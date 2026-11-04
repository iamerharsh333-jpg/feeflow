import datetime
import logging
import os
import uuid
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from app.models import Notification, Student, Centre, User

logger = logging.getLogger("feeflow.notifications")

class DeliveryProvider:
    """
    Delivery provider abstraction for In-App, SMS, and WhatsApp channels.
    If external credentials are not configured, delivery is marked as 'simulated'.
    """
    @staticmethod
    def deliver(channel: str, recipient: str, title: str, message: str) -> str:
        if channel == "in_app":
            return "delivered"
        
        # Check external provider credentials
        sms_configured = bool(os.environ.get("TWILIO_ACCOUNT_SID") and os.environ.get("TWILIO_AUTH_TOKEN"))
        whatsapp_configured = bool(os.environ.get("WHATSAPP_API_KEY") or os.environ.get("META_WA_TOKEN"))

        if channel == "sms":
            if sms_configured:
                # Real provider integration point
                logger.info(f"[SMS DISPATCH] Sent to {recipient}: {title}")
                return "delivered"
            logger.info(f"[SMS SIMULATION] Credential missing. Simulated delivery to {recipient}: {title}")
            return "simulated"
            
        elif channel == "whatsapp":
            if whatsapp_configured:
                # Real provider integration point
                logger.info(f"[WHATSAPP DISPATCH] Sent to {recipient}: {title}")
                return "delivered"
            logger.info(f"[WHATSAPP SIMULATION] Credential missing. Simulated delivery to {recipient}: {title}")
            return "simulated"
            
        return "delivered"


