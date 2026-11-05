import os
import datetime
from decimal import Decimal
import pytest
from sqlalchemy import or_

from app.config import settings
from app.models import Student, Instalment, Reminder, Payment, AutomationLog, JobLock
from app.services.currency import to_decimal
from app.services.reminders import (
    schedule_automated_milestone_reminders,
    cancel_pending_reminders,
    run_automatic_reminder_cycle,
    KOLKATA_TZ,
    get_kolkata_now,
    get_kolkata_today,
    AUTOMATION_REMINDER_OFFSETS
)
from app.services.locking import (
    acquire_job_lock,
    release_job_lock,
    get_job_lock_info,
    force_release_job_lock
)
from app.services.automation import (
    execute_reminder_scheduler,
    execute_risk_scan,
    get_automation_status
)
from app.worker import FeeFlowWorker
from app.main import scheduler


# -------------------------------------------------------------
# 1. Standalone Worker Mode in FastAPI
# -------------------------------------------------------------
def test_api_startup_standalone_mode_does_not_start_scheduler():
    """
    Test that when STANDALONE_WORKER_MODE=True, FastAPI lifespan does not start
    the BackgroundScheduler inside the web process.
    """
    assert settings.STANDALONE_WORKER_MODE is True
    # In standalone worker mode, scheduler instance must remain inactive
    assert scheduler.running is False


# -------------------------------------------------------------
# 2. Database-backed Job Locking / Duplicate Worker Prevention
# -------------------------------------------------------------
def test_duplicate_worker_prevention_reminder_scheduler(db_session):
    """
    Verify that two worker processes cannot execute the reminder scheduler simultaneously.
    Worker 1 acquires the lock; Worker 2 is rejected; Worker 1 releases; Worker 2 can acquire.
    """
    worker_1_id = "worker-process-alpha-1"
    worker_2_id = "worker-process-beta-2"

    # Step 1: Worker 1 acquires lock
    acquired_1, wid_1 = acquire_job_lock("reminder_scheduler", db_session, lease_seconds=300, worker_id=worker_1_id)
    assert acquired_1 is True
    assert wid_1 == worker_1_id

    # Verify lock info in database
    info = get_job_lock_info("reminder_scheduler", db_session)
    assert info["is_locked"] is True
    assert info["locked_by"] == worker_1_id

    # Step 2: Worker 2 attempts to run execute_reminder_scheduler concurrently
    res_2 = execute_reminder_scheduler(db_session, worker_id=worker_2_id)
    assert res_2["status"] == "SKIPPED"
    assert "locked by another worker process" in res_2["message"]

    # Step 3: Worker 1 releases lock
    released = release_job_lock("reminder_scheduler", worker_1_id, db_session)
    assert released is True

    # Step 4: Worker 2 can now successfully execute
    res_3 = execute_reminder_scheduler(db_session, worker_id=worker_2_id)
    assert res_3["status"] in ["SUCCESS", "PAUSED"]

    # Lock is released after completion
    info_after = get_job_lock_info("reminder_scheduler", db_session)
    assert info_after["is_locked"] is False


def test_duplicate_worker_prevention_risk_scan(db_session):
    """
    Verify that two worker processes cannot execute the daily risk scan simultaneously.
    """
    worker_1 = "worker-risk-proc-1"
    worker_2 = "worker-risk-proc-2"

    acquired, _ = acquire_job_lock("risk_analysis", db_session, lease_seconds=600, worker_id=worker_1)
    assert acquired is True

    # Concurrent attempt by worker 2 is rejected
    res_2 = execute_risk_scan(db_session, worker_id=worker_2)
    assert res_2["status"] == "SKIPPED"
    assert "locked by another worker process" in res_2["message"]

    # Worker 1 releases
    release_job_lock("risk_analysis", worker_1, db_session)

    # Worker 2 can now run
    res_3 = execute_risk_scan(db_session, worker_id=worker_2)
    assert res_3["status"] == "SUCCESS"


