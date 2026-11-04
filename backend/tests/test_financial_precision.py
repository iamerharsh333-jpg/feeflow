import datetime
import uuid
from decimal import Decimal, ROUND_HALF_UP
import pytest
from fastapi import HTTPException

from app.models import Student, Instalment, Payment, Receipt, Discount, RefundRequest, Centre
from app.services.currency import to_decimal, round_currency, split_gst, distribute_amount, ZERO, PAISE
from app.services.fees import (
    get_student_fee_summary, create_default_instalments, refresh_instalment_statuses
)
from app.services.payments import record_student_payment, auto_match_incoming_payment
from app.services.refunds import calculate_pro_rata_refund, approve_refund_request

def test_multiple_instalments_exact_distribution():
    """Verify that odd fee divisions distribute the remainder without losing a single paisa."""
    # 1. 100,000 divided by 3
    fee_1 = Decimal("100000.00")
    parts_1 = distribute_amount(fee_1, 3)
    assert len(parts_1) == 3
    assert sum(parts_1) == fee_1
    assert parts_1 == [Decimal("33333.34"), Decimal("33333.33"), Decimal("33333.33")]

    # 2. 125,000.50 divided by 4
    fee_2 = Decimal("125000.50")
    parts_2 = distribute_amount(fee_2, 4)
    assert len(parts_2) == 4
    assert sum(parts_2) == fee_2

    # 3. Create default instalments on a student
    insts = create_default_instalments("STU-PRECISION-1", fee_1, datetime.date.today(), count=3)
    assert len(insts) == 3
    total_inst_amount = sum(i.amount for i in insts)
    assert total_inst_amount == fee_1

def test_discounts_exact_deduction(db_session):
    """Verify discount application in pure Decimal without float conversion."""
    stu = Student(
        id="STU-DISC-TEST",
        roll_number="ROLL-DISC-TEST",
        name="Discount Test Student",
        course="JEE 2027",
        batch="Morning",
        centre_id=1,
        parent_name="Parent Test",
        parent_phone="9876543210",
        total_fee=Decimal("120000.00")
    )
    db_session.add(stu)
    
    # Add discount with paise
    disc = Discount(
        student_id=stu.id,
        code="MERIT50_PAISE",
        amount=Decimal("15000.75"),
        reason="Merit discount with paise",
        approved_by="Director"
    )
    db_session.add(disc)
    
    # 2 instalments
    i1 = Instalment(
        id="INS-DISC-1",
        student_id=stu.id,
        instalment_number=1,
        due_date=datetime.date.today(),
        amount=Decimal("60000.00"),
        paid_amount=ZERO,
        status="Upcoming"
    )
    i2 = Instalment(
        id="INS-DISC-2",
        student_id=stu.id,
        instalment_number=2,
        due_date=datetime.date.today() + datetime.timedelta(days=90),
        amount=Decimal("60000.00"),
        paid_amount=ZERO,
        status="Upcoming"
    )
    db_session.add_all([i1, i2])
    db_session.commit()

    summary = get_student_fee_summary(stu, db_session)
    assert summary["total_fee"] == Decimal("120000.00")
    assert summary["total_discount"] == Decimal("15000.75")
    assert summary["effective_fee"] == Decimal("104999.25")
    assert summary["outstanding_amount"] == Decimal("104999.25")
    assert summary["fee_status"] == "Pending"

def test_partial_payment_and_overpayment_protection(db_session):
    """Verify partial payment updates instalment and prevents negative balances."""
    stu = Student(
        id="STU-PARTIAL-TEST",
        roll_number="ROLL-PARTIAL-TEST",
        name="Partial Payment Student",
        course="NEET 2027",
        batch="Evening",
        centre_id=1,
        parent_name="Parent Partial",
        parent_phone="9876543211",
        total_fee=Decimal("50000.00")
    )
    db_session.add(stu)
    
    ins = Instalment(
        id="INS-PARTIAL-1",
        student_id=stu.id,
        instalment_number=1,
        due_date=datetime.date.today(),
        amount=Decimal("50000.00"),
        paid_amount=ZERO,
        status="Pending"
    )
    db_session.add(ins)
    db_session.commit()

    # 1. Partial payment of ₹19,999.50
    pay1 = record_student_payment(
        db=db_session,
        amount=Decimal("19999.50"),
        method="UPI",
        reference_no="REF-PARTIAL-001",
        student_id=stu.id,
        instalment_id=ins.id
    )
    assert pay1.status == "Success"
    assert ins.paid_amount == Decimal("19999.50")
    assert ins.status == "Partially Paid"
    
    summary = get_student_fee_summary(stu, db_session)
    assert summary["outstanding_amount"] == Decimal("30000.50")

    # 2. Overpayment attempt: Remaining is 30,000.50, attempt to pay 30,000.51
    with pytest.raises(HTTPException) as exc_info:
        record_student_payment(
            db=db_session,
            amount=Decimal("30000.51"),
            method="UPI",
            reference_no="REF-PARTIAL-OVERPAY",
            student_id=stu.id,
            instalment_id=ins.id
        )
    assert exc_info.value.status_code == 400
    assert "exceeds" in exc_info.value.detail

    # Remaining balance must stay unchanged and non-negative
    db_session.refresh(ins)
    assert ins.paid_amount == Decimal("19999.50")
    assert ins.amount - ins.paid_amount == Decimal("30000.50")

