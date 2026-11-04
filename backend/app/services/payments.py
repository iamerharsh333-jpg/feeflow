import datetime
import uuid
import hmac
import hashlib
from decimal import Decimal
from typing import Optional, Tuple, Dict, Any, Union
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.config import settings
from app.models import Payment, Instalment, Student, Receipt, AuditLog, Reminder
from app.services.fees import get_student_fee_summary
from app.services.currency import to_decimal, round_currency, split_gst, ZERO, PAISE

# In-memory store for active payment intents: order_id -> intent dict
INTENT_STORE: Dict[str, dict] = {}

def generate_gateway_signature(order_id: str, amount: Any, student_id: str) -> str:
    amount_dec = to_decimal(amount)
    msg = f"{order_id}|{amount_dec:.2f}|{student_id}".encode("utf-8")
    return hmac.new(settings.JWT_SECRET.encode("utf-8"), msg, hashlib.sha256).hexdigest()

def create_payment_intent(
    db: Session,
    student_id: str,
    instalment_id: str,
    amount: Optional[Decimal] = None,
    method: str = "UPI",
    user_identifier: str = "",
    user_role: str = "",
    user_name: str = ""
) -> dict:
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found.")

    if user_role == "parent" and student.parent_phone != user_identifier:
        raise HTTPException(status_code=403, detail="Forbidden: You can only initiate payment for your linked student.")
    if user_role == "student" and student.id != user_identifier:
        raise HTTPException(status_code=403, detail="Forbidden: You can only initiate payment for your own records.")

    instalment = db.query(Instalment).filter(
        Instalment.id == instalment_id,
        Instalment.student_id == student.id
    ).first()
    if not instalment:
        raise HTTPException(status_code=404, detail="Instalment not found for this student.")

    remaining_due = to_decimal(instalment.amount) - to_decimal(instalment.paid_amount)
    if remaining_due <= ZERO:
        raise HTTPException(status_code=400, detail="Instalment is already fully paid.")

    target_amount = to_decimal(amount) if amount is not None else remaining_due
    if target_amount <= ZERO:
        raise HTTPException(status_code=400, detail="Payment amount must be greater than zero.")
    if target_amount > remaining_due:
        raise HTTPException(
            status_code=400,
            detail=f"Payment amount (₹{target_amount:,.2f}) exceeds instalment remaining balance (₹{remaining_due:,.2f})."
        )

    order_id = f"order_mock_{uuid.uuid4().hex[:12]}"
    signature = generate_gateway_signature(order_id, target_amount, student.id)
    intent_id = f"pi_mock_{uuid.uuid4().hex[:12]}"

    intent_record = {
        "intent_id": intent_id,
        "order_id": order_id,
        "student_id": student.id,
        "student_name": student.name,
        "instalment_id": instalment.id,
        "instalment_number": instalment.instalment_number,
        "amount": target_amount,
        "currency": "INR",
        "method": method,
        "signature": signature,
        "gateway_type": "simulated",
        "created_at": datetime.datetime.now(datetime.timezone.utc),
        "status": "created"
    }
    INTENT_STORE[order_id] = intent_record

    db.add(AuditLog(
        entity_name="PaymentIntent",
        entity_id=order_id,
        action="INTENT_CREATED",
        changed_by=user_name or "Parent",
        new_values=f"Instalment: {instalment.id}, Amount: {target_amount}, Method: {method}"
    ))
    db.commit()

    return intent_record