# -------------------------------------------------------------
# 3. Worker Restart and Stale Lock Recovery
# -------------------------------------------------------------
def test_worker_restart_and_stale_lock_recovery(db_session):
    """
    Test recovery after a worker process crashes while holding a lock.
    When lease expires, the next worker recovers the lock, logs the recovery,
    and finishes the job.
    """
    crashed_worker_id = "dead-worker-pid-9999"
    recovery_worker_id = "live-worker-pid-1111"

    # Simulate crashed worker holding a lock that expired 30 seconds ago
    past_time = datetime.datetime.utcnow() - datetime.timedelta(seconds=30)
    db_session.query(JobLock).filter(JobLock.job_name == "reminder_scheduler").delete()
    db_session.commit()

    stale_lock = JobLock(
        job_name="reminder_scheduler",
        locked_by=crashed_worker_id,
        locked_at=past_time - datetime.timedelta(minutes=5),
        expires_at=past_time,
        status="LOCKED"
    )
    db_session.add(stale_lock)
    db_session.commit()

    # Verify lock is expired
    info = get_job_lock_info("reminder_scheduler", db_session)
    assert info["is_expired"] is True

    # Live worker runs scheduler: it detects stale lock, recovers it, and executes cleanly
    res = execute_reminder_scheduler(db_session, worker_id=recovery_worker_id)
    assert res["status"] in ["SUCCESS", "PAUSED"]

    # Verify a RECOVERED automation log entry was recorded
    recovery_logs = db_session.query(AutomationLog).filter(
        AutomationLog.job_name == "reminder_scheduler",
        AutomationLog.status == "RECOVERED"
    ).all()
    assert len(recovery_logs) > 0
    assert crashed_worker_id in recovery_logs[0].details

    # Clean up lock
    force_release_job_lock("reminder_scheduler", db_session)


# -------------------------------------------------------------
# 4. Reminder Deduplication Preservation
# -------------------------------------------------------------
def test_reminder_deduplication_preservation(db_session):
    """
    Preserve existing database-based reminder deduplication with unique event keys.
    Repeated milestone generation must not create duplicate reminder records.
    """
    student = db_session.query(Student).first()
    due_date = get_kolkata_today() + datetime.timedelta(days=14)

    ins = Instalment(
        id="INS-DEDUP-WORKER-01",
        student_id=student.id,
        instalment_number=9,
        due_date=due_date,
        amount=Decimal("45000.00"),
        paid_amount=Decimal("0.00"),
        status="Upcoming"
    )
    db_session.add(ins)
    db_session.commit()

    # First generation pass
    reminders_1 = schedule_automated_milestone_reminders(student, ins, db_session)
    assert len(reminders_1) == len(AUTOMATION_REMINDER_OFFSETS)

    initial_count = db_session.query(Reminder).filter(Reminder.instalment_id == ins.id).count()
    assert initial_count == len(AUTOMATION_REMINDER_OFFSETS)

    # Second generation pass (e.g. on subsequent 5-minute worker cycle)
    reminders_2 = schedule_automated_milestone_reminders(student, ins, db_session)
    assert len(reminders_2) == initial_count

    # Third generation pass
    schedule_automated_milestone_reminders(student, ins, db_session)

    # Assert exactly initial_count reminders exist, 0 duplicates
    final_count = db_session.query(Reminder).filter(Reminder.instalment_id == ins.id).count()
    assert final_count == initial_count

    # Verify each reminder has a unique event key matching instalment_id + stage_code
    stage_codes = [s[1] for s in AUTOMATION_REMINDER_OFFSETS]
    for sc in stage_codes:
        rem = db_session.query(Reminder).filter(
            Reminder.instalment_id == ins.id,
            Reminder.event_key == f"{ins.id}_{sc}"
        ).all()
        assert len(rem) == 1


