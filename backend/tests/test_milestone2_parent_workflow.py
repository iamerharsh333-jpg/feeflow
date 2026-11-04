import datetime
from decimal import Decimal
import pytest
from app.models import Centre, Student, Instalment, Payment, Reminder, Receipt, AuditLog
from app.auth import create_access_token
from app.services.reminders import schedule_instalment_reminders

@pytest.fixture
def parent2_token():
    return create_access_token({
        "sub": "9123456789",
        "role": "parent",
        "name": "Sunita Sharma",
        "student_id": "STU-0587"
    })

def seed_second_student(db_session):
    s2 = db_session.query(Student).filter(Student.id == "STU-0587").first()
    if not s2:
        s2 = Student(
            id="STU-0587",
            roll_number="JEE27-EVE-0587",
            name="Ishita Sharma",
            course="JEE 2027",
            batch="Evening",
            centre_id=1,
            parent_name="Sunita Sharma",
            parent_phone="9123456789",
            total_fee=Decimal("120000.00"),
            enrollment_date=datetime.date(2025, 4, 1)
        )
        db_session.add(s2)
        db_session.flush()

        ins1 = Instalment(
            id="INS-0587-1",
            student_id=s2.id,
            instalment_number=1,
            due_date=datetime.date(2025, 4, 10),
            amount=Decimal("30000.00"),
            paid_amount=Decimal("30000.00"),
            status="Paid"
        )
        ins2 = Instalment(
            id="INS-0587-2",
            student_id=s2.id,
            instalment_number=2,
            due_date=datetime.date(2026, 10, 10),
            amount=Decimal("30000.00"),
            paid_amount=Decimal("0.00"),
            status="Pending"
        )
        db_session.add_all([ins1, ins2])
        db_session.commit()
    return s2


# 1. Parent can access their linked student
def test_parent_can_access_linked_student(client, parent_token):
    # Detail view
    res = client.get("/api/v1/students/STU-0412", headers={"Authorization": f"Bearer {parent_token}"})
    assert res.status_code == 200
    data = res.json()
    assert data["id"] == "STU-0412"
    assert data["name"] == "Aarav Meena"
    assert data["parent_phone"] == "9876543210"
    assert "total_discount" in data
    assert len(data["instalments"]) >= 1

    # List view returns linked student
    res_list = client.get("/api/v1/students", headers={"Authorization": f"Bearer {parent_token}"})
    assert res_list.status_code == 200
    students = res_list.json()
    assert len(students) == 1
    assert students[0]["id"] == "STU-0412"


# 2. Parent cannot access an unlinked student
def test_parent_cannot_access_unlinked_student(client, db_session, parent_token):
    seed_second_student(db_session)

    # Attempt to view unlinked student record
    res_details = client.get("/api/v1/students/STU-0587", headers={"Authorization": f"Bearer {parent_token}"})
    assert res_details.status_code == 403
    assert "Forbidden" in res_details.json()["detail"]

    # Attempt to view unlinked student fee ledger
    res_ledger = client.get("/api/v1/fees/STU-0587/ledger", headers={"Authorization": f"Bearer {parent_token}"})
    assert res_ledger.status_code == 403

    # Attempt to view unlinked student attendance
    res_att = client.get("/api/v1/attendance/STU-0587", headers={"Authorization": f"Bearer {parent_token}"})
    assert res_att.status_code == 403

    # Attempt to view unlinked student test scores
    res_tests = client.get("/api/v1/tests/STU-0587", headers={"Authorization": f"Bearer {parent_token}"})
    assert res_tests.status_code == 403


