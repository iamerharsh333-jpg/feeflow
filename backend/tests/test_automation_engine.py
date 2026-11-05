import datetime
import hmac
import hashlib
from decimal import Decimal
import pytest
from app.config import settings
from app.models import Student, Instalment, Reminder, Payment, CounsellorTask, AuditLog, AutomationLog, AutomationConfig
from app.services.reminders import (
    schedule_instalment_reminders, schedule_automated_milestone_reminders,
    run_automatic_reminder_cycle, cancel_pending_reminders, retry_failed_reminders
)
from app.services.payments import (
    create_payment_intent, auto_match_incoming_payment, match_unmatched_payment,
    generate_gateway_signature
)
from app.services.risk import calculate_student_risk_score, run_daily_ai_risk_analysis, dismiss_risk_task
from app.services.automation import (
    get_automation_status, set_scheduler_state, execute_reminder_scheduler, execute_risk_scan
)

# -------------------------------------------------------------
# 1. Seven-day reminder generation
# -------------------------------------------------------------
def test_seven_day_reminder_generation(db_session):
    student = db_session.query(Student).filter(Student.id == "STU-0412").first()
    due_date = datetime.date.today() + datetime.timedelta(days=7)
    ins = Instalment(
        id="INS-TEST-7D",
        student_id=student.id,
        instalment_number=5,
        due_date=due_date,
        amount=Decimal("25000.00"),
        paid_amount=Decimal("0.00"),
        status="Upcoming"
    )
    db_session.add(ins)
    db_session.commit()

    reminders = schedule_automated_milestone_reminders(student, ins, db_session)
    # Check 7-day upcoming reminder exists
    rem_7d = db_session.query(Reminder).filter(
        Reminder.instalment_id == ins.id,
        Reminder.event_key == f"{ins.id}_UPCOMING_7D"
    ).first()

    assert rem_7d is not None
    assert rem_7d.scheduled_date == datetime.date.today()
    assert rem_7d.status == "Scheduled"
    assert "₹25,000" in rem_7d.message

# -------------------------------------------------------------
# 2. Due-date reminder generation
# -------------------------------------------------------------
def test_due_date_reminder_generation(db_session):
    student = db_session.query(Student).filter(Student.id == "STU-0412").first()
    today = datetime.date.today()
    ins = Instalment(
        id="INS-TEST-DUE",
        student_id=student.id,
        instalment_number=6,
        due_date=today,
        amount=Decimal("30000.00"),
        paid_amount=Decimal("0.00"),
        status="Pending"
    )
    db_session.add(ins)
    db_session.commit()

    schedule_automated_milestone_reminders(student, ins, db_session)
    rem_due = db_session.query(Reminder).filter(
        Reminder.instalment_id == ins.id,
        Reminder.event_key == f"{ins.id}_DUE_TODAY"
    ).first()

    assert rem_due is not None
    assert rem_due.scheduled_date == today
    assert "due today" in rem_due.message.lower()

# -------------------------------------------------------------
# 3. Overdue reminder generation
# -------------------------------------------------------------
def test_overdue_reminder_generation(db_session):
    student = db_session.query(Student).filter(Student.id == "STU-0412").first()
    # 1 day overdue instalment
    yesterday = datetime.date.today() - datetime.timedelta(days=1)
    ins = Instalment(
        id="INS-TEST-OVERDUE",
        student_id=student.id,
        instalment_number=7,
        due_date=yesterday,
        amount=Decimal("20000.00"),
        paid_amount=Decimal("0.00"),
        status="Overdue"
    )
    db_session.add(ins)
    db_session.commit()

    schedule_automated_milestone_reminders(student, ins, db_session)
    rem_overdue_1d = db_session.query(Reminder).filter(
        Reminder.instalment_id == ins.id,
        Reminder.event_key == f"{ins.id}_OVERDUE_1D"
    ).first()

    assert rem_overdue_1d is not None
    assert rem_overdue_1d.scheduled_date == datetime.date.today()
    assert "overdue" in rem_overdue_1d.message.lower()

