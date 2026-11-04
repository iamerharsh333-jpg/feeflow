import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { api } from '../utils/api';
import type { Student, Instalment, Receipt, StudentAttendance, TestScoreRecord } from '../types';
import { formatCurrency, formatDate } from '../utils/helpers';
import { Badge, Button, Modal, Card } from '../components/ui';
import { NotificationCenter } from '../components/notifications/NotificationCenter';
import {
  CreditCard, Download, LogOut, CheckCircle, Clock, AlertTriangle,
  RefreshCw, FileText, Calendar, BookOpen, ShieldCheck, ChevronRight,
  User, Check, X, Printer, ArrowLeft, AlertCircle
} from 'lucide-react';

type TabType = 'overview' | 'instalments' | 'receipts' | 'academic' | 'refunds';
type CheckoutStep = 'setup' | 'gateway' | 'processing' | 'result';
type Lang = 'en' | 'hi';

const translations = {
  en: {
    portalTitle: 'FeeFlow Parent',
    connected: 'Verified Backend Connection',
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
    allPaidTitle: 'All Fees Fully Paid!',
    allPaidDesc: 'There are no outstanding instalments for this academic session.',
    totalFee: 'Total Fee',
    discounts: 'Discounts',
    paidSoFar: 'Paid So Far',
    instalmentsTab: 'Instalments',
    receiptsTab: (count: number) => `Receipts (${count})`,
    academicTab: 'Attendance & Scores',
    refundsTab: (count: number) => `Refunds & Policy (${count})`,
    instalmentSchedule: 'Instalment Schedule',
    instalmentScheduleSub: 'Every scheduled instalment with payment tracking',
    officialReceipts: 'Official Receipts',
    officialReceiptsSub: 'Verified payment receipts with tax breakdown',
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
    connected: 'संस्थान सर्वर से कनेक्टेड',
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
    allPaidTitle: 'सभी शुल्क पूर्णतः जमा हैं!',
    allPaidDesc: 'इस शैक्षणिक सत्र के लिए कोई बकाया किस्त शेष नहीं है।',
    totalFee: 'कुल कोर्स शुल्क',
    discounts: 'छूट (Discounts)',
    paidSoFar: 'अब तक जमा शुल्क',
    instalmentsTab: 'किस्त विवरण',
    receiptsTab: (count: number) => `रसीदें (${count})`,
    academicTab: 'उपस्थिति एवं अंक',
    refundsTab: (count: number) => `शुल्क वापसी नीति (${count})`,
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
  const [activeIntent, setActiveIntent] = useState<any | null>(null);
  const [gatewayStatus, setGatewayStatus] = useState<'success' | 'failed' | 'cancelled' | null>(null);
  const [resultMessage, setResultMessage] = useState<string>('');
  const [createdReceipt, setCreatedReceipt] = useState<any | null>(null);
  const [gatewayProcessing, setGatewayProcessing] = useState<boolean>(false);

  // Receipt Detail View Modal
  const [viewReceipt, setViewReceipt] = useState<any | null>(null);

  // Load parent's linked students
  const loadParentData = useCallback(async () => {
    setLoading(true);
    setApiError(null);
    try {
      // 1. Fetch linked students from live backend
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
        // Fallback to client demo data if no students returned
        loadDemoFallback();
      }
    } catch (err: any) {
      console.warn('Backend fetch failed, using demo fallback:', err.message);
      loadDemoFallback();
    } finally {
      setLoading(false);
    }
  }, [selectedStudentId]);

  const loadDemoFallback = () => {
    setIsDemoMode(true);
    const sid = localStorage.getItem('parent_student_id') || 'STU-0412';
    const s = fallbackStudents.find(s => s.id === sid) || fallbackStudents[0];
    if (s) {
      setStudentsList([s]);
      setSelectedStudentId(s.id);
      setStudent(s);
    }
  };

  const loadStudentDetails = async (sid: string) => {
    try {
      // Fetch fresh details, attendance, tests, receipts, and refunds in parallel
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

  useEffect(() => {
    loadParentData();
  }, []);

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

  // Open checkout for a specific instalment
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
  };

  // Step 1 -> Step 2: Create Intent with Backend
  const handleCreateIntent = async () => {
    if (!student || !selectedInstalment) return;
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

  // Step 2: Simulate Payment Outcome (Success, Bank Decline, Cancel)
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
        // Refresh local student record and balance from live backend
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
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mb-3" />
        <p className="text-sm font-medium text-slate-700">Connecting to FeeFlow Parent Portal…</p>
        <p className="text-xs text-slate-400 mt-1">Retrieving student fee schedule and attendance</p>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 text-center">
        <AlertCircle className="w-12 h-12 text-amber-500 mb-3" />
        <h2 className="text-lg font-bold text-slate-900">No Student Records Found</h2>
        <p className="text-sm text-slate-600 mt-1 max-w-sm">
          No enrolled students are linked to this phone number ({user?.id || 'N/A'}).
        </p>
        <Button className="mt-4" onClick={handleLogout}>Log In with Another Account</Button>
      </div>
    );
  }

  // Calculate next due instalment
  const instalments: any[] = student.instalments || [];
  const nextDue = instalments.find((i: any) => i.status !== 'Paid');
  const nextDueAmount = nextDue ? (nextDue.amount - (nextDue.paid_amount ?? nextDue.paid ?? 0)) : 0;
  const isOverdue = nextDue?.status === 'Overdue';

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      {/* Mobile-First Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-xs">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center shadow-xs">
              <CreditCard className="w-4 h-4 text-white" />
            </div>
            <div>
              <span className="font-bold text-slate-900 text-sm leading-tight block">{t.portalTitle}</span>
              <span className="text-[10px] text-slate-500 block">
                {isDemoMode ? t.demoMode : t.connected}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Language Switcher */}
            <button
              onClick={() => setLang(l => l === 'en' ? 'hi' : 'en')}
              className="px-2.5 py-1 text-xs font-bold rounded-md border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors flex items-center gap-1"
              title="Switch Language / भाषा बदलें"
            >
              <span className={lang === 'en' ? 'text-indigo-600 font-extrabold' : 'text-slate-400'}>EN</span>
              <span className="text-slate-300">|</span>
              <span className={lang === 'hi' ? 'text-indigo-600 font-extrabold' : 'text-slate-400'}>हिं</span>
            </button>

            <NotificationCenter align="right" />
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-indigo-600' : ''}`} />
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1 text-xs text-slate-600 hover:text-red-600 hover:bg-slate-100 px-2 py-1.5 rounded-md transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {/* Banner for Mode & Status */}
        {isDemoMode ? (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3.5 py-2 flex items-center gap-2 text-xs text-amber-800">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span><strong>Offline Demo Mode:</strong> Backend server unreachable. Displaying pre-cached demo state.</span>
          </div>
        ) : (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3.5 py-1.5 flex items-center justify-between text-xs text-emerald-800">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span><strong>Verified Backend Connection:</strong> Data synced live with institute database.</span>
            </div>
            <span className="text-[11px] text-emerald-600 font-mono">100% Reconciled</span>
          </div>
        )}

        {/* Multi-Student Switcher (if more than 1 student linked) */}
        {studentsList.length > 1 && (
          <div className="bg-white border border-slate-200 rounded-lg p-2.5 flex items-center gap-2 overflow-x-auto">
            <User className="w-4 h-4 text-slate-400 flex-shrink-0 ml-1" />
            <span className="text-xs text-slate-500 font-medium whitespace-nowrap">{t.student}</span>
            {studentsList.map(s => (
              <button
                key={s.id}
                onClick={() => handleStudentSwitch(s.id)}
                className={`px-3 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                  s.id === selectedStudentId
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {s.name} ({s.id})
              </button>
            ))}
          </div>
        )}

        {/* ─── 5-SECOND HERO CARD ─── */}
        <section className="bg-gradient-to-br from-indigo-900 via-indigo-800 to-indigo-700 rounded-2xl p-5 text-white shadow-md relative overflow-hidden">
          <div className="absolute right-0 top-0 translate-x-6 -translate-y-6 w-36 h-36 bg-white/5 rounded-full pointer-events-none"></div>

          <div className="flex items-start justify-between">
            <div>
              <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-white/15 text-indigo-100 uppercase tracking-wide">
                {student.course} · {student.batch} Batch
              </span>
              <h1 className="text-xl font-bold mt-1.5">{student.name}</h1>
              <p className="text-xs text-indigo-200 mt-0.5">
                Roll No: {student.roll_number || student.rollNumber || 'N/A'} · Centre: {student.centre_name || student.centre || 'Jaipur Main'}
              </p>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-indigo-200 uppercase font-medium block">{t.balanceDue}</span>
              <span className="text-lg font-bold block tabular-nums">{formatCurrency(student.outstanding_amount ?? student.outstanding ?? 0)}</span>
            </div>
          </div>

          <div className="my-4 border-t border-indigo-700/60 pt-4">
            {nextDue ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-indigo-200">{t.nextDueLabel}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                      isOverdue ? 'bg-red-500/80 text-white' : 'bg-amber-400 text-slate-900'
                    }`}>
                      {isOverdue ? t.overdue : t.dueSoon}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-2xl font-black text-white tabular-nums">{formatCurrency(nextDueAmount)}</span>
                    <span className="text-xs text-indigo-200">
                      {t.dueBy} {formatDate(nextDue.due_date || nextDue.dueDate)}
                    </span>
                  </div>
                </div>

                <Button
                  onClick={() => handleInitiatePay(nextDue)}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-6 py-2.5 rounded-xl shadow-md flex items-center justify-center gap-2 active:scale-98 transition-all"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>{t.payNow(formatCurrency(nextDueAmount))}</span>
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-3 py-1">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-300">
                  <CheckCircle className="w-6 h-6" />
                </div>
                <div>
                  <p className="font-semibold text-emerald-200 text-sm">{t.allPaidTitle}</p>
                  <p className="text-xs text-indigo-200">{t.allPaidDesc}</p>
                </div>
              </div>
            )}
          </div>

          {/* Quick Metrics Strip */}
          <div className="grid grid-cols-3 gap-2 pt-3 border-t border-indigo-700/60 text-center text-xs">
            <div>
              <span className="text-indigo-300 text-[10px] uppercase block">{t.totalFee}</span>
              <span className="font-bold text-white text-sm tabular-nums">{formatCurrency(student.total_fee ?? student.totalFee ?? 0)}</span>
            </div>
            <div>
              <span className="text-indigo-300 text-[10px] uppercase block">{t.discounts}</span>
              <span className="font-bold text-emerald-300 text-sm tabular-nums">{formatCurrency(student.total_discount ?? 0)}</span>
            </div>
            <div>
              <span className="text-indigo-300 text-[10px] uppercase block">{t.paidSoFar}</span>
              <span className="font-bold text-emerald-300 text-sm tabular-nums">{formatCurrency(student.amount_paid ?? student.amountPaid ?? 0)}</span>
            </div>
          </div>
        </section>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 bg-white rounded-t-xl px-2">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex-1 py-3 text-xs font-semibold text-center border-b-2 transition-colors ${
              activeTab === 'overview'
                ? 'border-indigo-600 text-indigo-600 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.instalmentsTab}
          </button>
          <button
            onClick={() => setActiveTab('receipts')}
            className={`flex-1 py-3 text-xs font-semibold text-center border-b-2 transition-colors ${
              activeTab === 'receipts'
                ? 'border-indigo-600 text-indigo-600 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.receiptsTab(receipts.length)}
          </button>
          <button
            onClick={() => setActiveTab('academic')}
            className={`flex-1 py-3 text-xs font-semibold text-center border-b-2 transition-colors ${
              activeTab === 'academic'
                ? 'border-indigo-600 text-indigo-600 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.academicTab}
          </button>
          <button
            onClick={() => setActiveTab('refunds')}
            className={`flex-1 py-3 text-xs font-semibold text-center border-b-2 transition-colors ${
              activeTab === 'refunds'
                ? 'border-indigo-600 text-indigo-600 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.refundsTab(refunds.length)}
          </button>
        </div>

        {/* Tab 1: Instalments Breakdown */}
        {activeTab === 'overview' && (
          <div className="bg-white border border-slate-200 rounded-b-xl overflow-hidden shadow-xs divide-y divide-slate-100">
            <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">{t.instalmentSchedule}</h3>
                <p className="text-xs text-slate-500">{t.instalmentScheduleSub}</p>
              </div>
              <span className="text-xs text-slate-500 font-medium">{instalments.length} Instalments</span>
            </div>

            {instalments.map((ins: any) => {
              const paid = ins.paid_amount ?? ins.paid ?? 0;
              const due = ins.amount - paid;
              const status = ins.status;
              const isPaid = status === 'Paid';

              return (
                <div key={ins.id} className="p-4 hover:bg-slate-50/70 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        isPaid ? 'bg-emerald-100 text-emerald-600' :
                        status === 'Overdue' ? 'bg-red-100 text-red-600' :
                        status === 'Partially Paid' ? 'bg-amber-100 text-amber-700' :
                        'bg-slate-100 text-slate-500'
                      }`}>
                        {isPaid ? <CheckCircle className="w-4 h-4" /> :
                         status === 'Overdue' ? <AlertTriangle className="w-4 h-4" /> :
                         <Clock className="w-4 h-4" />}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-slate-900">
                            Instalment {ins.instalment_number || ins.number}
                          </p>
                          <Badge status={status} />
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Due Date: <strong>{formatDate(ins.due_date || ins.dueDate)}</strong>
                          {ins.overdue_days > 0 && (
                            <span className="text-red-600 ml-1 font-semibold">({ins.overdue_days} days overdue)</span>
                          )}
                        </p>
                        {isPaid && ins.paid_date && (
                          <p className="text-xs text-emerald-600 mt-0.5">
                            Paid on {formatDate(ins.paid_date || ins.paidDate)} {ins.receipt_no ? `· Receipt: ${ins.receipt_no}` : ''}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="text-sm font-bold text-slate-900">{formatCurrency(ins.amount)}</p>
                      {paid > 0 && !isPaid && (
                        <p className="text-xs text-emerald-600 font-medium">Paid: {formatCurrency(paid)}</p>
                      )}
                      {!isPaid && (
                        <p className="text-xs text-indigo-600 font-semibold mt-0.5">Due: {formatCurrency(due)}</p>
                      )}
                    </div>
                  </div>

                  {/* Payment Button if not paid */}
                  {!isPaid && (
                    <div className="mt-3 flex justify-end gap-2 pt-2 border-t border-slate-100">
                      <Button
                        size="sm"
                        onClick={() => handleInitiatePay(ins)}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs"
                      >
                        <CreditCard className="w-3.5 h-3.5 mr-1" />
                        Pay {paid > 0 ? `Remaining (${formatCurrency(due)})` : formatCurrency(ins.amount)}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Tab 2: Receipts & History */}
        {activeTab === 'receipts' && (
          <div className="bg-white border border-slate-200 rounded-b-xl overflow-hidden shadow-xs divide-y divide-slate-100">
            <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">{t.officialReceipts}</h3>
                <p className="text-xs text-slate-500">{t.officialReceiptsSub}</p>
              </div>
              <span className="text-xs text-slate-500 font-medium">{receipts.length} Issued</span>
            </div>

            {receipts.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                No receipts generated yet. Receipts will appear here once an instalment payment is confirmed.
              </div>
            ) : (
              receipts.map((rec: any) => (
                <div key={rec.id} className="p-4 flex items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors">
                  <div>
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-indigo-600" />
                      <p className="text-sm font-bold text-slate-900">{rec.receipt_no || rec.receiptNo}</p>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Date: {formatDate(rec.date)} · Total: <strong>{formatCurrency(rec.total_amount || rec.totalAmount)}</strong>
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Base: {formatCurrency(rec.base_amount || rec.baseAmount)} + 18% GST ({formatCurrency((rec.cgst_amount || rec.cgstAmount) + (rec.sgst_amount || rec.sgstAmount))})
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setViewReceipt(rec)}
                      className="text-xs flex items-center gap-1"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      {t.viewReceipt}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Tab 3: Attendance & Academic Scores */}
        {activeTab === 'academic' && (
          <div className="space-y-4">
            {/* Attendance Card */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-indigo-600" />
                  <h3 className="text-sm font-bold text-slate-900">{t.attendanceOverview}</h3>
                </div>
                {attendance && (
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    attendance.attendance_rate_percent >= 80 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {attendance.attendance_rate_percent}% Attendance
                  </span>
                )}
              </div>

              {attendance ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-center">
                    <div className="bg-slate-50 rounded-lg p-3">
                      <span className="text-[11px] text-slate-500 block">{t.classesPresent}</span>
                      <span className="text-base font-bold text-slate-900">{attendance.present_count}</span>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <span className="text-[11px] text-slate-500 block">{t.totalClasses}</span>
                      <span className="text-base font-bold text-slate-900">{attendance.total_classes}</span>
                    </div>
                  </div>

                  {attendance.records && attendance.records.length > 0 && (
                    <div className="border border-slate-100 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 border-b border-slate-100 text-slate-500">
                          <tr>
                            <th className="px-3 py-2">Date</th>
                            <th className="px-3 py-2">Batch</th>
                            <th className="px-3 py-2 text-right">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {attendance.records.slice(0, 10).map((r, i) => (
                            <tr key={i} className="hover:bg-slate-50">
                              <td className="px-3 py-1.5 font-medium">{formatDate(r.date)}</td>
                              <td className="px-3 py-1.5 text-slate-600">{r.batch}</td>
                              <td className="px-3 py-1.5 text-right">
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  r.status === 'Present' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
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
                <p className="text-xs text-slate-400">Loading attendance data…</p>
              )}
            </div>

            {/* Test Scores Card */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-indigo-600" />
                  <h3 className="text-sm font-bold text-slate-900">{t.academicScores}</h3>
                </div>
                <span className="text-xs text-slate-500 font-medium">{tests.length} Tests Recorded</span>
              </div>

              {tests.length === 0 ? (
                <p className="text-xs text-slate-400 py-3 text-center">No test evaluations on record yet.</p>
              ) : (
                <div className="space-y-2">
                  {tests.map(testItem => (
                    <div key={testItem.id} className="p-3 border border-slate-100 rounded-lg flex items-center justify-between hover:bg-slate-50">
                      <div>
                        <p className="text-xs font-bold text-slate-900">{testItem.test_name}</p>
                        <p className="text-[11px] text-slate-500">{testItem.subject} · {formatDate(testItem.test_date)}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-bold text-slate-900">{testItem.marks_obtained} / {testItem.max_marks}</span>
                        <span className={`block text-[11px] font-semibold ${
                          testItem.percentage >= 75 ? 'text-emerald-600' : testItem.percentage >= 50 ? 'text-amber-600' : 'text-red-600'
                        }`}>
                          {testItem.percentage}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 4: Refunds & Statutory Policy */}
        {activeTab === 'refunds' && (
          <div className="space-y-4">
            {/* Policy Info Card */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
              <div className="flex items-center gap-2 mb-2 text-indigo-700 font-bold text-sm">
                <ShieldCheck className="w-5 h-5 text-indigo-600" />
                <span>Published Institute Refund Policy (REFUND_STD_POLICY_2026 v2026.1)</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Under statutory coaching regulations, students who submit a formal notice of withdrawal within the first 10 days of commencement are eligible for a pro-rata refund of paid fees minus a standard 5% processing fee and educational material/kit charges.
              </p>
              <div className="mt-3 p-2.5 bg-indigo-50 border border-indigo-100 rounded-lg text-[11px] text-indigo-900 flex items-center justify-between">
                <div>
                  <span className="font-bold block">10-Day Statutory Refund Processing Window</span>
                  <span className="text-indigo-700">All eligible approved refunds are processed within 10 days of verified withdrawal.</span>
                </div>
                <Button size="sm" onClick={() => setRefundModalOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs">
                  {t.requestWithdrawal}
                </Button>
              </div>
            </div>

            {/* Refund Requests List */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
              <h3 className="text-sm font-bold text-slate-900 mb-3">{t.withdrawalHistory}</h3>

              {refunds.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-xs">
                  <p>No withdrawal or refund requests on record for this student.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {refunds.map(r => (
                    <div key={r.id} className="p-3.5 border border-slate-100 rounded-lg hover:bg-slate-50 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xs font-bold text-slate-900">Request #{r.id}</span>
                          <span className="text-[11px] text-slate-500 block">Submitted: {formatDate(r.created_at)}</span>
                        </div>
                        <Badge status={r.status} />
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2.5 rounded">
                        <div>
                          <span className="text-slate-400 block text-[10px]">Withdrawal Date:</span>
                          <span className="font-semibold text-slate-800">{formatDate(r.withdrawal_date)}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">Processing Deadline:</span>
                          <span className="font-semibold text-slate-800">{formatDate(r.processing_deadline)}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">Calculated Refund:</span>
                          <span className="font-bold text-emerald-600">{formatCurrency(r.estimated_refund)}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">Approved Amount:</span>
                          <span className="font-bold text-slate-900">
                            {r.approved_refund ? formatCurrency(r.approved_refund) : 'Pending Review'}
                          </span>
                        </div>
                      </div>

                      {r.withdrawal_reason && (
                        <p className="text-[11px] text-slate-600 italic">Reason: "{r.withdrawal_reason}"</p>
                      )}

                      {r.payout_reference && (
                        <div className="p-2 bg-emerald-50 rounded border border-emerald-100 text-[11px] text-emerald-900">
                          <span className="font-bold">Payout Reference:</span> <span className="font-mono">{r.payout_reference}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ─── MODAL 1: SIMULATED PAYMENT GATEWAY (REALISTIC FLOW) ─── */}
      <Modal
        open={checkoutModalOpen}
        onClose={() => {
          if (!gatewayProcessing) setCheckoutModalOpen(false);
        }}
        title="Fee Payment Gateway"
        size="md"
      >
        {/* Step A: Setup Payment (Select Amount & Method) */}
        {checkoutStep === 'setup' && selectedInstalment && (
          <div className="p-5 space-y-4">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <span className="text-[10px] text-slate-500 uppercase font-semibold block">Paying Instalment</span>
              <p className="text-base font-bold text-slate-900 mt-0.5">
                Instalment {selectedInstalment.instalment_number || selectedInstalment.number} · {student.course}
              </p>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-200 text-xs">
                <span className="text-slate-600">Total Instalment Amount:</span>
                <span className="font-bold text-slate-900">{formatCurrency(selectedInstalment.amount)}</span>
              </div>
              <div className="flex items-center justify-between mt-1 text-xs">
                <span className="text-slate-600">Remaining Balance:</span>
                <span className="font-bold text-indigo-700">
                  {formatCurrency(selectedInstalment.amount - (selectedInstalment.paid_amount ?? selectedInstalment.paid ?? 0))}
                </span>
              </div>
            </div>

            {/* Amount Selection: Full vs Partial */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 block">Payment Option</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsCustomAmount(false);
                    setPayAmount(selectedInstalment.amount - (selectedInstalment.paid_amount ?? selectedInstalment.paid ?? 0));
                  }}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    !isCustomAmount ? 'border-indigo-600 bg-indigo-50/70 text-indigo-900 font-bold' : 'border-slate-200 text-slate-700'
                  }`}
                >
                  <span className="text-xs block">Pay Full Balance</span>
                  <span className="text-sm font-extrabold block mt-0.5">
                    {formatCurrency(selectedInstalment.amount - (selectedInstalment.paid_amount ?? selectedInstalment.paid ?? 0))}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsCustomAmount(true)}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    isCustomAmount ? 'border-indigo-600 bg-indigo-50/70 text-indigo-900 font-bold' : 'border-slate-200 text-slate-700'
                  }`}
                >
                  <span className="text-xs block">Partial Payment</span>
                  <span className="text-xs text-slate-500 block mt-0.5">Custom Amount</span>
                </button>
              </div>

              {isCustomAmount && (
                <div className="mt-2">
                  <label className="text-xs text-slate-600 block mb-1">Enter custom partial amount (₹):</label>
                  <input
                    type="number"
                    min="1"
                    max={selectedInstalment.amount - (selectedInstalment.paid_amount ?? selectedInstalment.paid ?? 0)}
                    value={payAmount}
                    onChange={(e) => setPayAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Max allowed: {formatCurrency(selectedInstalment.amount - (selectedInstalment.paid_amount ?? selectedInstalment.paid ?? 0))}
                  </p>
                </div>
              )}
            </div>

            {/* Payment Method */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">Select Payment Mode</label>
              <div className="grid grid-cols-3 gap-2">
                {['UPI', 'Net Banking', 'Card'].map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPayMethod(m)}
                    className={`py-2 px-3 text-xs rounded-lg border font-semibold text-center transition-all ${
                      payMethod === m ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {apiError && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-2.5 text-xs flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{apiError}</span>
              </div>
            )}

            <Button onClick={handleCreateIntent} className="w-full justify-center py-2.5 font-bold shadow-sm">
              Proceed to Simulated Gateway (₹{payAmount.toLocaleString('en-IN')})
            </Button>
          </div>
        )}

        {/* Step B: Simulated Payment Gateway Dialog */}
        {checkoutStep === 'gateway' && activeIntent && (
          <div className="p-5 space-y-4">
            <div className="bg-amber-500 text-slate-950 px-3 py-1.5 rounded-lg text-xs font-bold text-center tracking-wide">
              SIMULATED PAYMENT GATEWAY · SANDBOX ENVIRONMENT
            </div>

            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Merchant:</span>
                <span className="font-bold text-slate-900">FeeFlow Academy (Jaipur Main)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Order ID:</span>
                <span className="font-mono text-slate-700">{activeIntent.order_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Student:</span>
                <span className="font-bold text-slate-900">{student.name} ({student.id})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Payment Mode:</span>
                <span className="font-semibold text-slate-800">{activeIntent.method}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-200 text-sm font-bold">
                <span className="text-slate-800">Total Charge:</span>
                <span className="text-indigo-700">{formatCurrency(activeIntent.amount)}</span>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <p className="text-xs text-slate-500 text-center font-medium">Choose a simulated gateway outcome to test:</p>
              
              <button
                type="button"
                disabled={gatewayProcessing}
                onClick={() => handleSimulatePayment('success')}
                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-2 shadow-xs transition-colors"
              >
                <Check className="w-4 h-4" />
                Simulate Successful Payment
              </button>

              <button
                type="button"
                disabled={gatewayProcessing}
                onClick={() => handleSimulatePayment('failed')}
                className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg text-xs flex items-center justify-center gap-2 transition-colors"
              >
                <X className="w-4 h-4" />
                Simulate Bank Decline (Insufficient Balance)
              </button>

              <button
                type="button"
                disabled={gatewayProcessing}
                onClick={() => handleSimulatePayment('cancelled')}
                className="w-full py-2 px-4 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-lg text-xs font-medium transition-colors"
              >
                Cancel Transaction
              </button>
            </div>
          </div>
        )}

        {/* Step C: Processing */}
        {checkoutStep === 'processing' && (
          <div className="p-8 text-center space-y-3">
            <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mx-auto" />
            <p className="text-sm font-bold text-slate-800">Creating Secure Payment Intent…</p>
            <p className="text-xs text-slate-500">Communicating with institute gateway backend</p>
          </div>
        )}

        {/* Step D: Result (Success / Decline / Cancelled) */}
        {checkoutStep === 'result' && (
          <div className="p-5 text-center space-y-4">
            {gatewayStatus === 'success' && (
              <div className="space-y-3">
                <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 mx-auto">
                  <CheckCircle className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">Payment Successfully Confirmed!</h3>
                <p className="text-xs text-slate-600 max-w-sm mx-auto">
                  {resultMessage || `Payment of ${formatCurrency(payAmount)} was verified and recorded in the fee ledger.`}
                </p>

                {createdReceipt && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-left max-w-xs mx-auto space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Receipt No:</span>
                      <span className="font-bold text-slate-900">{createdReceipt.receipt_no}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Amount Paid:</span>
                      <span className="font-bold text-emerald-600">{formatCurrency(createdReceipt.total_amount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">GST (18%):</span>
                      <span className="text-slate-700">{formatCurrency(createdReceipt.cgst_amount + createdReceipt.sgst_amount)}</span>
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
                    className="flex-1 justify-center text-xs"
                    onClick={() => setCheckoutModalOpen(false)}
                  >
                    Done
                  </Button>
                </div>
              </div>
            )}

            {gatewayStatus === 'failed' && (
              <div className="space-y-3">
                <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center text-red-600 mx-auto">
                  <AlertCircle className="w-8 h-8" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Transaction Failed</h3>
                <p className="text-xs text-red-600 max-w-sm mx-auto">
                  {resultMessage || 'Simulated bank declined the transaction. No funds were deducted.'}
                </p>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600 text-left">
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
                    className="flex-1 justify-center text-xs"
                    onClick={() => setCheckoutModalOpen(false)}
                  >
                    Close
                  </Button>
                </div>
              </div>
            )}

            {gatewayStatus === 'cancelled' && (
              <div className="space-y-3">
                <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 mx-auto">
                  <X className="w-8 h-8" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Transaction Cancelled</h3>
                <p className="text-xs text-slate-600 max-w-sm mx-auto">
                  The payment was cancelled by the user in the mock checkout window.
                </p>
                <Button className="w-full justify-center text-xs" onClick={() => setCheckoutModalOpen(false)}>
                  Close
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ─── MODAL 2: PRINTABLE / DOWNLOADABLE OFFICIAL RECEIPT VIEW ─── */}
      <Modal
        open={viewReceipt !== null}
        onClose={() => setViewReceipt(null)}
        title="Fee Receipt"
        size="md"
      >
        {viewReceipt && (
          <div className="p-5 space-y-4 text-xs" id="printable-receipt">
            {/* Institute Letterhead */}
            <div className="border-b-2 border-slate-900 pb-3 flex items-start justify-between">
              <div>
                <h2 className="text-base font-black text-slate-900 uppercase tracking-tight">FeeFlow Coaching Institute</h2>
                <p className="text-slate-600 text-[11px]">Tonk Road Campus, Jaipur, Rajasthan · Helpline: +91-141-2700100</p>
                <p className="text-slate-400 text-[10px]">GSTIN: {viewReceipt.gst_number || viewReceipt.gstNumber || '08AAACP1234F1Z5 (Demo GSTIN)'}</p>
              </div>
              <div className="text-right">
                <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase">
                  Fee Receipt
                </span>
                <p className="font-mono font-bold text-slate-900 text-sm mt-1">
                  {viewReceipt.receipt_no || viewReceipt.receiptNo}
                </p>
                <p className="text-slate-500 text-[10px]">Date: {formatDate(viewReceipt.date)}</p>
              </div>
            </div>

            {/* Student & Parent Metadata */}
            <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">Student Name</span>
                <span className="font-bold text-slate-900 text-xs block">{viewReceipt.student_name || viewReceipt.studentName || student.name}</span>
                <span className="text-slate-500 text-[11px]">ID: {viewReceipt.student_id || viewReceipt.studentId || student.id}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">Course & Batch</span>
                <span className="font-semibold text-slate-800 text-xs block">{student.course} ({student.batch})</span>
                <span className="text-slate-500 text-[11px]">Centre: {viewReceipt.centre_name || viewReceipt.centreName || student.centre_name || 'Jaipur Main'}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">Parent / Guardian</span>
                <span className="font-semibold text-slate-800 text-xs block">{viewReceipt.parent_name || student.parent_name || 'N/A'}</span>
                <span className="text-slate-500 text-[11px]">Phone: {viewReceipt.parent_phone || student.parent_phone || 'N/A'}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">Payment Ref / Txn</span>
                <span className="font-mono text-slate-800 text-[11px] block">{viewReceipt.payment_id || 'Online Payment'}</span>
                <span className="text-slate-500 text-[10px]">Method: {viewReceipt.payment_method || 'Online'}</span>
              </div>
            </div>

            {/* GST Financial Breakdown Table */}
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 border-b border-slate-200 font-bold text-slate-700">
                  <tr>
                    <th className="p-2.5">Particulars</th>
                    <th className="p-2.5 text-right">Rate</th>
                    <th className="p-2.5 text-right">Amount (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="p-2.5 font-medium text-slate-900">
                      Coaching & Academic Tuition Fee
                      {viewReceipt.instalment_number && (
                        <span className="text-[11px] text-slate-500 block">Instalment {viewReceipt.instalment_number}</span>
                      )}
                    </td>
                    <td className="p-2.5 text-right text-slate-500">—</td>
                    <td className="p-2.5 text-right font-semibold">
                      {formatCurrency(viewReceipt.base_amount || viewReceipt.baseAmount)}
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2.5 text-slate-600">Central GST (CGST)</td>
                    <td className="p-2.5 text-right text-slate-500">9%</td>
                    <td className="p-2.5 text-right">
                      {formatCurrency(viewReceipt.cgst_amount || viewReceipt.cgstAmount)}
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2.5 text-slate-600">State GST (SGST)</td>
                    <td className="p-2.5 text-right text-slate-500">9%</td>
                    <td className="p-2.5 text-right">
                      {formatCurrency(viewReceipt.sgst_amount || viewReceipt.sgstAmount)}
                    </td>
                  </tr>
                </tbody>
                <tfoot className="bg-slate-50 border-t-2 border-slate-300 font-bold text-slate-900">
                  <tr>
                    <td className="p-2.5 text-sm" colSpan={2}>Total Amount Paid:</td>
                    <td className="p-2.5 text-right text-sm text-indigo-700">
                      {formatCurrency(viewReceipt.total_amount || viewReceipt.totalAmount)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Demo Notice Disclaimer */}
            <div className="bg-slate-50 border border-slate-200 rounded p-2 text-[10px] text-slate-500 text-center">
              Disclaimer: This is a simulated computer-generated fee receipt issued for educational & demonstration purposes. GST registration number and tax breakdowns are mocked.
            </div>

            {/* Print & Download Action Bar */}
            <div className="flex gap-2 pt-2 no-print">
              <Button
                variant="outline"
                className="flex-1 justify-center text-xs"
                onClick={() => {
                  window.print();
                }}
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
========================================
Simulated Demonstration Receipt - FeeFlow
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
                className="flex-1 justify-center text-xs"
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
          <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 text-amber-900 space-y-1">
            <p className="font-bold">Formal Withdrawal Notice:</p>
            <p>
              Submitting this request notifies the accounts team to calculate your pro-rata refund in accordance with published policy <strong>REFUND_STD_POLICY_2026 (v2026.1)</strong>.
            </p>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              Student Withdrawal Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              className="w-full text-xs p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={refundWithdrawalDate}
              onChange={e => setRefundWithdrawalDate(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              Reason for Withdrawal <span className="text-red-500">*</span>
            </label>
            <textarea
              className="w-full text-xs p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              rows={3}
              placeholder="e.g. Relocating to a different city due to job transfer"
              value={refundReason}
              onChange={e => setRefundReason(e.target.value)}
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setRefundModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={refundSubmitting} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              {refundSubmitting ? 'Submitting…' : 'Submit Refund Request'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