# 3. Successful simulated payment updates the ledger
def test_successful_simulated_payment_updates_ledger(client, parent_token):
    # Step A: Create Intent
    intent_res = client.post(
        "/api/v1/payments/intent",
        json={
            "student_id": "STU-0412",
            "instalment_id": "INS-0412-2",
            "amount": 10000.0,
            "method": "UPI"
        },
        headers={"Authorization": f"Bearer {parent_token}"}
    )
    assert intent_res.status_code == 201
    intent = intent_res.json()
    assert intent["order_id"].startswith("order_mock_")
    assert intent["signature"] is not None
    assert intent["amount"] == 10000.0

    # Step B: Verify with simulated success
    verify_res = client.post(
        "/api/v1/payments/verify",
        json={
            "order_id": intent["order_id"],
            "payment_id": f"pay_mock_{datetime.datetime.now().timestamp()}",
            "signature": intent["signature"],
            "simulation_status": "success"
        },
        headers={"Authorization": f"Bearer {parent_token}"}
    )
    assert verify_res.status_code == 200
    res_data = verify_res.json()
    assert res_data["status"] == "Success"
    assert res_data["payment"] is not None
    assert res_data["receipt"] is not None
    assert res_data["payment"]["amount"] == 10000.0

    # Step C: Verify fee ledger updated
    ledger_res = client.get("/api/v1/fees/STU-0412/ledger", headers={"Authorization": f"Bearer {parent_token}"})
    assert ledger_res.status_code == 200
    ledger = ledger_res.json()
    ins2 = next(i for i in ledger["instalments"] if i["id"] == "INS-0412-2")
    assert ins2["paid_amount"] == 10000.0
    assert ins2["status"] == "Partially Paid"
    assert ledger["amount_paid"] == 40000.0  # 30000 baseline + 10000


# 4. Failed payment does not update the ledger
def test_failed_payment_does_not_update_ledger(client, db_session, parent_token):
    ins_before = db_session.query(Instalment).filter(Instalment.id == "INS-0412-2").first()
    paid_before = float(ins_before.paid_amount)

    # Create intent
    intent_res = client.post(
        "/api/v1/payments/intent",
        json={
            "student_id": "STU-0412",
            "instalment_id": "INS-0412-2",
            "amount": 5000.0,
            "method": "UPI"
        },
        headers={"Authorization": f"Bearer {parent_token}"}
    )
    intent = intent_res.json()

    # Verify with simulated bank failure
    verify_res = client.post(
        "/api/v1/payments/verify",
        json={
            "order_id": intent["order_id"],
            "payment_id": f"pay_fail_{datetime.datetime.now().timestamp()}",
            "signature": intent["signature"],
            "simulation_status": "failed"
        },
        headers={"Authorization": f"Bearer {parent_token}"}
    )
    assert verify_res.status_code == 200
    assert verify_res.json()["status"] == "Failed"
    assert verify_res.json()["receipt"] is None

    # Ledger remains unchanged
    db_session.refresh(ins_before)
    assert float(ins_before.paid_amount) == paid_before


# 5. Cancelled payment does not create a receipt
def test_cancelled_payment_does_not_create_receipt(client, db_session, parent_token):
    intent_res = client.post(
        "/api/v1/payments/intent",
        json={
            "student_id": "STU-0412",
            "instalment_id": "INS-0412-2",
            "amount": 5000.0,
            "method": "UPI"
        },
        headers={"Authorization": f"Bearer {parent_token}"}
    )
    intent = intent_res.json()

    verify_res = client.post(
        "/api/v1/payments/verify",
        json={
            "order_id": intent["order_id"],
            "payment_id": f"pay_can_{datetime.datetime.now().timestamp()}",
            "signature": intent["signature"],
            "simulation_status": "cancelled"
        },
        headers={"Authorization": f"Bearer {parent_token}"}
    )
    assert verify_res.status_code == 200
    assert verify_res.json()["status"] == "Cancelled"
    assert verify_res.json()["receipt"] is None

    # Ensure no receipt exists for this student
    receipts_res = client.get("/api/v1/receipts?student_id=STU-0412", headers={"Authorization": f"Bearer {parent_token}"})
    assert receipts_res.status_code == 200
    assert len(receipts_res.json()) == 0