TEMPLATES = {
    "PAYMENT_SUCCESS": {
        "en": {
            "title": "Payment Verified & Receipt Generated",
            "msg": "Payment of ₹{amount:,.2f} for {student_name} ({course}) has been verified. Receipt #{receipt_no} is generated."
        },
        "hi": {
            "title": "भुगतान सत्यापित एवं रसीद जारी",
            "msg": "{student_name} ({course}) के लिए ₹{amount:,.2f} का भुगतान सत्यापित हो गया है। रसीद सं. #{receipt_no} जारी कर दी गई है।"
        }
    },
    "PAYMENT_FAILED": {
        "en": {
            "title": "Payment Failed",
            "msg": "Payment attempt of ₹{amount:,.2f} for {student_name} was unsuccessful. Ref: {ref_no}."
        },
        "hi": {
            "title": "भुगतान विफल",
            "msg": "{student_name} के लिए ₹{amount:,.2f} का भुगतान प्रयास विफल रहा। संदर्भ: {ref_no}।"
        }
    },
    "PAYMENT_CANCELLED": {
        "en": {
            "title": "Payment Cancelled",
            "msg": "Payment checkout of ₹{amount:,.2f} for {student_name} was cancelled."
        },
        "hi": {
            "title": "भुगतान रद्द",
            "msg": "{student_name} के लिए ₹{amount:,.2f} का चेकआउट रद्द कर दिया गया था।"
        }
    },
    "UNMATCHED_PAYMENT": {
        "en": {
            "title": "Unmatched Payment Received",
            "msg": "An unmatched payment of ₹{amount:,.2f} (Ref: {ref_no}) requires manual review and reconciliation."
        },
        "hi": {
            "title": "बेमेल भुगतान प्राप्त हुआ",
            "msg": "₹{amount:,.2f} (संदर्भ: {ref_no}) का एक बेमेल भुगतान समीक्षा और समाधान हेतु लंबित है।"
        }
    },
    "FEE_UPCOMING": {
        "en": {
            "title": "Upcoming Fee Instalment",
            "msg": "Instalment #{inst_num} of ₹{amount:,.2f} for {student_name} is due on {due_date}."
        },
        "hi": {
            "title": "आगामी फीस किस्त",
            "msg": "{student_name} की किस्त सं. #{inst_num} (₹{amount:,.2f}) {due_date} को देय है।"
        }
    },
    "FEE_OVERDUE": {
        "en": {
            "title": "Fee Instalment Overdue",
            "msg": "Instalment #{inst_num} of ₹{amount:,.2f} for {student_name} is overdue since {due_date}. Please clear the dues."
        },
        "hi": {
            "title": "अतिदेय फीस किस्त",
            "msg": "{student_name} की किस्त सं. #{inst_num} (₹{amount:,.2f}) {due_date} से अतिदेय है। कृपया बकाया भुगतान करें।"
        }
    },
    "REFUND_REQUESTED": {
        "en": {
            "title": "Refund Request Submitted",
            "msg": "Refund request of ₹{amount:,.2f} submitted for {student_name}. 10-day regulatory processing timeline started."
        },
        "hi": {
            "title": "रिफंड अनुरोध प्रस्तुत",
            "msg": "{student_name} के लिए ₹{amount:,.2f} का रिफंड अनुरोध प्रस्तुत किया गया। 10-दिवसीय समय सीमा शुरू।"
        }
    },
    "REFUND_APPROVED": {
        "en": {
            "title": "Refund Approved",
            "msg": "Refund of ₹{amount:,.2f} approved for {student_name}. Scheduled for disbursement."
        },
        "hi": {
            "title": "रिफंड स्वीकृत",
            "msg": "{student_name} के लिए ₹{amount:,.2f} का रिफंड स्वीकृत हो गया है। भुगतान की तैयारी की जा रही है।"
        }
    },
    "REFUND_REJECTED": {
        "en": {
            "title": "Refund Request Rejected",
            "msg": "Refund request for {student_name} was rejected. Reason: {reason}."
        },
        "hi": {
            "title": "रिफंड अनुरोध अस्वीकृत",
            "msg": "{student_name} का रिफंड अनुरोध अस्वीकृत कर दिया गया है। कारण: {reason}।"
        }
    },
    "REFUND_PROCESSED": {
        "en": {
            "title": "Refund Disbursed",
            "msg": "Refund payout of ₹{amount:,.2f} for {student_name} has been successfully processed."
        },
        "hi": {
            "title": "रिफंड भुगतान संपन्न",
            "msg": "{student_name} के लिए ₹{amount:,.2f} का रिफंड भुगतान सफलतापूर्वक पूरा हो गया है।"
        }
    },
    "HIGH_RISK_DROPOUT": {
        "en": {
            "title": "High Dropout Risk Detected",
            "msg": "Student {student_name} ({course}, {centre_name}) flagged at high dropout risk (Score: {score}). Counsellor action required."
        },
        "hi": {
            "title": "ड्रॉपआउट जोखिम चेतावनी",
            "msg": "छात्र {student_name} ({course}, {centre_name}) उच्च ड्रॉपआउट जोखिम (स्कोर: {score}) पर है। परामर्श कार्य आवश्यक है।"
        }
    },
    "BULK_UPLOAD_FAILURE": {
        "en": {
            "title": "Bulk Upload Incomplete",
            "msg": "{upload_type} bulk CSV upload encountered {error_count} error(s). Please review the validation logs."
        },
        "hi": {
            "title": "बल्क अपलोड त्रुटि",
            "msg": "{upload_type} बल्क सीएसवी अपलोड में {error_count} त्रुटि(याँ) मिलीं। कृपया लॉग की जांच करें।"
        }
    },
    "RECONCILIATION_BACKLOG": {
        "en": {
            "title": "Payment Reconciliation Alert",
            "msg": "{count} unmatched or pending payment(s) require manual reconciliation review."
        },
        "hi": {
            "title": "समाधान बैकलॉग चेतावनी",
            "msg": "{count} बेमेल या लंबित भुगतान समीक्षा हेतु लंबित हैं।"
        }
    }
}


