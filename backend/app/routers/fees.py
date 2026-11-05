from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Student, Discount, User, AuditLog
from app.auth import get_current_user, require_role
from app.services.fees import get_student_fee_summary, calculate_overdue_days
from app.services.currency import to_decimal
from pydantic import BaseModel

router = APIRouter(prefix="/fees", tags=["Fee Ledger"])

class DiscountCreate(BaseModel):
    code: str
    amount: Decimal
    reason: str

@router.get("/{student_id}/ledger")
def get_fee_ledger(
    student_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # Role check
    if current_user.role == "counsellor":
        raise HTTPException(status_code=403, detail="Forbidden: Counsellors do not have authorization to view financial ledgers.")
    if current_user.role == "parent" and student.parent_phone != current_user.identifier:
        raise HTTPException(status_code=403, detail="Forbidden: You can only view your linked student's ledger.")
    if current_user.role == "student" and student.id != current_user.identifier:
        raise HTTPException(status_code=403, detail="Forbidden: You can only view your own ledger.")
    if current_user.role == "accounts_executive" and current_user.centre_id and student.centre_id != current_user.centre_id:
        raise HTTPException(status_code=403, detail="Forbidden: Student belongs to another centre.")

    summary = get_student_fee_summary(student, db)

    instalment_list = []
    for ins in summary["instalments"]:
        instalment_list.append({
            "id": ins.id,
            "number": ins.instalment_number,
            "due_date": ins.due_date,
            "amount": to_decimal(ins.amount),
            "paid_amount": to_decimal(ins.paid_amount),
            "status": ins.status,
            "paid_date": ins.paid_date,
            "receipt_no": ins.receipt_no,
            "overdue_days": calculate_overdue_days(ins.due_date, ins.status)
        })

    discounts = db.query(Discount).filter(Discount.student_id == student.id).all()
    discount_list = [
        {"code": d.code, "amount": to_decimal(d.amount), "reason": d.reason, "approved_by": d.approved_by}
        for d in discounts
    ]

    return {
        "student_id": student.id,
        "student_name": student.name,
        "course": student.course,
        "batch": student.batch,
        "centre_name": student.centre.name if student.centre else None,
        "total_fee": summary["total_fee"],
        "total_discount": summary["total_discount"],
        "effective_fee": summary["effective_fee"],
        "amount_paid": summary["amount_paid"],
        "outstanding_amount": summary["outstanding_amount"],
        "fee_status": summary["fee_status"],
        "instalments": instalment_list,
        "discounts": discount_list
    }

@router.post("/{student_id}/discounts", status_code=status.HTTP_201_CREATED)
def apply_discount(
    student_id: str,
    body: DiscountCreate,
    current_user: User = Depends(require_role("accounts_executive", "admin")),
    db: Session = Depends(get_db)
):
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    if current_user.role == "accounts_executive" and current_user.centre_id and student.centre_id != current_user.centre_id:
        raise HTTPException(status_code=403, detail="Forbidden: Student belongs to another centre.")

    disc = Discount(
        student_id=student.id,
        code=body.code.upper(),
        amount=body.amount,
        reason=body.reason,
        approved_by=current_user.full_name
    )
    db.add(disc)
    
    # Audit log
    db.add(AuditLog(
        entity_name="Discount",
        entity_id=student.id,
        action="DISCOUNT_APPLIED",
        changed_by=current_user.full_name,
        new_values=f"Code: {body.code}, Amount: {body.amount}, Reason: {body.reason}"
    ))
    db.commit()
    return {"message": "Discount applied successfully", "discount_amount": to_decimal(body.amount)}