def verify_and_process_simulated_payment(
    db: Session,
    order_id: str,
    payment_id: str,
    signature: str,
    simulation_status: str,
    user_name: str = ""
) -> Tuple[str, str, Optional[Payment], Optional[Receipt]]:
    """
    Server-side verification of simulated gateway checkout.
    Returns: (status, message, payment, receipt)
    """
    intent = INTENT_STORE.get(order_id)
    
    # Check if this transaction was already processed (idempotency)
    existing_pay = db.query(Payment).filter(
        (Payment.reference_no == payment_id) | (Payment.gateway_order_id == order_id)
    ).first()
    if existing_pay and existing_pay.status == "Success":
        return ("Success", "Payment already processed successfully.", existing_pay, existing_pay.receipt)

    if not intent:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired payment order ID."
        )

    # 1. Cryptographic HMAC-SHA256 signature verification
    expected_sig = generate_gateway_signature(order_id, intent["amount"], intent["student_id"])
    if not hmac.compare_digest(signature, expected_sig):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment verification failed: Gateway signature mismatch. Potential tampering detected."
        )

    # 2. Handle simulated cancellation
    if simulation_status.lower() == "cancelled":
        payment_record = Payment(
            id=f"PAY-{uuid.uuid4().hex[:8].upper()}",
            transaction_id=f"TXN-CAN-{uuid.uuid4().hex[:8].upper()}",
            student_id=intent["student_id"],
            instalment_id=intent["instalment_id"],
            amount=Decimal(str(intent["amount"])),
            payment_date=datetime.date.today(),
            method=intent["method"],
            reference_no=payment_id,
            status="Cancelled",
            gateway_order_id=order_id,
            gateway_signature=signature,
            notes="Simulated payment cancelled by user. No fees deducted."
        )
        db.add(payment_record)
        db.add(AuditLog(
            entity_name="Payment",
            entity_id=payment_record.id,
            action="PAYMENT_CANCELLED",
            changed_by=user_name or "Parent",
            new_values=f"Order {order_id} cancelled by user in mock checkout."
        ))
        db.commit()

        # Emit cancellation alert
        try:
            from app.services.notifications import notify_payment_cancelled
            student_obj = db.query(Student).filter(Student.id == intent["student_id"]).first()
            if student_obj:
                notify_payment_cancelled(
                    db=db,
                    student=student_obj,
                    amount=to_decimal(intent["amount"]),
                    reference_no=payment_id
                )
                db.commit()
        except Exception:
            pass

        return ("Cancelled", "Payment was cancelled in mock checkout. No fee was deducted.", payment_record, None)

    # 3. Handle simulated failure
    if simulation_status.lower() == "failed":
        payment_record = Payment(
            id=f"PAY-{uuid.uuid4().hex[:8].upper()}",
            transaction_id=f"TXN-FAIL-{uuid.uuid4().hex[:8].upper()}",
            student_id=intent["student_id"],
            instalment_id=intent["instalment_id"],
            amount=to_decimal(intent["amount"]),
            payment_date=datetime.date.today(),
            method=intent["method"],
            reference_no=payment_id,
            status="Failed",
            gateway_order_id=order_id,
            gateway_signature=signature,
            notes="Simulated bank decline: insufficient funds or timeout."
        )
        db.add(payment_record)
        db.add(AuditLog(
            entity_name="Payment",
            entity_id=payment_record.id,
            action="PAYMENT_FAILED",
            changed_by=user_name or "Parent",
            new_values=f"Order {order_id} failed simulation (bank decline)."
        ))
        db.commit()

        # Emit failure alert
        try:
            from app.services.notifications import notify_payment_failed
            student_obj = db.query(Student).filter(Student.id == intent["student_id"]).first()
            if student_obj:
                notify_payment_failed(
                    db=db,
                    student=student_obj,
                    amount=to_decimal(intent["amount"]),
                    reference_no=payment_id,
                    payment_id=payment_record.id
                )
                db.commit()
        except Exception:
            pass

        return ("Failed", "Payment simulation failed (bank declined transaction). No fee was deducted.", payment_record, None)

    # 4. Handle verified simulated success
    if simulation_status.lower() == "success":
        payment = record_student_payment(
            db=db,
            amount=to_decimal(intent["amount"]),
            method=intent["method"],
            reference_no=payment_id,
            student_id=intent["student_id"],
            instalment_id=intent["instalment_id"],
            notes=f"Parent Portal (Simulated Gateway - {intent['method']})",
            recorded_by=user_name or "Parent Portal"
        )
        payment.gateway_order_id = order_id
        payment.gateway_signature = signature
        db.commit()
        db.refresh(payment)
        return ("Success", "Payment verified and recorded successfully.", payment, payment.receipt)

    raise HTTPException(status_code=400, detail=f"Unsupported simulation status: {simulation_status}")

