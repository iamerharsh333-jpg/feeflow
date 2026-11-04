import datetime
from decimal import Decimal
from sqlalchemy import (
    Column, Integer, String, Float, Boolean, Date, DateTime,
    ForeignKey, Text, Numeric, Enum as SQLEnum
)
from sqlalchemy.orm import relationship
from app.database import Base

class UserRole(str):
    PARENT = "parent"
    STUDENT = "student"
    ACCOUNTS_EXECUTIVE = "accounts_executive"
    ADMIN = "admin"
    COUNSELLOR = "counsellor"

class Centre(Base):
    __tablename__ = "centres"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False, index=True)
    code = Column(String(20), unique=True, nullable=False)
    city = Column(String(50), nullable=False)
    address = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    students = relationship("Student", back_populates="centre")
    users = relationship("User", back_populates="centre")
    payments = relationship("Payment", back_populates="centre")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    identifier = Column(String(100), unique=True, nullable=False, index=True) # phone or email or student_id
    full_name = Column(String(100), nullable=False)
    hashed_password = Column(String(255), nullable=True)
    role = Column(String(30), nullable=False, default=UserRole.STUDENT)
    centre_id = Column(Integer, ForeignKey("centres.id"), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    centre = relationship("Centre", back_populates="users")


class Student(Base):
    __tablename__ = "students"

    id = Column(String(50), primary_key=True, index=True) # e.g. STU-0412
    roll_number = Column(String(50), unique=True, nullable=False, index=True)
    name = Column(String(100), nullable=False, index=True)
    course = Column(String(50), nullable=False) # e.g. JEE 2027
    batch = Column(String(50), nullable=False) # Morning, Evening, Weekend
    centre_id = Column(Integer, ForeignKey("centres.id"), nullable=False)
    
    parent_name = Column(String(100), nullable=False)
    parent_phone = Column(String(20), nullable=False, index=True)
    parent_email = Column(String(100), nullable=True)
    
    total_fee = Column(Numeric(12, 2, asdecimal=True), nullable=False, default=Decimal("0.00"))
    enrollment_date = Column(Date, default=datetime.date.today)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    centre = relationship("Centre", back_populates="students")
    instalments = relationship("Instalment", back_populates="student", cascade="all, delete-orphan", order_by="Instalment.instalment_number")
    discounts = relationship("Discount", back_populates="student", cascade="all, delete-orphan")
    payments = relationship("Payment", back_populates="student")
    reminders = relationship("Reminder", back_populates="student", cascade="all, delete-orphan")
    refund_requests = relationship("RefundRequest", back_populates="student")
    attendances = relationship("Attendance", back_populates="student")
    test_scores = relationship("TestScore", back_populates="student")
    counsellor_tasks = relationship("CounsellorTask", back_populates="student")
    consents = relationship("ParentalConsent", back_populates="student")
    notifications = relationship("Notification", back_populates="student")


class Instalment(Base):
    __tablename__ = "instalments"

    id = Column(String(50), primary_key=True, index=True) # e.g. INS-0412-1
    student_id = Column(String(50), ForeignKey("students.id"), nullable=False, index=True)
    instalment_number = Column(Integer, nullable=False)
    due_date = Column(Date, nullable=False, index=True)
    amount = Column(Numeric(12, 2, asdecimal=True), nullable=False)
    paid_amount = Column(Numeric(12, 2, asdecimal=True), nullable=False, default=Decimal("0.00"))
    status = Column(String(30), nullable=False, default="Upcoming") # Paid, Partially Paid, Pending, Overdue, Upcoming
    paid_date = Column(Date, nullable=True)
    receipt_no = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    student = relationship("Student", back_populates="instalments")
    payments = relationship("Payment", back_populates="instalment")
    reminders = relationship("Reminder", back_populates="instalment")


class Discount(Base):
    __tablename__ = "discounts"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(String(50), ForeignKey("students.id"), nullable=False)
    code = Column(String(50), nullable=False)
    amount = Column(Numeric(12, 2, asdecimal=True), nullable=False)
    reason = Column(String(255), nullable=True)
    approved_by = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    student = relationship("Student", back_populates="discounts")


class Payment(Base):
    __tablename__ = "payments"

    id = Column(String(50), primary_key=True, index=True) # e.g. PAY-001
    transaction_id = Column(String(100), unique=True, nullable=False, index=True)
    student_id = Column(String(50), ForeignKey("students.id"), nullable=True, index=True)
    instalment_id = Column(String(50), ForeignKey("instalments.id"), nullable=True)
    centre_id = Column(Integer, ForeignKey("centres.id"), nullable=True)
    
    amount = Column(Numeric(12, 2, asdecimal=True), nullable=False)
    payment_date = Column(Date, default=datetime.date.today, nullable=False)
    method = Column(String(50), nullable=False) # Cash, UPI, Bank Transfer, Cheque, Online
    reference_no = Column(String(100), nullable=False, index=True)
    status = Column(String(30), nullable=False, default="Success") # Success, Pending, Failed, Unmatched, Under Review, Rejected
    gateway_order_id = Column(String(100), nullable=True)
    gateway_signature = Column(String(255), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    student = relationship("Student", back_populates="payments")
    instalment = relationship("Instalment", back_populates="payments")
    centre = relationship("Centre", back_populates="payments")
    receipt = relationship("Receipt", back_populates="payment", uselist=False)


class Receipt(Base):
    __tablename__ = "receipts"

    id = Column(Integer, primary_key=True, index=True)
    receipt_no = Column(String(50), unique=True, nullable=False, index=True)
    payment_id = Column(String(50), ForeignKey("payments.id"), unique=True, nullable=False)
    student_id = Column(String(50), ForeignKey("students.id"), nullable=False)
    
    date = Column(Date, default=datetime.date.today, nullable=False)
    base_amount = Column(Numeric(12, 2, asdecimal=True), nullable=False)
    gst_rate = Column(Float, nullable=False, default=18.0)
    cgst_amount = Column(Numeric(12, 2, asdecimal=True), nullable=False, default=Decimal("0.00"))
    sgst_amount = Column(Numeric(12, 2, asdecimal=True), nullable=False, default=Decimal("0.00"))
    total_amount = Column(Numeric(12, 2, asdecimal=True), nullable=False)
    gst_number = Column(String(50), default="08AAACP1234F1Z5")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    payment = relationship("Payment", back_populates="receipt")


class Reminder(Base):
    __tablename__ = "reminders"

    id = Column(String(50), primary_key=True, index=True) # e.g. REM-001
    student_id = Column(String(50), ForeignKey("students.id"), nullable=False, index=True)
    instalment_id = Column(String(50), ForeignKey("instalments.id"), nullable=False)
    
    due_date = Column(Date, nullable=False)
    scheduled_date = Column(Date, nullable=False)
    channel = Column(String(30), nullable=False, default="WhatsApp") # WhatsApp, SMS, Email, Call
    status = Column(String(30), nullable=False, default="Scheduled") # Scheduled, Sent, Failed, Cancelled
    delivery_status = Column(String(30), nullable=False, default="simulated") # simulated, delivered, failed
    event_key = Column(String(100), nullable=True, index=True) # e.g. INS-0412-1_UPCOMING_7D
    lang = Column(String(10), nullable=False, default="en") # en, hi
    message = Column(Text, nullable=False)
    sent_at = Column(DateTime, nullable=True)
    retry_count = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    student = relationship("Student", back_populates="reminders")
    instalment = relationship("Instalment", back_populates="reminders")


class RefundRequest(Base):
    __tablename__ = "refund_requests"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(String(50), ForeignKey("students.id"), nullable=False, index=True)
    
    course_start_date = Column(Date, nullable=False)
    course_end_date = Column(Date, nullable=False)
    withdrawal_date = Column(Date, nullable=False)
    withdrawal_reason = Column(Text, nullable=True)
    amount_paid = Column(Numeric(12, 2, asdecimal=True), nullable=False)
    discount_applied = Column(Numeric(12, 2, asdecimal=True), default=Decimal("0.00"))
    
    total_days = Column(Integer, nullable=False)
    days_attended = Column(Integer, nullable=False)
    unused_days = Column(Integer, nullable=False)
    pro_rata_amount = Column(Numeric(12, 2, asdecimal=True), nullable=False)
    processing_fee = Column(Numeric(12, 2, asdecimal=True), default=Decimal("0.00"))
    material_fee = Column(Numeric(12, 2, asdecimal=True), default=Decimal("0.00"))
    estimated_refund = Column(Numeric(12, 2, asdecimal=True), nullable=False)
    approved_refund = Column(Numeric(12, 2, asdecimal=True), nullable=True)
    
    policy_code = Column(String(50), default="REFUND_STD_POLICY_2026")
    policy_version = Column(String(20), default="v2026.1")
    status = Column(String(30), nullable=False, default="Pending Review") # Pending Review, Approved, Rejected, Processed
    policy_configured = Column(Boolean, default=False)
    deadline_met = Column(Boolean, default=True) # 10-day refund window check
    processing_deadline = Column(Date, nullable=True) # 10 days from withdrawal
    processed_date = Column(DateTime, nullable=True)
    payout_reference = Column(String(100), nullable=True)

    notes = Column(Text, nullable=True)
    approved_by = Column(String(100), nullable=True)
    decision_reason = Column(Text, nullable=True)
    decision_date = Column(Date, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    student = relationship("Student", back_populates="refund_requests")


class Attendance(Base):
    __tablename__ = "attendances"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(String(50), ForeignKey("students.id"), nullable=False, index=True)
    batch = Column(String(50), nullable=False)
    date = Column(Date, nullable=False, index=True)
    status = Column(String(20), nullable=False, default="Present") # Present, Absent, Late
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    student = relationship("Student", back_populates="attendances")


class TestScore(Base):
    __tablename__ = "test_scores"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(String(50), ForeignKey("students.id"), nullable=False, index=True)
    test_name = Column(String(100), nullable=False)
    test_date = Column(Date, nullable=False)
    subject = Column(String(50), nullable=False)
    max_marks = Column(Float, nullable=False)
    marks_obtained = Column(Float, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    student = relationship("Student", back_populates="test_scores")


class CounsellorTask(Base):
    __tablename__ = "counsellor_tasks"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(String(50), ForeignKey("students.id"), nullable=False, index=True)
    risk_level = Column(String(20), nullable=False) # High, Medium, Low
    risk_score = Column(Float, nullable=False, default=50.0) # 0 to 100
    risk_reasons = Column(Text, nullable=False) # JSON or newline string
    evidence = Column(Text, nullable=True) # JSON evidence dictionary
    counsellor_name = Column(String(100), nullable=True)
    priority = Column(String(20), nullable=False, default="High") # Urgent, High, Medium, Low
    due_date = Column(Date, nullable=True)
    status = Column(String(30), nullable=False, default="Open") # Open, In Progress, Contacted, Resolved, False Positive
    dismissal_reason = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    flagged_date = Column(Date, default=datetime.date.today)
    reviewed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    student = relationship("Student", back_populates="counsellor_tasks")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    entity_name = Column(String(50), nullable=False, index=True) # Payment, Refund, Instalment, etc.
    entity_id = Column(String(50), nullable=False)
    action = Column(String(50), nullable=False) # CREATE, UPDATE, STATUS_CHANGE, MATCH, REFUND_APPROVE
    changed_by = Column(String(100), nullable=False)
    old_values = Column(Text, nullable=True)
    new_values = Column(Text, nullable=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)


class ParentalConsent(Base):
    __tablename__ = "parental_consents"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(String(50), ForeignKey("students.id"), nullable=False, index=True)
    parent_phone = Column(String(20), nullable=False)
    consent_type = Column(String(50), nullable=False, default="COMMUNICATION_AND_ACADEMIC_PROCESSING")
    verified = Column(Boolean, default=True)
    verified_at = Column(DateTime, default=datetime.datetime.utcnow)
    ip_address = Column(String(50), nullable=True)
    notes = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    student = relationship("Student", back_populates="consents")


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(String(50), primary_key=True, index=True) # e.g. NOTIF-001
    recipient_role = Column(String(30), nullable=True) # accounts_executive, admin, parent, student
    recipient_id = Column(String(100), nullable=False, index=True) # User identifier, parent phone, or student ID
    centre_id = Column(Integer, ForeignKey("centres.id"), nullable=True, index=True)
    
    event_type = Column(String(50), nullable=False, index=True) # PAYMENT_SUCCESS, REFUND_REQUESTED, etc.
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    lang = Column(String(10), nullable=False, default="en") # en, hi
    
    is_read = Column(Boolean, nullable=False, default=False, index=True)
    read_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, index=True)
    
    related_student_id = Column(String(50), ForeignKey("students.id"), nullable=True, index=True)
    related_payment_id = Column(String(50), nullable=True)
    related_refund_id = Column(Integer, nullable=True)
    related_task_id = Column(Integer, nullable=True)
    entity_type = Column(String(50), nullable=True) # payment, instalment, refund, task, student
    entity_id = Column(String(100), nullable=True)
    
    channel = Column(String(30), nullable=False, default="in_app") # in_app, whatsapp, sms, email
    delivery_status = Column(String(30), nullable=False, default="delivered") # delivered, simulated, pending, failed

    student = relationship("Student", back_populates="notifications")
    centre = relationship("Centre")


class AutomationLog(Base):
    __tablename__ = "automation_logs"

    id = Column(Integer, primary_key=True, index=True)
    job_name = Column(String(100), nullable=False, index=True) # reminder_scheduler, risk_analysis, payment_matching
    status = Column(String(30), nullable=False) # SUCCESS, FAILED, RUNNING
    items_processed = Column(Integer, default=0)
    details = Column(Text, nullable=True)
    duration_ms = Column(Integer, default=0)
    executed_at = Column(DateTime, default=datetime.datetime.utcnow, index=True)


class AutomationConfig(Base):
    __tablename__ = "automation_configs"

    key = Column(String(50), primary_key=True) # reminder_scheduler_enabled, reminder_interval_mins
    value = Column(String(255), nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow)


