def test_unmatched_payment_workflow(client, accounts_token):
    # 1. Payment received with non-existent student ID
    res = client.post(
        "/api/v1/payments",
        json={
            "student_id": "STU-UNKNOWN-9999",
            "amount": 25000.0,
            "method": "Bank Transfer",
            "reference_no": "NEFT-UNMATCHED-001",
            "notes": "NEFT sender unknown"
        },
        headers={"Authorization": f"Bearer {accounts_token}"}
    )
    assert res.status_code == 201
    unmatched_pay = res.json()
    assert unmatched_pay["status"] == "Unmatched"
    assert unmatched_pay["student_id"] is None

    # 2. Check unmatched queue
    res_queue = client.get(
        "/api/v1/payments/unmatched",
        headers={"Authorization": f"Bearer {accounts_token}"}
    )
    assert res_queue.status_code == 200
    queue = res_queue.json()
    assert any(p["id"] == unmatched_pay["id"] for p in queue)

    # 3. Mark under review
    res_rev = client.post(
        f"/api/v1/payments/{unmatched_pay['id']}/review",
        headers={"Authorization": f"Bearer {accounts_token}"}
    )
    assert res_rev.status_code == 200
    assert res_rev.json()["status"] == "Under Review"

    # 4. Match to existing student (sets to Pending for verification, NOT automatically Paid)
    res_match = client.post(
        f"/api/v1/payments/{unmatched_pay['id']}/match",
        json={"student_id": "STU-0412"},
        headers={"Authorization": f"Bearer {accounts_token}"}
    )
    assert res_match.status_code == 200
    matched_pay = res_match.json()
    assert matched_pay["student_id"] == "STU-0412"
    assert matched_pay["status"] == "Pending"

