import datetime
import csv
import io
from decimal import Decimal
import pytest
from app.models import Student, Centre, Payment, Attendance, TestScore as DBTestScore, Instalment

def test_unauthenticated_requests_blocked(client):
    """Verify that protected API endpoints return 401 Unauthorized when unauthenticated."""
    assert client.get("/api/v1/dashboard/summary").status_code == 401
    assert client.get("/api/v1/students").status_code == 401
    assert client.get("/api/v1/payments").status_code == 401
    assert client.get("/api/v1/refunds/requests").status_code == 401
    assert client.get("/api/v1/risk/tasks").status_code == 401

def test_student_attendance_idor_protection(client, db_session, student_token):
    """Verify that a student cannot view another student's attendance records."""
    other_student = Student(
        id="STU-9999",
        roll_number="JEE27-9999",
        name="Other Student",
        course="JEE 2027",
        batch="Morning",
        centre_id=1,
        parent_name="Other Parent",
        parent_phone="9999999999",
        total_fee=Decimal("120000.00"),
        enrollment_date=datetime.date(2025, 4, 1)
    )
    att1 = Attendance(
        student_id="STU-9999",
        batch="Morning",
        date=datetime.date.today(),
        status="Present"
    )
    att_own = Attendance(
        student_id="STU-0412",
        batch="Morning",
        date=datetime.date.today(),
        status="Present"
    )
    db_session.add_all([other_student, att1, att_own])
    db_session.commit()

    # Attempt cross-student IDOR access
    res_forbidden = client.get(
        "/api/v1/attendance/STU-9999",
        headers={"Authorization": f"Bearer {student_token}"}
    )
    assert res_forbidden.status_code == 403

    # Own attendance access allowed
    res_own = client.get(
        "/api/v1/attendance/STU-0412",
        headers={"Authorization": f"Bearer {student_token}"}
    )
    assert res_own.status_code == 200
    data = res_own.json()
    assert data["student_id"] == "STU-0412"
    assert data["total_classes"] >= 1

def test_student_test_scores_idor_protection(client, db_session, student_token):
    """Verify that a student cannot view another student's test scores."""
    other_student = Student(
        id="STU-8888",
        roll_number="JEE27-8888",
        name="Target Student",
        course="JEE 2027",
        batch="Morning",
        centre_id=1,
        parent_name="Target Parent",
        parent_phone="8888888888",
        total_fee=Decimal("120000.00"),
        enrollment_date=datetime.date(2025, 4, 1)
    )
    score1 = DBTestScore(
        student_id="STU-8888",
        test_name="Unit Test 1",
        test_date=datetime.date.today(),
        subject="Physics",
        max_marks=100.0,
        marks_obtained=88.0
    )
    score_own = DBTestScore(
        student_id="STU-0412",
        test_name="Unit Test 1",
        test_date=datetime.date.today(),
        subject="Physics",
        max_marks=100.0,
        marks_obtained=75.0
    )
    db_session.add_all([other_student, score1, score_own])
    db_session.commit()

    # Cross-student test IDOR forbidden
    res_forbidden = client.get(
        "/api/v1/tests/STU-8888",
        headers={"Authorization": f"Bearer {student_token}"}
    )
    assert res_forbidden.status_code == 403

    # Own test score allowed
    res_own = client.get(
        "/api/v1/tests/STU-0412",
        headers={"Authorization": f"Bearer {student_token}"}
    )
    assert res_own.status_code == 200
    assert len(res_own.json()) >= 1
    assert res_own.json()[0]["subject"] == "Physics"

def test_negative_and_zero_payment_rejected(client, accounts_token):
    """Verify that payment recording rejects zero or negative amounts."""
    # Zero amount
    res_zero = client.post(
        "/api/v1/payments",
        json={
            "student_id": "STU-0412",
            "amount": 0.0,
            "method": "UPI",
            "reference_no": "ZERO-PAY-01"
        },
        headers={"Authorization": f"Bearer {accounts_token}"}
    )
    assert res_zero.status_code in [400, 422]

    # Negative amount
    res_neg = client.post(
        "/api/v1/payments",
        json={
            "student_id": "STU-0412",
            "amount": -500.0,
            "method": "UPI",
            "reference_no": "NEG-PAY-01"
        },
        headers={"Authorization": f"Bearer {accounts_token}"}
    )
    assert res_neg.status_code in [400, 422]

