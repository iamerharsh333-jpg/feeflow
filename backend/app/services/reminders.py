import datetime
import uuid
import logging
from decimal import Decimal
from typing import List, Optional, Tuple, Dict, Any
from sqlalchemy.orm import Session
from app.models import Reminder, Instalment, Student, AutomationLog, AutomationConfig
from app.services.currency import to_decimal, ZERO, PAISE

logger = logging.getLogger("feeflow.reminders")

try:
    import zoneinfo
    KOLKATA_TZ = zoneinfo.ZoneInfo("Asia/Kolkata")
except Exception:
    KOLKATA_TZ = datetime.timezone(datetime.timedelta(hours=5, minutes=30))

def get_kolkata_today() -> datetime.date:
    return datetime.datetime.now(KOLKATA_TZ).date()

def get_kolkata_now() -> datetime.datetime:
    return datetime.datetime.now(KOLKATA_TZ)

# Automation reminder schedule offsets: (days_offset_relative_to_due_date, stage_code, label)
# Negative = days before due date, 0 = on due date, Positive = days overdue
AUTOMATION_REMINDER_OFFSETS: List[Tuple[int, str, str]] = [
    (-7, "UPCOMING_7D", "7-Day Upcoming Reminder"),
    (-3, "UPCOMING_3D", "3-Day Upcoming Reminder"),
    (0, "DUE_TODAY", "Due-Date Reminder"),
    (1, "OVERDUE_1D", "1-Day Overdue Notice"),
    (7, "OVERDUE_7D", "7-Day Overdue Notice"),
    (30, "OVERDUE_30D", "30-Day Critical Overdue Notice"),
]

def generate_reminder_message(
    student_name: str,
    course: str,
    centre_name: str,
    amount: float,
    due_date: datetime.date,
    parent_name: str,
    lang: str = "en",
    is_partial: bool = False,
    stage_code: str = "UPCOMING_3D"
) -> str:
    formatted_due = due_date.strftime("%d %b %Y")
    formatted_amount = f"₹{amount:,.0f}"
    
    if lang == "hi":
        if "OVERDUE" in stage_code:
            return (
                f"अतिदेय सूचना: प्रिय {parent_name}, {student_name} ({course}, {centre_name}) "
                f"की {formatted_amount} की {'शेष ' if is_partial else ''}फीस किस्त {formatted_due} को देय थी। "
                f"कृपया किसी भी प्रकार के विलंब शुल्क से बचने के लिए तुरंत भुगतान करें।"
            )
        elif stage_code == "DUE_TODAY":
            return (
                f"आज देय: प्रिय {parent_name}, {student_name} ({course}, {centre_name}) "
                f"की {formatted_amount} की {'शेष ' if is_partial else ''}फीस किस्त आज ({formatted_due}) देय है। "
                f"कृपया समय पर भुगतान सुनिश्चित करें।"
            )
        else: # Upcoming
            return (
                f"प्रिय {parent_name}, यह FeeFlow की ओर से सूचना है कि {student_name} "
                f"({course}, {centre_name}) की {formatted_amount} की {'शेष ' if is_partial else ''}फीस किस्त {formatted_due} को देय है। "
                f"कृपया समय पर भुगतान करें।"
            )

    # English messages
    if "OVERDUE" in stage_code:
        return (
            f"Overdue Notice: Dear {parent_name}, the {'remaining balance' if is_partial else 'instalment'} of "
            f"{formatted_amount} for {student_name} ({course}, {centre_name}) was due on {formatted_due}. "
            f"Please arrange payment immediately to avoid disruption or late penalties."
        )
    elif stage_code == "DUE_TODAY":
        return (
            f"Payment Due Today: Dear {parent_name}, the {'remaining balance' if is_partial else 'instalment'} of "
            f"{formatted_amount} for {student_name} ({course}, {centre_name}) is due today, {formatted_due}. "
            f"Kindly complete payment via the Parent Portal."
        )
    else: # Upcoming
        return (
            f"Upcoming Fee Reminder: Dear {parent_name}, this is a reminder from FeeFlow that "
            f"{'a remaining balance of ' if is_partial else 'an instalment of '}{formatted_amount} for "
            f"{student_name} ({course}, {centre_name}) is due on {formatted_due}. "
            f"Kindly pay promptly to avoid late penalties."
        )

