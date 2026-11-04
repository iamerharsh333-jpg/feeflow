import datetime
from decimal import Decimal
from app.services.fees import calculate_overdue_days, get_student_fee_summary
from app.models import Student, Instalment

def test_calculate_overdue_days():
    today = datetime.date.today()
    past_date = today - datetime.timedelta(days=25)
    future_date = today + datetime.timedelta(days=15)

    assert calculate_overdue_days(past_date, "Pending") == 25
    assert calculate_overdue_days(past_date, "Overdue") == 25
    assert calculate_overdue_days(past_date, "Paid") == 0  # Paid never overdue
    assert calculate_overdue_days(future_date, "Upcoming") == 0

def test_student_fee_ledger_api(client, accounts_token):
    res = client.get(
        "/api/v1/fees/STU-0412/ledger",
        headers={"Authorization": f"Bearer {accounts_token}"}
    )
    assert res.status_code == 200
    data = res.json()
    assert data["student_id"] == "STU-0412"
    assert data["total_fee"] == 120000.0
    assert data["amount_paid"] == 30000.0
    assert data["outstanding_amount"] == 90000.0
    assert len(data["instalments"]) == 2

