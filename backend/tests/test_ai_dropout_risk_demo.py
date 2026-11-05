import datetime
from decimal import Decimal
import json
import pytest
from app.models import (
    Student, Instalment, Attendance, TestScore as DBTestScore,
    CounsellorTask, AuditLog, Reminder, User
)
from app.auth import create_access_token, hash_password
from app.services.risk import (
    seed_demo_dropout_risk_student,
    calculate_student_risk_score,
    run_daily_ai_risk_analysis
)

@pytest.fixture
def counsellor_user(db_session):
    user = User(
        identifier="counsellor@feeflow.demo",
        full_name="Academic Counsellor",
        hashed_password=hash_password("Demo@12345"),
        role="counsellor",
        centre_id=1,
        is_active=True
    )
    db_session.add(user)
    db_session.commit()
    return user

@pytest.fixture
def counsellor_token(counsellor_user):
    return create_access_token({
        "sub": "counsellor@feeflow.demo",
        "role": "counsellor",
        "name": "Academic Counsellor",
        "centre_id": 1
    })


def test_demo_student_seed_and_high_risk_detection(client, accounts_token, db_session):
    """
    1. DEMO DATA & RISK DETECTION:
    Verifies that seeding creates Rohan Verma (STU-0999) and calculates an
    explainable High Risk score of 67.0 with exact factor breakdown:
    - Attendance decline 85.0% -> 58.3% (30 pts)
    - 3 declining test scores 72%, 61%, 43% (22 pts)
    - 1 instalment overdue by 25 days (15 pts)
    """
    # Trigger seeding via API
    res = client.post("/api/v1/risk/seed-demo", headers={"Authorization": f"Bearer {accounts_token}"})
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "SUCCESS"
    assert data["student_id"] == "STU-0999"
    assert data["student_name"] == "Rohan Verma"

    # Verify student in DB
    student = db_session.query(Student).filter(Student.id == "STU-0999").first()
    assert student is not None
    assert student.name == "Rohan Verma"
    assert student.course == "JEE 2027"
    assert student.batch == "Evening"

    # Verify 4 instalments with 1 overdue by 25 days
    instalments = db_session.query(Instalment).filter(Instalment.student_id == "STU-0999").order_by(Instalment.instalment_number).all()
    assert len(instalments) == 4
    assert instalments[0].status == "Paid"
    assert instalments[1].status == "Paid"
    assert instalments[2].status == "Overdue"
    assert (datetime.date.today() - instalments[2].due_date).days == 25
    assert instalments[3].status == "Upcoming"

    # Verify attendance: 120 records (60 baseline, 60 recent)
    att_records = db_session.query(Attendance).filter(Attendance.student_id == "STU-0999").all()
    assert len(att_records) == 120

    # Verify test scores: 3 scores (72%, 61%, 43%)
    scores = db_session.query(DBTestScore).filter(DBTestScore.student_id == "STU-0999").order_by(DBTestScore.test_date).all()
    assert len(scores) == 3
    assert [s.marks_obtained for s in scores] == [72.0, 61.0, 43.0]

    # Assess risk score
    risk_res = calculate_student_risk_score(student, db_session)
    assert risk_res["risk_level"] == "High"
    assert risk_res["risk_score"] == 67.0

    # Explainable factor breakdown verification
    breakdown = risk_res["evidence"]["score_breakdown"]
    assert breakdown["fee_risk_points"] == 15.0      # 25 days overdue: 15 pts
    assert breakdown["attendance_risk_points"] == 30.0 # <75% (20 pts) + decline >10% (10 pts)
    assert breakdown["academic_risk_points"] == 22.0  # avg 58.7% <60% (12 pts) + declining (10 pts)
    assert sum([breakdown["fee_risk_points"], breakdown["attendance_risk_points"], breakdown["academic_risk_points"]]) == 67.0

    # Explainable evidence metrics
    ev = risk_res["evidence"]
    assert ev["attendance_baseline_rate"] == 85.0
    assert ev["attendance_recent_rate"] == 58.3
    assert ev["recent_test_scores"] == [72.0, 61.0, 43.0]
    assert ev["test_score_trend"] == "Declining"
    assert ev["overdue_instalments"] == 1
    assert ev["max_overdue_days"] == 25


