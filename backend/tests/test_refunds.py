def test_refund_calculator_and_approval(client, accounts_token):
    # 1. Estimate refund within 10 days
    res = client.post(
        "/api/v1/refunds/estimate",
        json={
            "student_id": "STU-0412",
            "course_start_date": "2026-04-01",
            "course_end_date": "2027-03-31",
            "withdrawal_date": "2026-04-08", # 7 days attended
            "amount_paid": 60000.0,
            "processing_fee_percent": 5.0,
            "material_fee": 5000.0
        }
    )
    assert res.status_code == 200
    data = res.json()
    assert data["total_days"] == 364
    assert data["days_attended"] == 7
    assert data["unused_days"] == 357
    assert data["deadline_met"] is True
    assert data["estimated_refund"] > 50000.0

    # 2. Submit refund request for review
    res_req = client.post(
        "/api/v1/refunds/request",
        json={
            "student_id": "STU-0412",
            "course_start_date": "2026-04-01",
            "course_end_date": "2027-03-31",
            "withdrawal_date": "2026-04-08",
            "amount_paid": 60000.0,
            "processing_fee_percent": 5.0,
            "material_fee": 5000.0,
            "policy_confirmed": True
        },
        headers={"Authorization": f"Bearer {accounts_token}"}
    )
    assert res_req.status_code == 201
    req_id = res_req.json()["request_id"]

    # 3. Approve refund request with policy code
    res_app = client.post(
        f"/api/v1/refunds/requests/{req_id}/approve",
        json={
            "approved_amount": 50000.0,
            "policy_code": "REFUND_STD_POLICY_2026",
            "notes": "Approved by accounts manager"
        },
        headers={"Authorization": f"Bearer {accounts_token}"}
    )
    assert res_app.status_code == 200
    assert res_app.json()["status"] == "Approved"
    assert res_app.json()["approved_refund"] == 50000.0