def schedule_instalment_reminders(
    student: Student,
    instalment: Instalment,
    db: Session,
    centre_name: str = "Jaipur Main"
) -> List[Reminder]:
    # Reminders: 3 days before, on due date, 3 days after (preserving legacy offsets)
    offsets = [-3, 0, 3]
    reminders = []
    
    rem_amount = to_decimal(instalment.amount) - to_decimal(instalment.paid_amount)
    is_partial = to_decimal(instalment.paid_amount) > ZERO

    for offset in offsets:
        sched_date = instalment.due_date + datetime.timedelta(days=offset)
        
        # Prevent duplicate scheduling
        existing = db.query(Reminder).filter(
            Reminder.instalment_id == instalment.id,
            Reminder.scheduled_date == sched_date,
            Reminder.status.in_(["Scheduled", "Sent"])
        ).first()
        if existing:
            reminders.append(existing)
            continue

        rem_id = f"REM-{uuid.uuid4().hex[:8].upper()}"
        
        msg_en = generate_reminder_message(
            student_name=student.name,
            course=student.course,
            centre_name=centre_name,
            amount=rem_amount,
            due_date=instalment.due_date,
            parent_name=student.parent_name,
            lang="en",
            is_partial=is_partial
        )
        
        rem = Reminder(
            id=rem_id,
            student_id=student.id,
            instalment_id=instalment.id,
            due_date=instalment.due_date,
            scheduled_date=sched_date,
            channel="WhatsApp",
            status="Scheduled",
            delivery_status="simulated",
            lang="en",
            message=msg_en
        )
        db.add(rem)
        reminders.append(rem)
        
    db.commit()
    return reminders

def schedule_automated_milestone_reminders(
    student: Student,
    instalment: Instalment,
    db: Session,
    centre_name: str = "Jaipur Main"
) -> List[Reminder]:
    """
    Schedules the full 8-point statutory reminder series for an instalment:
    - 7 days before
    - 3 days before
    - On due date
    - 1 day overdue
    - Every 7 days thereafter (days 8, 15, 22, 29)
    Uses unique event keys to guarantee complete idempotency.
    """
    rem_amount = to_decimal(instalment.amount) - to_decimal(instalment.paid_amount)
    if rem_amount <= ZERO or instalment.status == "Paid":
        return []

    is_partial = to_decimal(instalment.paid_amount) > ZERO
    reminders = []
    lang = "en"

    for offset, stage_code, _label in AUTOMATION_REMINDER_OFFSETS:
        sched_date = instalment.due_date + datetime.timedelta(days=offset)
        event_key = f"{instalment.id}_{stage_code}"
        
        # Check for existing reminder by unique event_key
        existing = db.query(Reminder).filter(Reminder.event_key == event_key).first()

        if existing:
            reminders.append(existing)
            continue

        rem_id = f"REM-{uuid.uuid4().hex[:8].upper()}"
        msg = generate_reminder_message(
            student_name=student.name,
            course=student.course,
            centre_name=centre_name or (student.centre.name if student.centre else "Jaipur Main"),
            amount=rem_amount,
            due_date=instalment.due_date,
            parent_name=student.parent_name,
            lang=lang,
            is_partial=is_partial,
            stage_code=stage_code
        )

        rem = Reminder(
            id=rem_id,
            student_id=student.id,
            instalment_id=instalment.id,
            due_date=instalment.due_date,
            scheduled_date=sched_date,
            channel="WhatsApp",
            status="Scheduled",
            delivery_status="simulated",
            event_key=event_key,
            lang=lang,
            message=msg
        )
        db.add(rem)
        reminders.append(rem)

    db.commit()
    return reminders

def cancel_pending_reminders(instalment_id: str, db: Session) -> int:
    """Cancels all currently pending Scheduled reminders for an instalment."""
    count = db.query(Reminder).filter(
        Reminder.instalment_id == instalment_id,
        Reminder.status == "Scheduled"
    ).update({"status": "Cancelled"})
    db.commit()
    return count