def test_full_payment_exact_settlement_and_receipt(db_session):
    """Verify full payment achieves exact zero balance and generates reconciled GST receipt."""
    stu = Student(
        id="STU-FULL-TEST",
        roll_number="ROLL-FULL-TEST",
        name="Full Payment Student",
        course="Foundation",
        batch="Morning",
        centre_id=1,
        parent_name="Parent Full",
        parent_phone="9876543212",
        total_fee=Decimal("25000.00")
    )
    db_session.add(stu)
    
    ins = Instalment(
        id="INS-FULL-1",
        student_id=stu.id,
        instalment_number=1,
        due_date=datetime.date.today(),
        amount=Decimal("25000.00"),
        paid_amount=ZERO,
        status="Pending"
    )
    db_session.add(ins)
    db_session.commit()

    # Pay full ₹25,000.00
    pay = record_student_payment(
        db=db_session,
        amount=Decimal("25000.00"),
        method="Net Banking",
        reference_no="REF-FULL-001",
        student_id=stu.id,
        instalment_id=ins.id
    )
    assert pay.status == "Success"
    assert ins.status == "Paid"
    assert ins.paid_amount == Decimal("25000.00")
    assert ins.amount - ins.paid_amount == ZERO

    # Check GST receipt reconciliation
    receipt = pay.receipt
    assert receipt is not None
    assert receipt.total_amount == Decimal("25000.00")
    assert receipt.base_amount + receipt.cgst_amount + receipt.sgst_amount == receipt.total_amount

def test_gst_rounding_invariance_across_paise():
    """Verify GST split invariant (base + cgst + sgst == total) holds for any total."""
    test_amounts = [
        Decimal("0.01"), Decimal("1.00"), Decimal("100.00"),
        Decimal("13333.33"), Decimal("9999.99"), Decimal("12345.67"),
        Decimal("100000.00"), Decimal("34000000.00")
    ]
    for amt in test_amounts:
        base, cgst, sgst = split_gst(amt, Decimal("18.00"))
        assert base + cgst + sgst == amt, f"Invariant broken for amount {amt}"

def test_refund_bounds_and_over_approval_guard(db_session):
    """Verify refund pro-rata calculations and strict paid-amount upper bounds."""
    # 1. Pro-rata calculation
    start = datetime.date(2026, 4, 1)
    end = datetime.date(2027, 3, 31) # 364 days
    withdrawn = datetime.date(2026, 6, 1) # ~61 days attended
    
    paid = Decimal("80000.00")
    calc = calculate_pro_rata_refund(
        course_start_date=start,
        course_end_date=end,
        withdrawal_date=withdrawn,
        amount_paid=paid,
        processing_fee_percent=Decimal("5.00"),
        material_fee=Decimal("5000.00")
    )
    assert calc["final_refund"] <= paid
    assert calc["final_refund"] >= ZERO

    # 2. Guard against approving more than paid amount
    stu = Student(
        id="STU-REFUND-TEST",
        roll_number="ROLL-REFUND-TEST",
        name="Refund Student",
        course="JEE 2026",
        batch="Morning",
        centre_id=1,
        parent_name="Parent Refund",
        parent_phone="9876543213",
        total_fee=Decimal("80000.00")
    )
    db_session.add(stu)
    
    req = RefundRequest(
        student_id=stu.id,
        course_start_date=start,
        course_end_date=end,
        withdrawal_date=withdrawn,
        amount_paid=Decimal("40000.00"),
        total_days=calc["total_days"],
        days_attended=calc["days_attended"],
        unused_days=calc["unused_days"],
        pro_rata_amount=calc["pro_rata_refund"],
        processing_fee=calc["processing_fee"],
        material_fee=Decimal("5000.00"),
        estimated_refund=calc["final_refund"],
        status="Pending Review"
    )
    db_session.add(req)
    db_session.commit()

    # Attempt to approve ₹40,001 on ₹40,000 paid
    with pytest.raises(HTTPException) as exc_info:
        approve_refund_request(
            db=db_session,
            request_id=req.id,
            approved_amount=Decimal("40000.01"),
            approved_by="AccountsHead",
            reason="Approved with overage"
        )
    assert exc_info.value.status_code == 400
    assert "cannot exceed eligible paid amount" in exc_info.value.detail

