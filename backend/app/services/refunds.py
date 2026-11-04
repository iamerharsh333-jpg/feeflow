import datetime
import uuid
from decimal import Decimal
from typing import Tuple, Dict, Any, Optional
from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.models import RefundRequest, Student, Payment, AuditLog

REFUND_DEADLINE_DAYS = 10
CURRENT_POLICY_CODE = "REFUND_STD_POLICY_2026"
CURRENT_POLICY_VERSION = "v2026.1"

def calculate_pro_rata_refund(
    course_start_date: datetime.date,
    course_end_date: datetime.date,
    withdrawal_date: datetime.date,
    amount_paid: Decimal,
    discount_applied: Decimal = Decimal("0.0"),
    processing_fee_percent: float = 5.0,
    material_fee: Decimal = Decimal("5000.0"),
    policy_code: str = CURRENT_POLICY_CODE,
    policy_version: str = CURRENT_POLICY_VERSION
) -> Dict[str, Any]:
    if course_end_date <= course_start_date:
        raise HTTPException(status_code=400, detail="Course end date must be after course start date.")
    if withdrawal_date < course_start_date:
        raise HTTPException(status_code=400, detail="Withdrawal date cannot be earlier than course start date.")
        
    total_days = max(1, (course_end_date - course_start_date).days)
    days_attended = max(0, min(total_days, (withdrawal_date - course_start_date).days))
    unused_days = max(0, total_days - days_attended)
    
    paid_float = float(amount_paid)
    discount_float = float(discount_applied)
    
    # Pro-rata on the actual net amount paid by student
    pro_rata = round((paid_float * unused_days) / float(total_days), 2)
    processing = round(pro_rata * (processing_fee_percent / 100.0), 2)
    material = float(material_fee)
    
    # Estimated refund cannot exceed total paid amount, nor can it be negative
    raw_refund = max(0.0, round(pro_rata - processing - material, 2))
    final_refund = min(raw_refund, paid_float)
    
    deadline_met = (withdrawal_date - course_start_date).days <= REFUND_DEADLINE_DAYS
    processing_deadline = withdrawal_date + datetime.timedelta(days=10)
    
    policy_note = (
        f"Refund calculated under {policy_code} ({policy_version}). "
        f"Statutory 10-day withdrawal window: {'Met' if deadline_met else 'Exceeded'}. "
        f"Processing deadline: {processing_deadline.isoformat()}."
    )

    return {
        "total_days": total_days,
        "days_attended": days_attended,
        "unused_days": unused_days,
        "amount_paid": paid_float,
        "discount_applied": discount_float,
        "pro_rata_refund": pro_rata,
        "processing_fee": processing,
        "material_fee": material,
        "estimated_refund": final_refund,
        "final_refund": final_refund,
        "policy_code": policy_code,
        "policy_version": policy_version,
        "deadline_met": deadline_met,
        "processing_deadline": processing_deadline,
        "policy_note": policy_note
    }

