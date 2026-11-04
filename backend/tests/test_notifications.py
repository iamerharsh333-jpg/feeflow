import datetime
from decimal import Decimal
import pytest
from app.models import Student, Centre, Payment, Instalment, Notification, CounsellorTask
from app.services.notifications import (
    create_notification,
    notify_payment_success,
    notify_high_risk_dropout,
    notify_refund_submitted,
    notify_refund_status_update,
    notify_unmatched_payment,
    DeliveryProvider
)

def test_notification_delivery_channel_simulation():
    """Verify that absent credentials result in 'simulated' status rather than false delivery claim."""
    # In-app is always delivered
    assert DeliveryProvider.deliver("in_app", "test_user", "Title", "Msg") == "delivered"
    
    # SMS and WhatsApp without Twilio/Meta environment keys should return simulated
    assert DeliveryProvider.deliver("sms", "9876543210", "Title", "Msg") == "simulated"
    assert DeliveryProvider.deliver("whatsapp", "9876543210", "Title", "Msg") == "simulated"

def test_duplicate_notification_prevention(client, db_session):
    """Verify that duplicate unread notifications for the same entity and event are prevented."""
    n1 = create_notification(
        db=db_session,
        event_type="UNMATCHED_PAYMENT",
        recipient_role="accounts_executive",
        recipient_id="accounts@feeflow.demo",
        title="Unmatched Payment",
        message="Review required",
        entity_type="payment",
        entity_id="TXN-DUP-001"
    )
    db_session.commit()
    assert n1 is not None

    # Second call with identical event and entity should return existing notification
    n2 = create_notification(
        db=db_session,
        event_type="UNMATCHED_PAYMENT",
        recipient_role="accounts_executive",
        recipient_id="accounts@feeflow.demo",
        title="Unmatched Payment",
        message="Review required",
        entity_type="payment",
        entity_id="TXN-DUP-001"
    )
    db_session.commit()
    assert n1.id == n2.id

    # Count of unread notifications for this recipient should still be 1
    total = db_session.query(Notification).filter(
        Notification.recipient_id == "accounts@feeflow.demo",
        Notification.entity_id == "TXN-DUP-001"
    ).count()
    assert total == 1

def test_payment_success_notification_after_verification_only(client, db_session, parent_token):
    """Verify payment-success notification is generated strictly after verification, never before."""
    # Step 1: Create intent (no payment success notification yet)
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
    assert intent_res.status_code == 201
    intent = intent_res.json()

    notifs_pre = db_session.query(Notification).filter(
        Notification.event_type == "PAYMENT_SUCCESS",
        Notification.related_student_id == "STU-0412"
    ).all()
    assert len(notifs_pre) == 0

    # Step 2: Verify simulated payment
    verify_res = client.post(
        "/api/v1/payments/verify",
        json={
            "order_id": intent["order_id"],
            "payment_id": "PAY-SIM-SUCCESS-99",
            "signature": intent["signature"],
            "simulation_status": "success"
        },
        headers={"Authorization": f"Bearer {parent_token}"}
    )
    assert verify_res.status_code == 200
    assert verify_res.json()["status"] == "Success"

    # Step 3: Notification now exists for parent and student
    notifs_post = db_session.query(Notification).filter(
        Notification.event_type == "PAYMENT_SUCCESS",
        Notification.related_student_id == "STU-0412"
    ).all()
    assert len(notifs_post) >= 1
    parent_notif = next(n for n in notifs_post if n.recipient_role == "parent")
    assert parent_notif.recipient_id == "9876543210"
    assert "₹30,000" in parent_notif.message

def test_parent_never_receives_internal_ai_risk_score(client, db_session, parent_token, accounts_token):
    """Verify that parents and students cannot view or receive high-risk dropout alerts."""
    student = db_session.query(Student).filter(Student.id == "STU-0412").first()
    
    # 1. Attempt to create risk notification for parent should be blocked by service rule
    blocked = create_notification(
        db=db_session,
        event_type="HIGH_RISK_DROPOUT",
        recipient_role="parent",
        recipient_id=student.parent_phone,
        title="Risk Alert",
        message="Dropout risk high"
    )
    assert blocked is None

    # 2. Staff risk notification created
    notify_high_risk_dropout(
        db=db_session,
        student=student,
        task_id=101,
        score=82
    )
    db_session.commit()

    # 3. Parent queries notifications - should NOT see HIGH_RISK_DROPOUT
    parent_res = client.get(
        "/api/v1/notifications",
        headers={"Authorization": f"Bearer {parent_token}"}
    )
    assert parent_res.status_code == 200
    for notif in parent_res.json():
        assert notif["event_type"] != "HIGH_RISK_DROPOUT"

    # 4. Accounts staff queries notifications - CAN see HIGH_RISK_DROPOUT
    accounts_res = client.get(
        "/api/v1/notifications?category=risk",
        headers={"Authorization": f"Bearer {accounts_token}"}
    )
    assert accounts_res.status_code == 200
    risk_events = [n["event_type"] for n in accounts_res.json()]
    assert "HIGH_RISK_DROPOUT" in risk_events