# -------------------------------------------------------------
# 4. Duplicate reminder prevention
# -------------------------------------------------------------
def test_duplicate_reminder_prevention(db_session):
    student = db_session.query(Student).filter(Student.id == "STU-0412").first()
    ins = Instalment(
        id="INS-TEST-DEDUP",
        student_id=student.id,
        instalment_number=8,
        due_date=datetime.date.today() + datetime.timedelta(days=3),
        amount=Decimal("15000.00"),
        paid_amount=Decimal("0.00"),
        status="Upcoming"
    )
    db_session.add(ins)
    db_session.commit()

    # Run scheduling twice
    reminders1 = schedule_automated_milestone_reminders(student, ins, db_session)
    count1 = db_session.query(Reminder).filter(Reminder.instalment_id == ins.id).count()

    reminders2 = schedule_automated_milestone_reminders(student, ins, db_session)
    count2 = db_session.query(Reminder).filter(Reminder.instalment_id == ins.id).count()

    assert count1 == count2
    assert count1 == len(reminders1)

# -------------------------------------------------------------
# 5. Reminder cancellation after full payment
# -------------------------------------------------------------
def test_reminder_cancellation_after_full_payment(db_session):
    student = db_session.query(Student).filter(Student.id == "STU-0412").first()
    ins = Instalment(
        id="INS-TEST-FULLPAY",
        student_id=student.id,
        instalment_number=9,
        due_date=datetime.date.today() + datetime.timedelta(days=5),
        amount=Decimal("40000.00"),
        paid_amount=Decimal("0.00"),
        status="Upcoming"
    )
    db_session.add(ins)
    db_session.commit()

    schedule_instalment_reminders(student, ins, db_session)
    scheduled_before = db_session.query(Reminder).filter(
        Reminder.instalment_id == ins.id,
        Reminder.status == "Scheduled"
    ).count()
    assert scheduled_before > 0

    # Simulate full payment
    cancelled_count = cancel_pending_reminders(ins.id, db_session)
    assert cancelled_count == scheduled_before

    scheduled_after = db_session.query(Reminder).filter(
        Reminder.instalment_id == ins.id,
        Reminder.status == "Scheduled"
    ).count()
    assert scheduled_after == 0

    cancelled_reminders = db_session.query(Reminder).filter(
        Reminder.instalment_id == ins.id,
        Reminder.status == "Cancelled"
    ).count()
    assert cancelled_reminders == scheduled_before

# -------------------------------------------------------------
# 6. Partial-payment reminder balance
# -------------------------------------------------------------
def test_partial_payment_reminder_balance(db_session):
    student = db_session.query(Student).filter(Student.id == "STU-0412").first()
    ins = Instalment(
        id="INS-TEST-PARTIAL",
        student_id=student.id,
        instalment_number=10,
        due_date=datetime.date.today() + datetime.timedelta(days=3),
        amount=Decimal("50000.00"),
        paid_amount=Decimal("20000.00"), # partial payment made
        status="Partially Paid"
    )
    db_session.add(ins)
    db_session.commit()

    schedule_automated_milestone_reminders(student, ins, db_session)
    rem = db_session.query(Reminder).filter(
        Reminder.instalment_id == ins.id,
        Reminder.event_key == f"{ins.id}_UPCOMING_3D"
    ).first()

    assert rem is not None
    # Must reflect remaining balance: ₹30,000 (50k - 20k)
    assert "₹30,000" in rem.message
    assert "remaining" in rem.message.lower()

