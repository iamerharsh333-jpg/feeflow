from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Receipt, Payment, Student, User, Centre
from app.schemas import ReceiptDetailResponse
from app.auth import get_current_user
from app.services.currency import to_decimal

router = APIRouter(prefix="/receipts", tags=["Receipts"])

def map_receipt_detail(r: Receipt, db: Session) -> dict:
    student = db.query(Student).filter(Student.id == r.student_id).first()
    payment = db.query(Payment).filter(Payment.id == r.payment_id).first()
    centre_name = student.centre.name if (student and student.centre) else "Jaipur Main"
    
    inst_num = None
    if payment and payment.instalment:
        inst_num = payment.instalment.instalment_number

    return {
        "id": r.id,
        "receipt_no": r.receipt_no,
        "payment_id": r.payment_id,
        "transaction_id": payment.transaction_id if payment else "N/A",
        "payment_method": payment.method if payment else "Online",
        "student_id": student.id if student else r.student_id,
        "student_name": student.name if student else "N/A",
        "roll_number": student.roll_number if student else "N/A",
        "course": student.course if student else "N/A",
        "batch": student.batch if student else "N/A",
        "centre_name": centre_name,
        "parent_name": student.parent_name if student else "N/A",
        "parent_phone": student.parent_phone if student else "N/A",
        "instalment_number": inst_num,
        "date": r.date,
        "base_amount": float(to_decimal(r.base_amount)),
        "gst_rate": r.gst_rate,
        "cgst_amount": float(to_decimal(r.cgst_amount)),
        "sgst_amount": float(to_decimal(r.sgst_amount)),
        "total_amount": float(to_decimal(r.total_amount)),
        "gst_number": f"{r.gst_number} (Demo GSTIN)",
        "tax_treatment": "Standard 18% GST (9% CGST + 9% SGST) — Simulated Institute Registration (Demo)",
        "is_demo": True
    }

@router.get("", response_model=List[ReceiptDetailResponse])
def list_receipts(
    student_id: Optional[str] = Query(None),
    limit: int = Query(50, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(Receipt)

    if current_user.role == "parent":
        linked_students = db.query(Student).filter(Student.parent_phone == current_user.identifier).all()
        linked_ids = [s.id for s in linked_students]
        if not linked_ids:
            return []
        query = query.filter(Receipt.student_id.in_(linked_ids))
    elif current_user.role == "student":
        query = query.filter(Receipt.student_id == current_user.identifier)
    elif current_user.role == "accounts_executive" and current_user.centre_id:
        centre_students = db.query(Student.id).filter(Student.centre_id == current_user.centre_id).all()
        centre_student_ids = [s[0] for s in centre_students]
        query = query.filter(Receipt.student_id.in_(centre_student_ids))

    if student_id:
        # Cross-access check
        if current_user.role == "parent":
            s = db.query(Student).filter(Student.id == student_id).first()
            if not s or s.parent_phone != current_user.identifier:
                raise HTTPException(status_code=403, detail="Forbidden: You cannot access receipts for other students.")
        elif current_user.role == "student" and student_id != current_user.identifier:
            raise HTTPException(status_code=403, detail="Forbidden: You cannot access receipts for other students.")
        query = query.filter(Receipt.student_id == student_id)

    receipts = query.order_by(Receipt.date.desc(), Receipt.id.desc()).offset(offset).limit(limit).all()
    return [map_receipt_detail(r, db) for r in receipts]

@router.get("/{receipt_no}", response_model=ReceiptDetailResponse)
def get_receipt_by_number(
    receipt_no: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    receipt = db.query(Receipt).filter(Receipt.receipt_no == receipt_no).first()
    if not receipt:
        raise HTTPException(status_code=404, detail="Receipt not found.")

    student = db.query(Student).filter(Student.id == receipt.student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student record for receipt not found.")

    # Role-based access validation
    if current_user.role == "parent" and student.parent_phone != current_user.identifier:
        raise HTTPException(status_code=403, detail="Forbidden: You cannot view receipts for other students.")
    if current_user.role == "student" and student.id != current_user.identifier:
        raise HTTPException(status_code=403, detail="Forbidden: You cannot view receipts for other students.")
    if current_user.role == "accounts_executive" and current_user.centre_id and student.centre_id != current_user.centre_id:
        raise HTTPException(status_code=403, detail="Forbidden: Student belongs to another centre.")

    return map_receipt_detail(receipt, db)

