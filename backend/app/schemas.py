from pydantic import BaseModel, EmailStr, Field, ConfigDict
from typing import Optional, List, Dict, Any
from datetime import date, datetime
from decimal import Decimal

# Auth
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    name: str
    identifier: str
    centre_id: Optional[int] = None
    student_id: Optional[str] = None

class TokenData(BaseModel):
    identifier: Optional[str] = None
    role: Optional[str] = None
    centre_id: Optional[int] = None

class PasswordLoginRequest(BaseModel):
    identifier: str
    password: str

class SendOTPRequest(BaseModel):
    phone: str

class OTPLoginRequest(BaseModel):
    phone: str
    otp: str

# Centre
class CentreBase(BaseModel):
    name: str
    code: str
    city: str
    address: Optional[str] = None

class CentreResponse(CentreBase):
    id: int
    model_config = ConfigDict(from_attributes=True)

# Instalment
class InstalmentBase(BaseModel):
    instalment_number: int
    due_date: date
    amount: Decimal

class InstalmentResponse(BaseModel):
    id: str
    student_id: str
    instalment_number: int
    due_date: date
    amount: float
    paid_amount: float
    status: str
    paid_date: Optional[date] = None
    receipt_no: Optional[str] = None
    overdue_days: int = 0
    model_config = ConfigDict(from_attributes=True)

# Student
class StudentBase(BaseModel):
    id: str
    roll_number: str
    name: str
    course: str
    batch: str
    centre_id: int
    parent_name: str
    parent_phone: str
    parent_email: Optional[str] = None
    total_fee: Decimal

class StudentCreate(StudentBase):
    instalment_count: int = 4

class StudentResponse(BaseModel):
    id: str
    roll_number: str
    name: str
    course: str
    batch: str
    centre_id: int
    centre_name: Optional[str] = None
    parent_name: str
    parent_phone: str
    parent_email: Optional[str] = None
    total_fee: float
    total_discount: float = 0.0
    effective_fee: Optional[float] = None
    amount_paid: float
    outstanding_amount: float
    fee_status: str
    attendance_percent: float = 0.0
    test_scores_trend: str = "Stable"
    enrollment_date: date
    instalments: List[InstalmentResponse] = []
    model_config = ConfigDict(from_attributes=True)

# Receipt
class ReceiptResponse(BaseModel):
    id: int
    receipt_no: str
    payment_id: str
    student_id: str
    student_name: str
    date: date
    base_amount: float
    gst_rate: float
    cgst_amount: float
    sgst_amount: float
    total_amount: float
    gst_number: str

class ReceiptDetailResponse(BaseModel):
    id: int
    receipt_no: str
    payment_id: str
    transaction_id: str
    payment_method: str
    student_id: str
    student_name: str
    roll_number: str
    course: str
    batch: str
    centre_name: str
    parent_name: str
    parent_phone: str
    instalment_number: Optional[int] = None
    date: date
    base_amount: float
    gst_rate: float
    cgst_amount: float
    sgst_amount: float
    total_amount: float
    gst_number: str
    tax_treatment: str
    is_demo: bool = True


# Payment
class PaymentCreate(BaseModel):
    student_id: str
    instalment_id: Optional[str] = None
    amount: Decimal
    method: str
    reference_no: Optional[str] = None
    payment_date: Optional[date] = None
    notes: Optional[str] = None

class PaymentResponse(BaseModel):
    id: str
    transaction_id: str
    student_id: Optional[str] = None
    student_name: Optional[str] = None
    instalment_id: Optional[str] = None
    amount: float
    payment_date: date
    method: str
    reference_no: str
    status: str
    centre_name: Optional[str] = None
    receipt_no: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class MatchPaymentRequest(BaseModel):
    student_id: str
    instalment_id: Optional[str] = None

class PaymentLinkCreate(BaseModel):
    student_id: str
    instalment_id: str

class PaymentLinkResponse(BaseModel):
    order_id: str
    amount: float
    currency: str = "INR"
    student_id: str
    instalment_id: str
    payment_url: str

class PaymentIntentCreate(BaseModel):
    student_id: str
    instalment_id: str
    amount: Optional[Decimal] = None
    method: str = "UPI"

class PaymentIntentResponse(BaseModel):
    intent_id: str
    order_id: str
    student_id: str
    student_name: str
    instalment_id: str
    instalment_number: int
    amount: float
    currency: str = "INR"
    method: str
    signature: str
    gateway_type: str = "simulated"
    created_at: datetime

class PaymentVerifyRequest(BaseModel):
    order_id: str
    payment_id: str
    signature: str
    simulation_status: str = "success" # success, failed, cancelled


class PaymentVerifyResponse(BaseModel):
    status: str
    message: str
    payment: Optional[PaymentResponse] = None
    receipt: Optional[ReceiptResponse] = None

class MockPaymentWebhook(BaseModel):
    order_id: str
    payment_id: str
    signature: str

# Reminder
class ReminderResponse(BaseModel):
    id: str
    student_id: str
    student_name: str
    parent_name: str
    parent_phone: str
    outstanding: float
    due_date: date
    scheduled_date: date
    channel: str
    status: str
    lang: str
    message: str
    sent_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)

class ReminderPreviewRequest(BaseModel):
    student_id: str
    instalment_id: str
    lang: str = "en"
    channel: str = "WhatsApp"

class ReminderPreviewResponse(BaseModel):
    student_id: str
    channel: str
    lang: str
    recipient_phone: str
    message_text: str

