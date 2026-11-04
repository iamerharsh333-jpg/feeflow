import datetime
from decimal import Decimal
import pytest
from app.models import Centre, Student, Instalment, Reminder, Notification, User, CounsellorTask
from app.services.reminders import run_automatic_reminder_cycle, get_kolkata_today
from app.auth import create_access_token, hash_password


def test_1_seven_day_reminder_generated_at_correct_time(db_session, client):
    """1. 7-day reminder generated at correct time."""
    today = get_kolkata_today()
    due_date = today + datetime.timedelta(days=7)

    student = db_session.query(Student).filter(Student.id == "STU-0412").first()
    ins = Instalment(
        id="INS-TEST-7D",
        student_id=student.id,
        instalment_number=3,
        due_date=due_date,
        amount=Decimal("25000.00"),
        paid_amount=Decimal("0.00"),
        status="Pending"
    )
    db_session.add(ins)
    db_session.commit()

    # Execute cycle
    res = run_automatic_reminder_cycle(db_session)
    assert res["status"] == "SUCCESS"

    rem = db_session.query(Reminder).filter(
        Reminder.instalment_id == "INS-TEST-7D",
        Reminder.event_key == "INS-TEST-7D_UPCOMING_7D"
    ).first()

    assert rem is not None
    assert rem.status == "Sent"
    assert rem.delivery_status == "simulated"
    assert "25,000" in rem.message or "25000" in rem.message


def test_2_assigned_staff_receives_in_app_alert(db_session, client):
    """2. Assigned staff receives in-app alert for upcoming milestone."""
    today = get_kolkata_today()
    due_date = today + datetime.timedelta(days=3)

    student = db_session.query(Student).filter(Student.id == "STU-0412").first()
    ins = Instalment(
        id="INS-TEST-3D",
        student_id=student.id,
        instalment_number=4,
        due_date=due_date,
        amount=Decimal("20000.00"),
        paid_amount=Decimal("0.00"),
        status="Pending"
    )
    db_session.add(ins)
    db_session.commit()

    run_automatic_reminder_cycle(db_session)

    # Check staff in-app alert
    notif = db_session.query(Notification).filter(
        Notification.recipient_id == f"centre_{student.centre_id}_staff",
        Notification.event_type == "STAFF_DEADLINE_ALERT",
        Notification.entity_id == "INS-TEST-3D_UPCOMING_3D_staff"
    ).first()

    assert notif is not None
    assert notif.recipient_role == "accounts_executive"
    assert notif.channel == "in_app"
    assert "Aarav Meena" in notif.message
    assert "₹20,000.00" in notif.message