def create_refund_request(
    db: Session,
    student_id: str,
    course_start_date: datetime.date,
    course_end_date: datetime.date,
    withdrawal_date: datetime.date,
    withdrawal_reason: str = "Student voluntary withdrawal",
    amount_paid: Optional[Decimal] = None,
    discount_applied: Optional[Decimal] = None,
    processing_fee_percent: float = 5.0,
    material_fee: Decimal = Decimal("5000.0"),
    policy_code: str = CURRENT_POLICY_CODE,
    policy_version: str = CURRENT_POLICY_VERSION,
    policy_confirmed: bool = True,
    notes: Optional[str] = None,
    created_by: str = "system"
) -> RefundRequest:
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail=f"Student {student_id} not found")

    # If amount_paid is not explicitly passed or is 0, sum paid payments
    if amount_paid is None or amount_paid <= Decimal("0.0"):
        successful_payments = db.query(Payment).filter(
            Payment.student_id == student_id,
            Payment.status.in_(["Success", "Paid"])
        ).all()
        actual_paid = sum(Decimal(str(p.amount)) for p in successful_payments)
        amount_paid = actual_paid if actual_paid > Decimal("0.0") else student.total_fee

    if discount_applied is None:
        discount_applied = sum(Decimal(str(d.amount)) for d in student.discounts) if student.discounts else Decimal("0.0")

    calc = calculate_pro_rata_refund(
        course_start_date=course_start_date,
        course_end_date=course_end_date,
        withdrawal_date=withdrawal_date,
        amount_paid=amount_paid,
        discount_applied=discount_applied,
        processing_fee_percent=processing_fee_percent,
        material_fee=material_fee,
        policy_code=policy_code,
        policy_version=policy_version
    )
    
    req = RefundRequest(
        student_id=student_id,
        course_start_date=course_start_date,
        course_end_date=course_end_date,
        withdrawal_date=withdrawal_date,
        withdrawal_reason=withdrawal_reason,
        amount_paid=amount_paid,
        discount_applied=discount_applied,
        total_days=calc["total_days"],
        days_attended=calc["days_attended"],
        unused_days=calc["unused_days"],
        pro_rata_amount=Decimal(str(calc["pro_rata_refund"])),
        processing_fee=Decimal(str(calc["processing_fee"])),
        material_fee=material_fee,
        estimated_refund=Decimal(str(calc["final_refund"])),
        policy_code=policy_code,
        policy_version=policy_version,
        status="Pending Review",
        policy_configured=policy_confirmed,
        deadline_met=calc["deadline_met"],
        processing_deadline=calc["processing_deadline"],
        notes=notes
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    
    # Audit log
    db.add(AuditLog(
        entity_name="RefundRequest",
        entity_id=str(req.id),
        action="REFUND_CALCULATED_SAVED",
        changed_by=created_by,
        new_values=f"Estimated: {calc['final_refund']}, Policy: {policy_code} {policy_version}, Deadline: {calc['processing_deadline']}"
    ))
    db.commit()
    return req

def approve_refund_request(
    db: Session,
    request_id: int,
    approved_amount: Decimal,
    approved_by: str,
    reason: str,
    policy_code: str = CURRENT_POLICY_CODE,
    notes: Optional[str] = None
) -> RefundRequest:
    req = db.query(RefundRequest).filter(RefundRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Refund request not found")
        
    if req.status != "Pending Review":
        raise HTTPException(status_code=400, detail=f"Cannot approve request with status '{req.status}'. Must be 'Pending Review'.")

    if not reason or not reason.strip():
        raise HTTPException(status_code=400, detail="Mandatory approval reason is required.")
        
    if approved_amount <= Decimal("0.0"):
        raise HTTPException(status_code=400, detail="Approved refund amount must be greater than zero.")

    if approved_amount > req.amount_paid:
        raise HTTPException(
            status_code=400,
            detail=f"Approved refund (₹{approved_amount}) cannot exceed eligible paid amount (₹{req.amount_paid})."
        )
        
    req.status = "Approved"
    req.approved_refund = approved_amount
    req.approved_by = approved_by
    req.decision_reason = reason.strip()
    req.decision_date = datetime.date.today()
    req.policy_code = policy_code or req.policy_code
    req.policy_configured = True
    if notes:
        req.notes = f"{req.notes or ''} | Approval notes: {notes}".strip(" | ")
        
    db.add(AuditLog(
        entity_name="RefundRequest",
        entity_id=str(req.id),
        action="REFUND_APPROVED",
        changed_by=approved_by,
        new_values=f"Approved: ₹{approved_amount}, Reason: {reason}, Policy: {policy_code}"
    ))
    db.commit()
    db.refresh(req)
    return req

def reject_refund_request(
    db: Session,
    request_id: int,
    rejected_by: str,
    reason: str,
    notes: Optional[str] = None
) -> RefundRequest:
    req = db.query(RefundRequest).filter(RefundRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Refund request not found")

    if req.status != "Pending Review":
        raise HTTPException(status_code=400, detail=f"Cannot reject request with status '{req.status}'. Must be 'Pending Review'.")

    if not reason or not reason.strip():
        raise HTTPException(status_code=400, detail="Mandatory rejection reason is required.")

    req.status = "Rejected"
    req.approved_by = rejected_by
    req.decision_reason = reason.strip()
    req.decision_date = datetime.date.today()
    if notes:
        req.notes = f"{req.notes or ''} | Rejection notes: {notes}".strip(" | ")

    db.add(AuditLog(
        entity_name="RefundRequest",
        entity_id=str(req.id),
        action="REFUND_REJECTED",
        changed_by=rejected_by,
        new_values=f"Status: Rejected, Reason: {reason}"
    ))
    db.commit()
    db.refresh(req)
    return req

def process_simulated_refund(
    db: Session,
    request_id: int,
    processed_by: str,
    notes: Optional[str] = None
) -> RefundRequest:
    req = db.query(RefundRequest).filter(RefundRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Refund request not found")

    if req.status == "Processed":
        raise HTTPException(status_code=400, detail="Refund request has already been processed.")

    if req.status != "Approved":
        raise HTTPException(status_code=400, detail=f"Cannot process refund with status '{req.status}'. Must be 'Approved'.")

    payout_ref = f"SIM-PAYOUT-{req.id}-{uuid.uuid4().hex[:8].upper()}"
    req.status = "Processed"
    req.processed_date = datetime.datetime.now(datetime.timezone.utc)
    req.payout_reference = payout_ref
    if notes:
        req.notes = f"{req.notes or ''} | Payout notes: {notes}".strip(" | ")

    db.add(AuditLog(
        entity_name="RefundRequest",
        entity_id=str(req.id),
        action="REFUND_PROCESSED_SIMULATED",
        changed_by=processed_by,
        new_values=f"Status: Processed, Amount: ₹{req.approved_refund}, PayoutRef: {payout_ref}"
    ))
    db.commit()
    db.refresh(req)
    return req