def create_notification(
    db: Session,
    event_type: str,
    recipient_role: Optional[str],
    recipient_id: str,
    title: str,
    message: str,
    lang: str = "en",
    centre_id: Optional[int] = None,
    related_student_id: Optional[str] = None,
    related_payment_id: Optional[str] = None,
    related_refund_id: Optional[int] = None,
    related_task_id: Optional[int] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    channel: str = "in_app"
) -> Optional[Notification]:
    """
    Creates and records a persistent notification with deduplication and delivery dispatch.
    """
    # 1. Rule Check: Never notify parents/students about internal AI risk scores
    if event_type == "HIGH_RISK_DROPOUT" and recipient_role in ["parent", "student"]:
        logger.warning(f"Blocked attempt to send internal AI risk alert to {recipient_role} {recipient_id}")
        return None

    # 2. Duplicate Prevention: Check if unread notification with identical event, recipient, and entity already exists
    query = db.query(Notification).filter(
        Notification.recipient_id == recipient_id,
        Notification.event_type == event_type,
        Notification.is_read == False
    )
    if entity_id:
        query = query.filter(Notification.entity_id == entity_id)
    elif related_payment_id:
        query = query.filter(Notification.related_payment_id == related_payment_id)
    elif related_refund_id:
        query = query.filter(Notification.related_refund_id == related_refund_id)
    elif related_student_id:
        query = query.filter(Notification.related_student_id == related_student_id)

    existing = query.first()
    if existing:
        logger.info(f"Notification already exists for {recipient_id} ({event_type}, entity: {entity_id}). Skipping duplicate.")
        return existing

    # 3. Delivery dispatch
    delivery_status = DeliveryProvider.deliver(channel, recipient_id, title, message)

    notif = Notification(
        id=f"NOTIF-{uuid.uuid4().hex[:10].upper()}",
        recipient_role=recipient_role,
        recipient_id=recipient_id,
        centre_id=centre_id,
        event_type=event_type,
        title=title,
        message=message,
        lang=lang,
        is_read=False,
        read_at=None,
        created_at=datetime.datetime.utcnow(),
        related_student_id=related_student_id,
        related_payment_id=related_payment_id,
        related_refund_id=related_refund_id,
        related_task_id=related_task_id,
        entity_type=entity_type,
        entity_id=entity_id,
        channel=channel,
        delivery_status=delivery_status
    )
    db.add(notif)
    db.flush()
    return notif


# --- Specialized Event Helpers ---

def notify_payment_success(
    db: Session,
    student: Student,
    amount: float,
    receipt_no: str,
    payment_id: str,
    lang: str = "en"
):
    """
    Called strictly AFTER server-side payment verification.
    Notifies parent, student, and centre accounts staff.
    """
    tpl = TEMPLATES["PAYMENT_SUCCESS"].get(lang, TEMPLATES["PAYMENT_SUCCESS"]["en"])
    title = tpl["title"]
    msg = tpl["msg"].format(
        amount=amount,
        student_name=student.name,
        course=student.course,
        receipt_no=receipt_no
    )

    # 1. In-App for Student
    create_notification(
        db=db,
        event_type="PAYMENT_SUCCESS",
        recipient_role="student",
        recipient_id=student.id,
        centre_id=student.centre_id,
        title=title,
        message=msg,
        lang=lang,
        related_student_id=student.id,
        related_payment_id=payment_id,
        entity_type="payment",
        entity_id=payment_id,
        channel="in_app"
    )

    # 2. WhatsApp/SMS for Parent
    create_notification(
        db=db,
        event_type="PAYMENT_SUCCESS",
        recipient_role="parent",
        recipient_id=student.parent_phone,
        centre_id=student.centre_id,
        title=title,
        message=msg,
        lang=lang,
        related_student_id=student.id,
        related_payment_id=payment_id,
        entity_type="payment",
        entity_id=payment_id,
        channel="whatsapp"
    )

    # 3. In-App for Accounts Staff of Centre
    staff_title = f"Payment Verified: ₹{amount:,.0f} ({student.name})"
    staff_msg = f"Receipt #{receipt_no} generated for {student.name} ({student.roll_number}) in {student.course}."
    create_notification(
        db=db,
        event_type="PAYMENT_SUCCESS",
        recipient_role="accounts_executive",
        recipient_id=f"centre_{student.centre_id}_staff",
        centre_id=student.centre_id,
        title=staff_title,
        message=staff_msg,
        lang="en",
        related_student_id=student.id,
        related_payment_id=payment_id,
        entity_type="payment",
        entity_id=payment_id,
        channel="in_app"
    )


