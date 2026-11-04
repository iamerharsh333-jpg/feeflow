import datetime
import io
from decimal import Decimal
import pytest
from app.models import Centre, Student, Instalment, Reminder, User, ParentalConsent
from app.services.reminders import schedule_instalment_reminders
from app.services.risk import rule_based_risk_assessment
from app.auth import create_access_token, send_mock_otp

def test_cross_role_and_centre_isolation(client, db_session, accounts_token, student_token, parent_token):
    # Setup Centre 2 and Student 2 (Kota)
    c2 = db_session.query(Centre).filter(Centre.id == 2).first()
    if not c2:
        c2 = Centre(id=2, name="Kota Main", code="KT-01", city="Kota")
        db_session.add(c2)
        db_session.flush()

    s2 = db_session.query(Student).filter(Student.id == "STU-0219").first()
    if not s2:
        s2 = Student(
            id="STU-0219",
            roll_number="NEET27-0219",
            name="Mohit Gurjar",
            course="NEET 2027",
            batch="Morning",
            centre_id=c2.id,
            parent_name="Ramesh Gurjar",
            parent_phone="9988776655",
            total_fee=Decimal("120000.00"),
            enrollment_date=datetime.date(2025, 4, 1)
        )
        db_session.add(s2)
        db_session.commit()

    # 1. Accounts user (centre 1) attempting to access centre 2 student details -> 403 Forbidden
    res = client.get("/api/v1/students/STU-0219", headers={"Authorization": f"Bearer {accounts_token}"})
    assert res.status_code == 403
    assert "Forbidden" in res.json()["detail"]

    # 2. Accounts user (centre 1) attempting to access centre 2 fee ledger -> 403 Forbidden
    res = client.get("/api/v1/fees/STU-0219/ledger", headers={"Authorization": f"Bearer {accounts_token}"})
    assert res.status_code == 403
    assert "Forbidden" in res.json()["detail"]

    # 3. Parent (9876543210 - linked to STU-0412) attempting to access STU-0219 -> 403 Forbidden
    res = client.get("/api/v1/students/STU-0219", headers={"Authorization": f"Bearer {parent_token}"})
    assert res.status_code == 403

    # 4. Parent attempting to record payment for an unlinked student -> 403 Forbidden
    res = client.post(
        "/api/v1/payments",
        json={"student_id": "STU-0219", "amount": 1000.0, "method": "UPI"},
        headers={"Authorization": f"Bearer {parent_token}"}
    )
    assert res.status_code == 403

    # 5. Student (STU-0412) attempting to view another student's fee ledger -> 403 Forbidden
    res = client.get("/api/v1/fees/STU-0219/ledger", headers={"Authorization": f"Bearer {student_token}"})
    assert res.status_code == 403

    # 6. Student (STU-0412) attempting to view another student's attendance -> 403 Forbidden
    res = client.get("/api/v1/attendance/STU-0219", headers={"Authorization": f"Bearer {student_token}"})
    assert res.status_code == 403


def test_complete_payment_to_reminder_cancellation(client, db_session, accounts_token):
    # Use dedicated test student to isolate state
    stu = db_session.query(Student).filter(Student.id == "STU-WORKFLOW").first()
    if not stu:
        stu = Student(
            id="STU-WORKFLOW",
            roll_number="JEE27-9999",
            name="Workflow Test Student",
            course="JEE 2027",
            batch="Morning",
            centre_id=1,
            parent_name="Workflow Parent",
            parent_phone="9871112233",
            total_fee=Decimal("60000.00"),
            enrollment_date=datetime.date(2025, 4, 1)
        )
        db_session.add(stu)
        db_session.flush()

    # Create fresh instalment for payment workflow
    ins_id = "INS-TEST-WORKFLOW"
    ins = db_session.query(Instalment).filter(Instalment.id == ins_id).first()
    if not ins:
        ins = Instalment(
            id=ins_id,
            student_id=stu.id,
            instalment_number=1,
            due_date=datetime.date(2026, 12, 10),
            amount=Decimal("20000.00"),
            paid_amount=Decimal("0.00"),
            status="Pending"
        )
        db_session.add(ins)
        db_session.commit()

    # Schedule reminders for this instalment
    rems = schedule_instalment_reminders(stu, ins, db_session, centre_name="Jaipur Main")
    db_session.commit()
    assert len(rems) == 3

    # Record full payment
    res = client.post(
        "/api/v1/payments",
        json={
            "student_id": stu.id,
            "instalment_id": ins.id,
            "amount": 20000.0,
            "method": "UPI",
            "reference_no": f"REF-WORKFLOW-{datetime.datetime.now().timestamp()}",
            "notes": "Full instalment payoff"
        },
        headers={"Authorization": f"Bearer {accounts_token}"}
    )
    assert res.status_code == 201
    pay_data = res.json()
    assert pay_data["status"] == "Success"
    assert pay_data["receipt_no"] is not None
    assert pay_data["receipt_no"].startswith("REC-")

    # Verify instalment is marked Paid
    db_session.refresh(ins)
    assert ins.status == "Paid"
    assert ins.paid_amount == Decimal("20000.00")

    # Verify reminders for this instalment are now Cancelled
    cancelled_rems = db_session.query(Reminder).filter(Reminder.instalment_id == ins.id).all()
    assert len(cancelled_rems) == 3
    for r in cancelled_rems:
        assert r.status == "Cancelled"


