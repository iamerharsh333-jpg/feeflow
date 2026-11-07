import sys
import os
import datetime
from decimal import Decimal

# Add backend directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import engine, Base, SessionLocal
from app.models import (
    Centre, User, Student, Instalment, Payment, Receipt,
    Reminder, Attendance, TestScore, CounsellorTask, ParentalConsent, Notification, RefundRequest
)
from app.auth import hash_password

def seed():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    print("Seeding database...")

    # 1. Centres
    c_jm = Centre(name="Jaipur Main", code="JM-01", city="Jaipur", address="Tonk Road, Jaipur")
    c_jw = Centre(name="Jaipur West", code="JW-02", city="Jaipur", address="Vaishali Nagar, Jaipur")
    c_kt = Centre(name="Kota", code="KT-03", city="Kota", address="Vigyan Nagar, Kota")
    c_aj = Centre(name="Ajmer", code="AJ-04", city="Ajmer", address="Civil Lines, Ajmer")
    db.add_all([c_jm, c_jw, c_kt, c_aj])
    db.flush()

    # 2. Accounts Executive & Admin Users
    accounts_user = User(
        identifier="accounts@feeflow.demo",
        full_name="Accounts Executive",
        hashed_password=hash_password("Demo@12345"),
        role="accounts_executive",
        centre_id=c_jm.id,
        is_active=True
    )
    admin_user = User(
        identifier="admin@feeflow.demo",
        full_name="System Administrator",
        hashed_password=hash_password("Demo@12345"),
        role="admin",
        is_active=True
    )
    counsellor_user = User(
        identifier="counsellor@feeflow.demo",
        full_name="Academic Counsellor",
        hashed_password=hash_password("Demo@12345"),
        role="counsellor",
        centre_id=c_jm.id,
        is_active=True
    )
    manager_user = User(
        identifier="manager@feeflow.demo",
        full_name="Janakpuri Centre Manager",
        hashed_password=hash_password("Demo@12345"),
        role="centre_manager",
        centre_id=c_jm.id,
        is_active=True
    )
    db.add_all([accounts_user, admin_user, counsellor_user, manager_user])

    # 3. Required Students
    # Student 1: Aarav Meena (STU-0412, JEE 2027 Morning, ₹30,000 due 2026-10-10, Paid ₹30,000)
    s1 = Student(
        id="STU-0412",
        roll_number="JEE27-MOR-0412",
        name="Aarav Meena",
        course="JEE 2027",
        batch="Morning",
        centre_id=c_jm.id,
        parent_name="Rajesh Meena",
        parent_phone="9876543210",
        parent_email="rajesh.meena@example.com",
        total_fee=Decimal("120000.00"),
        enrollment_date=datetime.date(2025, 4, 1)
    )

    # Student 2: Ishita Sharma (STU-0587, JEE 2027 Evening, ₹30,000 due 2026-10-10, Paid ₹15,000)
    s2 = Student(
        id="STU-0587",
        roll_number="JEE27-EVE-0587",
        name="Ishita Sharma",
        course="JEE 2027",
        batch="Evening",
        centre_id=c_jm.id,
        parent_name="Sunita Sharma",
        parent_phone="9123456789",
        parent_email="sunita.sharma@example.com",
        total_fee=Decimal("120000.00"),
        enrollment_date=datetime.date(2025, 4, 1)
    )

    # Student 3: Mohit Gurjar (STU-0219, NEET 2027 Morning, ₹40,000 due 2026-11-15, Paid ₹0)
    s3 = Student(
        id="STU-0219",
        roll_number="NEE27-MOR-0219",
        name="Mohit Gurjar",
        course="NEET 2027",
        batch="Morning",
        centre_id=c_kt.id,
        parent_name="Ramesh Gurjar",
        parent_phone="9988776655",
        parent_email="ramesh.gurjar@example.com",
        total_fee=Decimal("160000.00"),
        enrollment_date=datetime.date(2025, 4, 1)
    )

    # Additional Fictional Students
    # Student 4: Priya Agarwal (STU-0331, All Paid)
    s4 = Student(
        id="STU-0331",
        roll_number="JEE27-MOR-0331",
        name="Priya Agarwal",
        course="JEE 2027",
        batch="Morning",
        centre_id=c_jm.id,
        parent_name="Manoj Agarwal",
        parent_phone="9654321098",
        parent_email="manoj.agarwal@example.com",
        total_fee=Decimal("120000.00"),
        enrollment_date=datetime.date(2025, 4, 1)
    )

    # Student 5: Sneha Patel (STU-0445, High Risk / Overdue)
    s5 = Student(
        id="STU-0445",
        roll_number="NEE27-EVE-0445",
        name="Sneha Patel",
        course="NEET 2027",
        batch="Evening",
        centre_id=c_aj.id,
        parent_name="Hiral Patel",
        parent_phone="9712345678",
        parent_email="hiral.patel@example.com",
        total_fee=Decimal("160000.00"),
        enrollment_date=datetime.date(2025, 4, 1)
    )

    db.add_all([s1, s2, s3, s4, s5])
    db.flush()

    # 4. Student User Accounts (Password: Student@123)
    stu_pw = hash_password("Student@123")
    for s in [s1, s2, s3, s4, s5]:
        db.add(User(
            identifier=s.id,
            full_name=s.name,
            hashed_password=stu_pw,
            role="student",
            centre_id=s.centre_id,
            is_active=True
        ))

    # 5. Instalments
    # Aarav Meena: 4 instalments of ₹30,000. Instalment 3 due 2026-10-10 has ₹30,000 paid.
    i1_1 = Instalment(id="INS-0412-1", student_id=s1.id, instalment_number=1, due_date=datetime.date(2025, 4, 10), amount=Decimal("30000.00"), paid_amount=Decimal("30000.00"), status="Paid", paid_date=datetime.date(2025, 4, 8), receipt_no="REC-2025-0001")
    i1_2 = Instalment(id="INS-0412-2", student_id=s1.id, instalment_number=2, due_date=datetime.date(2025, 7, 10), amount=Decimal("30000.00"), paid_amount=Decimal("30000.00"), status="Paid", paid_date=datetime.date(2025, 7, 9), receipt_no="REC-2025-0042")
    i1_3 = Instalment(id="INS-0412-3", student_id=s1.id, instalment_number=3, due_date=datetime.date(2026, 10, 10), amount=Decimal("30000.00"), paid_amount=Decimal("30000.00"), status="Paid", paid_date=datetime.date(2026, 10, 7), receipt_no="REC-2026-0118")
    i1_4 = Instalment(id="INS-0412-4", student_id=s1.id, instalment_number=4, due_date=datetime.date(2027, 1, 10), amount=Decimal("30000.00"), paid_amount=Decimal("0.00"), status="Upcoming")

    # Ishita Sharma: 4 instalments of ₹30,000. Instalment 3 due 2026-10-10 has ₹15,000 paid (Partially Paid).
    i2_1 = Instalment(id="INS-0587-1", student_id=s2.id, instalment_number=1, due_date=datetime.date(2025, 4, 10), amount=Decimal("30000.00"), paid_amount=Decimal("30000.00"), status="Paid", paid_date=datetime.date(2025, 4, 10), receipt_no="REC-2025-0005")
    i2_2 = Instalment(id="INS-0587-2", student_id=s2.id, instalment_number=2, due_date=datetime.date(2025, 7, 10), amount=Decimal("30000.00"), paid_amount=Decimal("30000.00"), status="Paid", paid_date=datetime.date(2025, 7, 15), receipt_no="REC-2025-0048")
    i2_3 = Instalment(id="INS-0587-3", student_id=s2.id, instalment_number=3, due_date=datetime.date(2026, 10, 10), amount=Decimal("30000.00"), paid_amount=Decimal("15000.00"), status="Partially Paid")
    i2_4 = Instalment(id="INS-0587-4", student_id=s2.id, instalment_number=4, due_date=datetime.date(2027, 1, 10), amount=Decimal("30000.00"), paid_amount=Decimal("0.00"), status="Upcoming")

    # Mohit Gurjar: 4 instalments of ₹40,000. Instalment 3 due 2026-11-15 has ₹0 paid.
    i3_1 = Instalment(id="INS-0219-1", student_id=s3.id, instalment_number=1, due_date=datetime.date(2025, 4, 15), amount=Decimal("40000.00"), paid_amount=Decimal("40000.00"), status="Paid", paid_date=datetime.date(2025, 4, 14), receipt_no="REC-2025-0009")
    i3_2 = Instalment(id="INS-0219-2", student_id=s3.id, instalment_number=2, due_date=datetime.date(2025, 7, 15), amount=Decimal("40000.00"), paid_amount=Decimal("40000.00"), status="Paid", paid_date=datetime.date(2025, 7, 20), receipt_no="REC-2025-0055")
    i3_3 = Instalment(id="INS-0219-3", student_id=s3.id, instalment_number=3, due_date=datetime.date(2026, 11, 15), amount=Decimal("40000.00"), paid_amount=Decimal("0.00"), status="Pending")
    i3_4 = Instalment(id="INS-0219-4", student_id=s3.id, instalment_number=4, due_date=datetime.date(2027, 1, 15), amount=Decimal("40000.00"), paid_amount=Decimal("0.00"), status="Upcoming")

    # Priya Agarwal: 4 instalments fully paid
    i4_1 = Instalment(id="INS-0331-1", student_id=s4.id, instalment_number=1, due_date=datetime.date(2025, 4, 10), amount=Decimal("30000.00"), paid_amount=Decimal("30000.00"), status="Paid", paid_date=datetime.date(2025, 4, 5), receipt_no="REC-2025-0003")
    i4_2 = Instalment(id="INS-0331-2", student_id=s4.id, instalment_number=2, due_date=datetime.date(2025, 7, 10), amount=Decimal("30000.00"), paid_amount=Decimal("30000.00"), status="Paid", paid_date=datetime.date(2025, 7, 8), receipt_no="REC-2025-0044")
    i4_3 = Instalment(id="INS-0331-3", student_id=s4.id, instalment_number=3, due_date=datetime.date(2025, 10, 10), amount=Decimal("30000.00"), paid_amount=Decimal("30000.00"), status="Paid", paid_date=datetime.date(2025, 10, 9), receipt_no="REC-2025-0120")
    i4_4 = Instalment(id="INS-0331-4", student_id=s4.id, instalment_number=4, due_date=datetime.date(2026, 1, 10), amount=Decimal("30000.00"), paid_amount=Decimal("30000.00"), status="Paid", paid_date=datetime.date(2026, 1, 8), receipt_no="REC-2026-0008")

    # Sneha Patel: 4 instalments, overdue
    i5_1 = Instalment(id="INS-0445-1", student_id=s5.id, instalment_number=1, due_date=datetime.date(2025, 4, 15), amount=Decimal("40000.00"), paid_amount=Decimal("40000.00"), status="Paid", paid_date=datetime.date(2025, 4, 20), receipt_no="REC-2025-0011")
    i5_2 = Instalment(id="INS-0445-2", student_id=s5.id, instalment_number=2, due_date=datetime.date(2025, 7, 15), amount=Decimal("40000.00"), paid_amount=Decimal("0.00"), status="Overdue")
    i5_3 = Instalment(id="INS-0445-3", student_id=s5.id, instalment_number=3, due_date=datetime.date(2025, 10, 15), amount=Decimal("40000.00"), paid_amount=Decimal("0.00"), status="Overdue")
    i5_4 = Instalment(id="INS-0445-4", student_id=s5.id, instalment_number=4, due_date=datetime.date(2026, 1, 15), amount=Decimal("40000.00"), paid_amount=Decimal("0.00"), status="Upcoming")

    db.add_all([
        i1_1, i1_2, i1_3, i1_4,
        i2_1, i2_2, i2_3, i2_4,
        i3_1, i3_2, i3_3, i3_4,
        i4_1, i4_2, i4_3, i4_4,
        i5_1, i5_2, i5_3, i5_4
    ])

    # 6. Sample Payments and Receipts
    pay1 = Payment(
        id="PAY-001",
        transaction_id="TXN-20261007-0001",
        student_id=s1.id,
        instalment_id=i1_3.id,
        centre_id=c_jm.id,
        amount=Decimal("30000.00"),
        payment_date=datetime.date(2026, 10, 7),
        method="UPI",
        reference_no="UPI-9234567890",
        status="Success"
    )
    rec1 = Receipt(
        receipt_no="REC-2026-0118",
        payment_id=pay1.id,
        student_id=s1.id,
        date=datetime.date(2026, 10, 7),
        base_amount=Decimal("25423.73"),
        gst_rate=18.0,
        cgst_amount=Decimal("2288.14"),
        sgst_amount=Decimal("2288.13"),
        total_amount=Decimal("30000.00")
    )

    pay2 = Payment(
        id="PAY-002",
        transaction_id="TXN-20261015-0002",
        student_id=s2.id,
        instalment_id=i2_3.id,
        centre_id=c_jm.id,
        amount=Decimal("15000.00"),
        payment_date=datetime.date(2026, 10, 15),
        method="Bank Transfer",
        reference_no="NEFT-HDFC-78901",
        status="Success"
    )

    # Unmatched Payments Queue
    unmatched1 = Payment(
        id="PAY-006",
        transaction_id="TXN-20261028-0006",
        student_id=None,
        centre_id=c_kt.id,
        amount=Decimal("35000.00"),
        payment_date=datetime.date(2026, 10, 28),
        method="Bank Transfer",
        reference_no="NEFT-AXIS-99012",
        status="Unmatched",
        notes="No student record found for this NEFT reference"
    )
    unmatched2 = Payment(
        id="PAY-007",
        transaction_id="TXN-20261030-0007",
        student_id=None,
        centre_id=c_jm.id,
        amount=Decimal("15000.00"),
        payment_date=datetime.date(2026, 10, 30),
        method="UPI",
        reference_no="UPI-5544332211",
        status="Unmatched",
        notes="UPI sender name does not match any enrolled student"
    )

    db.add_all([pay1, rec1, pay2, unmatched1, unmatched2])

    # 7. Reminders (Hindi & English)
    r1 = Reminder(
        id="REM-001",
        student_id=s2.id,
        instalment_id=i2_3.id,
        due_date=i2_3.due_date,
        scheduled_date=datetime.date(2026, 10, 7),
        channel="WhatsApp",
        status="Sent",
        lang="en",
        message="Dear Sunita Sharma, reminder that ₹15,000 is due for Ishita Sharma (JEE 2027) on 10 Oct 2026.",
        sent_at=datetime.datetime(2026, 10, 7, 10, 30)
    )
    r2 = Reminder(
        id="REM-002",
        student_id=s3.id,
        instalment_id=i3_3.id,
        due_date=i3_3.due_date,
        scheduled_date=datetime.date(2026, 11, 12),
        channel="WhatsApp",
        status="Scheduled",
        lang="hi",
        message="प्रिय रमेश गुर्जर, मोहित गुर्जर (NEET 2027) की ₹40,000 की किस्त 15 नवम्बर 2026 को देय है।"
    )
    db.add_all([r1, r2])

    # 8. Counsellor Tasks (Risk Flags)
    t1 = CounsellorTask(
        student_id=s5.id,
        risk_level="High",
        risk_reasons='["Attendance below 60%", "2 overdue instalments", "Test scores declining"]',
        status="Unreviewed",
        flagged_date=datetime.date.today()
    )
    t2 = CounsellorTask(
        student_id=s3.id,
        risk_level="Medium",
        risk_reasons='["Attendance below 70%", "Pending instalment approaching due date"]',
        counsellor_name="Mr. Amit Bhatnagar",
        status="In Progress",
        flagged_date=datetime.date.today()
    )
    db.add_all([t1, t2])

    # 8b. Sample Seed Refund Request
    ref_req = RefundRequest(
        student_id=s2.id,
        course_start_date=datetime.date(2025, 4, 1),
        course_end_date=datetime.date(2026, 3, 31),
        withdrawal_date=datetime.date(2025, 4, 10),
        withdrawal_reason="Family relocation to Gurgaon",
        amount_paid=Decimal("75000.00"),
        discount_applied=Decimal("10000.00"),
        total_days=365,
        days_attended=9,
        unused_days=356,
        pro_rata_amount=Decimal("73150.68"),
        processing_fee=Decimal("2500.00"),
        material_fee=Decimal("5000.00"),
        estimated_refund=Decimal("65650.68"),
        policy_code="UGC-REG-2024-V2",
        policy_version="2025-V2",
        status="Submitted",
        processing_deadline=datetime.date.today() + datetime.timedelta(days=7),
        deadline_met=True
    )
    db.add(ref_req)

    # 9. Parental Consent Records
    for s in [s1, s2, s3, s4, s5]:
        db.add(ParentalConsent(
            student_id=s.id,
            parent_phone=s.parent_phone,
            consent_type="COMMUNICATION_AND_ACADEMIC_PROCESSING",
            verified=True,
            verified_at=datetime.datetime.utcnow(),
            notes="Digital verification on enrollment"
        ))

    # 10. Sample Seed Notifications
    notifs = [
        Notification(
            id="NOTIF-SEED-01",
            recipient_role="accounts_executive",
            recipient_id="centre_1_staff",
            centre_id=1,
            event_type="UNMATCHED_PAYMENT",
            title="Unmatched Payment Received",
            message="An unmatched payment of ₹35,000.00 (Ref: HDFC-UNM-8912) requires review.",
            lang="en",
            is_read=False,
            channel="in_app",
            delivery_status="delivered",
            entity_type="payment",
            entity_id="PAY-UNMATCHED-01"
        ),
        Notification(
            id="NOTIF-SEED-02",
            recipient_role="accounts_executive",
            recipient_id="centre_1_staff",
            centre_id=1,
            event_type="HIGH_RISK_DROPOUT",
            title="High Dropout Risk Detected",
            message="Student Ananya Gupta (NEET 2026, Jaipur Main) flagged at high dropout risk (Score: 82). Counsellor action required.",
            lang="en",
            is_read=False,
            channel="in_app",
            delivery_status="delivered",
            related_student_id=s5.id,
            entity_type="task",
            entity_id=str(t1.id) if t1.id else "1"
        ),
        Notification(
            id="NOTIF-SEED-03",
            recipient_role="parent",
            recipient_id="9876543210",
            centre_id=1,
            event_type="PAYMENT_SUCCESS",
            title="Payment Verified & Receipt Generated",
            message="Payment of ₹30,000.00 for Aarav Meena (JEE 2027) has been verified. Receipt #REC-2025-0412-1 is generated.",
            lang="en",
            is_read=False,
            channel="whatsapp",
            delivery_status="simulated",
            related_student_id=s1.id,
            entity_type="payment",
            entity_id="PAY-0412-1"
        ),
        Notification(
            id="NOTIF-SEED-04",
            recipient_role="parent",
            recipient_id="9876543210",
            centre_id=1,
            event_type="FEE_UPCOMING",
            title="Upcoming Fee Instalment",
            message="Instalment #2 of ₹30,000.00 for Aarav Meena is due on 10 Oct 2026.",
            lang="en",
            is_read=False,
            channel="whatsapp",
            delivery_status="simulated",
            related_student_id=s1.id,
            entity_type="instalment",
            entity_id="INS-0412-2"
        ),
        Notification(
            id="NOTIF-SEED-05",
            recipient_role="student",
            recipient_id=s1.id,
            centre_id=1,
            event_type="PAYMENT_SUCCESS",
            title="Payment Verified & Receipt Generated",
            message="Payment of ₹30,000.00 has been verified. Receipt #REC-2025-0412-1 is available in your portal.",
            lang="en",
            is_read=False,
            channel="in_app",
            delivery_status="delivered",
            related_student_id=s1.id,
            entity_type="payment",
            entity_id="PAY-0412-1"
        )
    ]
    db.add_all(notifs)
    db.commit()

    # 11. Dedicated Demo Dropout-Risk Scenario (STU-0999: Rohan Verma)
    from app.services.risk import seed_demo_dropout_risk_student
    demo_student = seed_demo_dropout_risk_student(db)
    print(f"Seeded dedicated AI dropout-risk demo student: {demo_student.name} ({demo_student.id}).")

    db.commit()
    print("Database seeded successfully with all students, instalments, payments, and risk demo scenario.")
    db.close()

if __name__ == "__main__":
    seed()