def test_large_financial_aggregations_precision(db_session):
    """Simulate large-scale multi-student financial aggregations without floating-point error."""
    # Create a test centre
    centre = Centre(name="Financial Test Centre", code="FTC", city="Jaipur")
    db_session.add(centre)
    db_session.flush()

    total_expected_fees = ZERO
    total_expected_paid = ZERO
    
    students = []
    # 200 simulated students with varying fractional fees
    for idx in range(1, 201):
        fee = Decimal(f"{100000 + (idx * 0.33):.2f}")
        paid = Decimal(f"{40000 + (idx * 0.17):.2f}")
        s = Student(
            id=f"STU-SIM-{idx}",
            roll_number=f"ROLL-SIM-{idx}",
            name=f"Student {idx}",
            course="JEE",
            batch="Morning",
            centre_id=centre.id,
            parent_name="Parent",
            parent_phone=f"98000{idx:05d}",
            total_fee=fee
        )
        ins = Instalment(
            id=f"INS-SIM-{idx}-1",
            student_id=s.id,
            instalment_number=1,
            due_date=datetime.date.today(),
            amount=fee,
            paid_amount=paid,
            status="Partially Paid"
        )
        s.instalments.append(ins)
        students.append(s)
        total_expected_fees += fee
        total_expected_paid += paid

    db_session.add_all(students)
    db_session.commit()

    # Aggregate via fee summaries
    agg_fee = ZERO
    agg_paid = ZERO
    agg_outstanding = ZERO
    for s in students:
        summ = get_student_fee_summary(s, db_session)
        agg_fee += summ["effective_fee"]
        agg_paid += summ["amount_paid"]
        agg_outstanding += summ["outstanding_amount"]

    assert agg_fee == total_expected_fees
    assert agg_paid == total_expected_paid
    assert agg_outstanding == total_expected_fees - total_expected_paid
    assert agg_fee == agg_paid + agg_outstanding

def test_duplicate_payment_protection(db_session):
    """Verify that duplicate payment references are strictly rejected."""
    stu = Student(
        id="STU-DUP-TEST",
        roll_number="ROLL-DUP-TEST",
        name="Dup Test Student",
        course="JEE",
        batch="Morning",
        centre_id=1,
        parent_name="Parent Dup",
        parent_phone="9876543214",
        total_fee=Decimal("60000.00")
    )
    ins = Instalment(
        id="INS-DUP-1",
        student_id=stu.id,
        instalment_number=1,
        due_date=datetime.date.today(),
        amount=Decimal("60000.00"),
        paid_amount=ZERO,
        status="Pending"
    )
    stu.instalments.append(ins)
    db_session.add(stu)
    db_session.commit()

    ref = "REF-UNIQUE-TXN-001"
    # First payment succeeds
    pay1 = record_student_payment(
        db=db_session,
        amount=Decimal("10000.00"),
        method="UPI",
        reference_no=ref,
        student_id=stu.id,
        instalment_id=ins.id
    )
    assert pay1.status == "Success"

    # Second payment with identical reference_no is rejected with 409
    with pytest.raises(HTTPException) as exc_info:
        record_student_payment(
            db=db_session,
            amount=Decimal("10000.00"),
            method="UPI",
            reference_no=ref,
            student_id=stu.id,
            instalment_id=ins.id
        )
    assert exc_info.value.status_code == 409
    assert "already processed" in exc_info.value.detail

def test_repeated_sequential_transactions(db_session):
    """Verify repeated partial payments accumulate accurately to full payment without float drift."""
    stu = Student(
        id="STU-SEQ-TEST",
        roll_number="ROLL-SEQ-TEST",
        name="Sequential Student",
        course="NEET",
        batch="Evening",
        centre_id=1,
        parent_name="Parent Seq",
        parent_phone="9876543215",
        total_fee=Decimal("30000.00")
    )
    ins = Instalment(
        id="INS-SEQ-1",
        student_id=stu.id,
        instalment_number=1,
        due_date=datetime.date.today(),
        amount=Decimal("30000.00"),
        paid_amount=ZERO,
        status="Pending"
    )
    stu.instalments.append(ins)
    db_session.add(stu)
    db_session.commit()

    payments_data = [
        Decimal("4999.25"),
        Decimal("5000.75"),
        Decimal("10000.00"),
        Decimal("9999.99"),
        Decimal("0.01") # Exact remainder
    ]
    # Sum: 4999.25 + 5000.75 + 10000.00 + 9999.99 + 0.01 = 30000.00

    for i, amt in enumerate(payments_data):
        record_student_payment(
            db=db_session,
            amount=amt,
            method="Cash",
            reference_no=f"REF-SEQ-{i+1:03d}",
            student_id=stu.id,
            instalment_id=ins.id
        )
        db_session.refresh(ins)

    assert ins.paid_amount == Decimal("30000.00")
    assert ins.status == "Paid"
    summary = get_student_fee_summary(stu, db_session)
    assert summary["outstanding_amount"] == ZERO
    assert summary["fee_status"] == "Paid"
