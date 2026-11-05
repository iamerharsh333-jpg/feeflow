import os
import sys
import time
import signal
import uuid
import logging
import argparse
import datetime
from typing import Optional

from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

from app.config import settings
from app.database import engine, Base, SessionLocal
from app.services.reminders import KOLKATA_TZ, get_kolkata_now, get_kolkata_today
from app.services.automation import execute_reminder_scheduler, execute_risk_scan
from app.services.locking import get_default_worker_id

# Configure worker logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger("feeflow.worker")


class FeeFlowWorker:
    """
    Standalone background worker process for FeeFlow.
    Executes automated fee reminders and daily AI risk scans on scheduled intervals.
    
    Guarantees:
    - Multi-process mutual exclusion via database-backed job leasing (JobLock).
    - Asia/Kolkata timezone consistency.
    - Safe error isolation (job failure does not terminate the worker process).
    - Graceful shutdown on SIGINT / SIGTERM signals.
    - Idempotent reminder delivery and payment-triggered cancellation.
    """

    def __init__(
        self,
        worker_id: Optional[str] = None,
        reminder_interval_minutes: Optional[int] = None,
        risk_interval_hours: Optional[int] = None,
        blocking: bool = True
    ):
        self.worker_id = worker_id or get_default_worker_id()
        self.reminder_interval_minutes = reminder_interval_minutes or settings.REMINDER_INTERVAL_MINUTES
        self.risk_interval_hours = risk_interval_hours or settings.RISK_SCAN_INTERVAL_HOURS
        self.blocking = blocking
        self.is_running = False

        if blocking:
            self.scheduler = BlockingScheduler(timezone=KOLKATA_TZ)
        else:
            self.scheduler = BackgroundScheduler(timezone=KOLKATA_TZ)

        self._configure_signals()

    def _configure_signals(self):
        """Attaches graceful termination handlers for SIGINT and SIGTERM."""
        try:
            signal.signal(signal.SIGINT, self._handle_shutdown)
            signal.signal(signal.SIGTERM, self._handle_shutdown)
        except (ValueError, AttributeError):
            # Happens if instantiated outside the main thread (e.g. in certain test runners)
            pass

    def _handle_shutdown(self, signum, frame):
        sig_name = signal.Signals(signum).name if hasattr(signal, "Signals") else str(signum)
        logger.info(f"Received signal {sig_name}. Initiating graceful worker shutdown...")
        self.stop()
        sys.exit(0)

    def run_reminders_now(self) -> dict:
        """Executes one cycle of automated fee reminder checks."""
        logger.info(f"[{self.worker_id}] Starting scheduled reminder execution cycle...")
        db = SessionLocal()
        try:
            res = execute_reminder_scheduler(db, worker_id=self.worker_id)
            status = res.get("status")
            sent = res.get("sent_count", 0)
            items = res.get("items_processed", 0)
            if status == "SUCCESS":
                logger.info(f"[{self.worker_id}] Reminder cycle completed: {sent} reminders sent ({items} instalments processed).")
            elif status == "SKIPPED":
                logger.warning(f"[{self.worker_id}] Reminder cycle skipped: {res.get('message')}")
            elif status == "PAUSED":
                logger.info(f"[{self.worker_id}] Reminder cycle paused (scheduler disabled in config).")
            else:
                logger.info(f"[{self.worker_id}] Reminder cycle finished with status: {status}")
            return res
        except Exception as e:
            logger.exception(f"[{self.worker_id}] Unhandled error in scheduled reminder job: {e}")
            db.rollback()
            return {"status": "FAILED", "error": str(e)}
        finally:
            db.close()

    def run_risk_now(self) -> dict:
        """Executes one cycle of daily AI student risk analysis."""
        logger.info(f"[{self.worker_id}] Starting daily AI student risk scan...")
        db = SessionLocal()
        try:
            res = execute_risk_scan(db, worker_id=self.worker_id)
            status = res.get("status")
            if status == "SUCCESS":
                logger.info(
                    f"[{self.worker_id}] Risk scan completed successfully: "
                    f"{res.get('students_analyzed', 0)} students analyzed, "
                    f"{res.get('high_risk_count', 0)} high risk, "
                    f"{res.get('tasks_updated', 0)} tasks updated."
                )
            elif status == "SKIPPED":
                logger.warning(f"[{self.worker_id}] Risk scan skipped: {res.get('message')}")
            else:
                logger.info(f"[{self.worker_id}] Risk scan finished with status: {status}")
            return res
        except Exception as e:
            logger.exception(f"[{self.worker_id}] Unhandled error in daily risk scan: {e}")
            db.rollback()
            return {"status": "FAILED", "error": str(e)}
        finally:
            db.close()

    def run_once(self) -> dict:
        """Runs both jobs immediately once and returns the combined results."""
        self._ensure_database_ready()
        logger.info(f"[{self.worker_id}] Running single-pass worker cycle...")
        rem_res = self.run_reminders_now()
        risk_res = self.run_risk_now()
        return {
            "worker_id": self.worker_id,
            "reminders": rem_res,
            "risk_scan": risk_res,
            "executed_at": get_kolkata_now().isoformat()
        }

    def _ensure_database_ready(self):
        """Ensures all database tables exist before scheduler starts."""
        Base.metadata.create_all(bind=engine)

    def start(self):
        """Registers scheduled interval jobs and begins worker execution."""
        self._ensure_database_ready()
        self.is_running = True

        logger.info("=" * 65)
        logger.info(f"  FeeFlow Standalone Background Worker Starting")
        logger.info(f"  Worker ID         : {self.worker_id}")
        logger.info(f"  Process PID       : {os.getpid()}")
        logger.info(f"  Timezone          : Asia/Kolkata ({get_kolkata_now().strftime('%Y-%m-%d %H:%M:%S %Z')})")
        logger.info(f"  Reminder Cadence  : Every {self.reminder_interval_minutes} minutes")
        logger.info(f"  Risk Scan Cadence : Every {self.risk_interval_hours} hours")
        logger.info("=" * 65)

        # Schedule jobs
        self.scheduler.add_job(
            self.run_reminders_now,
            trigger=IntervalTrigger(minutes=self.reminder_interval_minutes, timezone=KOLKATA_TZ),
            id="reminder_check",
            name="FeeFlow Automated Due Reminders",
            replace_existing=True,
            next_run_time=get_kolkata_now()  # Run initial reminder check immediately upon worker startup
        )

        self.scheduler.add_job(
            self.run_risk_now,
            trigger=IntervalTrigger(hours=self.risk_interval_hours, timezone=KOLKATA_TZ),
            id="daily_risk_scan",
            name="FeeFlow Daily AI Student Risk Analysis",
            replace_existing=True
        )

        try:
            self.scheduler.start()
        except (KeyboardInterrupt, SystemExit):
            self.stop()

    def stop(self):
        """Gracefully shuts down the background scheduler."""
        if self.scheduler and self.scheduler.running:
            logger.info(f"[{self.worker_id}] Shutting down APScheduler...")
            self.scheduler.shutdown(wait=False)
        self.is_running = False
        logger.info(f"[{self.worker_id}] Worker stopped cleanly.")


