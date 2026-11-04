from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Reminder, Student, Instalment, User, AuditLog
from app.schemas import ReminderResponse, ReminderPreviewRequest, ReminderPreviewResponse
from app.auth import require_role
from app.services.reminders import generate_reminder_message, process_due_reminders

router = APIRouter(prefix="/reminders", tags=["Reminders"])

def map_reminder_response(r: Reminder) -> dict:
    return {
        "id": r.id,
        "student_id": r.student_id,
        "student_name": r.student.name if r.student else "Unknown",
        "parent_name": r.student.parent_name if r.student else "Parent",
        "parent_phone": r.student.parent_phone if r.student else "",
        "outstanding": float(r.instalment.amount - r.instalment.paid_amount) if r.instalment else 0.0,
        "due_date": r.due_date,
        "scheduled_date": r.scheduled_date,
        "channel": r.channel,
        "status": r.status,
        "lang": r.lang,
        "message": r.message,
        "sent_at": r.sent_at
    }

@router.get("", response_model=List[ReminderResponse])
def list_reminders(
    status_filter: Optional[str] = Query(None, alias="status"),
    student_id: Optional[str] = Query(None),
    limit: int = Query(50, le=100),
    current_user: User = Depends(require_role("accounts_executive", "admin")),
    db: Session = Depends(get_db)
):
    query = db.query(Reminder)
    if current_user.role == "accounts_executive" and current_user.centre_id:
        query = query.join(Student).filter(Student.centre_id == current_user.centre_id)
    if status_filter:
        query = query.filter(Reminder.status == status_filter)
    if student_id:
        query = query.filter(Reminder.student_id == student_id)
    reminders = query.order_by(Reminder.scheduled_date.desc()).limit(limit).all()
    return [map_reminder_response(r) for r in reminders]

@router.post("/preview", response_model=ReminderPreviewResponse)
def preview_reminder(
    body: ReminderPreviewRequest,
    current_user: User = Depends(require_role("accounts_executive", "admin")),
    db: Session = Depends(get_db)
):
    student = db.query(Student).filter(Student.id == body.student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    if current_user.role == "accounts_executive" and current_user.centre_id and student.centre_id != current_user.centre_id:
        raise HTTPException(status_code=403, detail="Forbidden: Student belongs to another centre.")

    instalment = db.query(Instalment).filter(
        Instalment.id == body.instalment_id,
        Instalment.student_id == student.id
    ).first()
    if not instalment:
        raise HTTPException(status_code=404, detail="Instalment not found")

    due_amt = float(instalment.amount - instalment.paid_amount)
    is_partial = float(instalment.paid_amount) > 0
    msg = generate_reminder_message(
        student_name=student.name,
        course=student.course,
        centre_name=student.centre.name if student.centre else "Centre",
        amount=due_amt,
        due_date=instalment.due_date,
        parent_name=student.parent_name,
        lang=body.lang,
        is_partial=is_partial
    )

    return {
        "student_id": student.id,
        "channel": body.channel,
        "lang": body.lang,
        "recipient_phone": student.parent_phone,
        "message_text": msg
    }

@router.post("/{reminder_id}/send")
def send_reminder_now(
    reminder_id: str,
    current_user: User = Depends(require_role("accounts_executive", "admin")),
    db: Session = Depends(get_db)
):
    rem = db.query(Reminder).filter(Reminder.id == reminder_id).first()
    if not rem:
        raise HTTPException(status_code=404, detail="Reminder not found")

    if current_user.role == "accounts_executive" and current_user.centre_id and rem.student and rem.student.centre_id != current_user.centre_id:
        raise HTTPException(status_code=403, detail="Forbidden: Reminder belongs to another centre.")

    # Guard: Never send reminders for paid instalments
    instalment = db.query(Instalment).filter(Instalment.id == rem.instalment_id).first()
    if instalment and instalment.status == "Paid":
        rem.status = "Cancelled"
        db.commit()
        raise HTTPException(status_code=400, detail="Instalment is already paid. Reminder cancelled.")

    rem.status = "Sent"
    rem.sent_at = datetime.datetime.now(datetime.timezone.utc)
    db.add(AuditLog(
        entity_name="Reminder",
        entity_id=rem.id,
        action="REMINDER_SENT",
        changed_by=current_user.full_name,
        new_values=f"Channel: {rem.channel}, Student: {rem.student_id} (Simulated Provider)"
    ))
    db.commit()
    return {
        "message": "Demo reminder sent successfully (simulated mock delivery).",
        "reminder_id": rem.id,
        "channel": rem.channel,
        "is_simulated": True
    }

@router.post("/{reminder_id}/resend")
def resend_reminder_manual(
    reminder_id: str,
    current_user: User = Depends(require_role("accounts_executive", "admin")),
    db: Session = Depends(get_db)
):
    rem = db.query(Reminder).filter(Reminder.id == reminder_id).first()
    if not rem:
        raise HTTPException(status_code=404, detail="Reminder not found")

    if current_user.role == "accounts_executive" and current_user.centre_id and rem.student and rem.student.centre_id != current_user.centre_id:
        raise HTTPException(status_code=403, detail="Forbidden: Reminder belongs to another centre.")

    # Guard: Never send reminders for paid instalments
    instalment = db.query(Instalment).filter(Instalment.id == rem.instalment_id).first()
    if instalment and instalment.status == "Paid":
        rem.status = "Cancelled"
        db.commit()
        raise HTTPException(status_code=400, detail="Instalment is already paid. Reminder cancelled.")

    rem.status = "Sent"
    rem.retry_count = (rem.retry_count or 0) + 1
    rem.sent_at = datetime.datetime.now(datetime.timezone.utc)
    db.add(AuditLog(
        entity_name="Reminder",
        entity_id=rem.id,
        action="REMINDER_RESENT",
        changed_by=current_user.full_name,
        new_values=f"Manual resend via {rem.channel} (Simulated Provider), retry #{rem.retry_count}"
    ))
    db.commit()
    return {
        "message": "Demo reminder resent successfully (simulated mock delivery).",
        "reminder_id": rem.id,
        "channel": rem.channel,
        "retry_count": rem.retry_count,
        "is_simulated": True
    }

@router.post("/{reminder_id}/cancel")
def cancel_reminder(
    reminder_id: str,
    current_user: User = Depends(require_role("accounts_executive", "admin")),
    db: Session = Depends(get_db)
):
    rem = db.query(Reminder).filter(Reminder.id == reminder_id).first()
    if not rem:
        raise HTTPException(status_code=404, detail="Reminder not found")

    if current_user.role == "accounts_executive" and current_user.centre_id and rem.student and rem.student.centre_id != current_user.centre_id:
        raise HTTPException(status_code=403, detail="Forbidden: Reminder belongs to another centre.")
    rem.status = "Cancelled"
    db.add(AuditLog(
        entity_name="Reminder",
        entity_id=rem.id,
        action="REMINDER_CANCELLED",
        changed_by=current_user.full_name,
        new_values=f"Reminder {rem.id} cancelled manually by staff"
    ))
    db.commit()
    return {"message": "Reminder cancelled.", "reminder_id": rem.id}

@router.post("/process-due")
def trigger_due_reminders(
    current_user: User = Depends(require_role("accounts_executive", "admin")),
    db: Session = Depends(get_db)
):
    count = process_due_reminders(db)
    return {"processed_count": count}

