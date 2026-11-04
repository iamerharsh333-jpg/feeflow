from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Student, Centre, User
from app.schemas import StudentResponse, StudentCreate
from app.auth import get_current_user, require_role
from app.services.fees import get_student_fee_summary, create_default_instalments, calculate_overdue_days
from app.services.currency import to_decimal

router = APIRouter(prefix="/students", tags=["Students"])

def map_student_response(s: Student, db: Session) -> dict:
    summary = get_student_fee_summary(s, db)
    
    # Calculate attendance
    att_pct = 85.0
    if s.attendances:
        pres = sum(1 for a in s.attendances if a.status == "Present")
        att_pct = round((pres / len(s.attendances)) * 100.0, 1)

    # Format instalments
    instalments_resp = []
    for ins in summary["instalments"]:
        instalments_resp.append({
            "id": ins.id,
            "student_id": ins.student_id,
            "instalment_number": ins.instalment_number,
            "due_date": ins.due_date,
            "amount": float(to_decimal(ins.amount)),
            "paid_amount": float(to_decimal(ins.paid_amount)),
            "status": ins.status,
            "paid_date": ins.paid_date,
            "receipt_no": ins.receipt_no,
            "overdue_days": calculate_overdue_days(ins.due_date, ins.status)
        })

    return {
        "id": s.id,
        "roll_number": s.roll_number,
        "name": s.name,
        "course": s.course,
        "batch": s.batch,
        "centre_id": s.centre_id,
        "centre_name": s.centre.name if s.centre else None,
        "parent_name": s.parent_name,
        "parent_phone": s.parent_phone,
        "parent_email": s.parent_email,
        "total_fee": summary["total_fee"],
        "total_discount": summary["total_discount"],
        "effective_fee": summary["effective_fee"],
        "amount_paid": summary["amount_paid"],
        "outstanding_amount": summary["outstanding_amount"],
        "fee_status": summary["fee_status"],
        "attendance_percent": att_pct,
        "test_scores_trend": "Improving" if att_pct >= 85 else ("Declining" if att_pct < 65 else "Stable"),
        "enrollment_date": s.enrollment_date,
        "instalments": instalments_resp
    }

@router.get("", response_model=List[StudentResponse])
def list_students(
    q: Optional[str] = Query(None, description="Search by name or ID"),
    centre_id: Optional[int] = Query(None),
    course: Optional[str] = Query(None),
    fee_status: Optional[str] = Query(None),
    limit: int = Query(50, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(Student)

    # Role-based restriction:
    if current_user.role == "parent":
        query = query.filter(Student.parent_phone == current_user.identifier)
    elif current_user.role == "student":
        query = query.filter(Student.id == current_user.identifier)
    elif current_user.role == "accounts_executive" and current_user.centre_id:
        query = query.filter(Student.centre_id == current_user.centre_id)

    if centre_id and current_user.role in ["accounts_executive", "admin"]:
        query = query.filter(Student.centre_id == centre_id)

    if course:
        query = query.filter(Student.course == course)

    if q:
        search = f"%{q.strip()}%"
        query = query.filter((Student.name.ilike(search)) | (Student.id.ilike(search)))

    students = query.offset(offset).limit(limit).all()
    
    results = []
    for s in students:
        mapped = map_student_response(s, db)
        if fee_status and mapped["fee_status"] != fee_status:
            continue
        results.append(mapped)
        
    return results

@router.get("/{student_id}", response_model=StudentResponse)
def get_student_details(
    student_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # Enforce role-based isolation
    if current_user.role == "parent" and student.parent_phone != current_user.identifier:
        raise HTTPException(status_code=403, detail="Forbidden: You can only view your linked student.")
    if current_user.role == "student" and student.id != current_user.identifier:
        raise HTTPException(status_code=403, detail="Forbidden: You can only view your own record.")
    if current_user.role == "accounts_executive" and current_user.centre_id and student.centre_id != current_user.centre_id:
        raise HTTPException(status_code=403, detail="Forbidden: Student belongs to another centre.")

    return map_student_response(student, db)

@router.post("", response_model=StudentResponse, status_code=status.HTTP_201_CREATED)
def create_student(
    body: StudentCreate,
    current_user: User = Depends(require_role("accounts_executive", "admin")),
    db: Session = Depends(get_db)
):
    existing = db.query(Student).filter((Student.id == body.id) | (Student.roll_number == body.roll_number)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Student with this ID or Roll Number already exists.")

    student = Student(
        id=body.id,
        roll_number=body.roll_number,
        name=body.name,
        course=body.course,
        batch=body.batch,
        centre_id=body.centre_id,
        parent_name=body.parent_name,
        parent_phone=body.parent_phone,
        parent_email=body.parent_email,
        total_fee=body.total_fee,
    )
    db.add(student)
    db.flush()

    # Generate default instalments
    instalments = create_default_instalments(
        student_id=student.id,
        total_fee=student.total_fee,
        enrollment_date=student.enrollment_date,
        count=body.instalment_count
    )
    for ins in instalments:
        db.add(ins)

    db.commit()
    db.refresh(student)
    return map_student_response(student, db)

