const API_BASE = (import.meta as any).env?.VITE_API_URL || (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? 'http://localhost:8000/api/v1' : '/api/v1');

function getToken(): string | null {
  return localStorage.getItem('feeflow_token');
}

async function apiRequest<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let errDetail = `API Error (${res.status})`;
    try {
      const errJson = await res.json();
      errDetail = errJson.detail || errJson.message || errDetail;
    } catch {
      // ignore
    }
    throw new Error(errDetail);
  }

  return res.json();
}

export const api = {
  // Auth
  login: (identifier: string, password: string) =>
    apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    }),

  sendOtp: (phone: string) =>
    apiRequest('/auth/send-otp', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    }),

  verifyOtp: (phone: string, otp: string) =>
    apiRequest('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ phone, otp }),
    }),

  getProfile: () => apiRequest('/auth/me'),

  // Students
  getStudents: (params: { q?: string; centre_id?: number; course?: string; fee_status?: string } = {}) => {
    const sp = new URLSearchParams();
    if (params.q) sp.append('q', params.q);
    if (params.centre_id) sp.append('centre_id', params.centre_id.toString());
    if (params.course) sp.append('course', params.course);
    if (params.fee_status) sp.append('fee_status', params.fee_status);
    return apiRequest(`/students?${sp.toString()}`);
  },

  getStudent: (studentId: string) => apiRequest(`/students/${studentId}`),

  createStudent: (data: {
    id: string;
    roll_number: string;
    name: string;
    centre_id: number;
    course: string;
    batch: string;
    parent_name: string;
    parent_phone: string;
    parent_email?: string;
    total_fee: number;
    instalment_count?: number;
  }) =>
    apiRequest('/students', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getFeeLedger: (studentId: string) => apiRequest(`/fees/${studentId}/ledger`),

  // Payments
  getPayments: (params: { status?: string; student_id?: string } = {}) => {
    const sp = new URLSearchParams();
    if (params.status) sp.append('status', params.status);
    if (params.student_id) sp.append('student_id', params.student_id);
    return apiRequest(`/payments?${sp.toString()}`);
  },

  recordPayment: (data: { student_id: string; instalment_id?: string; amount: number; method: string; reference_no?: string; notes?: string }) =>
    apiRequest('/payments', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getUnmatchedPayments: () => apiRequest('/payments/unmatched'),

  createPaymentIntent: (data: { student_id: string; instalment_id: string; amount?: number; method?: string }) =>
    apiRequest('/payments/intent', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  verifyPayment: (data: { order_id: string; payment_id: string; signature: string; simulation_status: 'success' | 'failed' | 'cancelled' }) =>
    apiRequest('/payments/verify', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  matchPayment: (paymentId: string, studentId: string, instalmentId?: string) =>
    apiRequest(`/payments/${paymentId}/match`, {
      method: 'POST',
      body: JSON.stringify({ student_id: studentId, instalment_id: instalmentId }),
    }),

  reviewPayment: (paymentId: string) =>
    apiRequest(`/payments/${paymentId}/review`, { method: 'POST' }),

  rejectPayment: (paymentId: string) =>
    apiRequest(`/payments/${paymentId}/reject`, { method: 'POST' }),

  // Reminders
  getReminders: (status?: string, studentId?: string) => {
    const sp = new URLSearchParams();
    if (status) sp.append('status', status);
    if (studentId) sp.append('student_id', studentId);
    const qs = sp.toString();
    return apiRequest(`/reminders${qs ? `?${qs}` : ''}`);
  },

  getStudentReminders: (studentId: string) =>
    apiRequest(`/reminders?student_id=${encodeURIComponent(studentId)}`),

  previewReminder: (studentId: string, instalmentId: string, lang = 'en') =>
    apiRequest('/reminders/preview', {
      method: 'POST',
      body: JSON.stringify({ student_id: studentId, instalment_id: instalmentId, lang }),
    }),

  sendReminder: (reminderId: string) =>
    apiRequest(`/reminders/${reminderId}/send`, { method: 'POST' }),

  cancelReminder: (reminderId: string) =>
    apiRequest(`/reminders/${reminderId}/cancel`, { method: 'POST' }),

  resendReminder: (reminderId: string) =>
    apiRequest(`/reminders/${reminderId}/resend`, { method: 'POST' }),

  // Receipts
  getReceipts: (studentId?: string) => {
    const sp = studentId ? `?student_id=${encodeURIComponent(studentId)}` : '';
    return apiRequest(`/receipts${sp}`);
  },

  getReceiptByNumber: (receiptNo: string) =>
    apiRequest(`/receipts/${encodeURIComponent(receiptNo)}`),

  // Attendance & Academic Tests
  getStudentAttendance: (studentId: string) =>
    apiRequest(`/attendance/${studentId}`),

  getStudentTests: (studentId: string) =>
    apiRequest(`/tests/${studentId}`),

  // Refunds
  estimateRefund: (data: {
    student_id: string;
    course_start_date: string;
    course_end_date: string;
    withdrawal_date: string;
    amount_paid?: number;
    processing_fee_percent?: number;
    material_fee?: number;
  }) =>
    apiRequest('/refunds/estimate', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  submitRefundRequest: (data: {
    student_id: string;
    course_start_date: string;
    course_end_date: string;
    withdrawal_date: string;
    withdrawal_reason?: string;
    amount_paid?: number;
    processing_fee_percent?: number;
    material_fee?: number;
    policy_confirmed?: boolean;
    notes?: string;
  }) =>
    apiRequest('/refunds/request', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getRefundRequests: () => apiRequest('/refunds/requests'),

  getStudentRefunds: (studentId: string) =>
    apiRequest(`/refunds/student/${encodeURIComponent(studentId)}`),

  approveRefund: (requestId: number, data: { approved_amount: number; reason: string; policy_code?: string; notes?: string }) =>
    apiRequest(`/refunds/requests/${requestId}/approve`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  rejectRefund: (requestId: number, reason: string, notes?: string) =>
    apiRequest(`/refunds/requests/${requestId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason, notes }),
    }),

  processRefund: (requestId: number, notes?: string) =>
    apiRequest(`/refunds/requests/${requestId}/process`, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    }),

  // Risk
  getRiskSummary: () => apiRequest('/risk/summary'),

  getCounsellorTasks: (params: { risk_level?: string; status?: string } = {}) => {
    const sp = new URLSearchParams();
    if (params.risk_level) sp.append('risk_level', params.risk_level);
    if (params.status) sp.append('status', params.status);
    return apiRequest(`/risk/tasks?${sp.toString()}`);
  },

  assessStudentRisk: (studentId: string) =>
    apiRequest(`/risk/assess/${encodeURIComponent(studentId)}`, { method: 'POST' }),

  assignCounsellor: (taskId: number, counsellorName: string, priority?: string, notes?: string) =>
    apiRequest(`/risk/tasks/${taskId}/assign`, {
      method: 'POST',
      body: JSON.stringify({ counsellor_name: counsellorName, priority, notes }),
    }),

  dismissRiskTask: (taskId: number, reason: string, notes?: string) =>
    apiRequest(`/risk/tasks/${taskId}/dismiss`, {
      method: 'POST',
      body: JSON.stringify({ reason, notes }),
    }),

  updateRiskStatus: (taskId: number, status: string, notes?: string, dismissal_reason?: string) =>
    apiRequest(`/risk/tasks/${taskId}/status`, {
      method: 'POST',
      body: JSON.stringify({ status, notes, dismissal_reason }),
    }),

  // Dashboard
  getDashboardSummary: (centreId?: number) => {
    const sp = centreId ? `?centre_id=${centreId}` : '';
    return apiRequest(`/dashboard/summary${sp}`);
  },

  getDashboardMonthly: (centreId?: number) => {
    const sp = centreId ? `?centre_id=${centreId}` : '';
    return apiRequest(`/dashboard/monthly${sp}`);
  },

  getDashboardCentreWise: () => {
    return apiRequest('/dashboard/centre-wise');
  },

  getDashboardBatchWise: (centreId?: number) => {
    const sp = centreId ? `?centre_id=${centreId}` : '';
    return apiRequest(`/dashboard/batch-wise${sp}`);
  },

  getDashboardAgeing: (centreId?: number) => {
    const sp = centreId ? `?centre_id=${centreId}` : '';
    return apiRequest(`/dashboard/ageing${sp}`);
  },

  // Notifications
  getNotifications: (params?: { unread_only?: boolean; category?: string; from_date?: string; to_date?: string; limit?: number; offset?: number }) => {
    const query = new URLSearchParams();
    if (params?.unread_only) query.append('unread_only', 'true');
    if (params?.category && params.category !== 'all') query.append('category', params.category);
    if (params?.from_date) query.append('from_date', params.from_date);
    if (params?.to_date) query.append('to_date', params.to_date);
    if (params?.limit) query.append('limit', String(params.limit));
    if (params?.offset) query.append('offset', String(params.offset));
    const qs = query.toString();
    return apiRequest(`/notifications${qs ? `?${qs}` : ''}`);
  },

  getUnreadNotificationCount: () => {
    return apiRequest<{ unread_count: number }>('/notifications/unread-count');
  },

  markNotificationRead: (id: string) => {
    return apiRequest(`/notifications/${encodeURIComponent(id)}/read`, {
      method: 'PATCH',
    });
  },

  markAllNotificationsRead: () => {
    return apiRequest<{ marked_count: number }>('/notifications/mark-all-read', {
      method: 'POST',
    });
  },

  // Automation Engine
  getAutomationStatus: () => apiRequest('/automation/status'),

  toggleReminderAutomation: (enabled: boolean) =>
    apiRequest('/automation/toggle-reminders', {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    }),

  runReminderCycle: () =>
    apiRequest('/automation/run-reminders', {
      method: 'POST',
    }),

  runRiskScan: () =>
    apiRequest('/automation/run-risk-scan', {
      method: 'POST',
    }),

  retryFailedReminders: () =>
    apiRequest('/automation/retry-failed', {
      method: 'POST',
    }),

  autoMatchPayment: (data: {
    reference_no: string;
    amount: number;
    method?: string;
    student_id?: string;
    instalment_id?: string;
    order_id?: string;
    signature?: string;
    payment_date?: string;
    notes?: string;
  }) =>
    apiRequest('/automation/match-payment', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};