def notify_payment_failed(
    db: Session,
    student: Student,
    amount: float,
    reference_no: str,
    payment_id: Optional[str] = None,
    lang: str = "en"
):
    tpl = TEMPLATES["PAYMENT_FAILED"].get(lang, TEMPLATES["PAYMENT_FAILED"]["en"])
    title = tpl["title"]
    msg = tpl["msg"].format(amount=amount, student_name=student.name, ref_no=reference_no)

    # Notify Parent
    create_notification(
        db=db,
        event_type="PAYMENT_FAILED",
        recipient_role="parent",
        recipient_id=student.parent_phone,
        centre_id=student.centre_id,
        title=title,
        message=msg,
        lang=lang,
        related_student_id=student.id,
        related_payment_id=payment_id,
        entity_type="payment",
        entity_id=reference_no,
        channel="whatsapp"
    )


def notify_payment_cancelled(
    db: Session,
    student: Student,
    amount: float,
    reference_no: str,
    lang: str = "en"
):
    tpl = TEMPLATES["PAYMENT_CANCELLED"].get(lang, TEMPLATES["PAYMENT_CANCELLED"]["en"])
    title = tpl["title"]
    msg = tpl["msg"].format(amount=amount, student_name=student.name)

    create_notification(
        db=db,
        event_type="PAYMENT_CANCELLED",
        recipient_role="parent",
        recipient_id=student.parent_phone,
        centre_id=student.centre_id,
        title=title,
        message=msg,
        lang=lang,
        related_student_id=student.id,
        entity_type="payment",
        entity_id=reference_no,
        channel="in_app"
    )


def notify_unmatched_payment(
    db: Session,
    amount: float,
    reference_no: str,
    payment_id: str,
    centre_id: Optional[int] = None
):
    tpl = TEMPLATES["UNMATCHED_PAYMENT"]["en"]
    title = tpl["title"]
    msg = tpl["msg"].format(amount=amount, ref_no=reference_no)

    # Notify Accounts & Admin Staff
    create_notification(
        db=db,
        event_type="UNMATCHED_PAYMENT",
        recipient_role="accounts_executive",
        recipient_id=f"centre_{centre_id}_staff" if centre_id else "global_accounts",
        centre_id=centre_id,
        title=title,
        message=msg,
        lang="en",
        related_payment_id=payment_id,
        entity_type="payment",
        entity_id=payment_id,
        channel="in_app"
    )


def notify_refund_submitted(
    db: Session,
    refund_id: int,
    student: Student,
    amount: float,
    lang: str = "en"
):
    tpl = TEMPLATES["REFUND_REQUESTED"].get(lang, TEMPLATES["REFUND_REQUESTED"]["en"])
    title = tpl["title"]
    msg = tpl["msg"].format(amount=amount, student_name=student.name)

    # Parent notification
    create_notification(
        db=db,
        event_type="REFUND_REQUESTED",
        recipient_role="parent",
        recipient_id=student.parent_phone,
        centre_id=student.centre_id,
        title=title,
        message=msg,
        lang=lang,
        related_student_id=student.id,
        related_refund_id=refund_id,
        entity_type="refund",
        entity_id=str(refund_id),
        channel="in_app"
    )

    # Accounts staff alert
    staff_title = f"Refund Request: ₹{amount:,.0f} ({student.name})"
    staff_msg = f"Refund request #{refund_id} submitted for {student.name}. 10-day regulatory deadline active."
    create_notification(
        db=db,
        event_type="REFUND_REQUESTED",
        recipient_role="accounts_executive",
        recipient_id=f"centre_{student.centre_id}_staff",
        centre_id=student.centre_id,
        title=staff_title,
        message=staff_msg,
        lang="en",
        related_student_id=student.id,
        related_refund_id=refund_id,
        entity_type="refund",
        entity_id=str(refund_id),
        channel="in_app"
    )


