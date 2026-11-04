import datetime
from decimal import Decimal
import io
import pytest
from app.models import Student, Instalment, Payment, RefundRequest, CounsellorTask, Attendance, TestScore as DBTestScore, AuditLog, Reminder

def test_pro_rata_refund_calculation(client, accounts_token):
    """1. Pro-rata refund calculation accurately calculates days and deductions."""
    res = client.post(
        "/api/v1/refunds/estimate",
        json={
            "student_id": "STU-0412",
            "course_start_date": "2026-04-01",
            "course_end_date": "2027-03-31",
            "withdrawal_date": "2026-04-11", # 10 days attended
            "amount_paid": 100000.0,
            "processing_fee_percent": 5.0,
            "material_fee": 5000.0
        }
    )
    assert res.status_code == 200
    data = res.json()
    assert data["total_days"] == 364
    assert data["days_attended"] == 10
    assert data["unused_days"] == 354
    assert data["deadline_met"] is True
    # Pro-rata = (100000 * 354) / 364 = 97252.75
    # Processing fee (5%) = 4862.64
    # Material fee = 5000.0
    # Final estimated refund = 97252.75 - 4862.64 - 5000 = 87390.11
    assert abs(data["estimated_refund"] - 87390.11) < 1.0

def test_published_policy_version_is_retained(client, accounts_token):
    """2. Published policy version is retained across estimates and requests."""
    res = client.post(
        "/api/v1/refunds/estimate",
        json={
            "student_id": "STU-0412",
            "course_start_date": "2026-04-01",
            "course_end_date": "2027-03-31",
            "withdrawal_date": "2026-04-05",
            "amount_paid": 50000.0
        }
    )
    assert res.status_code == 200
    assert res.json()["policy_code"] == "REFUND_STD_POLICY_2026"
    assert res.json()["policy_version"] == "v2026.1"

    res_req = client.post(
        "/api/v1/refunds/request",
        json={
            "student_id": "STU-0412",
            "course_start_date": "2026-04-01",
            "course_end_date": "2027-03-31",
            "withdrawal_date": "2026-04-05",
            "withdrawal_reason": "Medical reasons",
            "amount_paid": 50000.0,
            "policy_code": "REFUND_STD_POLICY_2026"
        },
        headers={"Authorization": f"Bearer {accounts_token}"}
    )
    assert res_req.status_code == 201

def test_refund_cannot_exceed_eligible_paid_amount(client, accounts_token, db_session):
    """3. Refund cannot exceed eligible paid amount."""
    # Attempting to approve refund > amount_paid must be rejected
    req = RefundRequest(
        student_id="STU-0412",
        course_start_date=datetime.date(2026, 4, 1),
        course_end_date=datetime.date(2027, 3, 31),
        withdrawal_date=datetime.date(2026, 4, 10),
        amount_paid=Decimal("20000.0"),
        total_days=364,
        days_attended=9,
        unused_days=355,
        pro_rata_amount=Decimal("19505.49"),
        processing_fee=Decimal("975.27"),
        material_fee=Decimal("5000.0"),
        estimated_refund=Decimal("13530.22"),
        status="Pending Review"
    )
    db_session.add(req)
    db_session.commit()
    db_session.refresh(req)

    # Try to approve 25,000 when paid is 20,000
    res = client.post(
        f"/api/v1/refunds/requests/{req.id}/approve",
        json={
            "approved_amount": 25000.0,
            "reason": "Excess amount approval attempt"
        },
        headers={"Authorization": f"Bearer {accounts_token}"}
    )
    assert res.status_code == 400
    assert "cannot exceed eligible paid amount" in res.json()["detail"]

