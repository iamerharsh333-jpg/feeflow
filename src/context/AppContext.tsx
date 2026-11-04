import React, { createContext, useContext, useState, useEffect } from 'react';
import type { Student, Payment, Reminder, RiskStudent } from '../types';
import { STUDENTS, PAYMENTS, REMINDERS, RISK_STUDENTS } from '../data/mockData';
import { api } from '../utils/api';
import { useAuth } from './AuthContext';

interface AppState {
  students: Student[];
  payments: Payment[];
  reminders: Reminder[];
  riskStudents: RiskStudent[];
  selectedCentre: string;
  setSelectedCentre: (c: string) => void;
  loading: boolean;
  backendConnected: boolean;
  error: string | null;
  clearError: () => void;
  updateStudent: (s: Student) => void;
  addPayment: (p: Payment) => Promise<Payment>;
  updatePayment: (p: Payment) => Promise<void>;
  cancelReminder: (id: string) => Promise<void>;
  sendReminder: (id: string) => Promise<void>;
  updateRiskStudent: (r: RiskStudent) => Promise<void>;
  notifications: Notification[];
  addNotification: (n: Omit<Notification, 'id' | 'time'>) => void;
  dismissNotification: (id: string) => void;
  refreshData: () => Promise<void>;
}

interface Notification {
  id: string;
  type: 'success' | 'info' | 'warning' | 'error';
  title: string;
  message: string;
  time: Date;
}

const AppContext = createContext<AppState | null>(null);