# -------------------------------------------------------------
# 7. Payment matching
# -------------------------------------------------------------
def test_payment_matching(db_session):
    student = db_session.query(Student).filter(Student.id == "STU-0412").first()
    ins = db_session.query(Instalment).filter(Instalment.student_id == student.id, Instalment.status != "Paid").first()
    assert ins is not None

    due_amt = ins.amount - ins.paid_amount
    order_id = f"order_auto_{datetime.datetime.utcnow().strftime('%s')}"
    sig = generate_gateway_signature(order_id, float(due_amt), student.id)

    # Ingest incoming payment via auto-matcher
    payment, is_matched = auto_match_incoming_payment(
        db=db_session,
        reference_no=f"REF-MATCH-{order_id}",
        amount=due_amt,
        student_id=student.id,
        instalment_id=ins.id,
        order_id=order_id,
        signature=sig
    )

    assert is_matched is True
    assert payment.status == "Success"
    assert payment.student_id == student.id
    assert payment.instalment_id == ins.id
    assert payment.receipt is not None

    # Verify instalment is marked Paid
    db_session.refresh(ins)
    assert ins.status == "Paid"

# -------------------------------------------------------------
# 8. Unmatched payment queue
# -------------------------------------------------------------
def test_unmatched_payment_queue(db_session):
    # Payment without valid student or intent
    ref_no = f"REF-UNMATCHED-{datetime.datetime.utcnow().strftime('%s')}"
    payment, is_matched = auto_match_incoming_payment(
        db=db_session,
        reference_no=ref_no,
        amount=Decimal("18000.00"),
        student_id=None,
        instalment_id=None
    )

    assert is_matched is False
    assert payment.status == "Unmatched"
    assert payment.student_id is None
    assert payment.instalment_id is None

    # Check it appears in unmatched queries
    unmatched = db_session.query(Payment).filter(Payment.status == "Unmatched").all()
    assert any(p.id == payment.id for p in unmatched)

# -------------------------------------------------------------
# 9. Invalid payment verification
# -------------------------------------------------------------
def test_invalid_payment_verification(db_session):
    from fastapi import HTTPException
    student = db_session.query(Student).filter(Student.id == "STU-0412").first()
    order_id = "order_tampered_123"
    bad_signature = "bad_signature_tampered_hex"

    with pytest.raises(HTTPException) as exc_info:
        auto_match_incoming_payment(
            db=db_session,
            reference_no="REF-TAMPER-001",
            amount=Decimal("10000.00"),
            student_id=student.id,
            order_id=order_id,
            signature=bad_signature
        )

    assert exc_info.value.status_code == 400
    assert "signature mismatch" in exc_info.value.detail.lower()

# -------------------------------------------------------------
# 10. Duplicate payment processing
# -------------------------------------------------------------
def test_duplicate_payment_processing(db_session):
    student = db_session.query(Student).filter(Student.id == "STU-0412").first()
    ins = Instalment(
        id="INS-TEST-DUPPAY",
        student_id=student.id,
        instalment_number=15,
        due_date=datetime.date.today() + datetime.timedelta(days=10),
        amount=Decimal("15000.00"),
        paid_amount=Decimal("0.00"),
        status="Upcoming"
    )
    db_session.add(ins)
    db_session.commit()
    ref_no = f"REF-DUP-CHECK-{datetime.datetime.utcnow().strftime('%s')}"

    # First successful processing
    pay1, matched1 = auto_match_incoming_payment(
        db=db_session,
        reference_no=ref_no,
        amount=Decimal("5000.00"),
        student_id=student.id,
        instalment_id=ins.id
    )
    assert matched1 is True

    # Immediate second attempt with same reference_no returns idempotent existing payment
    pay2, matched2 = auto_match_incoming_payment(
        db=db_session,
        reference_no=ref_no,
        amount=Decimal("5000.00"),
        student_id=student.id,
        instalment_id=ins.id
    )
    assert pay2.id == pay1.id
    assert matched2 is True

# -------------------------------------------------------------
# 11. Server restart and scheduler recovery
# -------------------------------------------------------------
def test_server_restart_and_scheduler_recovery(db_session):
    # Verify that status query reads persisted state and does not crash when logs are empty
    status = get_automation_status(db_session)
    assert status["scheduler_enabled"] is True
    assert status["scheduler_interval_minutes"] == 5

    # Run cycle to generate logs
    cycle_res = execute_reminder_scheduler(db_session)
    assert cycle_res["status"] in ["SUCCESS", "PAUSED"]

    # Verify log is persisted in database
    log = db_session.query(AutomationLog).filter(AutomationLog.job_name == "reminder_scheduler").first()
    assert log is not None
    assert log.status == "SUCCESS"