def test_counsellor_task_created_automatically(client, accounts_token, db_session):
    """
    2. COUNSELLOR WORKFLOW:
    Verifies that high-risk detection automatically generates a CounsellorTask
    with evidence, priority, recommended action, and audit logging.
    """
    client.post("/api/v1/risk/seed-demo", headers={"Authorization": f"Bearer {accounts_token}"})

    task = db_session.query(CounsellorTask).filter(
        CounsellorTask.student_id == "STU-0999"
    ).first()

    assert task is not None
    assert task.status == "Open"
    assert task.risk_level == "High"
    assert task.priority in ["High", "Urgent"]
    assert task.risk_score == 67.0

    # Verify audit log
    audit = db_session.query(AuditLog).filter(
        AuditLog.entity_name == "CounsellorTask",
        AuditLog.entity_id == str(task.id),
        AuditLog.action == "RISK_TASK_CREATED"
    ).first()
    assert audit is not None
    assert "STU-0999" in audit.new_values


def test_duplicate_open_task_prevention_on_repeated_scans(client, accounts_token, db_session):
    """
    3. DUPLICATE PREVENTION:
    Repeated risk scans must update the existing open CounsellorTask and
    never create duplicate tasks for the same student.
    """
    client.post("/api/v1/risk/seed-demo", headers={"Authorization": f"Bearer {accounts_token}"})

    # Run bulk scan multiple times
    res1 = client.post("/api/v1/risk/run-scan", headers={"Authorization": f"Bearer {accounts_token}"})
    assert res1.status_code == 200
    res2 = client.post("/api/v1/risk/run-scan", headers={"Authorization": f"Bearer {accounts_token}"})
    assert res2.status_code == 200

    tasks = db_session.query(CounsellorTask).filter(
        CounsellorTask.student_id == "STU-0999",
        CounsellorTask.status.in_(["Open", "In Progress", "Unreviewed"])
    ).all()

    assert len(tasks) == 1
    assert tasks[0].risk_score == 67.0


def test_false_positive_dismissal_workflow(client, accounts_token, db_session):
    """
    4. FALSE-POSITIVE DISMISSAL:
    Counsellors or staff can mark a task as false positive with a mandatory reason.
    Without a reason, dismissal must be rejected (400).
    A valid dismissal updates status and logs to AuditLog.
    Subsequent scans do not reopen a dismissed task.
    """
    client.post("/api/v1/risk/seed-demo", headers={"Authorization": f"Bearer {accounts_token}"})
    task = db_session.query(CounsellorTask).filter(CounsellorTask.student_id == "STU-0999").first()

    # 1. Attempt dismissal without reason -> rejected with 400
    res_no_reason = client.post(
        f"/api/v1/risk/tasks/{task.id}/dismiss",
        json={"reason": "   "},
        headers={"Authorization": f"Bearer {accounts_token}"}
    )
    assert res_no_reason.status_code == 400
    assert "Mandatory dismissal reason is required" in res_no_reason.json()["detail"]

    # 2. Dismiss with valid reason
    dismissal_reason = "Parent confirmed student had viral fever; submitted medical certificate; scheduled re-test."
    res_ok = client.post(
        f"/api/v1/risk/tasks/{task.id}/dismiss",
        json={"reason": dismissal_reason},
        headers={"Authorization": f"Bearer {accounts_token}"}
    )
    assert res_ok.status_code == 200
    assert res_ok.json()["dismissal_reason"] == dismissal_reason

    # Verify DB state
    db_session.refresh(task)
    assert task.status == "False Positive"
    assert task.dismissal_reason == dismissal_reason

    # Verify AuditLog
    audit = db_session.query(AuditLog).filter(
        AuditLog.entity_name == "CounsellorTask",
        AuditLog.entity_id == str(task.id),
        AuditLog.action == "RISK_TASK_DISMISSED"
    ).first()
    assert audit is not None
    assert dismissal_reason in audit.new_values

    # 3. Subsequent risk scan does NOT recreate or reopen the task as Open
    run_daily_ai_risk_analysis(db_session)
    open_tasks = db_session.query(CounsellorTask).filter(
        CounsellorTask.student_id == "STU-0999",
        CounsellorTask.status.in_(["Open", "In Progress"])
    ).all()
    assert len(open_tasks) == 0


