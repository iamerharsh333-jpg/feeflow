import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.database import get_db
from app.models import Notification, Student, User
from app.schemas import NotificationResponse, UnreadCountResponse
from app.auth import get_current_user

router = APIRouter(prefix="/notifications", tags=["Alerts & Notifications"])

def get_user_notifications_query(current_user: User, db: Session):
    query = db.query(Notification)

    if current_user.role == "parent":
        # Linked students
        linked = db.query(Student.id).filter(Student.parent_phone == current_user.identifier).all()
        linked_ids = [s[0] for s in linked]
        if not linked_ids:
            return query.filter(Notification.id == None)
        
        # Parent sees alerts for their phone or linked student (NEVER HIGH_RISK_DROPOUT)
        query = query.filter(
            Notification.event_type != "HIGH_RISK_DROPOUT",
            or_(
                Notification.recipient_id == current_user.identifier,
                Notification.related_student_id.in_(linked_ids)
            )
        )
    elif current_user.role == "student":
        query = query.filter(
            Notification.event_type != "HIGH_RISK_DROPOUT",
            or_(
                Notification.recipient_id == current_user.identifier,
                Notification.related_student_id == current_user.identifier
            )
        )
    elif current_user.role == "accounts_executive":
        if current_user.centre_id:
            query = query.filter(
                or_(
                    Notification.centre_id == current_user.centre_id,
                    Notification.recipient_id == f"centre_{current_user.centre_id}_staff",
                    Notification.recipient_id == f"centre_{current_user.centre_id}_manager",
                    Notification.recipient_id == current_user.identifier,
                    Notification.recipient_id == "global_accounts"
                )
            )
    elif current_user.role == "counsellor":
        # Only counsellor follow-up tasks and student retention deadlines (Never unrelated financial alerts)
        query = query.filter(
            Notification.event_type.in_(["HIGH_RISK_DROPOUT", "TASK_ASSIGNED", "TASK_ALERT"]),
            or_(
                Notification.recipient_id == current_user.identifier,
                Notification.recipient_id == current_user.full_name,
                Notification.recipient_role == "counsellor",
                Notification.related_task_id.isnot(None)
            )
        )
    elif current_user.role == "admin":
        pass  # Global access

    return query


@router.get("", response_model=List[NotificationResponse])
def list_notifications(
    unread_only: bool = Query(False),
    category: Optional[str] = Query(None), # payments, refunds, fees, risk, deadlines, all
    from_date: Optional[datetime.date] = Query(None),
    to_date: Optional[datetime.date] = Query(None),
    limit: int = Query(50, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = get_user_notifications_query(current_user, db)

    if unread_only:
        query = query.filter(Notification.is_read == False)

    if category and category.lower() != "all":
        cat = category.lower()
        if cat == "payments":
            query = query.filter(Notification.event_type.in_(["PAYMENT_SUCCESS", "PAYMENT_FAILED", "PAYMENT_CANCELLED", "UNMATCHED_PAYMENT"]))
        elif cat == "refunds":
            query = query.filter(Notification.event_type.in_(["REFUND_REQUESTED", "REFUND_APPROVED", "REFUND_REJECTED", "REFUND_PROCESSED"]))
        elif cat in ["fees", "deadlines"]:
            query = query.filter(Notification.event_type.in_([
                "FEE_UPCOMING", "FEE_OVERDUE", "STAFF_DEADLINE_ALERT",
                "OVERDUE_ESCALATION", "OVERDUE_CRITICAL_ESCALATION"
            ]))
        elif cat == "risk":
            query = query.filter(Notification.event_type == "HIGH_RISK_DROPOUT")
        else:
            query = query.filter(Notification.event_type == category.upper())

    if from_date:
        query = query.filter(Notification.created_at >= datetime.datetime.combine(from_date, datetime.time.min))
    if to_date:
        query = query.filter(Notification.created_at <= datetime.datetime.combine(to_date, datetime.time.max))

    notifications = query.order_by(Notification.created_at.desc()).offset(offset).limit(limit).all()
    return notifications


@router.get("/unread-count", response_model=UnreadCountResponse)
def get_unread_count(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = get_user_notifications_query(current_user, db)
    count = query.filter(Notification.is_read == False).count()
    return {"unread_count": count}


@router.patch("/{notification_id}/read", response_model=NotificationResponse)
def mark_notification_as_read(
    notification_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = get_user_notifications_query(current_user, db)
    notif = query.filter(Notification.id == notification_id).first()
    if not notif:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found or access forbidden."
        )

    if not notif.is_read:
        notif.is_read = True
        notif.read_at = datetime.datetime.utcnow()
        db.commit()
        db.refresh(notif)

    return notif


@router.post("/mark-all-read", status_code=status.HTTP_200_OK)
def mark_all_notifications_as_read(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = get_user_notifications_query(current_user, db)
    unread_notifs = query.filter(Notification.is_read == False).all()
    now = datetime.datetime.utcnow()
    for n in unread_notifs:
        n.is_read = True
        n.read_at = now
    db.commit()
    return {"marked_count": len(unread_notifs)}


@router.post("/{notification_id}/retry", response_model=NotificationResponse)
def retry_single_notification(
    notification_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role not in ["admin", "accounts_executive", "centre_manager"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only authorized staff or administrators can retry notifications."
        )

    query = db.query(Notification).filter(Notification.id == notification_id)
    if current_user.role in ["accounts_executive", "centre_manager"] and current_user.centre_id:
        query = query.filter(
            or_(
                Notification.centre_id == current_user.centre_id,
                Notification.recipient_id == f"centre_{current_user.centre_id}_staff",
                Notification.recipient_id == f"centre_{current_user.centre_id}_manager"
            )
        )

    notif = query.first()
    if not notif:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found or access forbidden for your centre."
        )

    # Redeliver (simulate delivery success for external gateways)
    notif.delivery_status = "delivered"
    db.commit()
    db.refresh(notif)
    return notif


@router.post("/retry-failed", status_code=status.HTTP_200_OK)
def retry_failed_notifications(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role not in ["admin", "accounts_executive", "centre_manager"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only authorized staff or administrators can retry notifications."
        )

    query = db.query(Notification).filter(Notification.delivery_status == "failed")
    if current_user.role in ["accounts_executive", "centre_manager"] and current_user.centre_id:
        query = query.filter(
            or_(
                Notification.centre_id == current_user.centre_id,
                Notification.recipient_id == f"centre_{current_user.centre_id}_staff",
                Notification.recipient_id == f"centre_{current_user.centre_id}_manager"
            )
        )

    failed_notifs = query.all()
    count = len(failed_notifs)
    for n in failed_notifs:
        n.delivery_status = "delivered"
    
    # Also retry failed reminders
    from app.services.reminders import retry_failed_reminders
    rem_retried = retry_failed_reminders(db)
    
    db.commit()
    return {"retried_notifications": count, "retried_reminders": rem_retried}