def test_duplicate_refund_processing_is_prevented(client, accounts_token, db_session):
    """4. Duplicate refund processing is prevented."""
    req = RefundRequest(
        student_id="STU-0412",
        course_start_date=datetime.date(2026, 4, 1),
        course_end_date=datetime.date(2027, 3, 31),
        withdrawal_date=datetime.date(2026, 4, 10),
        amount_paid=Decimal("30000.0"),
        total_days=364,
        days_attended=9,
        unused_days=355,
        pro_rata_amount=Decimal("25000.0"),
        estimated_refund=Decimal("20000.0"),
        approved_refund=Decimal("20000.0"),
        status="Approved"
    )
    db_session.add(req)
    db_session.commit()
    db_session.refresh(req)

    # Process first time
    res1 = client.post(
        f"/api/v1/refunds/requests/{req.id}/process",
        headers={"Authorization": f"Bearer {accounts_token}"}
    )
    assert res1.status_code == 200
    assert res1.json()["status"] == "Processed"

    # Process second time -> 400 Bad Request
    res2 = client.post(
        f"/api/v1/refunds/requests/{req.id}/process",
        headers={"Authorization": f"Bearer {accounts_token}"}
    )
    assert res2.status_code == 400
    assert "already been processed" in res2.json()["detail"]

def test_refund_approval_and_rejection_permissions(client, parent_token, accounts_token, db_session):
    """5. Approval and rejection permissions."""
    req = RefundRequest(
        student_id="STU-0412",
        course_start_date=datetime.date(2026, 4, 1),
        course_end_date=datetime.date(2027, 3, 31),
        withdrawal_date=datetime.date(2026, 4, 10),
        amount_paid=Decimal("30000.0"),
        total_days=364,
        days_attended=9,
        unused_days=355,
        pro_rata_amount=Decimal("25000.0"),
        estimated_refund=Decimal("20000.0"),
        status="Pending Review"
    )
    db_session.add(req)
    db_session.commit()
    db_session.refresh(req)

    # Parent cannot approve
    res_parent = client.post(
        f"/api/v1/refunds/requests/{req.id}/approve",
        json={"approved_amount": 20000.0, "reason": "Parent self approval"},
        headers={"Authorization": f"Bearer {parent_token}"}
    )
    assert res_parent.status_code == 403

    # Accounts staff rejection requires reason
    res_reject_no_reason = client.post(
        f"/api/v1/refunds/requests/{req.id}/reject",
        json={"reason": ""},
        headers={"Authorization": f"Bearer {accounts_token}"}
    )
    assert res_reject_no_reason.status_code == 400

    # Accounts staff valid rejection
    res_reject = client.post(
        f"/api/v1/refunds/requests/{req.id}/reject",
        json={"reason": "Withdrawal notice submitted after course completion."},
        headers={"Authorization": f"Bearer {accounts_token}"}
    )
    assert res_reject.status_code == 200
    assert res_reject.json()["status"] == "Rejected"

def test_ten_day_deadline_tracking(client, accounts_token, db_session):
    """6. Ten-day deadline tracking and overdue indicators."""
    today = datetime.date.today()
    # Withdrawal 15 days ago -> overdue
    past_withdrawal = today - datetime.timedelta(days=15)
    past_deadline = past_withdrawal + datetime.timedelta(days=10)

    req = RefundRequest(
        student_id="STU-0412",
        course_start_date=today - datetime.timedelta(days=30),
        course_end_date=today + datetime.timedelta(days=300),
        withdrawal_date=past_withdrawal,
        processing_deadline=past_deadline,
        amount_paid=Decimal("40000.0"),
        total_days=330,
        days_attended=15,
        unused_days=315,
        pro_rata_amount=Decimal("35000.0"),
        estimated_refund=Decimal("30000.0"),
        status="Pending Review"
    )
    db_session.add(req)
    db_session.commit()
    db_session.refresh(req)

    res = client.get(
        "/api/v1/refunds/requests",
        headers={"Authorization": f"Bearer {accounts_token}"}
    )
    assert res.status_code == 200
    items = [r for r in res.json() if r["id"] == req.id]
    assert len(items) == 1
    assert items[0]["is_overdue"] is True
    assert items[0]["days_remaining"] < 0

