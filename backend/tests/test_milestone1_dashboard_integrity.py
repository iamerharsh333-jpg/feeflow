import datetime
from decimal import Decimal
import pytest
from app.models import Centre, Student, Instalment, Payment, Reminder, AuditLog
from app.auth import create_access_token
from app.services.fees import get_student_fee_summary

@pytest.fixture
def admin_token():
    return create_access_token({
        "sub": "admin@feeflow.demo",
        "role": "admin",
        "name": "Super Admin"
    })

def test_dashboard_totals_match_database(client, db_session, admin_token):
    res = client.get("/api/v1/dashboard/summary", headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 200
    data = res.json()

    # Calculate expected from DB
    students = db_session.query(Student).all()
    assert data["total_students"] == len(students)

    today = datetime.date.today()
    exp_collected = 0.0
    exp_outstanding = 0.0
    exp_overdue = 0.0
    exp_overdue_count = 0

    for s in students:
        sum_res = get_student_fee_summary(s, db_session)
        exp_collected += sum_res["amount_paid"]
        exp_outstanding += sum_res["outstanding_amount"]
        overdue_insts = [i for i in s.instalments if i.status != "Paid" and i.due_date < today]
        if overdue_insts:
            exp_overdue_count += 1
            exp_overdue += sum(float(i.amount - i.paid_amount) for i in overdue_insts)

    assert abs(data["fees_collected"] - round(exp_collected, 2)) < 0.01
    assert abs(data["outstanding_fees"] - round(exp_outstanding, 2)) < 0.01
    assert abs(data["overdue_fees"] - round(exp_overdue, 2)) < 0.01
    assert data["overdue_students_count"] == exp_overdue_count


def test_centre_wise_aggregation_and_isolation(client, db_session, admin_token, accounts_token):
    # Admin gets all centres
    admin_res = client.get("/api/v1/dashboard/centre-wise", headers={"Authorization": f"Bearer {admin_token}"})
    assert admin_res.status_code == 200
    centres_data = admin_res.json()
    assert len(centres_data) >= 1
    total_centre_collected = sum(c["collected"] for c in centres_data)

    # Accounts executive with centre_id: 1 only gets Centre 1
    staff_res = client.get("/api/v1/dashboard/centre-wise", headers={"Authorization": f"Bearer {accounts_token}"})
    assert staff_res.status_code == 200
    staff_data = staff_res.json()
    assert len(staff_data) == 1
    assert staff_data[0]["centre_id"] == 1


def test_batch_wise_aggregation(client, admin_token):
    res = client.get("/api/v1/dashboard/batch-wise", headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 200
    batches = res.json()
    assert isinstance(batches, list)
    if batches:
        b0 = batches[0]
        assert "course" in b0
        assert "batch" in b0
        assert "collected" in b0
        assert "outstanding" in b0


def test_ageing_buckets_calculation(client, admin_token):
    res = client.get("/api/v1/dashboard/ageing", headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 200
    buckets = res.json()
    labels = [b["bucket"] for b in buckets]
    assert "Not Due" in labels
    assert "1–30 days" in labels
    assert "31–60 days" in labels
    assert "Over 60 days" in labels


def test_payment_updates_dashboard_and_reconciles(client, db_session, admin_token, accounts_token):
    # Setup isolated student for payment test
    stu_id = "STU-M1-PAY"
    stu = db_session.query(Student).filter(Student.id == stu_id).first()
    if not stu:
        stu = Student(
            id=stu_id,
            roll_number="JEE27-M1",
            name="Milestone1 Student",
            course="JEE 2027",
            batch="Morning",
            centre_id=1,
            parent_name="M1 Parent",
            parent_phone="9870001111",
            total_fee=Decimal("40000.00"),
            enrollment_date=datetime.date(2025, 4, 1)
        )
        db_session.add(stu)
        db_session.flush()

        ins = Instalment(
            id="INS-M1-1",
            student_id=stu.id,
            instalment_number=1,
            due_date=datetime.date(2026, 10, 10),
            amount=Decimal("20000.00"),
            paid_amount=Decimal("0.00"),
            status="Pending"
        )
        db_session.add(ins)
        db_session.commit()

    # Before summary
    sum_before = client.get("/api/v1/dashboard/summary", headers={"Authorization": f"Bearer {admin_token}"}).json()

    # Pay 10,000 partial payment
    pay_res = client.post(
        "/api/v1/payments",
        json={
            "student_id": stu_id,
            "instalment_id": "INS-M1-1",
            "amount": 10000.0,
            "method": "UPI",
            "reference_no": f"REF-M1-{datetime.datetime.now().timestamp()}"
        },
        headers={"Authorization": f"Bearer {accounts_token}"}
    )
    assert pay_res.status_code == 201

    # After summary
    sum_after = client.get("/api/v1/dashboard/summary", headers={"Authorization": f"Bearer {admin_token}"}).json()

    assert round(sum_after["fees_collected"] - sum_before["fees_collected"], 2) == 10000.0
    assert round(sum_before["outstanding_fees"] - sum_after["outstanding_fees"], 2) == 10000.0


def test_payment_amount_cannot_exceed_outstanding(client, accounts_token):
    # Try to pay 999,999 on a 30,000 instalment (INS-0412-2)
    res = client.post(
        "/api/v1/payments",
        json={
            "student_id": "STU-0412",
            "instalment_id": "INS-0412-2",
            "amount": 999999.0,
            "method": "UPI",
            "reference_no": f"REF-OVERPAY-{datetime.datetime.now().timestamp()}"
        },
        headers={"Authorization": f"Bearer {accounts_token}"}
    )
    assert res.status_code == 400
    assert "exceeds" in res.json()["detail"].lower()


def test_duplicate_payment_rejected(client, accounts_token):
    ref = f"REF-DUP-{datetime.datetime.now().timestamp()}"
    res1 = client.post(
        "/api/v1/payments",
        json={
            "student_id": "STU-0412",
            "instalment_id": "INS-0412-2",
            "amount": 1000.0,
            "method": "UPI",
            "reference_no": ref
        },
        headers={"Authorization": f"Bearer {accounts_token}"}
    )
    assert res1.status_code == 201

    # Same reference_no again
    res2 = client.post(
        "/api/v1/payments",
        json={
            "student_id": "STU-0412",
            "instalment_id": "INS-0412-2",
            "amount": 1000.0,
            "method": "UPI",
            "reference_no": ref
        },
        headers={"Authorization": f"Bearer {accounts_token}"}
    )
    assert res2.status_code == 409
    assert "already processed" in res2.json()["detail"].lower()


def test_staff_cannot_access_foreign_centre_dashboard(client, accounts_token):
    # Accounts token has centre_id: 1. Attempting to query centre 2 must yield 403
    res = client.get("/api/v1/dashboard/summary?centre_id=2", headers={"Authorization": f"Bearer {accounts_token}"})
    assert res.status_code == 403
    assert "Forbidden" in res.json()["detail"]


def test_audit_records_persisted(client, db_session, accounts_token):
    # Check audit log on payment review action
    p = db_session.query(Payment).filter(Payment.status == "Unmatched").first()
    if not p:
        p = Payment(
            id=f"PAY-AUDIT-{datetime.datetime.now().timestamp()}",
            transaction_id=f"TXN-AUDIT-{datetime.datetime.now().timestamp()}",
            amount=Decimal("5000.00"),
            payment_date=datetime.date.today(),
            method="UPI",
            reference_no=f"REF-AUDIT-{datetime.datetime.now().timestamp()}",
            status="Unmatched"
        )
        db_session.add(p)
        db_session.commit()

    rev_res = client.post(f"/api/v1/payments/{p.id}/review", headers={"Authorization": f"Bearer {accounts_token}"})
    assert rev_res.status_code == 200

    # Verify audit log exists
    audit = db_session.query(AuditLog).filter(
        AuditLog.entity_id == p.id,
        AuditLog.action == "PAYMENT_UNDER_REVIEW"
    ).first()
    assert audit is not None
    assert audit.changed_by is not None