# 6. Duplicate payment processing is rejected or safely returns the existing result
def test_duplicate_payment_processing_is_idempotent(client, parent_token):
    intent_res = client.post(
        "/api/v1/payments/intent",
        json={
            "student_id": "STU-0412",
            "instalment_id": "INS-0412-2",
            "amount": 7000.0,
            "method": "UPI"
        },
        headers={"Authorization": f"Bearer {parent_token}"}
    )
    intent = intent_res.json()
    ref = f"pay_idem_{datetime.datetime.now().timestamp()}"

    # First verify attempt
    res1 = client.post(
        "/api/v1/payments/verify",
        json={
            "order_id": intent["order_id"],
            "payment_id": ref,
            "signature": intent["signature"],
            "simulation_status": "success"
        },
        headers={"Authorization": f"Bearer {parent_token}"}
    )
    assert res1.status_code == 200
    assert res1.json()["status"] == "Success"

    # Second verify attempt with identical payload
    res2 = client.post(
        "/api/v1/payments/verify",
        json={
            "order_id": intent["order_id"],
            "payment_id": ref,
            "signature": intent["signature"],
            "simulation_status": "success"
        },
        headers={"Authorization": f"Bearer {parent_token}"}
    )
    assert res2.status_code == 200
    assert res2.json()["status"] == "Success"
    assert "already processed" in res2.json()["message"].lower()

    # Ledger must only have one 7000 payment, not 14000
    ledger_res = client.get("/api/v1/fees/STU-0412/ledger", headers={"Authorization": f"Bearer {parent_token}"})
    ins2 = next(i for i in ledger_res.json()["instalments"] if i["id"] == "INS-0412-2")
    assert ins2["paid_amount"] == 7000.0


# 7. Partial payment updates the remaining balance
def test_partial_payment_updates_remaining_balance(client, parent_token):
    intent_res = client.post(
        "/api/v1/payments/intent",
        json={
            "student_id": "STU-0412",
            "instalment_id": "INS-0412-2",
            "amount": 12000.0,
            "method": "Net Banking"
        },
        headers={"Authorization": f"Bearer {parent_token}"}
    )
    intent = intent_res.json()

    client.post(
        "/api/v1/payments/verify",
        json={
            "order_id": intent["order_id"],
            "payment_id": f"pay_part_{datetime.datetime.now().timestamp()}",
            "signature": intent["signature"],
            "simulation_status": "success"
        },
        headers={"Authorization": f"Bearer {parent_token}"}
    )

    ledger_res = client.get("/api/v1/fees/STU-0412/ledger", headers={"Authorization": f"Bearer {parent_token}"})
    ins2 = next(i for i in ledger_res.json()["instalments"] if i["id"] == "INS-0412-2")
    assert ins2["paid_amount"] == 12000.0
    assert ins2["amount"] - ins2["paid_amount"] == 18000.0
    assert ins2["status"] == "Partially Paid"


# 8. Full payment cancels pending reminders
def test_full_payment_cancels_pending_reminders(client, db_session, parent_token):
    student = db_session.query(Student).filter(Student.id == "STU-0412").first()
    ins2 = db_session.query(Instalment).filter(Instalment.id == "INS-0412-2").first()

    # Schedule reminders
    rems = schedule_instalment_reminders(student, ins2, db_session, "Jaipur Main")
    db_session.commit()
    assert len(rems) == 3
    assert all(r.status == "Scheduled" for r in rems)

    # Pay full remaining balance of ₹30,000
    intent_res = client.post(
        "/api/v1/payments/intent",
        json={
            "student_id": "STU-0412",
            "instalment_id": "INS-0412-2",
            "amount": 30000.0,
            "method": "UPI"
        },
        headers={"Authorization": f"Bearer {parent_token}"}
    )
    intent = intent_res.json()

    client.post(
        "/api/v1/payments/verify",
        json={
            "order_id": intent["order_id"],
            "payment_id": f"pay_full_{datetime.datetime.now().timestamp()}",
            "signature": intent["signature"],
            "simulation_status": "success"
        },
        headers={"Authorization": f"Bearer {parent_token}"}
    )

    # Check reminders: ALL must now be Cancelled
    db_session.expire_all()
    rems_after = db_session.query(Reminder).filter(Reminder.instalment_id == "INS-0412-2").all()
    assert len(rems_after) == 3
    assert all(r.status == "Cancelled" for r in rems_after)


