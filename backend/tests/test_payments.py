def test_partial_and_full_payment(client, accounts_token):
    # 1. Partial payment of ₹15,000 on INS-0412-2
    res_part = client.post(
        "/api/v1/payments",
        json={
            "student_id": "STU-0412",
            "instalment_id": "INS-0412-2",
            "amount": 15000.0,
            "method": "UPI",
            "reference_no": "UPI-PART-001"
        },
        headers={"Authorization": f"Bearer {accounts_token}"}
    )
    assert res_part.status_code == 201
    pay_data = res_part.json()
    assert pay_data["amount"] == 15000.0
    assert pay_data["status"] == "Success"

    # Verify instalment is now 'Partially Paid'
    res_ledger = client.get(
        "/api/v1/fees/STU-0412/ledger",
        headers={"Authorization": f"Bearer {accounts_token}"}
    )
    assert res_ledger.status_code == 200
    ins2 = next(i for i in res_ledger.json()["instalments"] if i["id"] == "INS-0412-2")
    assert ins2["paid_amount"] == 15000.0
    assert ins2["status"] == "Partially Paid"

    # 2. Complete remaining ₹15,000 payment
    res_full = client.post(
        "/api/v1/payments",
        json={
            "student_id": "STU-0412",
            "instalment_id": "INS-0412-2",
            "amount": 15000.0,
            "method": "UPI",
            "reference_no": "UPI-FULL-002"
        },
        headers={"Authorization": f"Bearer {accounts_token}"}
    )
    assert res_full.status_code == 201
    assert res_full.json()["receipt_no"] is not None

    # Verify instalment is now 'Paid'
    res_ledger2 = client.get(
        "/api/v1/fees/STU-0412/ledger",
        headers={"Authorization": f"Bearer {accounts_token}"}
    )
    ins2_after = next(i for i in res_ledger2.json()["instalments"] if i["id"] == "INS-0412-2")
    assert ins2_after["paid_amount"] == 30000.0
    assert ins2_after["status"] == "Paid"

def test_duplicate_payment_prevention(client, accounts_token):
    payload = {
        "student_id": "STU-0412",
        "instalment_id": "INS-0412-2",
        "amount": 1000.0,
        "method": "Cash",
        "reference_no": "CASH-UNIQUE-REF-999"
    }
    # First attempt should succeed
    res1 = client.post("/api/v1/payments", json=payload, headers={"Authorization": f"Bearer {accounts_token}"})
    assert res1.status_code == 201

    # Second attempt with same reference_no MUST return 409 Conflict
    res2 = client.post("/api/v1/payments", json=payload, headers={"Authorization": f"Bearer {accounts_token}"})
    assert res2.status_code == 409
    assert "already processed" in res2.json()["detail"]