# -------------------------------------------------------------
# 12. Duplicate scheduler execution prevention
# -------------------------------------------------------------
def test_duplicate_scheduler_execution_prevention(db_session):
    # Calling execute_reminder_scheduler completes cleanly and releases lock
    res1 = execute_reminder_scheduler(db_session)
    assert res1["status"] in ["SUCCESS", "PAUSED"]

    res2 = execute_reminder_scheduler(db_session)
    assert res2["status"] in ["SUCCESS", "PAUSED"]

# -------------------------------------------------------------
# 13. Risk task creation and false-positive handling
# -------------------------------------------------------------
def test_risk_task_creation_and_false_positive_handling(db_session):
    from fastapi import HTTPException
    student = db_session.query(Student).filter(Student.id == "STU-0412").first()

    # Run AI risk scan
    scan_res = execute_risk_scan(db_session)
    assert scan_res["status"] == "SUCCESS"
    assert scan_res["students_analyzed"] > 0

    # Create a test task for dismissal
    task = CounsellorTask(
        student_id=student.id,
        risk_level="High",
        risk_score=78.5,
        risk_reasons="['Critical low attendance', 'Overdue instalment']",
        status="Open"
    )
    db_session.add(task)
    db_session.commit()
    db_session.refresh(task)

    # 1. Attempt dismissal without reason -> 400 Bad Request
    with pytest.raises(HTTPException) as exc:
        dismiss_risk_task(task.id, "", db_session, dismissed_by="Counsellor")
    assert exc.value.status_code == 400

    # 2. Dismiss with valid explanation
    dismissed = dismiss_risk_task(task.id, "Student had verified medical leave approved by centre head", db_session, dismissed_by="Counsellor")
    assert dismissed.status == "False Positive"
    assert "medical leave" in dismissed.dismissal_reason
    assert dismissed.reviewed_at is not None

# -------------------------------------------------------------
# 14. Automation Control API Endpoints
# -------------------------------------------------------------
def test_automation_api_endpoints(client, accounts_token):
    headers = {"Authorization": f"Bearer {accounts_token}"}

    # 1. Status
    res = client.get("/api/v1/automation/status", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert "scheduler_enabled" in data
    assert data["scheduler_interval_minutes"] == 5

    # 2. Toggle scheduler
    res_toggle = client.post("/api/v1/automation/toggle-reminders", json={"enabled": False}, headers=headers)
    assert res_toggle.status_code == 200
    assert res_toggle.json()["scheduler_enabled"] is False

    # Re-enable
    res_toggle2 = client.post("/api/v1/automation/toggle-reminders", json={"enabled": True}, headers=headers)
    assert res_toggle2.status_code == 200
    assert res_toggle2.json()["scheduler_enabled"] is True

    # 3. Trigger manual reminder cycle
    res_run = client.post("/api/v1/automation/run-reminders", headers=headers)
    assert res_run.status_code == 200
    assert res_run.json()["status"] == "SUCCESS"

    # 4. Trigger manual risk scan
    res_risk = client.post("/api/v1/automation/run-risk-scan", headers=headers)
    assert res_risk.status_code == 200
    assert res_risk.json()["status"] == "SUCCESS"

    # 5. Retry failed
    res_retry = client.post("/api/v1/automation/retry-failed", headers=headers)
    assert res_retry.status_code == 200
    assert res_retry.json()["status"] == "SUCCESS"

    # 6. Simulation test-run by accounts executive
    res_sim = client.post(
        "/api/v1/automation/test-run",
        json={"simulation_date": datetime.date.today().isoformat()},
        headers=headers
    )
    assert res_sim.status_code == 200
    assert res_sim.json()["status"] == "SIMULATION_SUCCESS"
    assert res_sim.json()["dry_run"] is True