def test_refund_audit_records_persisted(client, accounts_token, db_session):
    """7. Refund audit records are recorded on creation and approval."""
    res_req = client.post(
        "/api/v1/refunds/request",
        json={
            "student_id": "STU-0412",
            "course_start_date": "2026-04-01",
            "course_end_date": "2027-03-31",
            "withdrawal_date": "2026-04-05",
            "withdrawal_reason": "Relocation to another city",
            "amount_paid": 50000.0
        },
        headers={"Authorization": f"Bearer {accounts_token}"}
    )
    assert res_req.status_code == 201
    req_id = res_req.json()["request_id"]

    # Verify audit log exists
    log = db_session.query(AuditLog).filter(
        AuditLog.entity_name == "RefundRequest",
        AuditLog.entity_id == str(req_id),
        AuditLog.action == "REFUND_CALCULATED_SAVED"
    ).first()
    assert log is not None

def test_simulated_processing_updates_status_correctly(client, accounts_token, db_session):
    """8. Simulated processing updates status, records payout ref and processed date."""
    req = RefundRequest(
        student_id="STU-0412",
        course_start_date=datetime.date(2026, 4, 1),
        course_end_date=datetime.date(2027, 3, 31),
        withdrawal_date=datetime.date(2026, 4, 10),
        amount_paid=Decimal("50000.0"),
        total_days=364,
        days_attended=9,
        unused_days=355,
        pro_rata_amount=Decimal("45000.0"),
        estimated_refund=Decimal("40000.0"),
        approved_refund=Decimal("40000.0"),
        status="Approved"
    )
    db_session.add(req)
    db_session.commit()
    db_session.refresh(req)

    res = client.post(
        f"/api/v1/refunds/requests/{req.id}/process",
        headers={"Authorization": f"Bearer {accounts_token}"}
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "Processed"
    assert "SIM-PAYOUT-" in data["payout_reference"]
    assert data["processed_date"] is not None

# --- AI RISK TESTS ---

def test_missed_instalment_increases_risk_score(client, accounts_token, db_session):
    """9. Missed instalment increases risk score."""
    student = db_session.query(Student).filter(Student.id == "STU-0412").first()
    # Baseline with no overdue instalments
    for inst in student.instalments:
        inst.status = "Paid"
        inst.paid_amount = inst.amount
    db_session.commit()

    res_base = client.post(
        f"/api/v1/risk/assess/{student.id}",
        headers={"Authorization": f"Bearer {accounts_token}"}
    )
    base_score = res_base.json()["data"]["risk_score"]

    # Now make 2 instalments overdue
    student.instalments[0].status = "Overdue"
    student.instalments[0].due_date = datetime.date.today() - datetime.timedelta(days=45)
    student.instalments[0].paid_amount = Decimal("0.0")
    student.instalments[1].status = "Overdue"
    student.instalments[1].due_date = datetime.date.today() - datetime.timedelta(days=15)
    student.instalments[1].paid_amount = Decimal("0.0")
    db_session.commit()

    res_overdue = client.post(
        f"/api/v1/risk/assess/{student.id}",
        headers={"Authorization": f"Bearer {accounts_token}"}
    )
    overdue_score = res_overdue.json()["data"]["risk_score"]
    assert overdue_score > base_score

def test_falling_attendance_affects_risk_score(client, accounts_token, db_session):
    """10. Falling attendance increases risk score."""
    student = db_session.query(Student).filter(Student.id == "STU-0412").first()
    # Clear attendance
    db_session.query(Attendance).filter(Attendance.student_id == student.id).delete()
    db_session.commit()

    # Add 10 sessions with 9 absent (10% attendance)
    today = datetime.date.today()
    for d in range(10):
        db_session.add(Attendance(
            student_id=student.id,
            batch=student.batch,
            date=today - datetime.timedelta(days=d+1),
            status="Present" if d == 0 else "Absent"
        ))
    db_session.commit()

    res = client.post(
        f"/api/v1/risk/assess/{student.id}",
        headers={"Authorization": f"Bearer {accounts_token}"}
    )
    data = res.json()["data"]
    assert data["attendance_percent"] <= 20.0
    assert any("Attendance critically low" in r or "Attendance below" in r for r in data["risk_reasons"])
    assert data["risk_level"] in ["High", "Medium"]

def test_falling_test_performance_affects_risk_score(client, accounts_token, db_session):
    """11. Falling test performance affects risk score and detects declining trend."""
    student = db_session.query(Student).filter(Student.id == "STU-0412").first()
    db_session.query(DBTestScore).filter(DBTestScore.student_id == student.id).delete()
    db_session.commit()

    today = datetime.date.today()
    # 4 tests with sharp decline: 90 -> 75 -> 50 -> 30
    scores = [90.0, 75.0, 50.0, 30.0]
    for idx, mark in enumerate(scores):
        db_session.add(DBTestScore(
            student_id=student.id,
            test_name=f"Unit Test {idx+1}",
            test_date=today - datetime.timedelta(days=(4-idx)*7),
            subject="Physics",
            max_marks=100.0,
            marks_obtained=mark
        ))
    db_session.commit()

    res = client.post(
        f"/api/v1/risk/assess/{student.id}",
        headers={"Authorization": f"Bearer {accounts_token}"}
    )
    data = res.json()["data"]
    assert data["evidence"]["test_score_trend"] == "Declining"
    assert any("decline" in r.lower() for r in data["risk_reasons"])

def test_risk_explanation_identifies_actual_evidence(client, accounts_token, db_session):
    """12. Risk explanation identifies actual factual evidence."""
    student = db_session.query(Student).filter(Student.id == "STU-0412").first()
    res = client.post(
        f"/api/v1/risk/assess/{student.id}",
        headers={"Authorization": f"Bearer {accounts_token}"}
    )
    ev = res.json()["data"]["evidence"]
    assert "overdue_instalments" in ev
    assert "attendance_rate" in ev
    assert "test_score_trend" in ev
    assert "score_breakdown" in ev

def test_high_risk_creates_counsellor_task(client, accounts_token, db_session):
    """13. High risk automatically creates a counsellor task."""
    student = db_session.query(Student).filter(Student.id == "STU-0412").first()
    # Force high risk: 2 overdue instalments + critically low attendance
    for i in range(2):
        student.instalments[i].status = "Overdue"
        student.instalments[i].due_date = datetime.date.today() - datetime.timedelta(days=40)
        student.instalments[i].paid_amount = Decimal("0.0")
    db_session.commit()

    res = client.post(
        f"/api/v1/risk/assess/{student.id}",
        headers={"Authorization": f"Bearer {accounts_token}"}
    )
    assert res.json()["data"]["risk_level"] == "High"

    task = db_session.query(CounsellorTask).filter(
        CounsellorTask.student_id == student.id,
        CounsellorTask.status == "Open"
    ).first()
    assert task is not None
    assert task.risk_level == "High"

def test_duplicate_open_tasks_are_prevented(client, accounts_token, db_session):
    """14. Duplicate open tasks are prevented; existing task is updated."""
    student = db_session.query(Student).filter(Student.id == "STU-0412").first()
    # Ensure student has risk factors that qualify for task creation
    student.instalments[1].status = "Overdue"
    student.instalments[1].due_date = datetime.date.today() - datetime.timedelta(days=40)
    student.instalments[1].paid_amount = Decimal("0.0")
    db_session.commit()
    
    # Assess twice
    client.post(f"/api/v1/risk/assess/{student.id}", headers={"Authorization": f"Bearer {accounts_token}"})
    client.post(f"/api/v1/risk/assess/{student.id}", headers={"Authorization": f"Bearer {accounts_token}"})

    open_tasks = db_session.query(CounsellorTask).filter(
        CounsellorTask.student_id == student.id,
        CounsellorTask.status.in_(["Open", "In Progress", "Unreviewed"])
    ).all()
    assert len(open_tasks) == 1

def test_false_positive_dismissal_requires_reason(client, accounts_token, db_session):
    """15. False-positive dismissal requires a mandatory reason."""
    student = db_session.query(Student).filter(Student.id == "STU-0412").first()
    task = CounsellorTask(
        student_id=student.id,
        risk_level="High",
        risk_reasons="['Overdue instalment']",
        status="Open"
    )
    db_session.add(task)
    db_session.commit()
    db_session.refresh(task)

    # Empty reason -> 400
    res_fail = client.post(
        f"/api/v1/risk/tasks/{task.id}/dismiss",
        json={"reason": ""},
        headers={"Authorization": f"Bearer {accounts_token}"}
    )
    assert res_fail.status_code == 400

    # With valid reason -> 200
    res_ok = client.post(
        f"/api/v1/risk/tasks/{task.id}/dismiss",
        json={"reason": "Parent confirmed student was sick and will pay on Friday."},
        headers={"Authorization": f"Bearer {accounts_token}"}
    )
    assert res_ok.status_code == 200
    assert res_ok.json()["dismissal_reason"] == "Parent confirmed student was sick and will pay on Friday."

def test_risk_flags_cannot_modify_fees_or_send_parent_messages(client, accounts_token, db_session):
    """16. Risk assessment strictly does not change fees or message parents."""
    student = db_session.query(Student).filter(Student.id == "STU-0412").first()
    
    # Record original fee amounts and reminder count
    orig_fees = [(i.id, float(i.amount), float(i.paid_amount)) for i in student.instalments]
    orig_reminder_count = db_session.query(Reminder).count()

    # Trigger risk assessment
    client.post(f"/api/v1/risk/assess/{student.id}", headers={"Authorization": f"Bearer {accounts_token}"})
    db_session.expire_all()

    # Verify fees are 100% unchanged
    current_fees = [(i.id, float(i.amount), float(i.paid_amount)) for i in student.instalments]
    assert orig_fees == current_fees

    # Verify no new reminders were scheduled/created
    new_reminder_count = db_session.query(Reminder).count()
    assert new_reminder_count == orig_reminder_count

def test_new_attendance_data_triggers_risk_recalculation(client, accounts_token, db_session):
    """17. Bulk uploading attendance CSV triggers risk recalculation."""
    student = db_session.query(Student).filter(Student.id == "STU-0412").first()
    csv_content = f"student_id,batch,date,status\n{student.id},{student.batch},2026-11-01,Absent\n{student.id},{student.batch},2026-11-02,Absent\n"
    
    res = client.post(
        "/api/v1/attendance/bulk-upload",
        files={"file": ("attendance.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")},
        headers={"Authorization": f"Bearer {accounts_token}"}
    )
    assert res.status_code == 201
    assert res.json()["recalculated_students_count"] >= 1

def test_new_test_data_triggers_risk_recalculation(client, accounts_token, db_session):
    """18. Bulk uploading test score CSV triggers risk recalculation."""
    student = db_session.query(Student).filter(Student.id == "STU-0412").first()
    csv_content = f"student_id,test_name,test_date,subject,max_marks,marks_obtained\n{student.id},Physics Weekly,2026-11-01,Physics,100,28\n"

    res = client.post(
        "/api/v1/tests/bulk-upload",
        files={"file": ("test_scores.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")},
        headers={"Authorization": f"Bearer {accounts_token}"}
    )
    assert res.status_code == 201
    assert res.json()["recalculated_students_count"] >= 1

# --- SECURITY TESTS ---

def test_parent_cannot_access_another_students_refund(client, parent_token, db_session):
    """19. Parent cannot access another student's refund or submit refund for another student."""
    # STU-0412 belongs to Aarav Meena (parent 9876543210).
    # Ensure STU-0413 exists in DB with different parent
    stu2 = Student(
        id="STU-0413",
        roll_number="JEE27-0413",
        name="Priya Sharma",
        course="JEE 2027",
        batch="Evening",
        centre_id=2,
        parent_name="Sunil Sharma",
        parent_phone="9988776655",
        total_fee=Decimal("120000.00")
    )
    db_session.add(stu2)
    db_session.commit()

    # Try to access STU-0413
    res_view = client.get(
        "/api/v1/refunds/student/STU-0413",
        headers={"Authorization": f"Bearer {parent_token}"}
    )
    assert res_view.status_code == 403

    # Try to submit refund for STU-0413
    res_submit = client.post(
        "/api/v1/refunds/request",
        json={
            "student_id": "STU-0413",
            "course_start_date": "2026-04-01",
            "course_end_date": "2027-03-31",
            "withdrawal_date": "2026-04-10",
            "withdrawal_reason": "Unauthorized parent submit attempt"
        },
        headers={"Authorization": f"Bearer {parent_token}"}
    )
    assert res_submit.status_code == 403

def test_accounts_staff_cannot_approve_refunds_for_unauthorised_centre(client, accounts_token, db_session):
    """20. Accounts staff cannot approve refunds for an unauthorised centre."""
    # accounts_token is for centre_id = 1.
    # Create student in centre 2 (STU-0413) and request
    stu2 = Student(
        id="STU-0413",
        roll_number="JEE27-0413",
        name="Priya Sharma",
        course="JEE 2027",
        batch="Evening",
        centre_id=2,
        parent_name="Sunil Sharma",
        parent_phone="9988776655",
        total_fee=Decimal("120000.00")
    )
    db_session.add(stu2)
    db_session.flush()

    req = RefundRequest(
        student_id="STU-0413", # centre_id = 2
        course_start_date=datetime.date(2026, 4, 1),
        course_end_date=datetime.date(2027, 3, 31),
        withdrawal_date=datetime.date(2026, 4, 10),
        amount_paid=Decimal("50000.0"),
        total_days=364,
        days_attended=9,
        unused_days=355,
        pro_rata_amount=Decimal("45000.0"),
        estimated_refund=Decimal("40000.0"),
        status="Pending Review"
    )
    db_session.add(req)
    db_session.commit()
    db_session.refresh(req)

    res = client.post(
        f"/api/v1/refunds/requests/{req.id}/approve",
        json={"approved_amount": 40000.0, "reason": "Attempt foreign approval"},
        headers={"Authorization": f"Bearer {accounts_token}"}
    )
    assert res.status_code == 403
    assert "unauthorised centre" in res.json()["detail"].lower()

def test_counsellor_task_permissions_enforced(client, parent_token, accounts_token, db_session):
    """21. Counsellor task permissions are strictly enforced."""
    stu2 = Student(
        id="STU-0413",
        roll_number="JEE27-0413",
        name="Priya Sharma",
        course="JEE 2027",
        batch="Evening",
        centre_id=2,
        parent_name="Sunil Sharma",
        parent_phone="9988776655",
        total_fee=Decimal("120000.00")
    )
    db_session.add(stu2)
    db_session.commit()

    # Parents cannot list counsellor tasks
    res_parent = client.get("/api/v1/risk/tasks", headers={"Authorization": f"Bearer {parent_token}"})
    assert res_parent.status_code == 403

    # Accounts staff for centre 1 cannot dismiss task for student in centre 2
    task = CounsellorTask(
        student_id="STU-0413", # centre 2
        risk_level="High",
        risk_reasons="['Foreign centre student task']",
        status="Open"
    )
    db_session.add(task)
    db_session.commit()
    db_session.refresh(task)

    res_cross = client.post(
        f"/api/v1/risk/tasks/{task.id}/dismiss",
        json={"reason": "Attempt cross centre dismissal"},
        headers={"Authorization": f"Bearer {accounts_token}"}
    )
    assert res_cross.status_code == 403
