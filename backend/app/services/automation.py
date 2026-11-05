import datetime
import threading
import logging
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from app.config import settings
from app.models import AutomationLog, AutomationConfig, Reminder, Payment, CounsellorTask
from app.services.locking import acquire_job_lock, release_job_lock, get_job_lock_info
from app.services.reminders import get_kolkata_today, get_kolkata_now

logger = logging.getLogger("feeflow.automation")

# In-memory execution locks to ensure strict process-local thread safety
_SCHEDULER_LOCK = threading.Lock()
_RISK_LOCK = threading.Lock()


def get_automation_status(db: Session) -> Dict[str, Any]:
    """Retrieves full system metrics and automation engine health."""
    today = get_kolkata_today()
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
    interval_mins = settings.REMINDER_INTERVAL_MINUTES
    next_reminder_time = (
        (last_reminder_time + datetime.timedelta(minutes=interval_mins))
        if last_reminder_time
        else (datetime.datetime.utcnow() + datetime.timedelta(minutes=interval_mins))
    )

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
        "scheduler_interval_minutes": interval_mins,
        "standalone_worker_mode": settings.STANDALONE_WORKER_MODE,
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
        "recent_logs": recent_logs,
        "reminder_lock": get_job_lock_info("reminder_scheduler", db),
        "risk_lock": get_job_lock_info("risk_analysis", db)
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


def execute_reminder_scheduler(
    db: Session,
    target_date: Optional[datetime.date] = None,
    worker_id: Optional[str] = None,
    lease_seconds: Optional[int] = None
) -> Dict[str, Any]:
    """
    Thread-safe and multi-process safe idempotent execution of automatic reminder cycle.
    Uses database-backed distributed lease to guarantee that concurrent workers
    or API calls cannot execute the reminder scheduler simultaneously.
    """
    if not _SCHEDULER_LOCK.acquire(blocking=False):
        return {
            "status": "SKIPPED",
            "message": "Reminder scheduler is already executing in another thread. Duplicate run prevented."
        }
    try:
        secs = lease_seconds or settings.JOB_LOCK_LEASE_SECONDS
        acquired, wid = acquire_job_lock("reminder_scheduler", db, lease_seconds=secs, worker_id=worker_id)
        if not acquired:
            logger.info("Reminder scheduler skipped: job lock is held by another worker process.")
            return {
                "status": "SKIPPED",
                "message": "Reminder scheduler is currently locked by another worker process. Duplicate run prevented."
            }
        try:
            from app.services.reminders import run_automatic_reminder_cycle
            return run_automatic_reminder_cycle(db, target_date)
        finally:
            release_job_lock("reminder_scheduler", wid, db)
    finally:
        _SCHEDULER_LOCK.release()


def execute_risk_scan(
    db: Session,
    worker_id: Optional[str] = None,
    lease_seconds: Optional[int] = None
) -> Dict[str, Any]:
    """
    Thread-safe and multi-process safe idempotent execution of daily AI risk analysis.
    Uses database-backed distributed lease to guarantee that concurrent workers
    or API calls cannot execute the risk analysis simultaneously.
    """
    if not _RISK_LOCK.acquire(blocking=False):
        return {
            "status": "SKIPPED",
            "message": "AI risk analysis is already running in another thread. Duplicate run prevented."
        }
    try:
        secs = lease_seconds or (settings.JOB_LOCK_LEASE_SECONDS * 2)
        acquired, wid = acquire_job_lock("risk_analysis", db, lease_seconds=secs, worker_id=worker_id)
        if not acquired:
            logger.info("AI risk scan skipped: job lock is held by another worker process.")
            return {
                "status": "SKIPPED",
                "message": "AI risk analysis is currently locked by another worker process. Duplicate run prevented."
            }
        try:
            from app.services.risk import run_daily_ai_risk_analysis
            return run_daily_ai_risk_analysis(db)
        finally:
            release_job_lock("risk_analysis", wid, db)
    finally:
        _RISK_LOCK.release()
