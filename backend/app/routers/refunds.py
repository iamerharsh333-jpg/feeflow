import datetime
from typing import List, Optional
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import RefundRequest, Student, User, Payment
from app.schemas import (
    RefundEstimateRequest, RefundEstimateResponse,
    RefundRequestCreate, RefundApprovalRequest,
    RefundRejectionRequest, RefundProcessRequest,
    RefundResponse
)
from app.auth import get_current_user, require_role
from app.services.refunds import (
    calculate_pro_rata_refund, create_refund_request,
    approve_refund_request, reject_refund_request,
    process_simulated_refund
)

router = APIRouter(prefix="/refunds", tags=["Refund Calculator & Requests"])

@router.post("/estimate", response_model=RefundEstimateResponse)
def estimate_refund(
    body: RefundEstimateRequest,
    db: Session = Depends(get_db)
):
    student = db.query(Student).filter(Student.id == body.student_id).first()
    amount_paid = body.amount_paid
    discount_applied = Decimal("0.0")
    student_name = None
    
    if student:
        student_name = student.name
        discount_applied = sum(Decimal(str(d.amount)) for d in student.discounts) if student.discounts else Decimal("0.0")
        if amount_paid is None or amount_paid <= Decimal("0.0"):
            payments = db.query(Payment).filter(
                Payment.student_id == student.id,
                Payment.status.in_(["Success", "Paid"])
            ).all()
            actual_paid = sum(Decimal(str(p.amount)) for p in payments)
            amount_paid = actual_paid if actual_paid > Decimal("0.0") else student.total_fee
    
    if amount_paid is None:
        amount_paid = Decimal("50000.0")

    calc = calculate_pro_rata_refund(
        course_start_date=body.course_start_date,
        course_end_date=body.course_end_date,
        withdrawal_date=body.withdrawal_date,
        amount_paid=amount_paid,
        discount_applied=discount_applied,
        processing_fee_percent=body.processing_fee_percent,
        material_fee=body.material_fee,
        policy_code=body.policy_code
    )
    return {
        "student_id": body.student_id,
        "student_name": student_name,
        "course_start_date": body.course_start_date,
        "course_end_date": body.course_end_date,
        "withdrawal_date": body.withdrawal_date,
        **calc
    }