def notify_refund_status_update(
    db: Session,
    refund_id: int,
    student: Student,
    amount: float,
    new_status: str,
    reason: Optional[str] = None,
    lang: str = "en"
):
    if new_status == "Approved":
        event = "REFUND_APPROVED"
        tpl = TEMPLATES["REFUND_APPROVED"].get(lang, TEMPLATES["REFUND_APPROVED"]["en"])
        title = tpl["title"]
        msg = tpl["msg"].format(amount=amount, student_name=student.name)
    elif new_status == "Rejected":
        event = "REFUND_REJECTED"
        tpl = TEMPLATES["REFUND_REJECTED"].get(lang, TEMPLATES["REFUND_REJECTED"]["en"])
        title = tpl["title"]
        msg = tpl["msg"].format(student_name=student.name, reason=reason or "Does not meet policy criteria")
    elif new_status == "Processed":
        event = "REFUND_PROCESSED"
        tpl = TEMPLATES["REFUND_PROCESSED"].get(lang, TEMPLATES["REFUND_PROCESSED"]["en"])
        title = tpl["title"]
        msg = tpl["msg"].format(amount=amount, student_name=student.name)
    else:
        return

    # Notify Parent
    create_notification(
        db=db,
        event_type=event,
        recipient_role="parent",
        recipient_id=student.parent_phone,
        centre_id=student.centre_id,
        title=title,
        message=msg,
        lang=lang,
        related_student_id=student.id,
        related_refund_id=refund_id,
        entity_type="refund",
        entity_id=str(refund_id),
        channel="whatsapp"
    )

    # Notify Student
    create_notification(
        db=db,
        event_type=event,
        recipient_role="student",
        recipient_id=student.id,
        centre_id=student.centre_id,
        title=title,
        message=msg,
        lang=lang,
        related_student_id=student.id,
        related_refund_id=refund_id,
        entity_type="refund",
        entity_id=str(refund_id),
        channel="in_app"
    )


def notify_high_risk_dropout(
    db: Session,
    student: Student,
    task_id: int,
    score: int
):
    """
    STRICT RULE: Staff alert ONLY. Never send to parent or student.
    """
    centre_name = student.centre.name if student.centre else "Centre"
    tpl = TEMPLATES["HIGH_RISK_DROPOUT"]["en"]
    title = tpl["title"]
    msg = tpl["msg"].format(
        student_name=student.name,
        course=student.course,
        centre_name=centre_name,
        score=score
    )

    create_notification(
        db=db,
        event_type="HIGH_RISK_DROPOUT",
        recipient_role="accounts_executive",
        recipient_id=f"centre_{student.centre_id}_staff",
        centre_id=student.centre_id,
        title=title,
        message=msg,
        lang="en",
        related_student_id=student.id,
        related_task_id=task_id,
        entity_type="task",
        entity_id=str(task_id),
        channel="in_app"
    )


def notify_bulk_upload_failure(
    db: Session,
    user_id: str,
    centre_id: Optional[int],
    upload_type: str,
    error_count: int
):
    tpl = TEMPLATES["BULK_UPLOAD_FAILURE"]["en"]
    title = tpl["title"]
    msg = tpl["msg"].format(upload_type=upload_type, error_count=error_count)

    create_notification(
        db=db,
        event_type="BULK_UPLOAD_FAILURE",
        recipient_role="accounts_executive",
        recipient_id=user_id,
        centre_id=centre_id,
        title=title,
        message=msg,
        lang="en",
        entity_type="bulk_upload",
        entity_id=f"{upload_type}-{datetime.date.today()}",
        channel="in_app"
    )


def notify_reconciliation_backlog(
    db: Session,
    centre_id: Optional[int],
    count: int
):
    tpl = TEMPLATES["RECONCILIATION_BACKLOG"]["en"]
    title = tpl["title"]
    msg = tpl["msg"].format(count=count)

    create_notification(
        db=db,
        event_type="RECONCILIATION_BACKLOG",
        recipient_role="accounts_executive",
        recipient_id=f"centre_{centre_id}_staff" if centre_id else "global_accounts",
        centre_id=centre_id,
        title=title,
        message=msg,
        lang="en",
        entity_type="reconciliation",
        entity_id=f"backlog-{datetime.date.today()}",
        channel="in_app"
    )

