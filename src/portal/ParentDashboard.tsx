import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { api } from '../utils/api';
import type { Receipt, StudentAttendance, TestScoreRecord } from '../types';
import { formatCurrency, formatDate } from '../utils/helpers';
import { Badge, Button, Modal, Card } from '../components/ui';
import { NotificationCenter } from '../components/notifications/NotificationCenter';
import {
  CreditCard, Download, LogOut, CheckCircle, Clock, AlertTriangle,
  RefreshCw, FileText, Calendar, BookOpen, ShieldCheck,
  User, Check, X, Printer, AlertCircle, Smartphone, Building2, QrCode
} from 'lucide-react';

type TabType = 'overview' | 'instalments' | 'receipts' | 'academic' | 'refunds';
type CheckoutStep = 'setup' | 'gateway' | 'processing' | 'result';
type Lang = 'en' | 'hi';

const translations = {
  en: {
    portalTitle: 'FeeFlow Parent',
    connected: 'Verified Live Database',
    connectedSub: 'Data synced live with institute database.',
    reconciled: '100% Reconciled',
    demoMode: 'Offline Demo Mode',
    student: 'Student:',
    balanceDue: 'Total Balance Due',
    nextDueLabel: 'Next Instalment Due:',
    overdue: 'Overdue',
    dueSoon: 'Due Soon',
    dueBy: 'Due by',
    payNow: (amt: string) => `Pay ${amt} Now`,
    payNowButton: 'Pay Now',
    originalInstalment: 'Original Amount',
    paidAmount: 'Amount Paid',
    remainingAmount: 'Remaining Amount',
    viewOfficialReceipt: 'View Receipt',
    payingFor: 'Paying for Student',
    fullBalanceOption: 'Pay Full Remaining Balance',
    partialAmountOption: 'Custom Partial Payment',
    simulatedDisclaimer: 'Simulated Demo Gateway · No Real Money Deducted',
    allPaidTitle: 'All Fees Fully Paid!',
    allPaidDesc: 'There are no outstanding instalments for this academic session.',
    totalFee: 'Total Fee',
    discounts: 'Discounts',
    paidSoFar: 'Paid So Far',
    instalmentsTab: 'Instalments',
    receiptsTab: (count: number) => `Receipts (${count})`,
    academicTab: 'Attendance & Scores',
    refundsTab: (count: number) => `Refunds (${count})`,
    instalmentSchedule: 'Instalment Schedule',
    instalmentScheduleSub: 'Every scheduled instalment with payment tracking',
    officialReceipts: 'Official Tax Receipts',
    officialReceiptsSub: 'Verified payment receipts with statutory GST breakdown',
    viewReceipt: 'View Receipt',
    attendanceOverview: 'Attendance Overview',
    classesPresent: 'Classes Present',
    totalClasses: 'Total Classes',
    academicScores: 'Academic Test Scores',
    requestWithdrawal: 'Request Withdrawal',
    withdrawalHistory: 'Withdrawal & Refund History',
  },
  hi: {
    portalTitle: 'फी-फ्लो अभिभावक पोर्टल',
    connected: 'सत्यापित संस्थान सर्वर',
    connectedSub: 'संस्थान डेटाबेस के साथ डेटा लाइव सिंक है।',
    reconciled: '100% सत्यापित',
    demoMode: 'ऑफ़लाइन डेमो मोड',
    student: 'विद्यार्थी:',
    balanceDue: 'कुल बकाया राशि',
    nextDueLabel: 'अगली देय किस्त:',
    overdue: 'अतिदेय (Overdue)',
    dueSoon: 'शीघ्र देय',
    dueBy: 'अंतिम तिथि',
    payNow: (amt: string) => `अभी ${amt} भुगतान करें`,
    payNowButton: 'अभी भुगतान करें',
    originalInstalment: 'मूल किस्त राशि',
    paidAmount: 'जमा राशि',
    remainingAmount: 'बकाया राशि',
    viewOfficialReceipt: 'रसीद देखें',
    payingFor: 'विद्यार्थी हेतु भुगतान',
    fullBalanceOption: 'पूरी बकाया राशि जमा करें',
    partialAmountOption: 'आंशिक किस्त भुगतान',
    simulatedDisclaimer: 'सिम्युलेटेड डेमो गेटवे · कोई वास्तविक कटौती नहीं',
    allPaidTitle: 'सभी शुल्क पूर्णतः जमा हैं!',
    allPaidDesc: 'इस शैक्षणिक सत्र के लिए कोई बकाया किस्त शेष नहीं है।',
    totalFee: 'कुल कोर्स शुल्क',
    discounts: 'छूट (Discounts)',
    paidSoFar: 'अब तक जमा शुल्क',
    instalmentsTab: 'किस्त विवरण',
    receiptsTab: (count: number) => `रसीदें (${count})`,
    academicTab: 'उपस्थिति एवं अंक',
    refundsTab: (count: number) => `शुल्क वापसी (${count})`,
    instalmentSchedule: 'शुल्क किस्त अनुसूची',
    instalmentScheduleSub: 'प्रत्येक निर्धारित किस्त का भुगतान विवरण',
    officialReceipts: 'अधिकृत शुल्क रसीदें',
    officialReceiptsSub: 'जीएसटी कर विवरण सहित सत्यापित भुगतान रसीदें',
    viewReceipt: 'रसीद देखें',
    attendanceOverview: 'उपस्थिति सारांश',
    classesPresent: 'उपस्थित कक्षाएं',
    totalClasses: 'कुल कक्षाएं',
    academicScores: 'शैक्षणिक टेस्ट परिणाम',
    requestWithdrawal: 'प्रवेश वापसी आवेदन',
    withdrawalHistory: 'प्रवेश वापसी व रिफंड इतिहास',
  }
};