# 9. Partial payment reminder shows remaining balance
def test_partial_payment_reminder_shows_remaining_balance(client, accounts_token, parent_token):
    # Pay partial ₹10,000 on ₹30,000 instalment -> ₹20,000 remaining
    intent_res = client.post(
        "/api/v1/payments/intent",
        json={
            "student_id": "STU-0412",
            "instalment_id": "INS-0412-2",
            "amount": 10000.0,
            "method": "UPI"
        },
        headers={"Authorization": f"Bearer {parent_token}"}
    )
    intent = intent_res.json()

    client.post(
        "/api/v1/payments/verify",
        json={
            "order_id": intent["order_id"],
            "payment_id": f"pay_rem_test_{datetime.datetime.now().timestamp()}",
            "signature": intent["signature"],
            "simulation_status": "success"
        },
        headers={"Authorization": f"Bearer {parent_token}"}
    )

    # Preview reminder in English: must mention remaining balance
    prev_en = client.post(
        "/api/v1/reminders/preview",
        json={"student_id": "STU-0412", "instalment_id": "INS-0412-2", "lang": "en"},
        headers={"Authorization": f"Bearer {accounts_token}"}
    )
    assert prev_en.status_code == 200
    assert "remaining balance of ₹20,000" in prev_en.json()["message_text"]

    # Preview reminder in Hindi: must mention remaining balance
    prev_hi = client.post(
        "/api/v1/reminders/preview",
        json={"student_id": "STU-0412", "instalment_id": "INS-0412-2", "lang": "hi"},
        headers={"Authorization": f"Bearer {accounts_token}"}
    )
    assert prev_hi.status_code == 200
    assert "₹20,000 की शेष फीस किस्त" in prev_hi.json()["message_text"]


# 10. Receipt history is restricted to the correct parent
def test_receipt_history_restricted_to_correct_parent(client, db_session, parent_token, parent2_token):
    seed_second_student(db_session)

    # Parent 1 makes payment -> gets receipt
    intent1 = client.post(
        "/api/v1/payments/intent",
        json={"student_id": "STU-0412", "instalment_id": "INS-0412-2", "amount": 5000.0},
        headers={"Authorization": f"Bearer {parent_token}"}
    ).json()

    ver1 = client.post(
        "/api/v1/payments/verify",
        json={
            "order_id": intent1["order_id"],
            "payment_id": f"pay_p1_{datetime.datetime.now().timestamp()}",
            "signature": intent1["signature"],
            "simulation_status": "success"
        },
        headers={"Authorization": f"Bearer {parent_token}"}
    ).json()
    rec1_no = ver1["receipt"]["receipt_no"]

    # Parent 2 makes payment -> gets receipt
    intent2 = client.post(
        "/api/v1/payments/intent",
        json={"student_id": "STU-0587", "instalment_id": "INS-0587-2", "amount": 6000.0},
        headers={"Authorization": f"Bearer {parent2_token}"}
    ).json()

    ver2 = client.post(
        "/api/v1/payments/verify",
        json={
            "order_id": intent2["order_id"],
            "payment_id": f"pay_p2_{datetime.datetime.now().timestamp()}",
            "signature": intent2["signature"],
            "simulation_status": "success"
        },
        headers={"Authorization": f"Bearer {parent2_token}"}
    ).json()
    rec2_no = ver2["receipt"]["receipt_no"]

    # Parent 1 lists receipts: sees rec1, NEVER rec2
    res_p1_recs = client.get("/api/v1/receipts", headers={"Authorization": f"Bearer {parent_token}"})
    p1_receipt_nos = [r["receipt_no"] for r in res_p1_recs.json()]
    assert rec1_no in p1_receipt_nos
    assert rec2_no not in p1_receipt_nos

    # Parent 1 tries to access Parent 2's receipt detail directly -> 403 Forbidden
    res_steal = client.get(f"/api/v1/receipts/{rec2_no}", headers={"Authorization": f"Bearer {parent_token}"})
    assert res_steal.status_code == 403