def test_parent_data_isolation_on_notifications(client, db_session, parent_token):
    """Verify that parents cannot see notifications belonging to other students."""
    # Create notification for student STU-9999
    other_notif = Notification(
        id="NOTIF-OTHER-01",
        recipient_role="parent",
        recipient_id="9999999999",
        centre_id=1,
        event_type="PAYMENT_SUCCESS",
        title="Other Student Payment",
        message="Payment for other student",
        is_read=False,
        related_student_id="STU-9999",
        channel="in_app",
        delivery_status="delivered"
    )
    db_session.add(other_notif)
    db_session.commit()

    res = client.get(
        "/api/v1/notifications",
        headers={"Authorization": f"Bearer {parent_token}"}
    )
    assert res.status_code == 200
    notif_ids = [n["id"] for n in res.json()]
    assert "NOTIF-OTHER-01" not in notif_ids

def test_accounts_centre_isolation_on_notifications(client, db_session, accounts_token):
    """Verify accounts executive only receives notifications for their centre."""
    # Centre 2 notification
    c2_notif = Notification(
        id="NOTIF-C2-01",
        recipient_role="accounts_executive",
        recipient_id="centre_2_staff",
        centre_id=2, # Centre 2 (Jaipur West)
        event_type="UNMATCHED_PAYMENT",
        title="Centre 2 Payment Alert",
        message="Review required at Centre 2",
        is_read=False,
        channel="in_app",
        delivery_status="delivered"
    )
    # Centre 1 notification
    c1_notif = Notification(
        id="NOTIF-C1-01",
        recipient_role="accounts_executive",
        recipient_id="centre_1_staff",
        centre_id=1, # Centre 1 (Jaipur Main)
        event_type="UNMATCHED_PAYMENT",
        title="Centre 1 Payment Alert",
        message="Review required at Centre 1",
        is_read=False,
        channel="in_app",
        delivery_status="delivered"
    )
    db_session.add_all([c2_notif, c1_notif])
    db_session.commit()

    # Accounts token belongs to Centre 1
    res = client.get(
        "/api/v1/notifications",
        headers={"Authorization": f"Bearer {accounts_token}"}
    )
    assert res.status_code == 200
    ids = [n["id"] for n in res.json()]
    assert "NOTIF-C1-01" in ids
    assert "NOTIF-C2-01" not in ids

def test_mark_notification_read_and_mark_all_read(client, db_session, accounts_token):
    """Verify marking single notification as read and mark all read."""
    n1 = Notification(
        id="NOTIF-READ-01",
        recipient_role="accounts_executive",
        recipient_id="centre_1_staff",
        centre_id=1,
        event_type="RECONCILIATION_BACKLOG",
        title="Backlog 1",
        message="Msg 1",
        is_read=False,
        channel="in_app",
        delivery_status="delivered"
    )
    n2 = Notification(
        id="NOTIF-READ-02",
        recipient_role="accounts_executive",
        recipient_id="centre_1_staff",
        centre_id=1,
        event_type="RECONCILIATION_BACKLOG",
        title="Backlog 2",
        message="Msg 2",
        is_read=False,
        channel="in_app",
        delivery_status="delivered"
    )
    db_session.add_all([n1, n2])
    db_session.commit()

    # Check unread count
    cnt_res = client.get(
        "/api/v1/notifications/unread-count",
        headers={"Authorization": f"Bearer {accounts_token}"}
    )
    assert cnt_res.status_code == 200
    assert cnt_res.json()["unread_count"] >= 2

    # Mark single read
    patch_res = client.patch(
        "/api/v1/notifications/NOTIF-READ-01/read",
        headers={"Authorization": f"Bearer {accounts_token}"}
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["is_read"] is True

    # Mark all read
    post_res = client.post(
        "/api/v1/notifications/mark-all-read",
        headers={"Authorization": f"Bearer {accounts_token}"}
    )
    assert post_res.status_code == 200

    # Unread count should now be 0 for this user
    cnt_after = client.get(
        "/api/v1/notifications/unread-count",
        headers={"Authorization": f"Bearer {accounts_token}"}
    )
    assert cnt_after.status_code == 200
    assert cnt_after.json()["unread_count"] == 0

def test_hindi_and_english_templates(db_session):
    """Verify that both English and Hindi templates are supported and populated correctly."""
    student = db_session.query(Student).filter(Student.id == "STU-0412").first()
    
    # English payment notification
    notify_payment_success(
        db=db_session,
        student=student,
        amount=12000.0,
        receipt_no="REC-TEST-EN",
        payment_id="PAY-TEST-EN",
        lang="en"
    )
    # Hindi payment notification
    notify_payment_success(
        db=db_session,
        student=student,
        amount=12000.0,
        receipt_no="REC-TEST-HI",
        payment_id="PAY-TEST-HI",
        lang="hi"
    )
    db_session.commit()

    en_notif = db_session.query(Notification).filter(Notification.related_payment_id == "PAY-TEST-EN").first()
    hi_notif = db_session.query(Notification).filter(Notification.related_payment_id == "PAY-TEST-HI").first()

    assert "Payment Verified" in en_notif.title
    assert "भुगतान सत्यापित" in hi_notif.title

