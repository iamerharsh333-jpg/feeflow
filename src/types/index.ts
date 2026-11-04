// ─── Enums / Union Types ────────────────────────────────────────────────────

export type FeeStatus = 'Paid' | 'Partially Paid' | 'Pending' | 'Overdue' | 'Upcoming';
export type PaymentMethod = 'Cash' | 'UPI' | 'Bank Transfer' | 'Cheque' | 'Online';
export type PaymentStatus = 'Success' | 'Pending' | 'Failed' | 'Unmatched' | 'Under Review' | 'Rejected';
export type ReminderChannel = 'WhatsApp' | 'SMS' | 'Email' | 'Call';
export type ReminderStatus = 'Scheduled' | 'Sent' | 'Failed' | 'Cancelled';
export type RiskLevel = 'High' | 'Medium' | 'Low';
export type Centre = 'Jaipur Main' | 'Jaipur West' | 'Kota' | 'Ajmer';
export type Course = 'JEE 2027' | 'JEE 2026' | 'NEET 2027' | 'NEET 2026' | 'Foundation';
export type Batch = 'Morning' | 'Evening' | 'Weekend';

// ─── Core Entities ───────────────────────────────────────────────────────────

export interface Instalment {
  id: string;
  number: number;
  dueDate: string;
  amount: number;
  paid: number;
  status: FeeStatus;
  paidDate?: string;
  receiptNo?: string;
  overdueDays?: number;
}

export interface Student {
  id: string;
  name: string;
  course: Course;
  batch: Batch;
  centre: Centre;
  parentName: string;
  parentPhone: string;
  parentEmail: string;
  totalFee: number;
  totalDiscount?: number;
  effectiveFee?: number;
  amountPaid: number;
  outstanding: number;
  feeStatus: FeeStatus;
  enrollmentDate: string;
  instalments: Instalment[];
  rollNumber: string;
  attendancePercent: number;
  testScoresTrend: 'Improving' | 'Stable' | 'Declining';
}

export interface Payment {
  id: string;
  transactionId: string;
  studentId: string;
  studentName: string;
  amount: number;
  paymentDate: string;
  method: PaymentMethod;
  referenceNo: string;
  status: PaymentStatus;
  instalmentId?: string;
  centre: Centre;
  notes?: string;
}

export interface Reminder {
  id: string;
  studentId: string;
  studentName: string;
  parentName: string;
  parentPhone: string;
  parentEmail: string;
  outstanding: number;
  dueDate: string;
  channel: ReminderChannel;
  scheduledDate: string;
  status: ReminderStatus;
  instalmentId: string;
  messagePreviewEn?: string;
  messagePreviewHi?: string;
  sentAt?: string;
  centre: Centre;
}

export interface RiskStudent {
  studentId: string;
  studentName: string;
  centre: Centre;
  course: Course;
  riskLevel: RiskLevel;
  riskReasons: string[];
  attendancePercent: number;
  testScoreTrend: 'Improving' | 'Stable' | 'Declining';
  outstandingInstalments: number;
  outstandingAmount: number;
  counsellorAssigned?: string;
  status: 'Unreviewed' | 'In Progress' | 'Reviewed' | 'Dismissed';
  flaggedOn: string;
}

export interface RefundEstimate {
  studentName: string;
  courseStartDate: string;
  courseEndDate: string;
  withdrawalDate: string;
  amountPaid: number;
  totalDays: number;
  daysAttended: number;
  unusedDays: number;
  proRataRefund: number;
  processingFee: number;
  materialFee: number;
  finalRefund: number;
  policyNote: string;
}

export interface Receipt {
  id: number;
  receiptNo: string;
  paymentId: string;
  transactionId: string;
  paymentMethod: string;
  studentId: string;
  studentName: string;
  rollNumber: string;
  course: string;
  batch: string;
  centreName: string;
  parentName: string;
  parentPhone: string;
  instalmentNumber?: number;
  date: string;
  baseAmount: number;
  gstRate: number;
  cgstAmount: number;
  sgstAmount: number;
  totalAmount: number;
  gstNumber: string;
  taxTreatment: string;
  isDemo: boolean;
}

export interface AttendanceRecord {
  date: string;
  batch: string;
  status: string;
}

export interface StudentAttendance {
  student_id: string;
  total_classes: number;
  present_count: number;
  attendance_rate_percent: number;
  records: AttendanceRecord[];
}

export interface TestScoreRecord {
  id: number;
  test_name: string;
  test_date: string;
  subject: string;
  max_marks: number;
  marks_obtained: number;
  percentage: number;
}

export interface NotificationItem {
  id: string;
  recipient_role?: string;
  recipient_id: string;
  centre_id?: number;
  event_type: string;
  title: string;
  message: string;
  lang: string;
  is_read: boolean;
  read_at?: string;
  created_at: string;
  related_student_id?: string;
  related_payment_id?: string;
  related_refund_id?: number;
  related_task_id?: number;
  entity_type?: string;
  entity_id?: string;
  channel: string;
  delivery_status: string;
}