def generate_gst_receipt(
    payment: Payment,
    student: Student,
    db: Session
) -> Receipt:
    base_amt, cgst, sgst = split_gst(payment.amount, settings.GST_RATE)
    
    year = datetime.date.today().year
    receipt_no = f"REC-{year}-{uuid.uuid4().hex[:6].upper()}"
    
    receipt = Receipt(
        receipt_no=receipt_no,
        payment_id=payment.id,
        student_id=student.id,
        date=payment.payment_date,
        base_amount=base_amt,
        gst_rate=float(settings.GST_RATE),
        cgst_amount=cgst,
        sgst_amount=sgst,
        total_amount=to_decimal(payment.amount),
        gst_number="08AAACP1234F1Z5"
    )
    db.add(receipt)
    return receipt

def record_student_payment(
    db: Session,
    amount: Decimal,
    method: str,
    reference_no: str,
    student_id: Optional[str] = None,
    instalment_id: Optional[str] = None,
    payment_date: Optional[datetime.date] = None,
    notes: Optional[str] = None,
    recorded_by: str = "system"
) -> Payment:
    # 0. Amount validation
    amount = to_decimal(amount)
    if amount <= ZERO:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment amount must be greater than zero."
        )

    # 1. Prevent duplicate payment processing by reference_no
    existing = db.query(Payment).filter(Payment.reference_no == reference_no).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Payment with reference {reference_no} already processed."
        )

    pay_date = payment_date or datetime.date.today()
    payment_id = f"PAY-{uuid.uuid4().hex[:8].upper()}"
    txn_id = f"TXN-{pay_date.strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"

    # 2. Check if student exists
    student = db.query(Student).filter(Student.id == student_id).first() if student_id else None

    if not student:
        # Never mark unmatched payments as paid; place in unmatched review queue
        try:
            unmatched_payment = Payment(
                id=payment_id,
                transaction_id=txn_id,
                student_id=None,
                instalment_id=None,
                centre_id=None,
                amount=amount,
                payment_date=pay_date,
                method=method,
                reference_no=reference_no,
                status="Unmatched",
                notes=notes or "Unmatched payment: student record not found."
            )
            db.add(unmatched_payment)
            
            # Audit log
            db.add(AuditLog(
                entity_name="Payment",
                entity_id=payment_id,
                action="UNMATCHED_RECEIVED",
                changed_by=recorded_by,
                new_values=f"Amount: {amount}, Ref: {reference_no}, Status: Unmatched"
            ))
            db.commit()
            db.refresh(unmatched_payment)

            # Emit unmatched payment alert for accounts staff
            try:
                from app.services.notifications import notify_unmatched_payment
                notify_unmatched_payment(
                    db=db,
                    amount=amount,
                    reference_no=reference_no,
                    payment_id=payment_id,
                    centre_id=None
                )
                db.commit()
            except Exception:
                pass

            return unmatched_payment
        except Exception:
            db.rollback()
            raise

    # 3. Verify payment amount cannot exceed permitted outstanding balance
    summary = get_student_fee_summary(student, db)
    total_outstanding = to_decimal(summary["outstanding_amount"])
    if amount > total_outstanding:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Payment amount (₹{amount:,.2f}) exceeds student outstanding balance (₹{total_outstanding:,.2f})."
        )

    # 4. Find matching instalment or oldest unpaid instalment
    target_instalment = None
    if instalment_id:
        target_instalment = db.query(Instalment).filter(
            Instalment.id == instalment_id,
            Instalment.student_id == student.id
        ).first()
        if not target_instalment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Instalment {instalment_id} not found for student {student.id}."
            )
    else:
        # Pick the oldest unpaid or partially paid instalment
        target_instalment = db.query(Instalment).filter(
            Instalment.student_id == student.id,
            Instalment.status != "Paid"
        ).order_by(Instalment.instalment_number.asc()).first()

    if target_instalment:
        ins_outstanding = to_decimal(target_instalment.amount) - to_decimal(target_instalment.paid_amount)
        if amount > ins_outstanding:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Payment amount (₹{amount:,.2f}) exceeds instalment balance (₹{ins_outstanding:,.2f})."
            )

    # 5. Execute transactional payment write
    try:
        payment = Payment(
            id=payment_id,
            transaction_id=txn_id,
            student_id=student.id,
            instalment_id=target_instalment.id if target_instalment else None,
            centre_id=student.centre_id,
            amount=amount,
            payment_date=pay_date,
            method=method,
            reference_no=reference_no,
            status="Success",
            notes=notes
        )
        db.add(payment)

        # 6. Update instalment paid amount and status
        if target_instalment:
            ins_total = to_decimal(target_instalment.amount)
            new_paid = to_decimal(target_instalment.paid_amount) + amount
            target_instalment.paid_amount = new_paid
            
            if new_paid >= ins_total:
                target_instalment.status = "Paid"
                target_instalment.paid_date = pay_date
                
                # Generate GST-compliant receipt only upon confirmed payment
                receipt = generate_gst_receipt(payment, student, db)
                target_instalment.receipt_no = receipt.receipt_no
                
                # Auto-cancel pending reminders immediately upon full payment!
                cancelled_count = db.query(Reminder).filter(
                    Reminder.instalment_id == target_instalment.id,
                    Reminder.status == "Scheduled"
                ).update({"status": "Cancelled"})
                if cancelled_count > 0:
                    db.add(AuditLog(
                        entity_name="Reminder",
                        entity_id=target_instalment.id,
                        action="REMINDERS_AUTO_CANCELLED",
                        changed_by=recorded_by,
                        new_values=f"Cancelled {cancelled_count} reminders on full payment"
                    ))
            else:
                target_instalment.status = "Partially Paid"
                # Generate receipt for partial payment
                receipt = generate_gst_receipt(payment, student, db)

        # Audit log
        db.add(AuditLog(
            entity_name="Payment",
            entity_id=payment_id,
            action="PAYMENT_RECORDED",
            changed_by=recorded_by,
            new_values=f"Student: {student.id}, Amount: {amount}, Instalment: {target_instalment.id if target_instalment else None}"
        ))

        db.commit()
        db.refresh(payment)

        # Notify student, parent, and accounts staff of verified payment
        try:
            from app.services.notifications import notify_payment_success
            from app.models import Notification
            
            # Dismiss fee due alerts if instalment fully paid
            if target_instalment and target_instalment.status == "Paid":
                db.query(Notification).filter(
                    Notification.entity_id == target_instalment.id,
                    Notification.event_type.in_(["FEE_UPCOMING", "FEE_OVERDUE"]),
                    Notification.is_read == False
                ).update({"is_read": True, "read_at": datetime.datetime.utcnow()})

            receipt_num = receipt.receipt_no if 'receipt' in locals() and receipt else f"REC-{payment.id}"
            notify_payment_success(
                db=db,
                student=student,
                amount=amount,
                receipt_no=receipt_num,
                payment_id=payment.id
            )
            db.commit()
        except Exception:
            pass

        return payment
    except Exception:
        db.rollback()
        raise