const LS_KEYS = {
  students: 'feeflow_students',
  payments: 'feeflow_payments',
  reminders: 'feeflow_reminders',
  risk: 'feeflow_risk',
};

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [students, setStudents] = useState<Student[]>(() =>
    loadFromStorage(LS_KEYS.students, STUDENTS)
  );
  const [payments, setPayments] = useState<Payment[]>(() =>
    loadFromStorage(LS_KEYS.payments, PAYMENTS)
  );
  const [reminders, setReminders] = useState<Reminder[]>(() =>
    loadFromStorage(LS_KEYS.reminders, REMINDERS)
  );
  const [riskStudents, setRiskStudents] = useState<RiskStudent[]>(() =>
    loadFromStorage(LS_KEYS.risk, RISK_STUDENTS)
  );
  const [selectedCentre, setSelectedCentre] = useState<string>('All Centres');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [backendConnected, setBackendConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-lock selectedCentre if user is accounts_executive with assigned centre
  useEffect(() => {
    if (user?.role === 'accounts' && user.centreName) {
      setSelectedCentre(user.centreName);
    }
  }, [user]);

  const fetchBackendData = async () => {
    setLoading(true);
    try {
      const backendStudents = await api.getStudents();
      if (Array.isArray(backendStudents)) {
        setBackendConnected(true);
        if (backendStudents.length > 0) {
          const mapped: Student[] = backendStudents.map(s => ({
            id: s.id,
            rollNumber: s.roll_number,
            name: s.name,
            course: s.course as any,
            batch: s.batch as any,
            centre: (s.centre_name || 'Jaipur Main') as any,
            parentName: s.parent_name,
            parentPhone: s.parent_phone,
            parentEmail: s.parent_email || '',
            totalFee: s.total_fee,
            totalDiscount: s.total_discount || 0,
            effectiveFee: s.effective_fee ?? (s.total_fee - (s.total_discount || 0)),
            amountPaid: s.amount_paid,
            outstanding: s.outstanding_amount,
            feeStatus: s.fee_status as any,
            enrollmentDate: s.enrollment_date,
            attendancePercent: s.attendance_percent || 85,
            testScoresTrend: (s.test_scores_trend || 'Stable') as any,
            instalments: (s.instalments || []).map((ins: any) => ({
              id: ins.id,
              number: ins.instalment_number,
              dueDate: ins.due_date,
              amount: ins.amount,
              paid: ins.paid_amount,
              status: ins.status,
              paidDate: ins.paid_date,
              receiptNo: ins.receipt_no,
              overdueDays: ins.overdue_days || 0,
            })),
          }));
          setStudents(mapped);
        }
      }

      const backendPayments = await api.getPayments();
      if (Array.isArray(backendPayments)) {
        setPayments(backendPayments.map(p => ({
          id: p.id,
          transactionId: p.transaction_id,
          studentId: p.student_id || '',
          studentName: p.student_name || 'Unknown',
          amount: p.amount,
          paymentDate: p.payment_date,
          method: p.method as any,
          referenceNo: p.reference_no,
          status: p.status as any,
          instalmentId: p.instalment_id,
          centre: (p.centre_name || 'Jaipur Main') as any,
          notes: p.notes,
        })));
      }

      const backendReminders = await api.getReminders();
      if (Array.isArray(backendReminders)) {
        setReminders(backendReminders.map(r => ({
          id: r.id,
          studentId: r.student_id,
          studentName: r.student_name,
          parentName: r.parent_name,
          parentPhone: r.parent_phone,
          parentEmail: '',
          outstanding: r.outstanding,
          dueDate: r.due_date,
          channel: r.channel as any,
          scheduledDate: r.scheduled_date,
          status: r.status as any,
          instalmentId: '',
          messagePreviewEn: r.message,
          messagePreviewHi: r.message,
          sentAt: r.sent_at,
          centre: 'Jaipur Main' as any,
        })));
      }

      try {
        const backendTasks = await api.getCounsellorTasks();
        if (Array.isArray(backendTasks)) {
          setRiskStudents(backendTasks.map((t: any) => ({
            studentId: t.student_id,
            studentName: t.student_name,
            centre: (t.centre_name || 'Jaipur Main') as any,
            course: (t.course || 'JEE 2027') as any,
            riskLevel: t.risk_level as any,
            riskReasons: t.risk_reasons || [],
            attendancePercent: t.attendance_percent || 75,
            testScoreTrend: (t.test_score_trend || 'Stable') as any,
            outstandingInstalments: 1,
            outstandingAmount: t.outstanding_amount || 0,
            counsellorAssigned: t.counsellor_name,
            status: t.status as any,
            flaggedOn: t.flagged_date || new Date().toISOString().split('T')[0],
          })));
        }
      } catch {
        // Counsellor tasks query not available for this role
      }
      setError(null);
    } catch (err: any) {
      setBackendConnected(false);
      // Only set error if user is actively logged in and attempted a fetch
      if (user) {
        setError(err.message || 'Could not connect to FeeFlow backend.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBackendData();
  }, [user]);

  useEffect(() => { localStorage.setItem(LS_KEYS.students, JSON.stringify(students)); }, [students]);
  useEffect(() => { localStorage.setItem(LS_KEYS.payments, JSON.stringify(payments)); }, [payments]);
  useEffect(() => { localStorage.setItem(LS_KEYS.reminders, JSON.stringify(reminders)); }, [reminders]);
  useEffect(() => { localStorage.setItem(LS_KEYS.risk, JSON.stringify(riskStudents)); }, [riskStudents]);

  const addNotification = (n: Omit<Notification, 'id' | 'time'>) => {
    const notif: Notification = { ...n, id: crypto.randomUUID(), time: new Date() };
    setNotifications(prev => [notif, ...prev].slice(0, 20));
    setTimeout(() => dismissNotification(notif.id), 5000);
  };

  const dismissNotification = (id: string) =>
    setNotifications(prev => prev.filter(n => n.id !== id));

  const clearError = () => setError(null);

  const updateStudent = (updated: Student) =>
    setStudents(prev => prev.map(s => s.id === updated.id ? updated : s));

  // Payment mutation: calls backend FIRST, never assumes success until confirmed
  const addPayment = async (p: Payment): Promise<Payment> => {
    try {
      const resp = await api.recordPayment({
        student_id: p.studentId,
        instalment_id: p.instalmentId,
        amount: p.amount,
        method: p.method,
        reference_no: p.referenceNo,
        notes: p.notes,
      });

      const confirmedPayment: Payment = {
        ...p,
        id: resp.id,
        transactionId: resp.transaction_id,
        status: resp.status,
      };

      setPayments(prev => [confirmedPayment, ...prev]);
      await fetchBackendData();
      return confirmedPayment;
    } catch (err: any) {
      const msg = err.message || 'Payment processing failed';
      addNotification({ type: 'error', title: 'Payment failed', message: msg });
      throw err;
    }
  };

  const updatePayment = async (updated: Payment): Promise<void> => {
    try {
      if (updated.status === 'Under Review') {
        await api.reviewPayment(updated.id);
      } else if (updated.status === 'Rejected') {
        await api.rejectPayment(updated.id);
      } else if (updated.studentId && updated.status === 'Pending') {
        await api.matchPayment(updated.id, updated.studentId, updated.instalmentId);
      }
      setPayments(prev => prev.map(p => p.id === updated.id ? updated : p));
      await fetchBackendData();
    } catch (err: any) {
      const msg = err.message || 'Payment status update failed';
      addNotification({ type: 'error', title: 'Update failed', message: msg });
      throw err;
    }
  };

  const cancelReminder = async (id: string): Promise<void> => {
    try {
      await api.cancelReminder(id);
      setReminders(prev => prev.map(r => r.id === id ? { ...r, status: 'Cancelled' as const } : r));
    } catch (err: any) {
      const msg = err.message || 'Reminder cancellation failed';
      addNotification({ type: 'error', title: 'Action failed', message: msg });
      throw err;
    }
  };

  const sendReminder = async (id: string): Promise<void> => {
    try {
      await api.sendReminder(id);
      setReminders(prev => prev.map(r => r.id === id ? { ...r, status: 'Sent' as const, sentAt: new Date().toISOString() } : r));
    } catch (err: any) {
      const msg = err.message || 'Failed to dispatch reminder';
      addNotification({ type: 'error', title: 'Dispatch failed', message: msg });
      throw err;
    }
  };

  const updateRiskStudent = async (updated: RiskStudent): Promise<void> => {
    try {
      const tasks = await api.getCounsellorTasks();
      const match = tasks.find((t: any) => t.student_id === updated.studentId);
      if (match) {
        if (updated.counsellorAssigned && updated.status === 'In Progress') {
          await api.assignCounsellor(match.id, updated.counsellorAssigned);
        } else {
          await api.updateRiskStatus(match.id, updated.status);
        }
      }
      setRiskStudents(prev => prev.map(r => r.studentId === updated.studentId ? updated : r));
    } catch (err: any) {
      const msg = err.message || 'Failed to update counsellor task';
      addNotification({ type: 'error', title: 'Action failed', message: msg });
      throw err;
    }
  };

  return (
    <AppContext.Provider value={{
      students, payments, reminders, riskStudents,
      selectedCentre, setSelectedCentre,
      loading, backendConnected, error, clearError,
      updateStudent, addPayment, updatePayment,
      cancelReminder, sendReminder, updateRiskStudent,
      notifications, addNotification, dismissNotification,
      refreshData: fetchBackendData,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be inside AppProvider');
  return ctx;
}