# 11. Dashboard and parent balance reconcile
def test_dashboard_and_parent_balance_reconcile(client, admin_token, parent_token):
    # Summary before
    sum_before = client.get("/api/v1/dashboard/summary", headers={"Authorization": f"Bearer {admin_token}"}).json()
    coll_before = sum_before["fees_collected"]
    out_before = sum_before["outstanding_fees"]

    # Parent makes verified payment of 15,000
    intent = client.post(
        "/api/v1/payments/intent",
        json={"student_id": "STU-0412", "instalment_id": "INS-0412-2", "amount": 15000.0},
        headers={"Authorization": f"Bearer {parent_token}"}
    ).json()

    client.post(
        "/api/v1/payments/verify",
        json={
            "order_id": intent["order_id"],
            "payment_id": f"pay_recon_{datetime.datetime.now().timestamp()}",
            "signature": intent["signature"],
            "simulation_status": "success"
        },
        headers={"Authorization": f"Bearer {parent_token}"}
    )

    # Summary after
    sum_after = client.get("/api/v1/dashboard/summary", headers={"Authorization": f"Bearer {admin_token}"}).json()
    assert round(sum_after["fees_collected"] - coll_before, 2) == 15000.0
    assert round(out_before - sum_after["outstanding_fees"], 2) == 15000.0

    # Parent student details after
    stu_after = client.get("/api/v1/students/STU-0412", headers={"Authorization": f"Bearer {parent_token}"}).json()
    assert stu_after["amount_paid"] == 45000.0  # 30,000 baseline + 15,000
    assert stu_after["outstanding_amount"] == 75000.0  # 120,000 - 45,000


# 12. Payment verification cannot be bypassed through frontend input
def test_payment_verification_cannot_be_bypassed(client, parent_token):
    intent = client.post(
        "/api/v1/payments/intent",
        json={"student_id": "STU-0412", "instalment_id": "INS-0412-2", "amount": 5000.0},
        headers={"Authorization": f"Bearer {parent_token}"}
    ).json()

    # Tampered signature
    res_tampered = client.post(
        "/api/v1/payments/verify",
        json={
            "order_id": intent["order_id"],
            "payment_id": "pay_fake_tampered",
            "signature": "bad_forged_signature_12345",
            "simulation_status": "success"
        },
        headers={"Authorization": f"Bearer {parent_token}"}
    )
    assert res_tampered.status_code == 400
    assert "signature mismatch" in res_tampered.json()["detail"].lower()

    # Non-existent order_id
    res_fake_order = client.post(
        "/api/v1/payments/verify",
        json={
            "order_id": "order_non_existent_9999",
            "payment_id": "pay_fake_order",
            "signature": intent["signature"],
            "simulation_status": "success"
        },
        headers={"Authorization": f"Bearer {parent_token}"}
    )
    assert res_fake_order.status_code == 400
    assert "invalid or expired" in res_fake_order.json()["detail"].lower()

    # Overpayment attempt on intent creation (> 30,000)
    res_overpay = client.post(
        "/api/v1/payments/intent",
        json={"student_id": "STU-0412", "instalment_id": "INS-0412-2", "amount": 999999.0},
        headers={"Authorization": f"Bearer {parent_token}"}
    )
    assert res_overpay.status_code == 400
    assert "exceeds" in res_overpay.json()["detail"].lower()

