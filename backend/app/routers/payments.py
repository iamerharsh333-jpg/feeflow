import uuid
import datetime
from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Payment, Student, Instalment, User, Receipt, AuditLog
from app.schemas import (
    PaymentResponse, PaymentCreate, MatchPaymentRequest,
    PaymentLinkCreate, PaymentLinkResponse, MockPaymentWebhook, ReceiptResponse,
    PaymentIntentCreate, PaymentIntentResponse, PaymentVerifyRequest, PaymentVerifyResponse
)
from app.auth import get_current_user, require_role
from app.services.payments import (
    record_student_payment, match_unmatched_payment,
    create_payment_intent, verify_and_process_simulated_payment
)

router = APIRouter(prefix="/payments", tags=["Payments"])

def map_payment_response(p: Payment) -> dict:
    return {
        "id": p.id,
        "transaction_id": p.transaction_id,
        "student_id": p.student_id,
        "student_name": p.student.name if p.student else "Unknown / Unmatched",
        "instalment_id": p.instalment_id,
        "amount": float(p.amount),
        "payment_date": p.payment_date,
        "method": p.method,
        "reference_no": p.reference_no,
        "status": p.status,
        "centre_name": p.centre.name if p.centre else None,
        "receipt_no": p.receipt.receipt_no if p.receipt else None,
        "notes": p.notes,
        "created_at": p.created_at
    }