export default function ParentDashboard() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { students: fallbackStudents, refreshData } = useApp();
  const [lang, setLang] = useState<Lang>('en');
  const t = translations[lang];

  // Multi-student support
  const [studentsList, setStudentsList] = useState<any[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [student, setStudent] = useState<any | null>(null);

  // Academic & receipt data
  const [attendance, setAttendance] = useState<StudentAttendance | null>(null);
  const [tests, setTests] = useState<TestScoreRecord[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [refunds, setRefunds] = useState<any[]>([]);

  // Refund Modal State
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [refundWithdrawalDate, setRefundWithdrawalDate] = useState(new Date().toISOString().split('T')[0]);
  const [refundReason, setRefundReason] = useState('');
  const [refundSubmitting, setRefundSubmitting] = useState(false);

  // State
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);

  // Mock Gateway State
  const [checkoutModalOpen, setCheckoutModalOpen] = useState<boolean>(false);
  const [checkoutStep, setCheckoutStep] = useState<CheckoutStep>('setup');
  const [selectedInstalment, setSelectedInstalment] = useState<any | null>(null);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [isCustomAmount, setIsCustomAmount] = useState<boolean>(false);
  const [payMethod, setPayMethod] = useState<string>('UPI');
  const [upiApp, setUpiApp] = useState<'gpay' | 'phonepe' | 'paytm' | 'bhim'>('gpay');
  const [upiId, setUpiId] = useState<string>('parent@upi');
  const [selectedBank, setSelectedBank] = useState<string>('HDFC Bank');
  const [cardNumber, setCardNumber] = useState<string>('4532 8920 1192 8821');
  const [cardExpiry, setCardExpiry] = useState<string>('12/28');
  const [cardCvv, setCardCvv] = useState<string>('892');
  const [activeIntent, setActiveIntent] = useState<any | null>(null);
  const [gatewayStatus, setGatewayStatus] = useState<'success' | 'failed' | 'cancelled' | null>(null);
  const [resultMessage, setResultMessage] = useState<string>('');
  const [createdReceipt, setCreatedReceipt] = useState<any | null>(null);
  const [gatewayProcessing, setGatewayProcessing] = useState<boolean>(false);

  // Receipt Detail View Modal
  const [viewReceipt, setViewReceipt] = useState<any | null>(null);

  const loadDemoFallback = useCallback(() => {
    setIsDemoMode(true);
    const sid = localStorage.getItem('parent_student_id') || 'STU-0412';
    const s = fallbackStudents.find(st => st.id === sid) || fallbackStudents[0];
    if (s) {
      setStudentsList([s]);
      setSelectedStudentId(s.id);
      setStudent(s);
    }
  }, [fallbackStudents]);

  const loadStudentDetails = async (sid: string) => {
    try {
      const [studentRes, attRes, testRes, recRes, refRes] = await Promise.allSettled([
        api.getStudent(sid),
        api.getStudentAttendance(sid),
        api.getStudentTests(sid),
        api.getReceipts(sid),
        api.getStudentRefunds(sid)
      ]);

      if (studentRes.status === 'fulfilled') {
        setStudent(studentRes.value);
      }
      if (attRes.status === 'fulfilled') {
        setAttendance(attRes.value);
      }
      if (testRes.status === 'fulfilled') {
        setTests(testRes.value);
      }
      if (recRes.status === 'fulfilled') {
        setReceipts(recRes.value);
      }
      if (refRes.status === 'fulfilled' && Array.isArray(refRes.value)) {
        setRefunds(refRes.value);
      }
    } catch (e: any) {
      console.error('Error fetching student sub-records:', e);
    }
  };

  const loadParentData = useCallback(async () => {
    setLoading(true);
    setApiError(null);
    try {
      const res = await api.getStudents();
      if (res && res.length > 0) {
        setStudentsList(res);
        setIsDemoMode(false);
        const currentSid = selectedStudentId || localStorage.getItem('parent_student_id') || res[0].id;
        const current = res.find((s: any) => s.id === currentSid) || res[0];
        setSelectedStudentId(current.id);
        setStudent(current);
        await loadStudentDetails(current.id);
      } else {
        loadDemoFallback();
      }
    } catch (err: any) {
      console.warn('Backend fetch failed, using demo fallback:', err.message);
      loadDemoFallback();
    } finally {
      setLoading(false);
    }
  }, [selectedStudentId, loadDemoFallback]);

  useEffect(() => {
    loadParentData();
  }, [loadParentData]);

  const handleStudentSwitch = async (sid: string) => {
    setSelectedStudentId(sid);
    localStorage.setItem('parent_student_id', sid);
    const target = studentsList.find(s => s.id === sid);
    if (target) {
      setStudent(target);
      await loadStudentDetails(sid);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    if (student) {
      await loadStudentDetails(student.id);
    }
    await refreshData();
    setRefreshing(false);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleInitiatePay = (ins: any) => {
    const due = ins.amount - (ins.paid_amount ?? ins.paid ?? 0);
    if (due <= 0) return;
    setSelectedInstalment(ins);
    setPayAmount(due);
    setIsCustomAmount(false);
    setPayMethod('UPI');
    setCheckoutStep('setup');
    setCheckoutModalOpen(true);
    setGatewayStatus(null);
    setResultMessage('');
    setCreatedReceipt(null);
    setApiError(null);
  };

  const handleOpenReceiptForInstalment = (ins: any) => {
    let rec: any = receipts.find((r: any) =>
      (ins.receipt_no && (r.receipt_no === ins.receipt_no || r.receiptNo === ins.receipt_no)) ||
      (ins.id && (r.instalment_id === ins.id || r.instalmentId === ins.id)) ||
      (r.instalment_number === (ins.instalment_number || ins.number))
    );

    if (!rec) {
      const paidAmt = ins.paid_amount ?? ins.paid ?? ins.amount;
      const baseAmt = Math.round((paidAmt / 1.18) * 100) / 100;
      const gstAmt = Math.round((paidAmt - baseAmt) * 100) / 100;
      rec = {
        id: 999999,
        receipt_no: ins.receipt_no || `REC-2026-${String(ins.id || '0000').slice(-6).toUpperCase()}`,
        student_id: student?.id,
        student_name: student?.name,
        parent_name: student?.parent_name,
        parent_phone: student?.parent_phone,
        instalment_number: ins.instalment_number || ins.number,
        date: ins.paid_date || ins.paidDate || new Date().toISOString().split('T')[0],
        base_amount: baseAmt,
        cgst_amount: Math.round((gstAmt / 2) * 100) / 100,
        sgst_amount: Math.round((gstAmt / 2) * 100) / 100,
        total_amount: paidAmt,
        payment_method: 'Online (Simulated UPI)',
        gst_number: '08AAACP1234F1Z5',
        centre_name: student?.centre_name || 'Jaipur Main'
      };
    }
    setViewReceipt(rec);
  };

  const handleCreateIntent = async () => {
    if (!student || !selectedInstalment) return;
    const remainingDue = selectedInstalment.amount - (selectedInstalment.paid_amount ?? selectedInstalment.paid ?? 0);
    if (payAmount <= 0) {
      setApiError('Please enter a payment amount greater than zero.');
      return;
    }
    if (payAmount > remainingDue) {
      setApiError(`Payment amount (₹${payAmount.toLocaleString('en-IN')}) cannot exceed remaining balance (₹${remainingDue.toLocaleString('en-IN')}).`);
      return;
    }
    setCheckoutStep('processing');
    try {
      const intentRes = await api.createPaymentIntent({
        student_id: student.id,
        instalment_id: selectedInstalment.id,
        amount: payAmount,
        method: payMethod,
      });
      setActiveIntent(intentRes);
      setCheckoutStep('gateway');
    } catch (err: any) {
      setCheckoutStep('setup');
      setApiError(err.message || 'Failed to initialize payment gateway.');
    }
  };

  const handleSimulatePayment = async (statusChoice: 'success' | 'failed' | 'cancelled') => {
    if (!activeIntent) return;
    setGatewayProcessing(true);
    try {
      const paymentRef = `pay_mock_${Date.now()}`;
      const verifyRes = await api.verifyPayment({
        order_id: activeIntent.order_id,
        payment_id: paymentRef,
        signature: activeIntent.signature,
        simulation_status: statusChoice,
      });

      setGatewayStatus(statusChoice);
      setResultMessage(verifyRes.message);

      if (statusChoice === 'success') {
        setCreatedReceipt(verifyRes.receipt);
        await loadStudentDetails(student.id);
        await refreshData();
      }
      setCheckoutStep('result');
    } catch (err: any) {
      setGatewayStatus('failed');
      setResultMessage(err.message || 'Payment verification failed on backend.');
      setCheckoutStep('result');
    } finally {
      setGatewayProcessing(false);
    }
  };

  const handleParentRefundSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!student || !refundWithdrawalDate || !refundReason.trim()) return;
    setRefundSubmitting(true);
    try {
      await api.submitRefundRequest({
        student_id: student.id,
        course_start_date: student.enrollment_date || '2026-04-01',
        course_end_date: '2027-03-31',
        withdrawal_date: refundWithdrawalDate,
        withdrawal_reason: refundReason.trim(),
        policy_confirmed: true,
      });
      setRefundModalOpen(false);
      setRefundReason('');
      await loadStudentDetails(student.id);
    } catch (err: any) {
      alert(err.message || 'Failed to submit refund request');
    } finally {
      setRefundSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#929DB4] flex items-center justify-center p-4">
        <div className="bg-[#EEF0F1] p-8 rounded-3xl shadow-xl flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-[#20283A] animate-spin" />
          <p className="text-sm font-semibold text-[#20283A]">Connecting to FeeFlow Parent Portal…</p>
          <p className="text-xs text-[#718096]">Retrieving student fee schedule and attendance</p>
        </div>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="min-h-screen bg-[#929DB4] flex items-center justify-center p-4">
        <div className="bg-[#EEF0F1] p-8 rounded-3xl shadow-xl max-w-sm text-center">
          <AlertCircle className="w-12 h-12 text-[#E95435] mx-auto mb-3" />
          <h2 className="text-lg font-bold text-[#20283A]">No Student Records Found</h2>
          <p className="text-xs text-[#718096] mt-1">
            No enrolled students are linked to this phone number ({user?.id || 'N/A'}).
          </p>
          <Button className="mt-5 w-full bg-[#20283A] text-white" onClick={handleLogout}>Log In with Another Account</Button>
        </div>
      </div>
    );
  }

  const instalments: any[] = student.instalments || [];
  const nextDue = instalments.find((i: any) => i.status !== 'Paid');
  const nextDueAmount = nextDue ? (nextDue.amount - (nextDue.paid_amount ?? nextDue.paid ?? 0)) : 0;
  const isOverdue = nextDue?.status === 'Overdue';

  return (
    <div className="min-h-screen bg-[#929DB4] py-3 sm:py-6 px-2 sm:px-4">
      {/* Centered Mobile-First Application Workspace */}
      <div className="max-w-2xl mx-auto bg-[#EEF0F1] sm:rounded-3xl border border-[#E3E6E9] shadow-xl overflow-hidden min-h-[92vh] flex flex-col">
        {/* Polished Header */}
        <header className="bg-white border-b border-[#E3E6E9] px-4 py-3 sticky top-0 z-20 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#20283A] flex items-center justify-center shadow-xs">
                <span className="w-2.5 h-2.5 rounded-full bg-[#E95435]" />
              </div>
              <div>
                <span className="font-bold text-[#20283A] text-sm tracking-tight leading-tight block">{t.portalTitle}</span>
                <span className="text-[10px] text-[#718096] block font-medium">
                  {isDemoMode ? t.demoMode : t.connected}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Language Switcher */}
              <button
                onClick={() => setLang(l => l === 'en' ? 'hi' : 'en')}
                className="px-2 py-1 text-xs font-bold rounded-xl border border-[#E3E6E9] text-[#20283A] hover:bg-slate-50 transition-colors flex items-center gap-1"
                title="Switch Language / भाषा बदलें"
              >
                <span className={lang === 'en' ? 'text-[#E95435] font-extrabold' : 'text-[#718096]'}>EN</span>
                <span className="text-slate-300">|</span>
                <span className={lang === 'hi' ? 'text-[#E95435] font-extrabold' : 'text-[#718096]'}>हिं</span>
              </button>

              <NotificationCenter align="right" />
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="p-1.5 text-[#718096] hover:text-[#20283A] hover:bg-slate-100 rounded-xl transition-colors"
                title="Refresh"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-[#E95435]' : ''}`} />
              </button>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1 text-xs text-[#718096] hover:text-[#BA2525] hover:bg-slate-100 px-2 py-1.5 rounded-xl transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <main className="p-4 sm:p-5 space-y-4 flex-1">
          {/* Status Indicator */}
          {isDemoMode ? (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-3.5 py-2 flex items-center gap-2 text-xs text-amber-800">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span><strong>Offline Demo Mode:</strong> Backend server unreachable. Displaying pre-cached demo state.</span>
            </div>
          ) : (
            <div className="bg-white border border-[#E3E6E9] rounded-2xl px-3.5 py-2 flex items-center justify-between text-xs text-[#20283A] shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-medium text-[#20283A]">Official Student Portal & Fee Schedule</span>
              </div>
              <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">100% Reconciled</span>
            </div>
          )}

          {/* Multi-Student Switcher */}
          {studentsList.length > 1 && (
            <div className="bg-white border border-[#E3E6E9] rounded-2xl p-2 flex items-center gap-2 overflow-x-auto shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
              <User className="w-4 h-4 text-[#718096] flex-shrink-0 ml-1.5" />
              <span className="text-xs text-[#718096] font-medium whitespace-nowrap">{t.student}</span>
              {studentsList.map(s => (
                <button
                  key={s.id}
                  onClick={() => handleStudentSwitch(s.id)}
                  className={`px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                    s.id === selectedStudentId
                      ? 'bg-[#20283A] text-white shadow-xs'
                      : 'bg-slate-50 text-[#718096] hover:bg-slate-100 hover:text-[#20283A]'
                  }`}
                >
                  {s.name} ({s.id})
                </button>
              ))}
            </div>
          )}

          {/* ─── 5-SECOND HERO CARD (TWISTY DESIGN) ─── */}
          <section className="bg-white rounded-3xl p-5 border border-[#E3E6E9] shadow-[0_1px_3px_rgba(0,0,0,0.03)] space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-[#20283A] border border-[#E3E6E9]">
                  {student.course} · {student.batch} Batch
                </span>
                <h1 className="text-xl font-bold text-[#20283A] mt-2 tracking-tight">{student.name}</h1>
                <p className="text-xs text-[#718096] mt-0.5">
                  Roll No: {student.roll_number || student.rollNumber || 'N/A'} · Centre: {student.centre_name || student.centre || 'Jaipur Main'}
                </p>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-[#718096] uppercase font-semibold block">{t.balanceDue}</span>
                <span className="text-xl font-black text-[#20283A] block tabular-nums">
                  {formatCurrency(student.outstanding_amount ?? student.outstanding ?? 0)}
                </span>
              </div>
            </div>

            <div className="pt-3 border-t border-[#E3E6E9]">
              {nextDue ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/75 p-3.5 rounded-2xl border border-[#E3E6E9]">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#718096] font-medium">{t.nextDueLabel}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                        isOverdue ? 'bg-rose-50 text-[#BA2525] border-rose-200' : 'bg-amber-50 text-amber-800 border-amber-200'
                      }`}>
                        {isOverdue ? t.overdue : t.dueSoon}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-2xl font-black text-[#20283A] tabular-nums">{formatCurrency(nextDueAmount)}</span>
                      <span className="text-xs text-[#718096]">
                        {t.dueBy} {formatDate(nextDue.due_date || nextDue.dueDate)}
                      </span>
                    </div>
                  </div>

                  <Button
                    onClick={() => handleInitiatePay(nextDue)}
                    className="bg-[#E95435] hover:bg-[#D84527] text-white font-bold px-6 py-2.5 rounded-xl shadow-xs flex items-center justify-center gap-2 transition-all active:scale-98"
                  >
                    <CreditCard className="w-4 h-4" />
                    <span>{t.payNow(formatCurrency(nextDueAmount))}</span>
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-3 p-3 bg-emerald-50 rounded-2xl border border-emerald-200">
                  <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700">
                    <CheckCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-emerald-900 text-xs">{t.allPaidTitle}</p>
                    <p className="text-[11px] text-emerald-700">{t.allPaidDesc}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Metrics Strip */}
            <div className="grid grid-cols-3 gap-2 pt-3 border-t border-[#E3E6E9] text-center text-xs">
              <div>
                <span className="text-[#718096] text-[10px] uppercase font-semibold block">{t.totalFee}</span>
                <span className="font-bold text-[#20283A] text-sm tabular-nums">{formatCurrency(student.total_fee ?? student.totalFee ?? 0)}</span>
              </div>
              <div>
                <span className="text-[#718096] text-[10px] uppercase font-semibold block">{t.discounts}</span>
                <span className="font-bold text-emerald-700 text-sm tabular-nums">{formatCurrency(student.total_discount ?? 0)}</span>
              </div>
              <div>
                <span className="text-[#718096] text-[10px] uppercase font-semibold block">{t.paidSoFar}</span>
                <span className="font-bold text-emerald-700 text-sm tabular-nums">{formatCurrency(student.amount_paid ?? student.amountPaid ?? 0)}</span>
              </div>
            </div>
          </section>

          {/* Tab Navigation */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 text-xs font-semibold">
            {[
              { id: 'overview', label: t.instalmentsTab },
              { id: 'receipts', label: t.receiptsTab(receipts.length) },
              { id: 'academic', label: t.academicTab },
              { id: 'refunds', label: t.refundsTab(refunds.length) },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold text-center transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-[#20283A] text-white shadow-xs'
                    : 'bg-white text-[#718096] border border-[#E3E6E9] hover:bg-slate-50 hover:text-[#20283A]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab 1: Instalments Breakdown */}
          {activeTab === 'overview' && (
            <Card className="rounded-2xl border border-[#E3E6E9] bg-white overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.03)] divide-y divide-[#E3E6E9]">
              <div className="p-4 bg-slate-50/75 border-b border-[#E3E6E9] flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[#20283A]">{t.instalmentSchedule}</h3>
                  <p className="text-xs text-[#718096]">{t.instalmentScheduleSub}</p>
                </div>
                <span className="text-xs text-[#718096] font-medium">{instalments.length} Instalments</span>
              </div>

              {instalments.map((ins: any) => {
                const paid = ins.paid_amount ?? ins.paid ?? 0;
                const due = ins.amount - paid;
                const status = ins.status;
                const isPaid = status === 'Paid';

                return (
                  <div key={ins.id} className="p-4 hover:bg-slate-50/60 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${
                          isPaid ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' :
                          status === 'Overdue' ? 'bg-rose-50 text-[#BA2525] border border-rose-200' :
                          status === 'Partially Paid' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                          'bg-slate-100 text-[#718096] border border-[#E3E6E9]'
                        }`}>
                          {isPaid ? <CheckCircle className="w-4 h-4" /> :
                           status === 'Overdue' ? <AlertTriangle className="w-4 h-4" /> :
                           <Clock className="w-4 h-4" />}
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-bold text-[#20283A]">
                              Instalment {ins.instalment_number || ins.number}
                            </p>
                            <Badge status={status} />
                          </div>
                          <p className="text-xs text-[#718096]">
                            Student: <strong className="text-[#20283A]">{student.name}</strong> ({student.id})
                          </p>
                          <p className="text-xs text-[#718096]">
                            Due Date: <strong className="text-[#20283A]">{formatDate(ins.due_date || ins.dueDate)}</strong>
                            {!isPaid && (() => {
                              const dDate = new Date(ins.due_date || ins.dueDate);
                              const tDate = new Date();
                              tDate.setHours(0, 0, 0, 0);
                              dDate.setHours(0, 0, 0, 0);
                              const diffDays = Math.round((dDate.getTime() - tDate.getTime()) / (1000 * 3600 * 24));
                              if (diffDays < 0 || ins.overdue_days > 0) {
                                const ov = Math.max(ins.overdue_days || 0, Math.abs(diffDays));
                                return <span className="text-[#BA2525] ml-1.5 font-bold">({ov} days overdue)</span>;
                              } else if (diffDays === 0) {
                                return <span className="text-amber-800 ml-1.5 font-bold bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded">Due Today</span>;
                              } else {
                                return <span className="text-[#79A9D1] ml-1.5 font-medium">({diffDays} days remaining)</span>;
                              }
                            })()}
                          </p>
                          {isPaid && ins.paid_date && (
                            <p className="text-xs text-emerald-700 font-medium">
                              Paid on {formatDate(ins.paid_date || ins.paidDate)} {ins.receipt_no ? `· Receipt: ${ins.receipt_no}` : ''}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] text-[#718096] uppercase font-semibold block">Total Instalment</span>
                        <p className="text-sm font-bold text-[#20283A] tabular-nums">{formatCurrency(ins.amount)}</p>
                        {paid > 0 && !isPaid && (
                          <p className="text-xs text-emerald-700 font-medium tabular-nums mt-0.5">Paid: {formatCurrency(paid)}</p>
                        )}
                        {!isPaid && (
                          <p className="text-xs text-[#E95435] font-bold tabular-nums mt-0.5">Due: {formatCurrency(due)}</p>
                        )}
                      </div>
                    </div>

                    <div className="mt-3.5 flex items-center justify-between gap-2 pt-2.5 border-t border-[#E3E6E9]">
                      <div className="text-[11px] text-[#718096]">
                        {!isPaid ? (
                          <span>Payable balance: <strong className="text-[#20283A] tabular-nums">{formatCurrency(due)}</strong></span>
                        ) : (
                          <span className="text-emerald-700 font-medium flex items-center gap-1">
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" /> Settled in full
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {isPaid ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenReceiptForInstalment(ins)}
                            className="text-xs font-semibold text-emerald-800 border-emerald-300 hover:bg-emerald-50 rounded-xl flex items-center gap-1.5"
                          >
                            <FileText className="w-3.5 h-3.5 text-emerald-600" />
                            View Receipt
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => handleInitiatePay(ins)}
                            className="bg-[#E95435] hover:bg-[#D84527] text-white font-bold text-xs px-4 py-2 rounded-xl shadow-xs flex items-center gap-1.5 transition-all active:scale-98"
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                            Pay Now ({formatCurrency(due)})
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </Card>
          )}

          {/* Tab 2: Receipts & History */}
          {activeTab === 'receipts' && (
            <Card className="rounded-2xl border border-[#E3E6E9] bg-white overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.03)] divide-y divide-[#E3E6E9]">
              <div className="p-4 bg-slate-50/75 border-b border-[#E3E6E9] flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[#20283A]">{t.officialReceipts}</h3>
                  <p className="text-xs text-[#718096]">{t.officialReceiptsSub}</p>
                </div>
                <span className="text-xs text-[#718096] font-medium">{receipts.length} Issued</span>
              </div>

              {receipts.length === 0 ? (
                <div className="p-8 text-center text-[#718096] text-xs">
                  No receipts generated yet. Receipts will appear here once an instalment payment is confirmed.
                </div>
              ) : (
                receipts.map((rec: any) => (
                  <div key={rec.id} className="p-4 flex items-center justify-between gap-3 hover:bg-slate-50/60 transition-colors">
                    <div>
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-[#79A9D1]" />
                        <p className="text-sm font-bold text-[#20283A]">{rec.receipt_no || rec.receiptNo}</p>
                      </div>
                      <p className="text-xs text-[#718096] mt-1">
                        Date: {formatDate(rec.date)} · Total: <strong className="text-[#20283A]">{formatCurrency(rec.total_amount || rec.totalAmount)}</strong>
                      </p>
                      <p className="text-[11px] text-[#718096] mt-0.5">
                        Base: {formatCurrency(rec.base_amount || rec.baseAmount)} + 18% GST ({formatCurrency((rec.cgst_amount || rec.cgstAmount) + (rec.sgst_amount || rec.sgstAmount))})
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setViewReceipt(rec)}
                        className="text-xs flex items-center gap-1 text-[#20283A] border-[#E3E6E9] hover:bg-slate-50"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        {t.viewReceipt}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </Card>
          )}

          {/* Tab 3: Attendance & Academic Scores */}
          {activeTab === 'academic' && (
            <div className="space-y-4">
              {/* Attendance Card */}
              <Card className="rounded-2xl border border-[#E3E6E9] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
                <div className="flex items-center justify-between mb-3.5">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-[#79A9D1]" />
                    <h3 className="text-sm font-bold text-[#20283A]">{t.attendanceOverview}</h3>
                  </div>
                  {attendance && (
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                      attendance.attendance_rate_percent >= 80 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-[#BA2525] border-rose-200'
                    }`}>
                      {attendance.attendance_rate_percent}% Attendance
                    </span>
                  )}
                </div>

                {attendance ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3 text-center">
                      <div className="bg-slate-50/75 rounded-xl p-3 border border-[#E3E6E9]">
                        <span className="text-[11px] text-[#718096] block">{t.classesPresent}</span>
                        <span className="text-base font-bold text-[#20283A]">{attendance.present_count}</span>
                      </div>
                      <div className="bg-slate-50/75 rounded-xl p-3 border border-[#E3E6E9]">
                        <span className="text-[11px] text-[#718096] block">{t.totalClasses}</span>
                        <span className="text-base font-bold text-[#20283A]">{attendance.total_classes}</span>
                      </div>
                    </div>

                    {attendance.records && attendance.records.length > 0 && (
                      <div className="border border-[#E3E6E9] rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50/75 border-b border-[#E3E6E9] text-[#718096] font-semibold">
                            <tr>
                              <th className="px-3 py-2">Date</th>
                              <th className="px-3 py-2">Batch</th>
                              <th className="px-3 py-2 text-right">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#E3E6E9]">
                            {attendance.records.slice(0, 10).map((r, i) => (
                              <tr key={i} className="hover:bg-slate-50/60">
                                <td className="px-3 py-2 font-medium text-[#20283A]">{formatDate(r.date)}</td>
                                <td className="px-3 py-2 text-[#718096]">{r.batch}</td>
                                <td className="px-3 py-2 text-right">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                    r.status === 'Present' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-[#BA2525] border-rose-200'
                                  }`}>
                                    {r.status}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-[#718096]">Loading attendance data…</p>
                )}
              </Card>

              {/* Test Scores Card */}
              <Card className="rounded-2xl border border-[#E3E6E9] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
                <div className="flex items-center justify-between mb-3.5">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-[#79A9D1]" />
                    <h3 className="text-sm font-bold text-[#20283A]">{t.academicScores}</h3>
                  </div>
                  <span className="text-xs text-[#718096] font-medium">{tests.length} Tests Recorded</span>
                </div>

                {tests.length === 0 ? (
                  <p className="text-xs text-[#718096] py-3 text-center">No test evaluations on record yet.</p>
                ) : (
                  <div className="space-y-2">
                    {tests.map(testItem => (
                      <div key={testItem.id} className="p-3 border border-[#E3E6E9] rounded-xl flex items-center justify-between hover:bg-slate-50/60 transition-colors">
                        <div>
                          <p className="text-xs font-bold text-[#20283A]">{testItem.test_name}</p>
                          <p className="text-[11px] text-[#718096]">{testItem.subject} · {formatDate(testItem.test_date)}</p>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-bold text-[#20283A]">{testItem.marks_obtained} / {testItem.max_marks}</span>
                          <span className={`block text-[11px] font-semibold ${
                            testItem.percentage >= 75 ? 'text-emerald-600' : testItem.percentage >= 50 ? 'text-amber-600' : 'text-[#BA2525]'
                          }`}>
                            {testItem.percentage}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          )}

          {/* Tab 4: Refunds & Statutory Policy */}
          {activeTab === 'refunds' && (
            <div className="space-y-4">
              {/* Policy Info Card */}
              <Card className="rounded-2xl border border-[#E3E6E9] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
                <div className="flex items-center gap-2 mb-2 text-[#20283A] font-bold text-sm">
                  <ShieldCheck className="w-5 h-5 text-emerald-600" />
                  <span>Published Institute Refund Policy (REFUND_STD_POLICY_2026 v2026.1)</span>
                </div>
                <p className="text-xs text-[#718096] leading-relaxed">
                  Under statutory coaching regulations, students who submit a formal notice of withdrawal within the first 10 days of commencement are eligible for a pro-rata refund of paid fees minus a standard 5% processing fee and educational material/kit charges.
                </p>
                <div className="mt-3.5 p-3 bg-slate-50 border border-[#E3E6E9] rounded-xl text-[11px] text-[#20283A] flex items-center justify-between gap-3">
                  <div>
                    <span className="font-bold block">10-Day Statutory Refund Processing Window</span>
                    <span className="text-[#718096]">All eligible approved refunds are processed within 10 days of verified withdrawal.</span>
                  </div>
                  <Button size="sm" onClick={() => setRefundModalOpen(true)} className="bg-[#E95435] hover:bg-[#D84527] text-white text-xs whitespace-nowrap">
                    {t.requestWithdrawal}
                  </Button>
                </div>
              </Card>

              {/* Refund Requests List */}
              <Card className="rounded-2xl border border-[#E3E6E9] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
                <h3 className="text-sm font-bold text-[#20283A] mb-3">{t.withdrawalHistory}</h3>

                {refunds.length === 0 ? (
                  <div className="text-center py-8 text-[#718096] text-xs">
                    <p>No withdrawal or refund requests on record for this student.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {refunds.map(r => (
                      <div key={r.id} className="p-3.5 border border-[#E3E6E9] rounded-xl hover:bg-slate-50/60 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-xs font-bold text-[#20283A]">Request #{r.id}</span>
                            <span className="text-[11px] text-[#718096] block">Submitted: {formatDate(r.created_at)}</span>
                          </div>
                          <Badge status={r.status} />
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50/75 p-2.5 rounded-lg border border-[#E3E6E9]">
                          <div>
                            <span className="text-[#718096] block text-[10px]">Withdrawal Date:</span>
                            <span className="font-semibold text-[#20283A]">{formatDate(r.withdrawal_date)}</span>
                          </div>
                          <div>
                            <span className="text-[#718096] block text-[10px]">Processing Deadline:</span>
                            <span className="font-semibold text-[#20283A]">{formatDate(r.processing_deadline)}</span>
                          </div>
                          <div>
                            <span className="text-[#718096] block text-[10px]">Calculated Refund:</span>
                            <span className="font-bold text-emerald-700">{formatCurrency(r.estimated_refund)}</span>
                          </div>
                          <div>
                            <span className="text-[#718096] block text-[10px]">Approved Amount:</span>
                            <span className="font-bold text-[#20283A]">
                              {r.approved_refund ? formatCurrency(r.approved_refund) : 'Pending Review'}
                            </span>
                          </div>
                        </div>

                        {r.withdrawal_reason && (
                          <p className="text-[11px] text-[#718096] italic">Reason: "{r.withdrawal_reason}"</p>
                        )}

                        {r.payout_reference && (
                          <div className="p-2 bg-emerald-50 rounded-lg border border-emerald-200 text-[11px] text-emerald-900">
                            <span className="font-bold">Payout Reference:</span> <span className="font-mono">{r.payout_reference}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          )}
        </main>
      </div>

      {/* ─── MODAL 1: SIMULATED PAYMENT GATEWAY (REALISTIC FLOW) ─── */}
      <Modal
        open={checkoutModalOpen}
        onClose={() => {
          if (!gatewayProcessing) setCheckoutModalOpen(false);
        }}
        title="Fee Payment Gateway"
        size="md"
      >
        {checkoutStep === 'setup' && selectedInstalment && (() => {
          const remainingDue = selectedInstalment.amount - (selectedInstalment.paid_amount ?? selectedInstalment.paid ?? 0);
          const baseComponent = Math.round((payAmount / 1.18) * 100) / 100;
          const gstComponent = Math.round((payAmount - baseComponent) * 100) / 100;
          const isOverLimit = payAmount > remainingDue || payAmount <= 0;

          return (
            <div className="p-5 space-y-4">
              {/* Simulated Demo Disclaimer Banner */}
              <div className="bg-amber-50 text-amber-900 border border-amber-200 px-3.5 py-2 rounded-xl text-xs flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-700 flex-shrink-0" />
                <span className="font-semibold">{t.simulatedDisclaimer}</span>
              </div>

              {/* Student & Instalment Details Card */}
              <div className="bg-slate-50/80 border border-[#E3E6E9] rounded-2xl p-4 space-y-2.5">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] text-[#718096] uppercase font-bold tracking-wider block">Student Details</span>
                    <p className="text-sm font-extrabold text-[#20283A] mt-0.5">{student.name}</p>
                    <p className="text-xs text-[#718096]">ID: <span className="font-mono font-semibold text-[#20283A]">{student.id}</span> · {student.course} ({student.batch})</p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-[#718096] uppercase font-bold tracking-wider block">Instalment</span>
                    <p className="text-sm font-bold text-[#20283A]">#{selectedInstalment.instalment_number || selectedInstalment.number}</p>
                    <p className="text-xs text-[#718096]">Due: {formatDate(selectedInstalment.due_date || selectedInstalment.dueDate)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2.5 border-t border-[#E3E6E9] text-center text-xs">
                  <div>
                    <span className="text-[#718096] text-[10px] uppercase font-semibold block">{t.originalInstalment}</span>
                    <span className="font-bold text-[#20283A] tabular-nums">{formatCurrency(selectedInstalment.amount)}</span>
                  </div>
                  <div>
                    <span className="text-[#718096] text-[10px] uppercase font-semibold block">{t.paidAmount}</span>
                    <span className="font-bold text-emerald-700 tabular-nums">{formatCurrency(selectedInstalment.paid_amount ?? selectedInstalment.paid ?? 0)}</span>
                  </div>
                  <div>
                    <span className="text-[#718096] text-[10px] uppercase font-semibold block">{t.remainingAmount}</span>
                    <span className="font-bold text-[#E95435] tabular-nums">{formatCurrency(remainingDue)}</span>
                  </div>
                </div>
              </div>

              {/* Payment Amount Selection */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-[#20283A] block">Payment Option</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomAmount(false);
                      setPayAmount(remainingDue);
                      setApiError(null);
                    }}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      !isCustomAmount ? 'border-[#20283A] bg-slate-50 text-[#20283A] font-bold shadow-xs' : 'border-[#E3E6E9] text-[#718096] hover:bg-slate-50'
                    }`}
                  >
                    <span className="text-xs block">{t.fullBalanceOption}</span>
                    <span className="text-sm font-extrabold block mt-0.5 text-[#20283A] tabular-nums">
                      {formatCurrency(remainingDue)}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomAmount(true);
                      setApiError(null);
                    }}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      isCustomAmount ? 'border-[#20283A] bg-slate-50 text-[#20283A] font-bold shadow-xs' : 'border-[#E3E6E9] text-[#718096] hover:bg-slate-50'
                    }`}
                  >
                    <span className="text-xs block">{t.partialAmountOption}</span>
                    <span className="text-xs text-[#718096] block mt-0.5">Custom partial dues</span>
                  </button>
                </div>

                {isCustomAmount && (
                  <div className="mt-2 bg-slate-50/75 p-3 rounded-xl border border-[#E3E6E9] space-y-1.5">
                    <label className="text-xs font-semibold text-[#20283A] block">Enter Custom Amount (₹):</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-sm font-bold text-[#718096]">₹</span>
                      <input
                        type="number"
                        min="1"
                        max={remainingDue}
                        value={payAmount || ''}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setPayAmount(val);
                          if (val > remainingDue) {
                            setApiError(`Amount cannot exceed remaining balance (${formatCurrency(remainingDue)})`);
                          } else if (val <= 0) {
                            setApiError('Please enter an amount greater than zero');
                          } else {
                            setApiError(null);
                          }
                        }}
                        className="w-full pl-7 pr-3 py-2 border border-[#E3E6E9] rounded-xl text-sm font-bold text-[#20283A] focus:ring-2 focus:ring-[#20283A] focus:outline-none bg-white"
                        placeholder="Enter amount"
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-[#718096]">
                      <span>Max allowed: <strong className="text-[#20283A]">{formatCurrency(remainingDue)}</strong></span>
                      {payAmount > remainingDue && <span className="text-[#BA2525] font-bold">Exceeds balance!</span>}
                    </div>
                  </div>
                )}
              </div>

              {/* Payment Modes (UPI Prominently First) */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-[#20283A] block">Select Payment Mode</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setPayMethod('UPI')}
                    className={`py-2 px-3 text-xs rounded-xl border font-bold text-center flex items-center justify-center gap-1.5 transition-all ${
                      payMethod === 'UPI' ? 'border-[#20283A] bg-[#20283A] text-white shadow-xs' : 'border-[#E3E6E9] text-[#718096] hover:bg-slate-50'
                    }`}
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>UPI (Instant)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPayMethod('Card')}
                    className={`py-2 px-3 text-xs rounded-xl border font-bold text-center flex items-center justify-center gap-1.5 transition-all ${
                      payMethod === 'Card' ? 'border-[#20283A] bg-[#20283A] text-white shadow-xs' : 'border-[#E3E6E9] text-[#718096] hover:bg-slate-50'
                    }`}
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>Card</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPayMethod('Net Banking')}
                    className={`py-2 px-3 text-xs rounded-xl border font-bold text-center flex items-center justify-center gap-1.5 transition-all ${
                      payMethod === 'Net Banking' ? 'border-[#20283A] bg-[#20283A] text-white shadow-xs' : 'border-[#E3E6E9] text-[#718096] hover:bg-slate-50'
                    }`}
                  >
                    <Building2 className="w-3.5 h-3.5" />
                    <span>Net Banking</span>
                  </button>
                </div>

                {/* Sub-options for UPI */}
                {payMethod === 'UPI' && (
                  <div className="bg-slate-50/80 p-3 rounded-xl border border-[#E3E6E9] space-y-2.5 mt-2">
                    <span className="text-[11px] font-bold text-[#20283A] block">Popular UPI Apps (Zero Extra Charges)</span>
                    <div className="grid grid-cols-4 gap-1.5 text-[11px]">
                      {[
                        { id: 'gpay', name: 'Google Pay' },
                        { id: 'phonepe', name: 'PhonePe' },
                        { id: 'paytm', name: 'Paytm' },
                        { id: 'bhim', name: 'BHIM UPI' },
                      ].map(app => (
                        <button
                          key={app.id}
                          type="button"
                          onClick={() => setUpiApp(app.id as any)}
                          className={`p-2 rounded-lg border text-center font-medium transition-all ${
                            upiApp === app.id
                              ? 'border-[#20283A] bg-white text-[#20283A] font-bold shadow-xs'
                              : 'border-[#E3E6E9] bg-white/70 text-[#718096] hover:border-slate-300'
                          }`}
                        >
                          {app.name}
                        </button>
                      ))}
                    </div>

                    <div className="pt-2 border-t border-[#E3E6E9]">
                      <label className="text-[11px] text-[#718096] block mb-1">UPI ID / VPA handle:</label>
                      <input
                        type="text"
                        value={upiId}
                        onChange={(e) => setUpiId(e.target.value)}
                        placeholder="parent@okhdfcbank"
                        className="w-full px-3 py-1.5 border border-[#E3E6E9] rounded-lg text-xs font-mono text-[#20283A] bg-white focus:outline-none focus:ring-1 focus:ring-[#20283A]"
                      />
                    </div>
                  </div>
                )}

                {/* Sub-options for Card */}
                {payMethod === 'Card' && (
                  <div className="bg-slate-50/80 p-3 rounded-xl border border-[#E3E6E9] space-y-2 mt-2 text-xs">
                    <div>
                      <label className="text-[11px] text-[#718096] block mb-0.5">Card Number (Mock):</label>
                      <input
                        type="text"
                        value={cardNumber}
                        onChange={(e) => setCardNumber(e.target.value)}
                        className="w-full px-3 py-1.5 border border-[#E3E6E9] rounded-lg text-xs font-mono text-[#20283A] bg-white focus:outline-none"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] text-[#718096] block mb-0.5">Valid Thru (MM/YY):</label>
                        <input
                          type="text"
                          value={cardExpiry}
                          onChange={(e) => setCardExpiry(e.target.value)}
                          className="w-full px-3 py-1.5 border border-[#E3E6E9] rounded-lg text-xs font-mono text-[#20283A] bg-white focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-[#718096] block mb-0.5">CVV:</label>
                        <input
                          type="password"
                          value={cardCvv}
                          onChange={(e) => setCardCvv(e.target.value)}
                          maxLength={3}
                          className="w-full px-3 py-1.5 border border-[#E3E6E9] rounded-lg text-xs font-mono text-[#20283A] bg-white focus:outline-none"
                        />
                      </div>
                    </div>
                    <span className="text-[10px] text-emerald-700 font-medium block">✓ Visa, Mastercard & RuPay cards supported in simulation</span>
                  </div>
                )}

                {/* Sub-options for Net Banking */}
                {payMethod === 'Net Banking' && (
                  <div className="bg-slate-50/80 p-3 rounded-xl border border-[#E3E6E9] space-y-1.5 mt-2 text-xs">
                    <label className="text-[11px] text-[#718096] block">Select Banking Partner:</label>
                    <select
                      value={selectedBank}
                      onChange={(e) => setSelectedBank(e.target.value)}
                      className="w-full px-3 py-2 border border-[#E3E6E9] rounded-lg text-xs font-semibold text-[#20283A] bg-white focus:outline-none"
                    >
                      <option value="HDFC Bank">HDFC Bank</option>
                      <option value="State Bank of India">State Bank of India (SBI)</option>
                      <option value="ICICI Bank">ICICI Bank</option>
                      <option value="Axis Bank">Axis Bank</option>
                      <option value="Punjab National Bank">Punjab National Bank (PNB)</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Itemized Invoice Summary */}
              <div className="bg-slate-50/60 rounded-xl p-3 border border-[#E3E6E9] space-y-1 text-xs">
                <div className="flex justify-between text-[#718096]">
                  <span>Tuition Base Component:</span>
                  <span className="font-mono text-[#20283A] tabular-nums">{formatCurrency(baseComponent)}</span>
                </div>
                <div className="flex justify-between text-[#718096]">
                  <span>Statutory GST (18% itemized):</span>
                  <span className="font-mono text-[#20283A] tabular-nums">{formatCurrency(gstComponent)}</span>
                </div>
                <div className="flex justify-between pt-1.5 border-t border-[#E3E6E9] font-bold text-sm">
                  <span className="text-[#20283A]">Total Amount to Pay:</span>
                  <span className="text-emerald-700 tabular-nums">{formatCurrency(payAmount)}</span>
                </div>
              </div>

              {apiError && (
                <div className="bg-rose-50 border border-rose-200 text-[#BA2525] rounded-xl p-2.5 text-xs flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{apiError}</span>
                </div>
              )}

              {/* Modal Buttons: Confirm Pay and Cancel */}
              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  className="flex-1 justify-center py-2.5 text-xs text-[#718096] hover:bg-slate-50"
                  onClick={() => setCheckoutModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  disabled={isOverLimit}
                  onClick={handleCreateIntent}
                  className="flex-2 justify-center py-2.5 font-bold shadow-xs bg-[#E95435] hover:bg-[#D84527] text-white disabled:opacity-50"
                >
                  Confirm & Pay {formatCurrency(payAmount)}
                </Button>
              </div>
            </div>
          );
        })()}

        {checkoutStep === 'gateway' && activeIntent && (
          <div className="p-5 space-y-4">
            <div className="bg-amber-100 text-amber-900 border border-amber-200 px-3 py-1.5 rounded-xl text-xs font-bold text-center tracking-wide">
              SIMULATED PAYMENT GATEWAY · SANDBOX ENVIRONMENT
            </div>

            <div className="border border-[#E3E6E9] rounded-2xl p-4 bg-slate-50/75 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-[#718096]">Merchant:</span>
                <span className="font-bold text-[#20283A]">FeeFlow Academy (Janakpuri Campus)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#718096]">Order ID:</span>
                <span className="font-mono text-[#20283A]">{activeIntent.order_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#718096]">Student:</span>
                <span className="font-bold text-[#20283A]">{student.name} ({student.id})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#718096]">Instalment:</span>
                <span className="font-semibold text-[#20283A]">#{selectedInstalment?.instalment_number || selectedInstalment?.number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#718096]">Payment Mode:</span>
                <span className="font-semibold text-[#20283A]">{activeIntent.method}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-[#E3E6E9] text-sm font-bold">
                <span className="text-[#20283A]">Total Charge:</span>
                <span className="text-emerald-700">{formatCurrency(activeIntent.amount)}</span>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <p className="text-xs text-[#718096] text-center font-medium">Choose a simulated gateway outcome to test:</p>
              
              <button
                type="button"
                disabled={gatewayProcessing}
                onClick={() => handleSimulatePayment('success')}
                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-xs transition-colors"
              >
                <Check className="w-4 h-4" />
                Simulate Successful Payment
              </button>

              <button
                type="button"
                disabled={gatewayProcessing}
                onClick={() => handleSimulatePayment('failed')}
                className="w-full py-2.5 px-4 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-2 transition-colors"
              >
                <X className="w-4 h-4" />
                Simulate Bank Decline (Insufficient Balance)
              </button>

              <button
                type="button"
                disabled={gatewayProcessing}
                onClick={() => handleSimulatePayment('cancelled')}
                className="w-full py-2 px-4 border border-[#E3E6E9] text-[#718096] hover:bg-slate-100 rounded-xl text-xs font-medium transition-colors"
              >
                Cancel Transaction
              </button>
            </div>
          </div>
        )}

        {checkoutStep === 'processing' && (
          <div className="p-8 text-center space-y-3">
            <RefreshCw className="w-8 h-8 text-[#20283A] animate-spin mx-auto" />
            <p className="text-sm font-bold text-[#20283A]">Creating Secure Payment Intent…</p>
            <p className="text-xs text-[#718096]">Communicating with institute gateway backend</p>
          </div>
        )}

        {checkoutStep === 'result' && (
          <div className="p-5 text-center space-y-4">
            {gatewayStatus === 'success' && (
              <div className="space-y-3">
                <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 mx-auto">
                  <CheckCircle className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-bold text-[#20283A]">Payment Successfully Confirmed!</h3>
                <p className="text-xs text-[#718096] max-w-sm mx-auto">
                  {resultMessage || `Payment of ${formatCurrency(payAmount)} was verified and recorded in the fee ledger.`}
                </p>

                {createdReceipt && (
                  <div className="bg-slate-50/75 border border-[#E3E6E9] rounded-2xl p-4 text-xs text-left max-w-sm mx-auto space-y-2">
                    <div className="flex justify-between items-center border-b border-[#E3E6E9] pb-2">
                      <span className="text-[#718096]">Receipt Number:</span>
                      <span className="font-mono font-bold text-[#20283A]">{createdReceipt.receipt_no}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[#718096]">Transaction Ref:</span>
                      <span className="font-mono text-[#20283A]">{createdReceipt.payment_id || activeIntent?.order_id}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[#718096]">Student:</span>
                      <span className="font-semibold text-[#20283A]">{createdReceipt.student_name || student.name} ({student.id})</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[#718096]">Instalment:</span>
                      <span className="font-semibold text-[#20283A]">Instalment #{selectedInstalment?.instalment_number || selectedInstalment?.number}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[#718096]">Payment Method:</span>
                      <span className="font-semibold text-[#20283A]">{activeIntent?.method || 'UPI'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[#718096]">Date:</span>
                      <span className="text-[#20283A]">{formatDate(createdReceipt.date || new Date().toISOString().split('T')[0])}</span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-[#E3E6E9]">
                      <span className="text-[#718096]">GST Breakdown (18%):</span>
                      <span className="font-mono text-[#20283A]">{formatCurrency((createdReceipt.cgst_amount || 0) + (createdReceipt.sgst_amount || 0))}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm font-bold pt-1">
                      <span className="text-[#20283A]">Amount Paid:</span>
                      <span className="text-emerald-700">{formatCurrency(createdReceipt.total_amount)}</span>
                    </div>
                    <div className="text-[10px] text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-200 mt-2">
                      <span>Simulated demo payment environment · Official receipt issued & pending reminders cancelled.</span>
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  {createdReceipt && (
                    <Button
                      variant="outline"
                      className="flex-1 justify-center text-xs"
                      onClick={() => {
                        setViewReceipt(createdReceipt);
                        setCheckoutModalOpen(false);
                      }}
                    >
                      <Printer className="w-3.5 h-3.5 mr-1" />
                      View Full Receipt
                    </Button>
                  )}
                  <Button
                    className="flex-1 justify-center text-xs bg-[#20283A] text-white"
                    onClick={() => setCheckoutModalOpen(false)}
                  >
                    Done
                  </Button>
                </div>
              </div>
            )}

            {gatewayStatus === 'failed' && (
              <div className="space-y-3">
                <div className="w-14 h-14 bg-rose-100 rounded-full flex items-center justify-center text-[#BA2525] mx-auto">
                  <AlertCircle className="w-8 h-8" />
                </div>
                <h3 className="text-base font-bold text-[#20283A]">Transaction Failed</h3>
                <p className="text-xs text-[#BA2525] max-w-sm mx-auto">
                  {resultMessage || 'Simulated bank declined the transaction. No funds were deducted.'}
                </p>
                <div className="bg-slate-50 border border-[#E3E6E9] rounded-xl p-3 text-xs text-[#718096] text-left">
                  <p><strong>Note:</strong> In accordance with safety rules, the fee ledger was NOT updated and no receipt was issued.</p>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    className="flex-1 justify-center text-xs"
                    onClick={() => setCheckoutStep('gateway')}
                  >
                    Retry Simulation
                  </Button>
                  <Button
                    className="flex-1 justify-center text-xs bg-[#20283A] text-white"
                    onClick={() => setCheckoutModalOpen(false)}
                  >
                    Close
                  </Button>
                </div>
              </div>
            )}

            {gatewayStatus === 'cancelled' && (
              <div className="space-y-3">
                <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center text-[#718096] mx-auto">
                  <X className="w-8 h-8" />
                </div>
                <h3 className="text-base font-bold text-[#20283A]">Transaction Cancelled</h3>
                <p className="text-xs text-[#718096] max-w-sm mx-auto">
                  The payment was cancelled by the user in the mock checkout window.
                </p>
                <Button className="w-full justify-center text-xs bg-[#20283A] text-white" onClick={() => setCheckoutModalOpen(false)}>
                  Close
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ─── MODAL 2: PRINTABLE OFFICIAL RECEIPT VIEW ─── */}
      <Modal
        open={viewReceipt !== null}
        onClose={() => setViewReceipt(null)}
        title="Fee Receipt"
        size="md"
      >
        {viewReceipt && (
          <div className="p-5 space-y-4 text-xs" id="printable-receipt">
            <div className="border-b-2 border-[#20283A] pb-3 flex items-start justify-between">
              <div>
                <h2 className="text-base font-black text-[#20283A] uppercase tracking-tight">FeeFlow Coaching Institute</h2>
                <p className="text-[#718096] text-[11px]">Tonk Road Campus, Jaipur, Rajasthan · Helpline: +91-141-2700100</p>
                <p className="text-[#718096] text-[10px]">GSTIN: {viewReceipt.gst_number || viewReceipt.gstNumber || '08AAACP1234F1Z5'}</p>
              </div>
              <div className="text-right">
                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-bold uppercase">
                  Tax Receipt
                </span>
                <p className="font-mono font-bold text-[#20283A] text-sm mt-1">
                  {viewReceipt.receipt_no || viewReceipt.receiptNo}
                </p>
                <p className="text-[#718096] text-[10px]">Date: {formatDate(viewReceipt.date)}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 bg-slate-50/75 p-3.5 rounded-2xl border border-[#E3E6E9]">
              <div>
                <span className="text-[10px] text-[#718096] uppercase font-semibold block">Student Name</span>
                <span className="font-bold text-[#20283A] text-xs block">{viewReceipt.student_name || viewReceipt.studentName || student.name}</span>
                <span className="text-[#718096] text-[11px]">ID: {viewReceipt.student_id || viewReceipt.studentId || student.id}</span>
              </div>
              <div>
                <span className="text-[10px] text-[#718096] uppercase font-semibold block">Course & Batch</span>
                <span className="font-semibold text-[#20283A] text-xs block">{student.course} ({student.batch})</span>
                <span className="text-[#718096] text-[11px]">Centre: {viewReceipt.centre_name || viewReceipt.centreName || student.centre_name || 'Jaipur Main'}</span>
              </div>
              <div>
                <span className="text-[10px] text-[#718096] uppercase font-semibold block">Parent / Guardian</span>
                <span className="font-semibold text-[#20283A] text-xs block">{viewReceipt.parent_name || student.parent_name || 'N/A'}</span>
                <span className="text-[#718096] text-[11px]">Phone: {viewReceipt.parent_phone || student.parent_phone || 'N/A'}</span>
              </div>
              <div>
                <span className="text-[10px] text-[#718096] uppercase font-semibold block">Payment Ref / Txn</span>
                <span className="font-mono text-[#20283A] text-[11px] block">{viewReceipt.payment_id || 'Online Payment'}</span>
                <span className="text-[#718096] text-[10px]">Method: {viewReceipt.payment_method || 'Online'}</span>
              </div>
            </div>

            <div className="border border-[#E3E6E9] rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/75 border-b border-[#E3E6E9] font-bold text-[#20283A]">
                  <tr>
                    <th className="p-2.5">Particulars</th>
                    <th className="p-2.5 text-right">Rate</th>
                    <th className="p-2.5 text-right">Amount (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E3E6E9]">
                  <tr>
                    <td className="p-2.5 font-medium text-[#20283A]">
                      Coaching & Academic Tuition Fee
                      {viewReceipt.instalment_number && (
                        <span className="text-[11px] text-[#718096] block">Instalment {viewReceipt.instalment_number}</span>
                      )}
                    </td>
                    <td className="p-2.5 text-right text-[#718096]">—</td>
                    <td className="p-2.5 text-right font-semibold text-[#20283A]">
                      {formatCurrency(viewReceipt.base_amount || viewReceipt.baseAmount)}
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2.5 text-[#718096]">Central GST (CGST)</td>
                    <td className="p-2.5 text-right text-[#718096]">9%</td>
                    <td className="p-2.5 text-right text-[#20283A]">
                      {formatCurrency(viewReceipt.cgst_amount || viewReceipt.cgstAmount)}
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2.5 text-[#718096]">State GST (SGST)</td>
                    <td className="p-2.5 text-right text-[#718096]">9%</td>
                    <td className="p-2.5 text-right text-[#20283A]">
                      {formatCurrency(viewReceipt.sgst_amount || viewReceipt.sgstAmount)}
                    </td>
                  </tr>
                </tbody>
                <tfoot className="bg-slate-50/75 border-t-2 border-[#E3E6E9] font-bold text-[#20283A]">
                  <tr>
                    <td className="p-2.5 text-sm" colSpan={2}>Total Amount Paid:</td>
                    <td className="p-2.5 text-right text-sm text-emerald-700">
                      {formatCurrency(viewReceipt.total_amount || viewReceipt.totalAmount)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="flex gap-2 pt-2 no-print">
              <Button
                variant="outline"
                className="flex-1 justify-center text-xs"
                onClick={() => window.print()}
              >
                <Printer className="w-3.5 h-3.5 mr-1" />
                Print / Save PDF
              </Button>

              <Button
                variant="outline"
                className="flex-1 justify-center text-xs"
                onClick={() => {
                  const receiptText = `
========================================
FEEFLOW COACHING INSTITUTE - OFFICIAL RECEIPT
========================================
Receipt No: ${viewReceipt.receipt_no || viewReceipt.receiptNo}
Date: ${formatDate(viewReceipt.date)}
Student: ${viewReceipt.student_name || student.name} (ID: ${viewReceipt.student_id || student.id})
Course: ${student.course} - ${student.batch} Batch
Centre: ${viewReceipt.centre_name || student.centre_name || 'Jaipur Main'}
----------------------------------------
Base Amount: ${formatCurrency(viewReceipt.base_amount || viewReceipt.baseAmount)}
CGST (9%): ${formatCurrency(viewReceipt.cgst_amount || viewReceipt.cgstAmount)}
SGST (9%): ${formatCurrency(viewReceipt.sgst_amount || viewReceipt.sgstAmount)}
----------------------------------------
TOTAL PAID: ${formatCurrency(viewReceipt.total_amount || viewReceipt.totalAmount)}
Payment Ref: ${viewReceipt.payment_id || 'Online'}
========================================`;
                  const blob = new Blob([receiptText], { type: 'text/plain' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `Receipt-${viewReceipt.receipt_no || viewReceipt.receiptNo}.txt`;
                  a.click();
                }}
              >
                <Download className="w-3.5 h-3.5 mr-1" />
                Download TXT
              </Button>

              <Button
                className="flex-1 justify-center text-xs bg-[#20283A] text-white"
                onClick={() => setViewReceipt(null)}
              >
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ─── MODAL 3: PARENT WITHDRAWAL & REFUND REQUEST ─── */}
      <Modal
        open={refundModalOpen}
        onClose={() => setRefundModalOpen(false)}
        title="Submit Course Withdrawal / Refund Request"
        size="md"
      >
        <form onSubmit={handleParentRefundSubmit} className="p-5 space-y-4 text-xs">
          <div className="bg-amber-50/75 p-3.5 rounded-xl border border-amber-200 text-amber-900 space-y-1">
            <p className="font-bold">Formal Withdrawal Notice:</p>
            <p>
              Submitting this request notifies the accounts team to calculate your pro-rata refund in accordance with published policy <strong>REFUND_STD_POLICY_2026 (v2026.1)</strong>.
            </p>
          </div>

          <div>
            <label className="text-xs font-semibold text-[#20283A] block mb-1">
              Student Withdrawal Date <span className="text-[#BA2525]">*</span>
            </label>
            <input
              type="date"
              className="w-full text-xs p-2.5 border border-[#E3E6E9] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#20283A]"
              value={refundWithdrawalDate}
              onChange={e => setRefundWithdrawalDate(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-[#20283A] block mb-1">
              Reason for Withdrawal <span className="text-[#BA2525]">*</span>
            </label>
            <textarea
              className="w-full text-xs p-2.5 border border-[#E3E6E9] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#20283A]"
              rows={3}
              placeholder="e.g. Relocating to a different city due to job transfer"
              value={refundReason}
              onChange={e => setRefundReason(e.target.value)}
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[#E3E6E9]">
            <Button type="button" variant="outline" onClick={() => setRefundModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={refundSubmitting} className="bg-[#E95435] hover:bg-[#D84527] text-white">
              {refundSubmitting ? 'Submitting…' : 'Submit Refund Request'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
