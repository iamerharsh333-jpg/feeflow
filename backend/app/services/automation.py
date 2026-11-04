import datetime
import threading
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from app.models import AutomationLog, AutomationConfig, Reminder, Payment, CounsellorTask

# In-memory execution locks to ensure strict idempotency and prevent multiple concurrent runs
_SCHEDULER_LOCK = threading.Lock()
_RISK_LOCK = threading.Lock()

def get_automation_status(db: Session) -> Dict[str, Any]:
    """Retrieves full system metrics and automation engine health."""
    today = datetime.date.today()
    today_start = datetime.datetime.combine(today, datetime.time.min)

    # 1. Config status
    cfg = db.query(AutomationConfig).filter(AutomationConfig.key == "reminder_scheduler_enabled").first()
    scheduler_enabled = True if not cfg else (cfg.value.lower() == "true")

    # 2. Last executions
    last_reminder_log = db.query(AutomationLog).filter(
        AutomationLog.job_name == "reminder_scheduler"
    ).order_by(AutomationLog.executed_at.desc()).first()

    last_risk_log = db.query(AutomationLog).filter(
        AutomationLog.job_name == "risk_analysis"
    ).order_by(AutomationLog.executed_at.desc()).first()

    last_reminder_time = last_reminder_log.executed_at if last_reminder_log else None
    next_reminder_time = (last_reminder_time + datetime.timedelta(minutes=5)) if last_reminder_time else (datetime.datetime.utcnow() + datetime.timedelta(minutes=5))

    # 3. Reminder counts
    reminders_today = db.query(Reminder).filter(
        (Reminder.created_at >= today_start) | (Reminder.sent_at >= today_start)
    ).count()

    reminders_delivered = db.query(Reminder).filter(Reminder.status == "Sent").count()
    reminders_failed = db.query(Reminder).filter(Reminder.status == "Failed").count()
    reminders_cancelled = db.query(Reminder).filter(Reminder.status == "Cancelled").count()

    # 4. Payment counts
    payments_matched = db.query(Payment).filter(Payment.status == "Success").count()
    payments_unmatched = db.query(Payment).filter(Payment.status.in_(["Unmatched", "Under Review"])).count()

    # 5. Failed automation jobs count
    failed_jobs_count = db.query(AutomationLog).filter(
        AutomationLog.status.in_(["FAILED", "PARTIAL_FAILURE"])
    ).count()

    # 6. Recent logs
    logs = db.query(AutomationLog).order_by(AutomationLog.executed_at.desc()).limit(15).all()
    recent_logs = [
        {
            "id": l.id,
            "job_name": l.job_name,
            "status": l.status,
            "items_processed": l.items_processed,
            "details": l.details,
            "duration_ms": l.duration_ms,
            "executed_at": l.executed_at.isoformat() if l.executed_at else None
        }
        for l in logs
    ]

    return {
        "scheduler_enabled": scheduler_enabled,
        "scheduler_interval_minutes": 5,
        "last_reminder_execution": last_reminder_time.isoformat() if last_reminder_time else None,
        "next_scheduled_execution": next_reminder_time.isoformat() if next_reminder_time else None,
        "reminders_today": reminders_today,
        "reminders_delivered": reminders_delivered,
        "reminders_failed": reminders_failed,
        "reminders_cancelled": reminders_cancelled,
        "payments_matched": payments_matched,
        "payments_unmatched": payments_unmatched,
        "last_risk_execution": last_risk_log.executed_at.isoformat() if last_risk_log and last_risk_log.executed_at else None,
        "failed_jobs_count": failed_jobs_count,
        "recent_logs": recent_logs
    }

def set_scheduler_state(enabled: bool, db: Session) -> bool:
    """Enables or disables background reminder automation."""
    cfg = db.query(AutomationConfig).filter(AutomationConfig.key == "reminder_scheduler_enabled").first()
    if not cfg:
        cfg = AutomationConfig(key="reminder_scheduler_enabled", value=str(enabled).lower())
        db.add(cfg)
    else:
        cfg.value = str(enabled).lower()
        cfg.updated_at = datetime.datetime.utcnow()
    db.commit()
    return enabled

def execute_reminder_scheduler(db: Session, target_date: Optional[datetime.date] = None) -> Dict[str, Any]:
    """Thread-safe idempotent execution of automatic reminder cycle."""
    if not _SCHEDULER_LOCK.acquire(blocking=False):
        return {
            "status": "SKIPPED",
            "message": "Reminder scheduler is already executing in another thread. Duplicate run prevented."
        }
    try:
        from app.services.reminders import run_automatic_reminder_cycle
        return run_automatic_reminder_cycle(db, target_date)
    finally:
        _SCHEDULER_LOCK.release()

def execute_risk_scan(db: Session) -> Dict[str, Any]:
    """Thread-safe idempotent execution of daily AI risk analysis."""
    if not _RISK_LOCK.acquire(blocking=False):
        return {
            "status": "SKIPPED",
            "message": "AI risk analysis is already running. Duplicate run prevented."
        }
    try:
        from app.services.risk import run_daily_ai_risk_analysis
        return run_daily_ai_risk_analysis(db)
    finally:
        _RISK_LOCK.release()

