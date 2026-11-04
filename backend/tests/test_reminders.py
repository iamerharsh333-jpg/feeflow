from app.services.reminders import schedule_instalment_reminders
from app.models import Student, Instalment, Reminder

def test_reminder_schedule_and_auto_cancel_on_payment(client, db_session, accounts_token):
    student = db_session.query(Student).filter(Student.id == "STU-0412").first()
    ins2 = db_session.query(Instalment).filter(Instalment.id == "INS-0412-2").first()

    # Schedule reminders
    reminders = schedule_instalment_reminders(student, ins2, db_session, "Jaipur Main")
    db_session.commit()
    assert len(reminders) == 3

    # Check reminder preview
    res_prev = client.post(
        "/api/v1/reminders/preview",
        json={"student_id": "STU-0412", "instalment_id": "INS-0412-2", "lang": "hi"},
        headers={"Authorization": f"Bearer {accounts_token}"}
    )
    assert res_prev.status_code == 200
    assert "किस्त" in res_prev.json()["message_text"]

    # Now make full payment on INS-0412-2
    res_pay = client.post(
        "/api/v1/payments",
        json={
            "student_id": "STU-0412",
            "instalment_id": "INS-0412-2",
            "amount": 30000.0,
            "method": "UPI",
            "reference_no": "UPI-REM-TEST-001"
        },
        headers={"Authorization": f"Bearer {accounts_token}"}
    )
    assert res_pay.status_code == 201

    # Verify that scheduled reminders for INS-0412-2 are automatically CANCELLED!
    cancelled_rems = db_session.query(Reminder).filter(
        Reminder.instalment_id == "INS-0412-2",
        Reminder.status == "Cancelled"
    ).all()
    assert len(cancelled_rems) == 3

