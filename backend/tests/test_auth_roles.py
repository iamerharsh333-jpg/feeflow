def test_role_based_permissions(client, parent_token, student_token, accounts_token):
    # 1. Unauthenticated request to protected endpoint -> 401
    res_unauth = client.get("/api/v1/students")
    assert res_unauth.status_code == 401

    # 2. Parent can access linked student (STU-0412 linked to 9876543210)
    res_parent = client.get(
        "/api/v1/students/STU-0412",
        headers={"Authorization": f"Bearer {parent_token}"}
    )
    assert res_parent.status_code == 200
    assert res_parent.json()["id"] == "STU-0412"

    # 3. Parent cannot access other students
    res_parent_forbidden = client.get(
        "/api/v1/students/STU-OTHER-999",
        headers={"Authorization": f"Bearer {parent_token}"}
    )
    assert res_parent_forbidden.status_code in [403, 404]

    # 4. Student can view own record
    res_stu = client.get(
        "/api/v1/students/STU-0412",
        headers={"Authorization": f"Bearer {student_token}"}
    )
    assert res_stu.status_code == 200

    # 5. Accounts staff can access student records
    res_acc = client.get(
        "/api/v1/students/STU-0412",
        headers={"Authorization": f"Bearer {accounts_token}"}
    )
    assert res_acc.status_code == 200

    # 6. Student cannot access accounts-only endpoints (e.g. unmatched payments) -> 403
    res_unmatched_stu = client.get(
        "/api/v1/payments/unmatched",
        headers={"Authorization": f"Bearer {student_token}"}
    )
    assert res_unmatched_stu.status_code == 403