@router.get("", response_model=List[PaymentResponse])
def list_payments(
    status_filter: Optional[str] = Query(None, alias="status"),
    student_id: Optional[str] = Query(None),
    limit: int = Query(50, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(Payment)

    if current_user.role == "parent":
        # Find linked student
        student = db.query(Student).filter(Student.parent_phone == current_user.identifier).first()
        if student:
            query = query.filter(Payment.student_id == student.id)
        else:
            return []
    elif current_user.role == "student":
        query = query.filter(Payment.student_id == current_user.identifier)
    elif current_user.role == "accounts_executive" and current_user.centre_id:
        query = query.filter((Payment.centre_id == current_user.centre_id) | (Payment.centre_id == None))

    if status_filter:
        query = query.filter(Payment.status == status_filter)
    if student_id:
        query = query.filter(Payment.student_id == student_id)

    payments = query.order_by(Payment.created_at.desc()).offset(offset).limit(limit).all()
    return [map_payment_response(p) for p in payments]

@router.post("", response_model=PaymentResponse, status_code=status.HTTP_201_CREATED)
def create_payment(
    body: PaymentCreate,
    current_user: User = Depends(require_role("accounts_executive", "admin", "parent")),
    db: Session = Depends(get_db)
):
    # Role & Centre Permission Verification
    if current_user.role == "parent":
        student = db.query(Student).filter(Student.id == body.student_id).first()
        if not student or student.parent_phone != current_user.identifier:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden: You can only record payments for your linked student.")
    elif current_user.role == "accounts_executive" and current_user.centre_id and body.student_id:
        student = db.query(Student).filter(Student.id == body.student_id).first()
        if student and student.centre_id != current_user.centre_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden: Student belongs to another centre.")

    ref_no = body.reference_no or f"REF-{uuid.uuid4().hex[:10].upper()}"
    payment = record_student_payment(
        db=db,
        amount=body.amount,
        method=body.method,
        reference_no=ref_no,
        student_id=body.student_id,
        instalment_id=body.instalment_id,
        payment_date=body.payment_date,
        notes=body.notes,
        recorded_by=current_user.full_name
    )
    return map_payment_response(payment)

@router.get("/unmatched", response_model=List[PaymentResponse])
def get_unmatched_payments_queue(
    current_user: User = Depends(require_role("accounts_executive", "admin")),
    db: Session = Depends(get_db)
):
    payments = db.query(Payment).filter(
        Payment.status.in_(["Unmatched", "Under Review"])
    ).order_by(Payment.created_at.desc()).all()
    return [map_payment_response(p) for p in payments]

@router.post("/{payment_id}/match", response_model=PaymentResponse)
def match_payment(
    payment_id: str,
    body: MatchPaymentRequest,
    current_user: User = Depends(require_role("accounts_executive", "admin")),
    db: Session = Depends(get_db)
):
    matched = match_unmatched_payment(
        db=db,
        payment_id=payment_id,
        student_id=body.student_id,
        instalment_id=body.instalment_id,
        matched_by=current_user.full_name
    )
    return map_payment_response(matched)

@router.post("/{payment_id}/review")
def mark_payment_under_review(
    payment_id: str,
    current_user: User = Depends(require_role("accounts_executive", "admin")),
    db: Session = Depends(get_db)
):
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    payment.status = "Under Review"
    db.add(AuditLog(
        entity_name="Payment",
        entity_id=payment.id,
        action="PAYMENT_UNDER_REVIEW",
        changed_by=current_user.full_name,
        new_values="Status set to Under Review"
    ))
    db.commit()
    return {"message": "Payment marked under review", "status": payment.status}

@router.post("/{payment_id}/reject")
def reject_payment(
    payment_id: str,
    current_user: User = Depends(require_role("accounts_executive", "admin")),
    db: Session = Depends(get_db)
):
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    payment.status = "Rejected"
    db.add(AuditLog(
        entity_name="Payment",
        entity_id=payment.id,
        action="PAYMENT_REJECTED",
        changed_by=current_user.full_name,
        new_values="Status set to Rejected"
    ))
    db.commit()
    return {"message": "Payment rejected", "status": payment.status}

@router.post("/create-link", response_model=PaymentLinkResponse)
def create_payment_link(
    body: PaymentLinkCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    student = db.query(Student).filter(Student.id == body.student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    if current_user.role == "parent" and student.parent_phone != current_user.identifier:
        raise HTTPException(status_code=403, detail="Forbidden: You can only create payment links for your linked student.")
    if current_user.role == "student" and student.id != current_user.identifier:
        raise HTTPException(status_code=403, detail="Forbidden: You can only create payment links for your own record.")
    if current_user.role == "accounts_executive" and current_user.centre_id and student.centre_id != current_user.centre_id:
        raise HTTPException(status_code=403, detail="Forbidden: Student belongs to another centre.")

    instalment = db.query(Instalment).filter(
        Instalment.id == body.instalment_id,
        Instalment.student_id == student.id
    ).first()
    if not instalment:
        raise HTTPException(status_code=404, detail="Instalment not found")

    due_amt = float(instalment.amount - instalment.paid_amount)
    if due_amt <= 0:
        raise HTTPException(status_code=400, detail="Instalment is already fully paid.")

    order_id = f"order_{uuid.uuid4().hex[:14]}"
    # Mock / configurable payment URL
    payment_url = f"https://api.feeflow.local/pay/{order_id}?amount={due_amt}"

    return {
        "order_id": order_id,
        "amount": due_amt,
        "currency": "INR",
        "student_id": student.id,
        "instalment_id": instalment.id,
        "payment_url": payment_url
    }

@router.post("/intent", response_model=PaymentIntentResponse, status_code=status.HTTP_201_CREATED)
def create_checkout_intent(
    body: PaymentIntentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    intent = create_payment_intent(
        db=db,
        student_id=body.student_id,
        instalment_id=body.instalment_id,
        amount=body.amount,
        method=body.method,
        user_identifier=current_user.identifier,
        user_role=current_user.role,
        user_name=current_user.full_name
    )
    return intent

@router.post("/verify", response_model=PaymentVerifyResponse)
def verify_checkout_payment(
    body: PaymentVerifyRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    status_str, message, payment, receipt = verify_and_process_simulated_payment(
        db=db,
        order_id=body.order_id,
        payment_id=body.payment_id,
        signature=body.signature,
        simulation_status=body.simulation_status,
        user_name=current_user.full_name
    )
    pay_resp = map_payment_response(payment) if payment else None
    rec_resp = None
    if receipt:
        rec_student = db.query(Student).filter(Student.id == receipt.student_id).first()
        rec_resp = {
            "id": receipt.id,
            "receipt_no": receipt.receipt_no,
            "payment_id": receipt.payment_id,
            "student_id": receipt.student_id,
            "student_name": rec_student.name if rec_student else "N/A",
            "date": receipt.date,
            "base_amount": float(receipt.base_amount),
            "gst_rate": receipt.gst_rate,
            "cgst_amount": float(receipt.cgst_amount),
            "sgst_amount": float(receipt.sgst_amount),
            "total_amount": float(receipt.total_amount),
            "gst_number": receipt.gst_number
        }
    return {
        "status": status_str,
        "message": message,
        "payment": pay_resp,
        "receipt": rec_resp
    }

@router.post("/webhook")
def mock_payment_gateway_webhook(
    body: MockPaymentWebhook,
    db: Session = Depends(get_db)
):
    # Simulated gateway signature validation
    if not body.signature or len(body.signature) < 6:
        raise HTTPException(status_code=400, detail="Invalid payment gateway signature.")
        
    # Check if transaction already exists
    existing = db.query(Payment).filter(Payment.reference_no == body.payment_id).first()
    if existing:
        return {"status": "already_processed", "payment_id": existing.id}

    return {"status": "signature_verified", "order_id": body.order_id}

@router.get("/{payment_id}/receipt", response_model=ReceiptResponse)
def get_payment_receipt(
    payment_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    receipt = db.query(Receipt).filter(Receipt.payment_id == payment_id).first()
    if not receipt:
        raise HTTPException(status_code=404, detail="Receipt not found for this payment.")

    student = db.query(Student).filter(Student.id == receipt.student_id).first()
    return {
        "id": receipt.id,
        "receipt_no": receipt.receipt_no,
        "payment_id": receipt.payment_id,
        "student_id": receipt.student_id,
        "student_name": student.name if student else "N/A",
        "date": receipt.date,
        "base_amount": float(receipt.base_amount),
        "gst_rate": receipt.gst_rate,
        "cgst_amount": float(receipt.cgst_amount),
        "sgst_amount": float(receipt.sgst_amount),
        "total_amount": float(receipt.total_amount),
        "gst_number": receipt.gst_number
    }