def main():
    """CLI entry point for running `python -m app.worker`."""
    parser = argparse.ArgumentParser(description="FeeFlow Standalone Background Worker")
    parser.add_argument(
        "--run-once",
        action="store_true",
        help="Run one complete cycle of reminders and risk analysis, then exit."
    )
    parser.add_argument(
        "--reminder-interval",
        type=int,
        default=None,
        help=f"Reminder interval in minutes (default: {settings.REMINDER_INTERVAL_MINUTES})"
    )
    parser.add_argument(
        "--risk-interval",
        type=int,
        default=None,
        help=f"Risk scan interval in hours (default: {settings.RISK_SCAN_INTERVAL_HOURS})"
    )
    parser.add_argument(
        "--worker-id",
        type=str,
        default=None,
        help="Custom worker instance identifier"
    )

    args = parser.parse_args()

    worker = FeeFlowWorker(
        worker_id=args.worker_id,
        reminder_interval_minutes=args.reminder_interval,
        risk_interval_hours=args.risk_interval,
        blocking=True
    )

    if args.run_once:
        res = worker.run_once()
        print(f"Run-once finished: Reminders={res['reminders'].get('status')}, Risk={res['risk_scan'].get('status')}")
        sys.exit(0)
    else:
        worker.start()


if __name__ == "__main__":
    main()

