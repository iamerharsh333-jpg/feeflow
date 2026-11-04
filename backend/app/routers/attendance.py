import csv
import io
import datetime
from typing import List, Set
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Attendance, Student, User, AuditLog
from app.auth import get_current_user, require_role
from app.services.risk import assess_student_risk

router = APIRouter(prefix="/attendance", tags=["Attendance"])

@router.get("/{student_id}")
def get_student_attendance(
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

    records = db.query(Attendance).filter(Attendance.student_id == student_id).order_by(Attendance.date.desc()).all()
    total = len(records)
    present = sum(1 for r in records if r.status == "Present")
    rate = round((present / total * 100.0), 1) if total > 0 else 0.0

    return {
        "student_id": student_id,
        "student_name": student.name,
        "batch": student.batch,
        "total_classes": total,
        "present_count": present,
        "attendance_rate_percent": rate,
        "records": [
            {"date": r.date, "batch": r.batch, "status": r.status}
            for r in records
        ]
    }

@router.post("/bulk-upload", status_code=status.HTTP_201_CREATED)
async def bulk_upload_attendance_csv(
    file: UploadFile = File(...),
    current_user: User = Depends(require_role("accounts_executive", "admin")),
    db: Session = Depends(get_db)
):
    """
    CSV Format: student_id, batch, date (YYYY-MM-DD), status (Present/Absent/Late)
    Validates batch membership, prevents duplicate entries for the same date,
    and automatically triggers risk recalculation for affected students.
    """
    contents = await file.read()
    try:
        decoded = contents.decode("utf-8")
    except Exception:
        raise HTTPException(status_code=400, detail="File must be a UTF-8 encoded CSV.")

    reader = csv.DictReader(io.StringIO(decoded))
    required_cols = {"student_id", "batch", "date", "status"}
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
        batch = row.get("batch", "").strip()
        date_str = row.get("date", "").strip()
        status_val = row.get("status", "").strip()

        if not s_id or not batch or not date_str or not status_val:
            errors.append(f"Row {row_idx}: Missing required fields.")
            continue

        student = db.query(Student).filter(Student.id == s_id).first()
        if not student:
            errors.append(f"Row {row_idx}: Student '{s_id}' does not exist.")
            continue

        # Centre isolation for accounts executive
        if current_user.role == "accounts_executive" and current_user.centre_id:
            if student.centre_id != current_user.centre_id:
                errors.append(f"Row {row_idx}: Student '{s_id}' belongs to another centre.")
                continue

        # Batch membership validation
        if student.batch.strip().lower() != batch.strip().lower():
            errors.append(
                f"Row {row_idx}: Student '{s_id}' is enrolled in batch '{student.batch}', not '{batch}'."
            )
            continue

        try:
            d = datetime.date.fromisoformat(date_str)
        except Exception:
            errors.append(f"Row {row_idx}: Invalid date format '{date_str}'. Expected YYYY-MM-DD.")
            continue

        if status_val not in ["Present", "Absent", "Late"]:
            errors.append(f"Row {row_idx}: Invalid status '{status_val}'. Must be Present, Absent, or Late.")
            continue

        # Duplicate check on same date
        existing = db.query(Attendance).filter(
            Attendance.student_id == s_id,
            Attendance.date == d
        ).first()

        if existing:
            existing.status = status_val
            existing.batch = batch
        else:
            db.add(Attendance(
                student_id=s_id,
                batch=batch,
                date=d,
                status=status_val
            ))
        
        created_count += 1
        affected_students.add(student)

    db.commit()

    # Recalculate risk scores for all affected students
    for st in affected_students:
        await assess_student_risk(st, db)

    # Audit log
    db.add(AuditLog(
        entity_name="Attendance",
        entity_id=file.filename or "bulk-upload",
        action="ATTENDANCE_BULK_UPLOAD",
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
                upload_type="Attendance",
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