def match_unmatched_payment(
    db: Session,
    payment_id: str,
    student_id: str,
    instalment_id: Optional[str],
    matched_by: str
) -> Payment:
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment record not found")
        
    if payment.status not in ["Unmatched", "Under Review"]:
        raise HTTPException(status_code=400, detail=f"Cannot match payment with status {payment.status}")

    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Target student not found")

    try:
        payment.student_id = student.id
        payment.centre_id = student.centre_id
        # Keep status as 'Pending' for accounts verification; NEVER auto-mark as Paid
        payment.status = "Pending"
        if instalment_id:
            payment.instalment_id = instalment_id

        db.add(AuditLog(
            entity_name="Payment",
            entity_id=payment.id,
            action="MATCH_ATTEMPTED",
            changed_by=matched_by,
            new_values=f"Matched to student: {student_id}, Status set to Pending"
        ))
        db.commit()
        db.refresh(payment)
        return payment
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to match payment: {str(e)}")

def auto_match_incoming_payment(
    db: Session,
    reference_no: str,
    amount: Decimal,
    method: str = "UPI",
    student_id: Optional[str] = None,
    instalment_id: Optional[str] = None,
    order_id: Optional[str] = None,
    signature: Optional[str] = None,
    payment_date: Optional[datetime.date] = None,
    notes: Optional[str] = None,
    recorded_by: str = "AutoPaymentMatcher"
) -> Tuple[Payment, bool]:
    """
    Automatic Payment Matching Engine:
    - Verifies cryptographic signature if order_id is present.
    - Matches student and instalment references.
    - Prevents duplicate payment processing (idempotency).
    - Prevents overpayment.
    - Atomically updates fee ledger, generates receipt, and cancels reminders.
    - If student or instalment cannot be verified, registers payment as 'Unmatched'
      in the accounts reconciliation queue without marking any instalment paid.
    Returns: (payment, is_matched)
    """
    amount = to_decimal(amount)
    # 1. Idempotency: check if reference_no or order_id already exists
    existing = db.query(Payment).filter(
        (Payment.reference_no == reference_no) |
        (Payment.gateway_order_id == order_id if order_id else False)
    ).first()
    if existing:
        if existing.status == "Success":
            return (existing, True)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Payment transaction {reference_no} has already been recorded (status: {existing.status})."
        )

    # 2. Signature verification if order_id / signature provided
    target_student_id = student_id
    target_instalment_id = instalment_id

    if order_id:
        intent = INTENT_STORE.get(order_id)
        if intent:
            target_student_id = target_student_id or intent.get("student_id")
            target_instalment_id = target_instalment_id or intent.get("instalment_id")

        if signature:
            if not target_student_id:
                raise HTTPException(status_code=400, detail="Cannot verify signature without student reference.")
            expected_sig = generate_gateway_signature(order_id, amount, target_student_id)
            if not hmac.compare_digest(signature, expected_sig):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cryptographic verification failed: Payment signature mismatch."
                )

    # 3. Attempt matching to student
    student = db.query(Student).filter(Student.id == target_student_id).first() if target_student_id else None

    # If student cannot be determined -> Save as Unmatched
    if not student:
        unmatched_pay = record_student_payment(
            db=db,
            amount=amount,
            method=method,
            reference_no=reference_no,
            student_id=None,
            instalment_id=None,
            payment_date=payment_date,
            notes=notes or "AutoMatcher: Unmatched incoming transaction. Student reference not resolved.",
            recorded_by=recorded_by
        )
        return (unmatched_pay, False)

    # 4. Attempt matching to instalment
    target_ins = None
    if target_instalment_id:
        target_ins = db.query(Instalment).filter(
            Instalment.id == target_instalment_id,
            Instalment.student_id == student.id
        ).first()

    if not target_ins:
        # Find oldest unpaid instalment
        target_ins = db.query(Instalment).filter(
            Instalment.student_id == student.id,
            Instalment.status != "Paid"
        ).order_by(Instalment.instalment_number.asc()).first()

    if not target_ins:
        # Student has no unpaid instalments -> save as Unmatched to prevent overpayment!
        unmatched_pay = record_student_payment(
            db=db,
            amount=amount,
            method=method,
            reference_no=reference_no,
            student_id=student.id,
            instalment_id=None,
            payment_date=payment_date,
            notes="AutoMatcher: Student has zero outstanding instalments. Flagged for accounts review.",
            recorded_by=recorded_by
        )
        return (unmatched_pay, False)

    # 5. Overpayment guard
    rem_due = to_decimal(target_ins.amount) - to_decimal(target_ins.paid_amount)
    if amount > rem_due:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Payment amount (₹{amount:,.2f}) exceeds instalment remaining balance (₹{rem_due:,.2f})."
        )

    # 6. Process matched payment via record_student_payment
    matched_pay = record_student_payment(
        db=db,
        amount=amount,
        method=method,
        reference_no=reference_no,
        student_id=student.id,
        instalment_id=target_ins.id,
        payment_date=payment_date,
        notes=notes or f"AutoMatched with Instalment {target_ins.instalment_number}",
        recorded_by=recorded_by
    )

    if order_id:
        matched_pay.gateway_order_id = order_id
    if signature:
        matched_pay.gateway_signature = signature
    db.commit()

    return (matched_pay, True)