def test_safety_no_financial_modifications(client, accounts_token, db_session):
    """
    5. SAFETY REQUIREMENT - NO FINANCIAL MODIFICATIONS:
    Risk engine and scans must NEVER alter fee amounts, instalments, paid amounts,
    or discounts.
    """
    client.post("/api/v1/risk/seed-demo", headers={"Authorization": f"Bearer {accounts_token}"})
    student = db_session.query(Student).filter(Student.id == "STU-0999").first()

    # Capture initial financial state
    initial_total_fee = student.total_fee
    initial_instalments = [
        (i.id, i.amount, i.paid_amount, i.status, i.due_date)
        for i in student.instalments
    ]

    # Run scans multiple times
    client.post("/api/v1/risk/run-scan", headers={"Authorization": f"Bearer {accounts_token}"})
    student_obj = db_session.query(Student).filter(Student.id == "STU-0999").first()
    calculate_student_risk_score(student_obj, db_session)
    db_session.expire_all()

    # Re-verify financial state is 100% untouched
    refreshed_student = db_session.query(Student).filter(Student.id == "STU-0999").first()
    assert refreshed_student.total_fee == initial_total_fee

    current_instalments = [
        (i.id, i.amount, i.paid_amount, i.status, i.due_date)
        for i in refreshed_student.instalments
    ]
    assert current_instalments == initial_instalments


def test_safety_no_parent_or_student_notifications(client, accounts_token, db_session):
    """
    6. SAFETY REQUIREMENT - NO PARENT/STUDENT MESSAGES:
    Dropout risk evaluation must never send messages to parents or students,
    trigger payment gateways, or schedule reminders.
    """
    initial_reminder_count = db_session.query(Reminder).count()

    client.post("/api/v1/risk/seed-demo", headers={"Authorization": f"Bearer {accounts_token}"})
    client.post("/api/v1/risk/run-scan", headers={"Authorization": f"Bearer {accounts_token}"})

    final_reminder_count = db_session.query(Reminder).count()
    # No customer-facing reminders created by risk engine
    assert final_reminder_count == initial_reminder_count


def test_safety_counsellor_access_restrictions_and_fee_masking(client, counsellor_token, accounts_token, db_session):
    """
    7. SAFETY REQUIREMENT - COUNSELLOR RESTRICTIONS & FEE MASKING:
    - Counsellor role can view tasks and summaries.
    - Financial figures are masked/redacted for counsellors:
      - outstanding_amount is 0.0
      - overdue_amount and fee_risk_points are stripped from evidence
      - Currency symbols (₹...) in reasons are masked to 'overdue fee balance'
    - Counsellor cannot access financial ledger routes (/api/v1/fees, /api/v1/deadlines).
    """
    client.post("/api/v1/risk/seed-demo", headers={"Authorization": f"Bearer {accounts_token}"})

    # Counsellor views tasks
    res = client.get("/api/v1/risk/tasks", headers={"Authorization": f"Bearer {counsellor_token}"})
    assert res.status_code == 200
    tasks = res.json()
    demo_task = next((t for t in tasks if t["student_id"] == "STU-0999"), None)
    assert demo_task is not None

    # Verify fee amount is masked to 0.0
    assert demo_task["outstanding_amount"] == 0.0

    # Verify reasons do not expose specific currency figures like '₹30,000'
    for r in demo_task["risk_reasons"]:
        assert "₹" not in r
        if "overdue" in r.lower():
            assert "overdue fee balance" in r

    # Verify evidence does not leak fee amounts to counsellor
    ev = demo_task["evidence"]
    assert "overdue_amount" not in ev
    if "score_breakdown" in ev and ev["score_breakdown"]:
        assert ev["score_breakdown"].get("fee_risk_points") is None

    # Verify counsellor is blocked from financial ledger and deadline routes (HTTP 403)
    res_fees = client.get("/api/v1/fees/STU-0999/ledger", headers={"Authorization": f"Bearer {counsellor_token}"})
    assert res_fees.status_code == 403

    res_deadlines = client.get("/api/v1/deadlines", headers={"Authorization": f"Bearer {counsellor_token}"})
    assert res_deadlines.status_code == 403


def test_seed_demo_idempotency(client, accounts_token, db_session):
    """
    8. REPRODUCIBILITY & IDEMPOTENCY:
    Calling seed-demo multiple times cleanly resets student state without duplicating
    records or corrupting existing data.
    """
    res1 = client.post("/api/v1/risk/seed-demo", headers={"Authorization": f"Bearer {accounts_token}"})
    assert res1.status_code == 200

    res2 = client.post("/api/v1/risk/seed-demo", headers={"Authorization": f"Bearer {accounts_token}"})
    assert res2.status_code == 200

    students = db_session.query(Student).filter(Student.id == "STU-0999").all()
    assert len(students) == 1

    instalments = db_session.query(Instalment).filter(Instalment.student_id == "STU-0999").all()
    assert len(instalments) == 4

    scores = db_session.query(DBTestScore).filter(DBTestScore.student_id == "STU-0999").all()
    assert len(scores) == 3

    attendances = db_session.query(Attendance).filter(Attendance.student_id == "STU-0999").all()
    assert len(attendances) == 120