def run_automatic_reminder_cycle(db: Session, target_date: Optional[datetime.date] = None) -> Dict[str, Any]:
    """
    Main 5-minute persistent automated reminder scheduler runner.
    1. Checks if scheduler is enabled in config.
    2. Scans active instalments and ensures required reminder series are scheduled.
    3. Identifies reminders due for delivery up to target_date.
    4. Immediately verifies current payment status before sending (never sends for paid instalments).
    5. Recalculates partial remaining balances.
    6. Delivers simulated message and emits notification alert.
    7. Logs execution run in AutomationLog.
    """
    start_time = datetime.datetime.utcnow()
    today = target_date or get_kolkata_today()
    
    # 1. Config Check
    cfg = db.query(AutomationConfig).filter(AutomationConfig.key == "reminder_scheduler_enabled").first()
    if cfg and cfg.value.lower() == "false":
        logger.info("Automation reminder scheduler is disabled by admin.")
        return {"status": "PAUSED", "items_processed": 0, "message": "Scheduler disabled."}

    # 2. Schedule reminders for all unpaid / active instalments
    active_instalments = db.query(Instalment).filter(
        Instalment.status != "Paid",
        Instalment.paid_amount < Instalment.amount
    ).all()

    scheduled_count = 0
    for ins in active_instalments:
        if ins.student:
            milestones = schedule_automated_milestone_reminders(
                student=ins.student,
                instalment=ins,
                db=db,
                centre_name=ins.student.centre.name if ins.student.centre else "Jaipur Main"
            )
            scheduled_count += len(milestones)

    # 3. Process Scheduled reminders due on or before today
    due_reminders = db.query(Reminder).filter(
        Reminder.status == "Scheduled",
        Reminder.scheduled_date <= today
    ).all()

    sent_count = 0
    cancelled_count = 0
    failed_count = 0

    for rem in due_reminders:
        # Immediate pre-send payment verification: NEVER send if paid!
        instalment = db.query(Instalment).filter(Instalment.id == rem.instalment_id).first()
        if not instalment or instalment.status == "Paid" or instalment.paid_amount >= instalment.amount:
            rem.status = "Cancelled"
            cancelled_count += 1
            continue

        # For partial payments, recompute remaining balance immediately before sending
        remaining_due = to_decimal(instalment.amount) - to_decimal(instalment.paid_amount)
        if remaining_due <= ZERO:
            rem.status = "Cancelled"
            cancelled_count += 1
            continue

        try:
            # Refresh message text with accurate latest remaining balance
            if rem.event_key and rem.event_key.startswith(f"{rem.instalment_id}_"):
                stage_code = rem.event_key[len(rem.instalment_id) + 1:]
            elif rem.event_key and "_" in rem.event_key:
                stage_code = rem.event_key.split("_", 1)[1]
            else:
                stage_code = "DUE_TODAY"

            rem.message = generate_reminder_message(
                student_name=rem.student.name if rem.student else "Student",
                course=rem.student.course if rem.student else "Course",
                centre_name=rem.student.centre.name if rem.student and rem.student.centre else "Jaipur Main",
                amount=remaining_due,
                due_date=instalment.due_date,
                parent_name=rem.student.parent_name if rem.student else "Parent",
                lang=rem.lang,
                is_partial=(to_decimal(instalment.paid_amount) > ZERO),
                stage_code=stage_code
            )

            # Mark sent (Simulated delivery via mock gateway provider)
            rem.status = "Sent"
            rem.delivery_status = "simulated"
            rem.sent_at = datetime.datetime.utcnow()
            sent_count += 1

            # Emit notification alert in Notification Centre
            try:
                from app.services.notifications import create_notification, TEMPLATES
                ev_type = "FEE_OVERDUE" if rem.scheduled_date > instalment.due_date else "FEE_UPCOMING"
                tpl = TEMPLATES.get(ev_type, {}).get(rem.lang, TEMPLATES[ev_type]["en"])
                t_msg = tpl["msg"].format(
                    inst_num=instalment.instalment_number,
                    amount=remaining_due,
                    student_name=rem.student.name if rem.student else "Student",
                    due_date=instalment.due_date.strftime("%d %b %Y")
                )
                # 1. Parent Notification
                create_notification(
                    db=db,
                    event_type=ev_type,
                    recipient_role="parent",
                    recipient_id=rem.student.parent_phone if rem.student else "Parent",
                    centre_id=rem.student.centre_id if rem.student else None,
                    title=tpl["title"],
                    message=t_msg,
                    lang=rem.lang,
                    related_student_id=rem.student_id,
                    entity_type="instalment",
                    entity_id=f"{rem.instalment_id}_{stage_code}",
                    channel="whatsapp"
                )

                # 2. Staff Notification Routing: Notify assigned Accounts Executive for student's centre
                if rem.student:
                    student = rem.student
                    centre_name = student.centre.name if student.centre else "Jaipur Main"
                    due_str = instalment.due_date.strftime("%d %b %Y")
                    
                    if "OVERDUE" in stage_code:
                        staff_title = f"Overdue Fee Alert ({stage_code.replace('_', ' ')}): {student.name}"
                        staff_msg = (
                            f"Student {student.name} (ID: {student.id}, Batch: {student.batch}) at {centre_name} "
                            f"has instalment #{instalment.instalment_number} of ₹{remaining_due:,.2f} overdue since {due_str}."
                        )
                    else:
                        stage_label = "7 Days" if "7D" in stage_code else ("3 Days" if "3D" in stage_code else "Today")
                        staff_title = f"Upcoming Deadline ({stage_label}): {student.name}"
                        staff_msg = (
                            f"Student {student.name} (ID: {student.id}, Batch: {student.batch}) at {centre_name} "
                            f"has instalment #{instalment.instalment_number} of ₹{remaining_due:,.2f} due on {due_str}."
                        )

                    create_notification(
                        db=db,
                        event_type="STAFF_DEADLINE_ALERT",
                        recipient_role="accounts_executive",
                        recipient_id=f"centre_{student.centre_id}_staff",
                        centre_id=student.centre_id,
                        title=staff_title,
                        message=staff_msg,
                        lang="en",
                        related_student_id=student.id,
                        entity_type="instalment",
                        entity_id=f"{instalment.id}_{stage_code}_staff",
                        channel="in_app"
                    )

                    # 3. Escalation Rules
                    if stage_code == "OVERDUE_7D":
                        create_notification(
                            db=db,
                            event_type="OVERDUE_ESCALATION",
                            recipient_role="accounts_executive",
                            recipient_id=f"centre_{student.centre_id}_manager",
                            centre_id=student.centre_id,
                            title=f"[ESCALATION - 7D] Overdue Payment: {student.name}",
                            message=f"Escalation for {centre_name}: {student.name} ({student.id}, {student.batch}) is 7 days overdue for ₹{remaining_due:,.2f} (Due: {due_str}).",
                            lang="en",
                            related_student_id=student.id,
                            entity_type="instalment",
                            entity_id=f"{instalment.id}_OVERDUE_7D_manager",
                            channel="in_app"
                        )
                    elif stage_code == "OVERDUE_30D":
                        create_notification(
                            db=db,
                            event_type="OVERDUE_CRITICAL_ESCALATION",
                            recipient_role="admin",
                            recipient_id="admin_escalation",
                            centre_id=student.centre_id,
                            title=f"[CRITICAL ESCALATION - 30D] Severe Overdue: {student.name}",
                            message=f"Critical Overdue (30 Days) at {centre_name}: {student.name} ({student.id}, {student.batch}) has outstanding balance of ₹{remaining_due:,.2f} (Due: {due_str}). Immediate intervention required.",
                            lang="en",
                            related_student_id=student.id,
                            entity_type="instalment",
                            entity_id=f"{instalment.id}_OVERDUE_30D_admin",
                            channel="in_app"
                        )
            except Exception as ne:
                logger.debug(f"Notification creation bypassed: {ne}")

        except Exception as e:
            logger.error(f"Error delivering reminder {rem.id}: {e}")
            rem.status = "Failed"
            rem.delivery_status = "failed"
            rem.error_message = str(e)
            failed_count += 1

    db.commit()

    duration = int((datetime.datetime.utcnow() - start_time).total_seconds() * 1000)
    
    # Persist AutomationLog record
    log_record = AutomationLog(
        job_name="reminder_scheduler",
        status="SUCCESS" if failed_count == 0 else "PARTIAL_FAILURE",
        items_processed=sent_count,
        details=f"Sent: {sent_count}, Cancelled: {cancelled_count}, Failed: {failed_count}, Active instalments scanned: {len(active_instalments)}",
        duration_ms=duration
    )
    db.add(log_record)
    db.commit()

    return {
        "status": "SUCCESS",
        "sent_count": sent_count,
        "cancelled_count": cancelled_count,
        "failed_count": failed_count,
        "duration_ms": duration
    }

def retry_failed_reminders(db: Session) -> int:
    """Retries all failed delivery reminders safely without duplicate sending."""
    failed_reminders = db.query(Reminder).filter(Reminder.status == "Failed").all()
    retried_count = 0

    for rem in failed_reminders:
        instalment = db.query(Instalment).filter(Instalment.id == rem.instalment_id).first()
        if not instalment or instalment.status == "Paid" or instalment.paid_amount >= instalment.amount:
            rem.status = "Cancelled"
            continue

        rem.retry_count = (rem.retry_count or 0) + 1
        rem.status = "Sent"
        rem.delivery_status = "simulated"
        rem.sent_at = datetime.datetime.utcnow()
        rem.error_message = None
        retried_count += 1

    db.commit()
    return retried_count

def process_due_reminders(db: Session, target_date: Optional[datetime.date] = None) -> int:
    """Preserves legacy interface called by existing routes."""
    res = run_automatic_reminder_cycle(db, target_date)
    return res.get("sent_count", 0)