def test_reminder_duplicate_prevention(db_session):
    stu = db_session.query(Student).filter(Student.id == "STU-0412").first()
    ins = db_session.query(Instalment).filter(Instalment.student_id == stu.id, Instalment.status == "Pending").first()

    # Call schedule twice
    rems1 = schedule_instalment_reminders(stu, ins, db_session)
    db_session.commit()
    count1 = db_session.query(Reminder).filter(Reminder.instalment_id == ins.id).count()

    rems2 = schedule_instalment_reminders(stu, ins, db_session)
    db_session.commit()
    count2 = db_session.query(Reminder).filter(Reminder.instalment_id == ins.id).count()

    # Count should not duplicate
    assert count1 == count2


def test_bulk_csv_upload_validation(client, accounts_token):
    # CSV with 1 valid row, 1 non-existent student, 1 invalid date format, 1 invalid status
    csv_content = (
        "student_id,batch,date,status\n"
        "STU-0412,Morning,2026-11-01,Present\n"
        "STU-NONEXIST,Morning,2026-11-01,Present\n"
        "STU-0412,Morning,01-11-2026,Present\n"
        "STU-0412,Morning,2026-11-02,Excused\n"
    )

    files = {"file": ("attendance.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")}
    res = client.post(
        "/api/v1/attendance/bulk-upload",
        files=files,
        headers={"Authorization": f"Bearer {accounts_token}"}
    )
    assert res.status_code == 201
    data = res.json()
    assert data["processed_rows"] == 1
    assert data["error_count"] == 3
    assert any("does not exist" in e for e in data["errors"])
    assert any("Invalid date format" in e for e in data["errors"])
    assert any("Invalid status" in e for e in data["errors"])


def test_tally_compatible_export(client, accounts_token):
    # Record a payment first so a receipt exists to export
    client.post(
        "/api/v1/payments",
        json={
            "student_id": "STU-0412",
            "instalment_id": "INS-0412-2",
            "amount": 5000.0,
            "method": "UPI",
            "reference_no": "UPI-TALLY-TEST-01"
        },
        headers={"Authorization": f"Bearer {accounts_token}"}
    )

    res = client.get("/api/v1/reports/tally-export", headers={"Authorization": f"Bearer {accounts_token}"})
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/csv")
    csv_text = res.text
    # Verify standard Tally double-entry header and rows
    assert "Date,Voucher Type,Voucher No,Ledger Name,Amount,Dr/Cr" in csv_text
    assert ",Receipt," in csv_text
    assert ",Dr" in csv_text
    assert ",Cr" in csv_text


def test_rule_based_risk_fallback():
    # Verify explainable rule-based scoring logic
    res_high = rule_based_risk_assessment(
        attendance_pct=58.0,
        overdue_count=2,
        overdue_amount=60000.0,
        score_trend="Declining"
    )
    assert res_high["risk_level"] == "High"
    assert len(res_high["risk_reasons"]) >= 2

    res_low = rule_based_risk_assessment(
        attendance_pct=92.0,
        overdue_count=0,
        overdue_amount=0.0,
        score_trend="Stable"
    )
    assert res_low["risk_level"] == "Low"


def test_otp_rate_limiting_and_parental_consent(client, parent_token, accounts_token):
    # OTP rate limit check: send OTP for a new number
    test_phone = "9820098200"
    otp1 = send_mock_otp(test_phone)
    assert len(otp1) == 6

    # Immediate second request should trigger HTTP 429
    with pytest.raises(Exception) as exc:
        send_mock_otp(test_phone)
    assert "429" in str(exc.value)

    # Parental consent creation & retrieval
    consent_res = client.post(
        "/api/v1/consent",
        json={
            "student_id": "STU-0412",
            "parent_phone": "9876543210",
            "consent_type": "DIGITAL_MINOR_DATA_PROCESSING",
            "notes": "Verified via OTP"
        },
        headers={"Authorization": f"Bearer {parent_token}"}
    )
    assert consent_res.status_code == 201
    assert consent_res.json()["verified"] is True

    # Check consent status
    check_res = client.get("/api/v1/consent/STU-0412", headers={"Authorization": f"Bearer {accounts_token}"})
    assert check_res.status_code == 200
    assert check_res.json()["parental_consent_verified"] is True