# -------------------------------------------------------------
# 5. Full Payment Cancels Pending Reminders
# -------------------------------------------------------------
def test_full_payment_cancels_pending_reminders(db_session):
    """
    Verify that when an instalment is fully paid, pending Scheduled reminders
    are cancelled and will never be delivered by the worker.
    """
    student = db_session.query(Student).first()
    due_date = get_kolkata_today()

    ins = Instalment(
        id="INS-PAY-CANCEL-01",
        student_id=student.id,
        instalment_number=10,
        due_date=due_date,
        amount=Decimal("30000.00"),
        paid_amount=Decimal("0.00"),
        status="Pending"
    )
    db_session.add(ins)
    db_session.commit()

    # Schedule reminders
    schedule_automated_milestone_reminders(student, ins, db_session)
    scheduled_before = db_session.query(Reminder).filter(
        Reminder.instalment_id == ins.id,
        Reminder.status == "Scheduled"
    ).count()
    assert scheduled_before > 0

    # Simulate full payment received
    ins.paid_amount = Decimal("30000.00")
    ins.status = "Paid"
    cancelled_count = cancel_pending_reminders(ins.id, db_session)
    db_session.commit()

    assert cancelled_count == scheduled_before

    # Verify all reminders are now Cancelled
    scheduled_after = db_session.query(Reminder).filter(
        Reminder.instalment_id == ins.id,
        Reminder.status == "Scheduled"
    ).count()
    assert scheduled_after == 0

    cancelled_total = db_session.query(Reminder).filter(
        Reminder.instalment_id == ins.id,
        Reminder.status == "Cancelled"
    ).count()
    assert cancelled_total == scheduled_before

    # Worker reminder cycle will not send any reminders for this paid instalment
    cycle_res = run_automatic_reminder_cycle(db_session, target_date=due_date)
    sent_for_ins = db_session.query(Reminder).filter(
        Reminder.instalment_id == ins.id,
        Reminder.status == "Sent"
    ).count()
    assert sent_for_ins == 0


# -------------------------------------------------------------
# 6. Standalone Worker run_once Mode and Health
# -------------------------------------------------------------
def test_worker_run_once_mode(db_session):
    """
    Tests the standalone worker's programmatic single-pass execution.
    """
    worker = FeeFlowWorker(
        worker_id="test-unit-worker",
        reminder_interval_minutes=5,
        risk_interval_hours=24,
        blocking=False
    )
    res = worker.run_once()

    assert res["worker_id"] == "test-unit-worker"
    assert res["reminders"]["status"] in ["SUCCESS", "PAUSED"]
    assert res["risk_scan"]["status"] == "SUCCESS"
    assert "executed_at" in res


# -------------------------------------------------------------
# 7. Asia/Kolkata Timezone Consistency
# -------------------------------------------------------------
def test_asia_kolkata_timezone_consistency():
    """
    Verify timezone calculations strictly use Asia/Kolkata (+05:30).
    """
    now_kolkata = get_kolkata_now()
    today_kolkata = get_kolkata_today()

    assert now_kolkata.tzinfo is not None
    # Offset must be +5:30 (19800 seconds)
    offset = now_kolkata.utcoffset()
    assert offset == datetime.timedelta(hours=5, minutes=30)
    assert today_kolkata == now_kolkata.date()

    # Check FeeFlowWorker scheduler timezone
    worker = FeeFlowWorker(blocking=False)
    assert str(worker.scheduler.timezone) == "Asia/Kolkata"


# -------------------------------------------------------------
# 8. Manual Automation Triggers via API Keep Working
# -------------------------------------------------------------
def test_manual_automation_triggers_through_api(client, accounts_token):
    """
    Verify manual trigger endpoints still work and respect locks.
    """
    headers = {"Authorization": f"Bearer {accounts_token}"}

    # 1. Run reminders trigger
    res_rem = client.post("/api/v1/automation/run-reminders", headers=headers)
    assert res_rem.status_code == 200
    assert res_rem.json()["status"] == "SUCCESS"

    # 2. Run risk scan trigger
    res_risk = client.post("/api/v1/automation/run-risk-scan", headers=headers)
    assert res_risk.status_code == 200
    assert res_risk.json()["status"] == "SUCCESS"

    # 3. Status endpoint returns lock info and standalone mode
    res_status = client.get("/api/v1/automation/status", headers=headers)
    assert res_status.status_code == 200
    status_data = res_status.json()
    assert "standalone_worker_mode" in status_data
    assert "reminder_lock" in status_data
    assert "risk_lock" in status_data

