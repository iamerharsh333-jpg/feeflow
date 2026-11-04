import csv
import io
import datetime
from typing import List, Set
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import TestScore, Student, User, AuditLog
from app.auth import get_current_user, require_role
from app.services.risk import assess_student_risk

router = APIRouter(prefix="/tests", tags=["Tests & Academic Performance"])

@router.get("/{student_id}")
def get_student_tests(
    student_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    if current_user.role == "parent" and student.parent_phone != current_user.identifier:
        raise HTTPException(status_code=403, detail="Forbidden")
    if current_user.role == "student" and student.id != current_user.identifier:
        raise HTTPException(status_code=403, detail="Forbidden")
    if current_user.role == "accounts_executive" and current_user.centre_id and student.centre_id != current_user.centre_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    scores = db.query(TestScore).filter(TestScore.student_id == student_id).order_by(TestScore.test_date.desc()).all()
    return [
        {
            "id": s.id,
            "test_name": s.test_name,
            "test_date": s.test_date,
            "subject": s.subject,
            "max_marks": s.max_marks,
            "marks_obtained": s.marks_obtained,
            "percentage": round((s.marks_obtained / s.max_marks) * 100.0, 1) if s.max_marks > 0 else 0.0
        }
        for s in scores
    ]

@router.post("/bulk-upload", status_code=status.HTTP_201_CREATED)
async def bulk_upload_test_scores_csv(
    file: UploadFile = File(...),
    current_user: User = Depends(require_role("accounts_executive", "admin")),
    db: Session = Depends(get_db)
):
    """
    CSV Format: student_id, test_name, test_date (YYYY-MM-DD), subject, max_marks, marks_obtained
    Validates scores, prevents duplicates, and triggers risk recalculation for affected students.
    """
    contents = await file.read()
    try:
        decoded = contents.decode("utf-8")
    except Exception:
        raise HTTPException(status_code=400, detail="File must be a UTF-8 encoded CSV.")

    reader = csv.DictReader(io.StringIO(decoded))
    required_cols = {"student_id", "test_name", "test_date", "subject", "max_marks", "marks_obtained"}
    if not required_cols.issubset(set(reader.fieldnames or [])):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid CSV headers. Required: {required_cols}. Found: {reader.fieldnames}"
        )

    created_count = 0
    errors: List[str] = []
    affected_students: Set[Student] = set()

    for row_idx, row in enumerate(reader, start=2):
        s_id = row.get("student_id", "").strip()
        t_name = row.get("test_name", "").strip()
        d_str = row.get("test_date", "").strip()
        sub = row.get("subject", "").strip()

        if not s_id or not t_name or not d_str or not sub:
            errors.append(f"Row {row_idx}: Missing required fields.")
            continue

        student = db.query(Student).filter(Student.id == s_id).first()
        if not student:
            errors.append(f"Row {row_idx}: Student '{s_id}' does not exist.")
            continue

        if current_user.role == "accounts_executive" and current_user.centre_id:
            if student.centre_id != current_user.centre_id:
                errors.append(f"Row {row_idx}: Student '{s_id}' belongs to another centre.")
                continue

        try:
            d = datetime.date.fromisoformat(d_str)
        except Exception:
            errors.append(f"Row {row_idx}: Invalid date format '{d_str}'. Expected YYYY-MM-DD.")
            continue

        try:
            max_m = float(row.get("max_marks", 0))
            marks = float(row.get("marks_obtained", 0))
            if max_m <= 0:
                errors.append(f"Row {row_idx}: Max marks must be greater than zero.")
                continue
            if marks < 0 or marks > max_m:
                errors.append(f"Row {row_idx}: Marks obtained ({marks}) must be between 0 and max marks ({max_m}).")
                continue
        except Exception:
            errors.append(f"Row {row_idx}: Invalid numeric marks values.")
            continue

        # Prevent duplicate on same test and date for student
        existing = db.query(TestScore).filter(
            TestScore.student_id == s_id,
            TestScore.test_name == t_name,
            TestScore.test_date == d
        ).first()

        if existing:
            existing.marks_obtained = marks
            existing.max_marks = max_m
            existing.subject = sub
        else:
            db.add(TestScore(
                student_id=s_id,
                test_name=t_name,
                test_date=d,
                subject=sub,
                max_marks=max_m,
                marks_obtained=marks
            ))

        created_count += 1
        affected_students.add(student)

    db.commit()

    # Recalculate risk scores for all affected students
    for st in affected_students:
        await assess_student_risk(st, db)

    # Audit log
    db.add(AuditLog(
        entity_name="TestScore",
        entity_id=file.filename or "bulk-upload",
        action="TEST_SCORES_BULK_UPLOAD",
        changed_by=current_user.full_name,
        new_values=f"Processed: {created_count}, Errors: {len(errors)}, AffectedStudents: {len(affected_students)}"
    ))

    # Alert staff if bulk upload had errors
    if errors:
        try:
            from app.services.notifications import notify_bulk_upload_failure
            notify_bulk_upload_failure(
                db=db,
                user_id=current_user.identifier,
                centre_id=current_user.centre_id,
                upload_type="TestScores",
                error_count=len(errors)
            )
        except Exception:
            pass

    db.commit()

    return {
        "success": True,
        "processed_rows": created_count,
        "error_count": len(errors),
        "errors": errors,
        "recalculated_students_count": len(affected_students)
    }