@router.post("/request", status_code=status.HTTP_201_CREATED)
def submit_refund_for_review(
    body: RefundRequestCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    student = db.query(Student).filter(Student.id == body.student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # Centre & Role Isolation
    if current_user.role == "parent":
        if student.parent_phone != current_user.identifier:
            raise HTTPException(status_code=403, detail="Forbidden: You can only submit refund requests for your linked student.")
    elif current_user.role == "accounts_executive":
        if current_user.centre_id and student.centre_id != current_user.centre_id:
            raise HTTPException(status_code=403, detail="Forbidden: You cannot submit refund requests for a foreign centre.")
    elif current_user.role not in ["admin"]:
        raise HTTPException(status_code=403, detail="Forbidden: Insufficient privileges.")

    req = create_refund_request(
        db=db,
        student_id=body.student_id,
        course_start_date=body.course_start_date,
        course_end_date=body.course_end_date,
        withdrawal_date=body.withdrawal_date,
        withdrawal_reason=body.withdrawal_reason or "Student voluntary withdrawal",
        amount_paid=body.amount_paid,
        processing_fee_percent=body.processing_fee_percent,
        material_fee=body.material_fee,
        policy_code=body.policy_code,
        policy_confirmed=body.policy_confirmed,
        notes=body.notes,
        created_by=current_user.full_name
    )

    try:
        from app.services.notifications import notify_refund_submitted
        notify_refund_submitted(
            db=db,
            refund_id=req.id,
            student=student,
            amount=float(req.estimated_refund)
        )
        db.commit()
    except Exception:
        pass

    return {
        "message": "Refund request submitted for accounts review.",
        "request_id": req.id,
        "estimated_refund": float(req.estimated_refund),
        "status": req.status,
        "processing_deadline": req.processing_deadline
    }

@router.get("/requests", response_model=List[RefundResponse])
def list_refund_requests(
    current_user: User = Depends(require_role("accounts_executive", "admin")),
    db: Session = Depends(get_db)
):
    query = db.query(RefundRequest).join(Student, RefundRequest.student_id == Student.id)
    
    # Centre isolation: Accounts executive only sees their centre's requests
    if current_user.role == "accounts_executive" and current_user.centre_id:
        query = query.filter(Student.centre_id == current_user.centre_id)

    requests = query.order_by(RefundRequest.created_at.desc()).all()
    today = datetime.date.today()
    results = []

    for r in requests:
        deadline = r.processing_deadline or (r.withdrawal_date + datetime.timedelta(days=10))
        days_rem = (deadline - today).days
        is_over = (today > deadline and r.status in ["Pending Review", "Approved"])

        results.append(RefundResponse(
            id=r.id,
            student_id=r.student_id,
            student_name=r.student.name if r.student else "N/A",
            centre_name=r.student.centre.name if r.student and r.student.centre else "N/A",
            course_start_date=r.course_start_date,
            course_end_date=r.course_end_date,
            withdrawal_date=r.withdrawal_date,
            withdrawal_reason=r.withdrawal_reason,
            amount_paid=float(r.amount_paid),
            discount_applied=float(r.discount_applied or 0.0),
            total_days=r.total_days,
            days_attended=r.days_attended,
            unused_days=r.unused_days,
            pro_rata_amount=float(r.pro_rata_amount),
            processing_fee=float(r.processing_fee),
            material_fee=float(r.material_fee),
            estimated_refund=float(r.estimated_refund),
            approved_refund=float(r.approved_refund) if r.approved_refund is not None else None,
            policy_code=r.policy_code,
            policy_version=r.policy_version,
            status=r.status,
            deadline_met=r.deadline_met,
            processing_deadline=deadline,
            days_remaining=days_rem,
            is_overdue=is_over,
            processed_date=r.processed_date,
            payout_reference=r.payout_reference,
            notes=r.notes,
            approved_by=r.approved_by,
            decision_reason=r.decision_reason,
            decision_date=r.decision_date,
            created_at=r.created_at
        ))
    return results

@router.get("/student/{student_id}", response_model=List[RefundResponse])
def get_student_refund_history(
    student_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    if current_user.role == "parent" and student.parent_phone != current_user.identifier:
        raise HTTPException(status_code=403, detail="Forbidden: You cannot view refund requests for other students.")
    elif current_user.role == "student" and student.id != current_user.identifier:
        raise HTTPException(status_code=403, detail="Forbidden: You cannot view other students' requests.")
    elif current_user.role == "accounts_executive" and current_user.centre_id and student.centre_id != current_user.centre_id:
        raise HTTPException(status_code=403, detail="Forbidden: Centre isolation violated.")

    requests = db.query(RefundRequest).filter(
        RefundRequest.student_id == student_id
    ).order_by(RefundRequest.created_at.desc()).all()

    today = datetime.date.today()
    results = []
    for r in requests:
        deadline = r.processing_deadline or (r.withdrawal_date + datetime.timedelta(days=10))
        days_rem = (deadline - today).days
        is_over = (today > deadline and r.status in ["Pending Review", "Approved"])

        results.append(RefundResponse(
            id=r.id,
            student_id=r.student_id,
            student_name=student.name,
            centre_name=student.centre.name if student.centre else "N/A",
            course_start_date=r.course_start_date,
            course_end_date=r.course_end_date,
            withdrawal_date=r.withdrawal_date,
            withdrawal_reason=r.withdrawal_reason,
            amount_paid=float(r.amount_paid),
            discount_applied=float(r.discount_applied or 0.0),
            total_days=r.total_days,
            days_attended=r.days_attended,
            unused_days=r.unused_days,
            pro_rata_amount=float(r.pro_rata_amount),
            processing_fee=float(r.processing_fee),
            material_fee=float(r.material_fee),
            estimated_refund=float(r.estimated_refund),
            approved_refund=float(r.approved_refund) if r.approved_refund is not None else None,
            policy_code=r.policy_code,
            policy_version=r.policy_version,
            status=r.status,
            deadline_met=r.deadline_met,
            processing_deadline=deadline,
            days_remaining=days_rem,
            is_overdue=is_over,
            processed_date=r.processed_date,
            payout_reference=r.payout_reference,
            notes=r.notes,
            approved_by=r.approved_by,
            decision_reason=r.decision_reason,
            decision_date=r.decision_date,
            created_at=r.created_at
        ))
    return results

@router.post("/requests/{request_id}/approve")
def approve_refund(
    request_id: int,
    body: RefundApprovalRequest,
    current_user: User = Depends(require_role("accounts_executive", "admin")),
    db: Session = Depends(get_db)
):
    req = db.query(RefundRequest).filter(RefundRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Refund request not found")

    # Centre isolation check
    if current_user.role == "accounts_executive" and current_user.centre_id:
        if req.student and req.student.centre_id != current_user.centre_id:
            raise HTTPException(
                status_code=403,
                detail="Forbidden: Cannot approve refunds for a student from an unauthorised centre."
            )

    approved = approve_refund_request(
        db=db,
        request_id=request_id,
        approved_amount=body.approved_amount,
        approved_by=current_user.full_name,
        reason=body.reason or "Approved as per standard refund policy",
        policy_code=body.policy_code,
        notes=body.notes
    )

    try:
        from app.services.notifications import notify_refund_status_update
        notify_refund_status_update(
            db=db,
            refund_id=request_id,
            student=req.student,
            amount=float(approved.approved_refund),
            new_status="Approved",
            reason=body.reason
        )
        db.commit()
    except Exception:
        pass

    return {
        "message": "Refund approved successfully. Ready for manual payout processing.",
        "request_id": approved.id,
        "approved_refund": float(approved.approved_refund),
        "status": approved.status,
        "decision_date": approved.decision_date,
        "policy_code": approved.policy_code,
        "policy_version": approved.policy_version
    }

@router.post("/requests/{request_id}/reject")
def reject_refund(
    request_id: int,
    body: RefundRejectionRequest,
    current_user: User = Depends(require_role("accounts_executive", "admin")),
    db: Session = Depends(get_db)
):
    req = db.query(RefundRequest).filter(RefundRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Refund request not found")

    if current_user.role == "accounts_executive" and current_user.centre_id:
        if req.student and req.student.centre_id != current_user.centre_id:
            raise HTTPException(
                status_code=403,
                detail="Forbidden: Cannot reject refunds for a student from an unauthorised centre."
            )

    rejected = reject_refund_request(
        db=db,
        request_id=request_id,
        rejected_by=current_user.full_name,
        reason=body.reason,
        notes=body.notes
    )

    try:
        from app.services.notifications import notify_refund_status_update
        notify_refund_status_update(
            db=db,
            refund_id=request_id,
            student=req.student,
            amount=float(req.estimated_refund or 0.0),
            new_status="Rejected",
            reason=body.reason
        )
        db.commit()
    except Exception:
        pass

    return {
        "message": "Refund request rejected.",
        "request_id": rejected.id,
        "status": rejected.status,
        "decision_date": rejected.decision_date,
        "decision_reason": rejected.decision_reason
    }

@router.post("/requests/{request_id}/process")
def process_refund_payout(
    request_id: int,
    body: RefundProcessRequest = None,
    current_user: User = Depends(require_role("accounts_executive", "admin")),
    db: Session = Depends(get_db)
):
    req = db.query(RefundRequest).filter(RefundRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Refund request not found")

    if current_user.role == "accounts_executive" and current_user.centre_id:
        if req.student and req.student.centre_id != current_user.centre_id:
            raise HTTPException(
                status_code=403,
                detail="Forbidden: Cannot process refunds for a student from an unauthorised centre."
            )

    processed = process_simulated_refund(
        db=db,
        request_id=request_id,
        processed_by=current_user.full_name,
        notes=body.notes if body else None
    )

    try:
        from app.services.notifications import notify_refund_status_update
        notify_refund_status_update(
            db=db,
            refund_id=request_id,
            student=req.student,
            amount=float(processed.approved_refund or 0.0),
            new_status="Processed"
        )
        db.commit()
    except Exception:
        pass

    return {
        "message": "Simulated refund payout processed successfully.",
        "request_id": processed.id,
        "status": processed.status,
        "payout_reference": processed.payout_reference,
        "processed_date": processed.processed_date,
        "approved_refund": float(processed.approved_refund or 0.0)
    }