def test_3_parent_sees_own_student_deadline(client, parent_token):
    """3. Parent sees own student's deadline with complete financial breakdown."""
    resp = client.get("/api/v1/deadlines", headers={"Authorization": f"Bearer {parent_token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 1

    # Verify all returned records belong to linked student STU-0412
    for item in data:
        assert item["student_id"] == "STU-0412"
        assert "due_date" in item
        assert "amount" in item
        assert "paid_amount" in item
        assert "outstanding_balance" in item
        assert "days_remaining" in item
        assert "overdue_days" in item
        assert "status" in item


def test_4_parent_cannot_see_another_student_deadline(db_session, client, parent_token):
    """4. Parent cannot see another student's deadline (403 Forbidden)."""
    # Create foreign student
    other_student = Student(
        id="STU-OTHER-99",
        roll_number="OTHER-99",
        name="Foreign Student",
        course="NEET 2026",
        batch="Evening",
        centre_id=1,
        parent_name="Other Parent",
        parent_phone="9999900000",
        total_fee=Decimal("80000.00")
    )
    ins_other = Instalment(
        id="INS-OTHER-1",
        student_id=other_student.id,
        instalment_number=1,
        due_date=datetime.date.today(),
        amount=Decimal("40000.00"),
        paid_amount=Decimal("0.00"),
        status="Pending"
    )
    db_session.add_all([other_student, ins_other])
    db_session.commit()

    resp = client.get("/api/v1/deadlines?student_id=STU-OTHER-99", headers={"Authorization": f"Bearer {parent_token}"})
    assert resp.status_code == 403
    assert "Access forbidden" in resp.json()["detail"]


def test_5_staff_cannot_see_unauthorised_centre_data(client, accounts_token, db_session):
    """5. Staff cannot see unauthorised centre data (403 Forbidden)."""
    # accounts_token is authorized for centre_id=1
    resp = client.get("/api/v1/deadlines?centre_id=2", headers={"Authorization": f"Bearer {accounts_token}"})
    assert resp.status_code == 403
    assert "assigned centre: 1" in resp.json()["detail"]

    # Counsellor calling financial deadlines must also get 403
    counsellor_user = User(
        identifier="counsellor@feeflow.demo",
        full_name="Counsellor Staff",
        hashed_password=hash_password("Demo@12345"),
        role="counsellor",
        centre_id=1,
        is_active=True
    )
    db_session.add(counsellor_user)
    db_session.commit()

    counsellor_token = create_access_token({
        "sub": "counsellor@feeflow.demo",
        "role": "counsellor",
        "name": "Counsellor Staff",
        "centre_id": 1
    })
    c_resp = client.get("/api/v1/deadlines", headers={"Authorization": f"Bearer {counsellor_token}"})
    assert c_resp.status_code == 403
    assert "Counsellors do not have authorization to view student financial ledgers" in c_resp.json()["detail"]


def test_6_partial_payment_changes_remaining_reminder_amount(db_session):
    """6. Partial payment recalculates remaining reminder amount accurately."""
    today = get_kolkata_today()
    student = db_session.query(Student).filter(Student.id == "STU-0412").first()

    ins = Instalment(
        id="INS-PARTIAL-TEST",
        student_id=student.id,
        instalment_number=5,
        due_date=today, # Due today (0d)
        amount=Decimal("50000.00"),
        paid_amount=Decimal("20000.00"), # 20k paid, 30k remaining
        status="Partial"
    )
    db_session.add(ins)
    db_session.commit()

    run_automatic_reminder_cycle(db_session)

    rem = db_session.query(Reminder).filter(
        Reminder.instalment_id == "INS-PARTIAL-TEST",
        Reminder.event_key == "INS-PARTIAL-TEST_DUE_TODAY"
    ).first()

    assert rem is not None
    # Message must reflect the remaining ₹30,000, not ₹50,000
    assert "30,000" in rem.message or "30000" in rem.message
    assert "50,000" not in rem.message


def test_7_full_payment_stops_future_reminders(db_session):
    """7. Full payment cancels or stops future reminders."""
    today = get_kolkata_today()
    student = db_session.query(Student).filter(Student.id == "STU-0412").first()

    ins = Instalment(
        id="INS-FULLPAID-TEST",
        student_id=student.id,
        instalment_number=6,
        due_date=today,
        amount=Decimal("40000.00"),
        paid_amount=Decimal("40000.00"), # Fully paid
        status="Paid"
    )
    db_session.add(ins)
    db_session.commit()

    run_automatic_reminder_cycle(db_session)

    # Should not create active Sent reminder for fully paid instalment
    rem = db_session.query(Reminder).filter(
        Reminder.instalment_id == "INS-FULLPAID-TEST",
        Reminder.status == "Sent"
    ).first()
    assert rem is None


def test_8_restarting_application_does_not_duplicate_reminders(db_session):
    """8. Restarting application does not duplicate reminders (Idempotency)."""
    today = get_kolkata_today()
    due_date = today + datetime.timedelta(days=7)
    student = db_session.query(Student).filter(Student.id == "STU-0412").first()

    ins = Instalment(
        id="INS-IDEM-TEST",
        student_id=student.id,
        instalment_number=7,
        due_date=due_date,
        amount=Decimal("35000.00"),
        paid_amount=Decimal("0.00"),
        status="Pending"
    )
    db_session.add(ins)
    db_session.commit()

    # First cycle
    res1 = run_automatic_reminder_cycle(db_session)
    sent_1 = db_session.query(Reminder).filter(Reminder.instalment_id == "INS-IDEM-TEST", Reminder.status == "Sent").count()
    total_1 = db_session.query(Reminder).filter(Reminder.instalment_id == "INS-IDEM-TEST").count()
    notifs_1 = db_session.query(Notification).filter(Notification.related_student_id == student.id).count()
    assert sent_1 == 1

    # Simulated application restart and second cycle execution
    res2 = run_automatic_reminder_cycle(db_session)
    sent_2 = db_session.query(Reminder).filter(Reminder.instalment_id == "INS-IDEM-TEST", Reminder.status == "Sent").count()
    total_2 = db_session.query(Reminder).filter(Reminder.instalment_id == "INS-IDEM-TEST").count()
    notifs_2 = db_session.query(Notification).filter(Notification.related_student_id == student.id).count()

    # Exactly same count, zero duplicates!
    assert sent_2 == sent_1 == 1
    assert total_2 == total_1
    assert notifs_2 == notifs_1


def test_9_failed_deliveries_recorded_accurately_and_retried(db_session, client, accounts_token):
    """9. Failed deliveries recorded accurately and retry endpoint functions."""
    failed_notif = Notification(
        id="NOTIF-FAIL-01",
        recipient_role="accounts_executive",
        recipient_id="centre_1_staff",
        centre_id=1,
        event_type="STAFF_DEADLINE_ALERT",
        title="Failed Alert",
        message="Delivery test failure",
        lang="en",
        channel="in_app",
        delivery_status="failed",
        is_read=False
    )
    db_session.add(failed_notif)
    db_session.commit()

    # Retry single
    resp = client.post(f"/api/v1/notifications/{failed_notif.id}/retry", headers={"Authorization": f"Bearer {accounts_token}"})
    assert resp.status_code == 200
    assert resp.json()["delivery_status"] == "delivered"

    # Retry batch
    resp_batch = client.post("/api/v1/notifications/retry-failed", headers={"Authorization": f"Bearer {accounts_token}"})
    assert resp_batch.status_code == 200


def test_10_overdue_escalation_rules(db_session):
    """10. Overdue escalation follows configured rules (+7d manager, +30d admin)."""
    today = get_kolkata_today()
    student = db_session.query(Student).filter(Student.id == "STU-0412").first()

    # 1. 7-day overdue instalment
    ins_7d = Instalment(
        id="INS-ESC-7D",
        student_id=student.id,
        instalment_number=8,
        due_date=today - datetime.timedelta(days=7),
        amount=Decimal("28000.00"),
        paid_amount=Decimal("0.00"),
        status="Overdue"
    )

    # 2. 30-day overdue instalment
    ins_30d = Instalment(
        id="INS-ESC-30D",
        student_id=student.id,
        instalment_number=9,
        due_date=today - datetime.timedelta(days=30),
        amount=Decimal("45000.00"),
        paid_amount=Decimal("0.00"),
        status="Overdue"
    )
    db_session.add_all([ins_7d, ins_30d])
    db_session.commit()

    run_automatic_reminder_cycle(db_session)

    # Verify Centre Manager 7-day escalation
    notif_mgr = db_session.query(Notification).filter(
        Notification.recipient_id == f"centre_{student.centre_id}_manager",
        Notification.event_type == "OVERDUE_ESCALATION",
        Notification.entity_id == "INS-ESC-7D_OVERDUE_7D_manager"
    ).first()
    assert notif_mgr is not None
    assert "ESCALATION - 7D" in notif_mgr.title
    assert "₹28,000.00" in notif_mgr.message

    # Verify Admin 30-day critical escalation
    notif_adm = db_session.query(Notification).filter(
        Notification.recipient_id == "admin_escalation",
        Notification.event_type == "OVERDUE_CRITICAL_ESCALATION",
        Notification.entity_id == "INS-ESC-30D_OVERDUE_30D_admin"
    ).first()
    assert notif_adm is not None
    assert "CRITICAL ESCALATION - 30D" in notif_adm.title
    assert "₹45,000.00" in notif_adm.message