def test_overpayment_exceeding_instalment_rejected(client, accounts_token):
    """Verify that paying more than an instalment's remaining balance is rejected."""
    # INS-0412-2 has amount 30000.00 and paid 0.00
    res_over = client.post(
        "/api/v1/payments",
        json={
            "student_id": "STU-0412",
            "instalment_id": "INS-0412-2",
            "amount": 40000.0,
            "method": "UPI",
            "reference_no": "OVERPAY-REF-01"
        },
        headers={"Authorization": f"Bearer {accounts_token}"}
    )
    assert res_over.status_code == 400
    assert "exceeds" in res_over.json()["detail"].lower()

def test_centre_isolation_on_reports_and_dashboard(client, db_session, accounts_token):
    """Verify that accounts executives can only see reports and summary for their authorized centre."""
    # Create Centre 2 student
    stu_c2 = Student(
        id="STU-C2-01",
        roll_number="NEET27-01",
        name="Centre Two Student",
        course="NEET 2027",
        batch="Evening",
        centre_id=2, # Centre 2 (Jaipur West)
        parent_name="Parent Two",
        parent_phone="9111111111",
        total_fee=Decimal("150000.00"),
        enrollment_date=datetime.date(2025, 4, 1)
    )
    p_c2 = Payment(
        id="PAY-C2-01",
        transaction_id="TXN-C2-01",
        student_id="STU-C2-01",
        centre_id=2,
        amount=Decimal("50000.00"),
        payment_date=datetime.date.today(),
        method="UPI",
        reference_no="REF-C2-01",
        status="Success"
    )
    db_session.add_all([stu_c2, p_c2])
    db_session.commit()

    # Accounts token belongs to Centre 1 (Jaipur Main)
    # 1. Centre collection report should only list Centre 1
    res_coll = client.get(
        "/api/v1/reports/centre-collection",
        headers={"Authorization": f"Bearer {accounts_token}"}
    )
    assert res_coll.status_code == 200
    centres = [r["centre"] for r in res_coll.json()]
    assert "Jaipur Main" in centres
    assert "Jaipur West" not in centres

    # 2. Tally export should only include Centre 1 payments
    res_tally = client.get(
        "/api/v1/reports/tally-export",
        headers={"Authorization": f"Bearer {accounts_token}"}
    )
    assert res_tally.status_code == 200
    assert "TXN-C2-01" not in res_tally.text

    # 3. Cross-centre dashboard access should be forbidden
    res_dash_forbidden = client.get(
        "/api/v1/dashboard/summary?centre_id=2",
        headers={"Authorization": f"Bearer {accounts_token}"}
    )
    assert res_dash_forbidden.status_code == 403

def test_tally_export_double_entry_balance(client, db_session, admin_token):
    """Verify that Tally export produces matching Debit and Credit entries for all successful payments."""
    pay = Payment(
        id="PAY-TALLY-01",
        transaction_id="TXN-TALLY-01",
        student_id="STU-0412",
        centre_id=1,
        amount=Decimal("15000.00"),
        payment_date=datetime.date.today(),
        method="UPI",
        reference_no="REF-TALLY-01",
        status="Success"
    )
    db_session.add(pay)
    db_session.commit()

    res = client.get(
        "/api/v1/reports/tally-export",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert res.status_code == 200
    csv_text = res.text
    reader = csv.DictReader(io.StringIO(csv_text))
    rows = list(reader)

    # Filter rows for our transaction
    txn_rows = [r for r in rows if r["Voucher No"] == "TXN-TALLY-01"]
    assert len(txn_rows) == 2, "Each transaction must have exactly one Dr and one Cr voucher entry"
    dr_row = next(r for r in txn_rows if r["Dr/Cr"] == "Dr")
    cr_row = next(r for r in txn_rows if r["Dr/Cr"] == "Cr")

    assert float(dr_row["Amount"]) == 15000.0
    assert float(cr_row["Amount"]) == 15000.0
    assert dr_row["Ledger Name"] == "HDFC Bank A/c"
    assert "Fee Revenue" in cr_row["Ledger Name"]

def test_parent_receipts_idor(client, student_token, parent_token):
    """Verify that parents can only view receipts for their linked student."""
    # Parent is linked to STU-0412
    res_own = client.get(
        "/api/v1/receipts?student_id=STU-0412",
        headers={"Authorization": f"Bearer {parent_token}"}
    )
    assert res_own.status_code == 200

    # Cross-student receipt access is blocked
    res_forbidden = client.get(
        "/api/v1/receipts?student_id=STU-9999",
        headers={"Authorization": f"Bearer {parent_token}"}
    )
    assert res_forbidden.status_code == 403