# Refund
class RefundEstimateRequest(BaseModel):
    student_id: str
    course_start_date: date
    course_end_date: date
    withdrawal_date: date
    amount_paid: Optional[Decimal] = None
    processing_fee_percent: float = 5.0
    material_fee: Decimal = Decimal("5000.0")
    policy_code: str = "REFUND_STD_POLICY_2026"
    policy_confirmed: bool = False

class RefundEstimateResponse(BaseModel):
    student_id: str
    student_name: Optional[str] = None
    course_start_date: date
    course_end_date: date
    withdrawal_date: date
    total_days: int
    days_attended: int
    unused_days: int
    amount_paid: float
    discount_applied: float = 0.0
    pro_rata_refund: float
    processing_fee: float
    material_fee: float
    estimated_refund: float
    policy_code: str
    policy_version: str = "v2026.1"
    deadline_met: bool
    processing_deadline: date
    policy_note: str

class RefundRequestCreate(BaseModel):
    student_id: str
    course_start_date: date
    course_end_date: date
    withdrawal_date: date
    withdrawal_reason: Optional[str] = "Student voluntary withdrawal"
    amount_paid: Optional[Decimal] = None
    processing_fee_percent: float = 5.0
    material_fee: Decimal = Decimal("5000.0")
    policy_confirmed: bool = True
    policy_code: str = "REFUND_STD_POLICY_2026"
    notes: Optional[str] = None

class RefundApprovalRequest(BaseModel):
    approved_amount: Decimal
    reason: Optional[str] = "Approved as per standard institute refund policy"
    policy_code: str = "REFUND_STD_POLICY_2026"
    notes: Optional[str] = None

class RefundRejectionRequest(BaseModel):
    reason: str
    notes: Optional[str] = None

class RefundProcessRequest(BaseModel):
    payout_method: str = "Simulated Direct Bank Transfer"
    notes: Optional[str] = None

class RefundResponse(BaseModel):
    id: int
    student_id: str
    student_name: str
    centre_name: Optional[str] = None
    course_start_date: date
    course_end_date: date
    withdrawal_date: date
    withdrawal_reason: Optional[str] = None
    amount_paid: float
    discount_applied: float = 0.0
    total_days: int
    days_attended: int
    unused_days: int
    pro_rata_amount: float
    processing_fee: float
    material_fee: float
    estimated_refund: float
    approved_refund: Optional[float] = None
    policy_code: str
    policy_version: str
    status: str
    deadline_met: bool
    processing_deadline: Optional[date] = None
    days_remaining: Optional[int] = None
    is_overdue: bool = False
    processed_date: Optional[datetime] = None
    payout_reference: Optional[str] = None
    notes: Optional[str] = None
    approved_by: Optional[str] = None
    decision_reason: Optional[str] = None
    decision_date: Optional[date] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

# Attendance & Tests
class AttendanceRecord(BaseModel):
    student_id: str
    batch: str
    date: date
    status: str = "Present"

class TestScoreRecord(BaseModel):
    student_id: str
    test_name: str
    test_date: date
    subject: str
    max_marks: float
    marks_obtained: float

# Risk & Counsellor Task
class CounsellorTaskResponse(BaseModel):
    id: int
    student_id: str
    student_name: str
    centre_name: str
    course: str
    risk_level: str
    risk_score: float = 50.0
    risk_reasons: List[str]
    evidence: Optional[Dict[str, Any]] = None
    attendance_percent: float
    test_score_trend: str
    outstanding_amount: float
    counsellor_name: Optional[str] = None
    priority: str = "High"
    due_date: Optional[date] = None
    status: str
    dismissal_reason: Optional[str] = None
    notes: Optional[str] = None
    flagged_date: date
    reviewed_at: Optional[datetime] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class AssignCounsellorRequest(BaseModel):
    counsellor_name: str
    priority: Optional[str] = "High"
    notes: Optional[str] = None

class DismissRiskTaskRequest(BaseModel):
    reason: str
    notes: Optional[str] = None

class RiskStatusUpdateRequest(BaseModel):
    status: str # Open, In Progress, Contacted, Resolved, False Positive
    notes: Optional[str] = None
    dismissal_reason: Optional[str] = None
    notes: Optional[str] = None

# Consent
class ParentalConsentCreate(BaseModel):
    student_id: str
    parent_phone: str
    consent_type: str = "COMMUNICATION_AND_ACADEMIC_PROCESSING"
    ip_address: Optional[str] = None
    notes: Optional[str] = None

class ParentalConsentResponse(BaseModel):
    id: int
    student_id: str
    parent_phone: str
    consent_type: str
    verified: bool
    verified_at: datetime
    notes: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)

# Dashboard KPIs
class DashboardSummary(BaseModel):
    total_students: int
    total_fee: float = 0.0
    fees_collected: float
    outstanding_fees: float
    overdue_fees: float
    collection_rate: float
    overdue_students_count: int
    unmatched_payments_count: int

# Notifications
class NotificationResponse(BaseModel):
    id: str
    recipient_role: Optional[str] = None
    recipient_id: str
    centre_id: Optional[int] = None
    event_type: str
    title: str
    message: str
    lang: str = "en"
    is_read: bool
    read_at: Optional[datetime] = None
    created_at: datetime
    related_student_id: Optional[str] = None
    related_payment_id: Optional[str] = None
    related_refund_id: Optional[int] = None
    related_task_id: Optional[int] = None
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None
    channel: str
    delivery_status: str
    model_config = ConfigDict(from_attributes=True)

class UnreadCountResponse(BaseModel):
    unread_count: int

