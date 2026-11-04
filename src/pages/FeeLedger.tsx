import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatDate } from '../utils/helpers';
import { Badge, Button, Card, Modal, Select, Table, EmptyState, Input } from '../components/ui';
import type { Student, Instalment } from '../types';
import { api } from '../utils/api';
import {
  Search, BookOpen, Plus, FileText, Printer, CheckCircle,
  AlertTriangle, Clock, Bell, ArrowRight, ShieldCheck, Download,
  ExternalLink, CreditCard, ChevronRight
} from 'lucide-react';

export default function FeeLedger() {
  const [searchParams] = useSearchParams();
  const paramStudentId = searchParams.get('student_id');

  const { students, updateStudent, addPayment, addNotification, refreshData, backendConnected } = useApp();
  const [q, setQ] = useState('');
  const [centreFilter, setCentreFilter] = useState('All');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [paymentModal, setPaymentModal] = useState<Instalment | null>(null);
  const [receiptModal, setReceiptModal] = useState<any | null>(null);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [studentReminders, setStudentReminders] = useState<any[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const centres = ['All', 'Jaipur Main', 'Jaipur West', 'Kota', 'Ajmer'];

  const filtered = useMemo(() =>
    students.filter(s => {
      const matchQ = s.name.toLowerCase().includes(q.toLowerCase()) ||
        s.id.toLowerCase().includes(q.toLowerCase()) ||
        s.rollNumber.toLowerCase().includes(q.toLowerCase());
      const matchCentre = centreFilter === 'All' || s.centre === centreFilter;
      return matchQ && matchCentre;
    }), [students, q, centreFilter]
  );

  // Synchronize selection with query parameter if present
  useEffect(() => {
    if (paramStudentId && students.length > 0) {
      const match = students.find(s => s.id === paramStudentId);
      if (match) setSelectedStudent(match);
    }
  }, [paramStudentId, students]);

  // Select first student by default if none selected
  const activeStudent = selectedStudent ?? filtered[0] ?? null;

  // Load live receipts and reminder log whenever activeStudent changes
  useEffect(() => {
    if (!activeStudent?.id) return;
    let isCurrent = true;
    setLoadingDetails(true);

    Promise.all([
      api.getReceipts(activeStudent.id).catch(() => []),
      api.getStudentReminders(activeStudent.id).catch(() => []),
    ]).then(([recRes, remRes]) => {
      if (!isCurrent) return;
      setReceipts(Array.isArray(recRes) ? recRes : []);
      setStudentReminders(Array.isArray(remRes) ? remRes : []);
    }).finally(() => {
      if (isCurrent) setLoadingDetails(false);
    });

    return () => { isCurrent = false; };
  }, [activeStudent?.id]);

  const handleRecordPayment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!activeStudent || !paymentModal) return;
    const fd = new FormData(e.currentTarget);
    const paid = parseFloat(fd.get('amount') as string) || 0;
    const method = (fd.get('method') as any) || 'UPI';
    const refNo = (fd.get('ref') as string) || `REC-${Date.now()}`;
    const date = (fd.get('date') as string) || new Date().toISOString().split('T')[0];

    setSubmitting(true);
    setModalError(null);

    try {
      await addPayment({
        id: crypto.randomUUID(),
        transactionId: `TXN-${Date.now()}`,
        studentId: activeStudent.id,
        studentName: activeStudent.name,
        amount: paid,
        paymentDate: date,
        method,
        referenceNo: refNo,
        status: 'Success',
        instalmentId: paymentModal.id,
        centre: activeStudent.centre,
        notes: `Instalment ${paymentModal.number} payment`,
      });

      setPaymentModal(null);
      addNotification({
        type: 'success',
        title: 'Payment recorded',
        message: `₹${paid.toLocaleString('en-IN')} recorded for ${activeStudent.name}. Reconciled on backend.`,
      });
      await refreshData();

      // Refresh receipts and reminders
      const [newRec, newRem] = await Promise.all([
        api.getReceipts(activeStudent.id).catch(() => []),
        api.getStudentReminders(activeStudent.id).catch(() => []),
      ]);
      setReceipts(newRec || []);
      setStudentReminders(newRem || []);
    } catch (err: any) {
      setModalError(err.message || 'Payment recording failed');
    } finally {
      setSubmitting(false);
    }
  };

  const getDueOrOverdueInfo = (ins: Instalment) => {
    if (ins.status === 'Paid') return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(ins.dueDate);
    due.setHours(0, 0, 0, 0);
    const diffTime = today.getTime() - due.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays > 0) {
      return { isOverdue: true, text: `${diffDays}d overdue` };
    } else if (diffDays === 0) {
      return { isOverdue: false, text: 'Due today' };
    } else {
      const inDays = Math.abs(diffDays);
      return { isOverdue: false, text: `${inDays}d left` };
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-[#E3E6E9] rounded-2xl px-5 py-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
        <div>
          <h1 className="text-sm font-bold text-[#20283A] leading-tight">Student Fee Ledger & Financial Accounts</h1>
          <p className="text-[11px] text-[#718096] leading-tight mt-0.5">
            Full audit ledger, statutory instalment schedule, official GST receipts and reminder tracking
          </p>
        </div>
        {activeStudent && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#718096]">Selected:</span>
            <span className="text-xs font-bold text-[#20283A] bg-[#EEF0F1] px-2.5 py-1 rounded-xl">
              {activeStudent.name} ({activeStudent.id})
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left Column: Student Selector */}
        <Card className="overflow-hidden flex flex-col h-[750px]">
          {/* Search & Centre Filter Toolbar */}
          <div className="p-3.5 border-b border-[#E3E6E9] space-y-2 bg-[#FAFAFA]">
            <div className="flex items-center gap-2 bg-white border border-[#E3E6E9] rounded-xl px-3 py-1.5 focus-within:border-[#E95435] transition-all">
              <Search className="w-3.5 h-3.5 text-[#718096] flex-shrink-0" />
              <input
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Search name, ID, roll no..."
                className="bg-transparent text-xs text-[#20283A] placeholder:text-[#718096] outline-none flex-1 font-medium"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none text-[11px]">
              {centres.map(c => (
                <button
                  key={c}
                  onClick={() => setCentreFilter(c)}
                  className={`px-2 py-0.5 rounded-lg font-medium whitespace-nowrap transition-colors cursor-pointer ${
                    centreFilter === c
                      ? 'bg-[#20283A] text-white font-semibold shadow-xs'
                      : 'bg-white border border-[#E3E6E9] text-[#718096] hover:bg-[#EEF0F1] hover:text-[#20283A]'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Student List */}
          <div className="overflow-y-auto flex-1 divide-y divide-[#E3E6E9]">
            {filtered.length === 0 ? (
              <EmptyState icon={<BookOpen className="w-6 h-6" />} title="No students found" />
            ) : (
              filtered.map(s => {
                const isSelected = activeStudent?.id === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => setSelectedStudent(s)}
                    className={`w-full text-left p-3.5 transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#FDF1ED] border-l-4 border-l-[#E95435]'
                        : 'hover:bg-[#F8FAFC]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className={`text-xs font-bold truncate ${isSelected ? 'text-[#E95435]' : 'text-[#20283A]'}`}>
                          {s.name}
                        </p>
                        <p className="text-[10px] text-[#718096] mt-0.5 truncate">{s.id} · {s.course}</p>
                      </div>
                      <Badge status={s.feeStatus} />
                    </div>

                    <div className="flex items-center justify-between mt-2 text-[11px]">
                      <span className="text-[#718096] font-medium">{s.centre}</span>
                      {s.outstanding > 0 ? (
                        <span className="font-bold text-[#BA2525] tabular-nums">{formatCurrency(s.outstanding)} due</span>
                      ) : (
                        <span className="font-bold text-[#1B7043]">Fully Paid</span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </Card>

        {/* Right Column: Ledger Detail */}
        <div className="lg:col-span-2 space-y-5">
          {activeStudent ? (
            <>
              {/* Financial Hierarchy Card */}
              <Card className="p-6">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-5 pb-4 border-b border-[#E3E6E9]">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-[#20283A]">{activeStudent.name}</h2>
                      <Badge status={activeStudent.feeStatus} />
                    </div>
                    <p className="text-xs text-[#718096] mt-0.5">
                      Student ID: <strong className="text-[#20283A]">{activeStudent.id}</strong> · Roll: <strong className="text-[#20283A]">{activeStudent.rollNumber}</strong> · {activeStudent.course} ({activeStudent.batch}) · {activeStudent.centre}
                    </p>
                    <p className="text-[11px] text-[#718096] mt-0.5">
                      Parent: <strong className="text-[#20283A]">{activeStudent.parentName}</strong> ({activeStudent.parentPhone})
                    </p>
                  </div>
                </div>

                {/* 4-Box Financial Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3.5 bg-[#FAFAFA] border border-[#E3E6E9] rounded-2xl">
                    <p className="text-[10px] font-bold text-[#718096] uppercase tracking-wider">Course Fee</p>
                    <p className="text-lg font-bold text-[#20283A] tabular-nums mt-0.5">{formatCurrency(activeStudent.totalFee)}</p>
                    <p className="text-[10px] text-[#718096] mt-0.5">Base Structure</p>
                  </div>

                  <div className="p-3.5 bg-[#FAFAFA] border border-[#E3E6E9] rounded-2xl">
                    <p className="text-[10px] font-bold text-[#718096] uppercase tracking-wider">Discounts</p>
                    <p className="text-lg font-bold text-[#718096] tabular-nums mt-0.5">{formatCurrency(activeStudent.totalDiscount ?? (activeStudent as any).discount ?? 0)}</p>
                    <p className="text-[10px] text-[#718096] mt-0.5">Scholarships</p>
                  </div>

                  <div className="p-3.5 bg-[#EBF7EE] border border-[#CDEED6] rounded-2xl">
                    <p className="text-[10px] font-bold text-[#1B7043] uppercase tracking-wider">Paid Amount</p>
                    <p className="text-lg font-bold text-[#1B7043] tabular-nums mt-0.5">{formatCurrency(activeStudent.amountPaid)}</p>
                    <p className="text-[10px] text-[#1B7043] mt-0.5">Verified</p>
                  </div>

                  <div className={`p-3.5 rounded-2xl border ${
                    activeStudent.outstanding > 0 ? 'bg-[#FDF2F2] border-[#F9CACA]' : 'bg-[#FAFAFA] border-[#E3E6E9]'
                  }`}>
                    <p className="text-[10px] font-bold text-[#BA2525] uppercase tracking-wider">Balance Due</p>
                    <p className="text-lg font-bold text-[#BA2525] tabular-nums mt-0.5">{formatCurrency(activeStudent.outstanding)}</p>
                    <p className="text-[10px] text-[#BA2525] mt-0.5">
                      {activeStudent.feeStatus === 'Overdue' ? 'Past Deadline' : 'Net Remaining'}
                    </p>
                  </div>
                </div>
              </Card>

              {/* Instalments Schedule Table */}
              <Card className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-[#20283A]">Statutory Instalment Schedule</h3>
                    <p className="text-[11px] text-[#718096] mt-0.5">Tracks due dates, milestones, payments and remaining balances</p>
                  </div>
                  <span className="text-[11px] font-semibold text-[#718096] bg-[#EEF0F1] px-2.5 py-0.5 rounded-lg">
                    {activeStudent.instalments.length} Instalments
                  </span>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-[#E3E6E9]">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-[#FAFAFA] text-[#718096] border-b border-[#E3E6E9] uppercase font-semibold text-[10px] tracking-wider">
                      <tr>
                        <th className="py-2.5 px-3.5">#</th>
                        <th className="py-2.5 px-3.5">Due Date & Timeline</th>
                        <th className="py-2.5 px-3.5 text-right">Amount</th>
                        <th className="py-2.5 px-3.5 text-right">Paid</th>
                        <th className="py-2.5 px-3.5 text-right">Remaining</th>
                        <th className="py-2.5 px-3.5 text-center">Status</th>
                        <th className="py-2.5 px-3.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E3E6E9]">
                      {activeStudent.instalments.map(ins => {
                        const due = ins.amount - ins.paid;
                        const dueInfo = getDueOrOverdueInfo(ins);
                        const isPaid = ins.status === 'Paid';

                        return (
                          <tr key={ins.id} className="hover:bg-[#F8FAFC] transition-colors">
                            <td className="py-3 px-3.5 font-bold text-[#20283A]">#{ins.number}</td>
                            <td className="py-3 px-3.5">
                              <div className="font-semibold text-[#20283A]">{formatDate(ins.dueDate)}</div>
                              {dueInfo && (
                                <span className={`text-[10px] font-bold ${dueInfo.isOverdue ? 'text-[#BA2525]' : 'text-[#718096]'}`}>
                                  {dueInfo.text}
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-3.5 text-right font-bold text-[#20283A] tabular-nums">{formatCurrency(ins.amount)}</td>
                            <td className="py-3 px-3.5 text-right font-bold text-[#1B7043] tabular-nums">{formatCurrency(ins.paid)}</td>
                            <td className="py-3 px-3.5 text-right font-bold text-[#BA2525] tabular-nums">
                              {due > 0 ? formatCurrency(due) : <span className="text-[#1B7043]">₹0</span>}
                            </td>
                            <td className="py-3 px-3.5 text-center">
                              <Badge status={ins.status} />
                            </td>
                            <td className="py-3 px-3.5 text-right">
                              {!isPaid ? (
                                <Button
                                  size="sm"
                                  onClick={() => setPaymentModal(ins)}
                                  className="text-[11px] py-1 px-2.5"
                                >
                                  Record
                                </Button>
                              ) : (
                                <span className="text-[11px] font-semibold text-[#1B7043] flex items-center justify-end gap-1">
                                  <CheckCircle className="w-3.5 h-3.5" /> Reconciled
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Official Tax Receipts */}
              <Card className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-[#20283A]">Official Verified Tax Receipts</h3>
                    <p className="text-[11px] text-[#718096] mt-0.5">Audit-compliant GST receipts with break-ups</p>
                  </div>
                  <span className="text-[11px] font-semibold text-[#718096] bg-[#EEF0F1] px-2.5 py-0.5 rounded-lg">
                    {receipts.length} Issued
                  </span>
                </div>

                {loadingDetails ? (
                  <div className="py-8 text-center text-xs text-[#718096]">Loading receipts...</div>
                ) : receipts.length === 0 ? (
                  <div className="py-8 text-center text-xs text-[#718096] bg-[#FAFAFA] rounded-2xl border border-[#E3E6E9]">
                    No receipts issued yet. Payments posted to instalments will generate official tax receipts automatically.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-2xl border border-[#E3E6E9]">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-[#FAFAFA] text-[#718096] border-b border-[#E3E6E9] uppercase font-semibold text-[10px] tracking-wider">
                        <tr>
                          <th className="py-2.5 px-3.5">Receipt #</th>
                          <th className="py-2.5 px-3.5">Date</th>
                          <th className="py-2.5 px-3.5 text-right">Base Amount</th>
                          <th className="py-2.5 px-3.5 text-right">GST (18%)</th>
                          <th className="py-2.5 px-3.5 text-right">Total</th>
                          <th className="py-2.5 px-3.5 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E3E6E9]">
                        {receipts.map((r: any) => (
                          <tr key={r.id || r.receipt_no} className="hover:bg-[#F8FAFC] transition-colors">
                            <td className="py-3 px-3.5 font-bold text-[#20283A]">{r.receipt_no}</td>
                            <td className="py-3 px-3.5 text-[#718096]">{formatDate(r.date)}</td>
                            <td className="py-3 px-3.5 text-right text-[#20283A] tabular-nums">{formatCurrency(r.base_amount)}</td>
                            <td className="py-3 px-3.5 text-right text-[#718096] tabular-nums">
                              {formatCurrency((r.cgst_amount || 0) + (r.sgst_amount || 0))}
                            </td>
                            <td className="py-3 px-3.5 text-right font-bold text-[#1B7043] tabular-nums">
                              {formatCurrency(r.total_amount)}
                            </td>
                            <td className="py-3 px-3.5 text-center">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setReceiptModal(r)}
                                className="text-[11px] py-1 px-2.5 flex items-center gap-1 mx-auto"
                              >
                                <Printer className="w-3 h-3 text-[#E95435]" /> View
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              {/* Statutory Reminder History */}
              <Card className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-[#20283A]">Statutory Reminder & Notification Log</h3>
                    <p className="text-[11px] text-[#718096] mt-0.5">Multi-channel dispatches with unique event key tracking</p>
                  </div>
                  <span className="text-[11px] font-semibold text-[#718096] bg-[#EEF0F1] px-2.5 py-0.5 rounded-lg">
                    {studentReminders.length} Logged
                  </span>
                </div>

                {studentReminders.length === 0 ? (
                  <div className="py-8 text-center text-xs text-[#718096] bg-[#FAFAFA] rounded-2xl border border-[#E3E6E9]">
                    No reminder logs found for this student.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-2xl border border-[#E3E6E9]">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-[#FAFAFA] text-[#718096] border-b border-[#E3E6E9] uppercase font-semibold text-[10px] tracking-wider">
                        <tr>
                          <th className="py-2.5 px-3.5">Scheduled</th>
                          <th className="py-2.5 px-3.5">Milestone / Key</th>
                          <th className="py-2.5 px-3.5">Channel</th>
                          <th className="py-2.5 px-3.5">Status</th>
                          <th className="py-2.5 px-3.5">Delivery</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E3E6E9]">
                        {studentReminders.map((rem: any) => (
                          <tr key={rem.id} className="hover:bg-[#F8FAFC]">
                            <td className="py-3 px-3.5 font-medium text-[#20283A]">{formatDate(rem.scheduled_date)}</td>
                            <td className="py-3 px-3.5">
                              <span className="font-mono text-[10px] text-[#718096] bg-[#EEF0F1] px-1.5 py-0.5 rounded">
                                {rem.event_key || rem.id}
                              </span>
                            </td>
                            <td className="py-3 px-3.5 text-[#20283A] font-semibold">{rem.channel}</td>
                            <td className="py-3 px-3.5">
                              <Badge status={rem.status} />
                            </td>
                            <td className="py-3 px-3.5 text-[11px] text-[#718096]">
                              {rem.delivery_status === 'delivered' ? '✓ Delivered' : '• Simulated'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </>
          ) : (
            <Card className="p-12 text-center">
              <BookOpen className="w-10 h-10 text-[#718096] mx-auto mb-3" />
              <h3 className="text-sm font-bold text-[#20283A]">Select a student</h3>
              <p className="text-xs text-[#718096] mt-1">Choose a student from the directory to view the complete financial ledger.</p>
            </Card>
          )}
        </div>
      </div>

      {/* Record Payment Modal */}
      {paymentModal && activeStudent && (
        <Modal
          open={Boolean(paymentModal)}
          onClose={() => { setPaymentModal(null); setModalError(null); }}
          title={`Record Payment — Instalment #${paymentModal.number}`}
          size="md"
        >
          <form onSubmit={handleRecordPayment} className="space-y-4">
            <div className="bg-[#EEF0F1] p-3.5 rounded-2xl text-xs space-y-1">
              <div className="flex justify-between text-[#718096]">
                <span>Student:</span>
                <span className="font-bold text-[#20283A]">{activeStudent.name} ({activeStudent.id})</span>
              </div>
              <div className="flex justify-between text-[#718096]">
                <span>Instalment Total:</span>
                <span className="font-bold text-[#20283A]">{formatCurrency(paymentModal.amount)}</span>
              </div>
              <div className="flex justify-between text-[#718096]">
                <span>Remaining Due:</span>
                <span className="font-bold text-[#BA2525]">{formatCurrency(paymentModal.amount - paymentModal.paid)}</span>
              </div>
            </div>

            {modalError && (
              <div className="p-3 bg-[#FDF2F2] border border-[#F9CACA] rounded-xl text-xs text-[#BA2525]">
                {modalError}
              </div>
            )}

            <Input
              label="Payment Amount (₹)"
              name="amount"
              type="number"
              min="1"
              max={paymentModal.amount - paymentModal.paid}
              defaultValue={paymentModal.amount - paymentModal.paid}
              required
            />

            <Select
              label="Payment Method"
              name="method"
              options={[
                { value: 'UPI', label: 'UPI (PhonePe, GPay, Paytm)' },
                { value: 'Bank Transfer', label: 'NEFT / RTGS / IMPS' },
                { value: 'Cash', label: 'Cash (Receipt Counter)' },
                { value: 'Cheque', label: 'Bank Cheque / DD' },
                { value: 'Card', label: 'Credit / Debit Card' },
              ]}
            />

            <Input
              label="Transaction / Bank Reference No."
              name="ref"
              placeholder="e.g. UPI-984729184 or CHQ-00123"
              required
            />

            <Input
              label="Payment Date"
              name="date"
              type="date"
              defaultValue={new Date().toISOString().split('T')[0]}
              required
            />

            <div className="flex justify-end gap-2 pt-3 border-t border-[#E3E6E9]">
              <Button
                type="button"
                variant="outline"
                onClick={() => setPaymentModal(null)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                loading={submitting}
              >
                Confirm & Issue Receipt
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Official Tax Receipt Modal */}
      {receiptModal && (
        <Modal
          open={Boolean(receiptModal)}
          onClose={() => setReceiptModal(null)}
          title={`Official Tax Receipt — ${receiptModal.receipt_no}`}
          size="lg"
        >
          <div className="p-6 bg-white border border-[#E3E6E9] rounded-2xl space-y-5 print:border-none print:shadow-none">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-[#E3E6E9] pb-4">
              <div>
                <h2 className="text-lg font-bold text-[#20283A]">FeeFlow Institute of Education</h2>
                <p className="text-xs text-[#718096]">Branch: {activeStudent?.centre || 'Jaipur Main'}</p>
                <p className="text-[11px] text-[#718096]">GSTIN: {receiptModal.gst_number || '08AAACP1234F1Z5'}</p>
              </div>
              <div className="text-right">
                <span className="text-xs font-bold text-[#1B7043] bg-[#EBF7EE] border border-[#CDEED6] px-2.5 py-1 rounded-xl">
                  PAID & VERIFIED
                </span>
                <p className="text-xs font-bold text-[#20283A] mt-2">Receipt: {receiptModal.receipt_no}</p>
                <p className="text-[11px] text-[#718096]">Date: {formatDate(receiptModal.date)}</p>
              </div>
            </div>

            {/* Student metadata */}
            <div className="grid grid-cols-2 gap-4 text-xs bg-[#FAFAFA] p-3.5 rounded-xl border border-[#E3E6E9]">
              <div>
                <span className="text-[#718096]">Student Name:</span>
                <p className="font-bold text-[#20283A]">{activeStudent?.name}</p>
                <span className="text-[#718096] mt-1 block">Roll Number:</span>
                <p className="font-semibold text-[#20283A]">{activeStudent?.rollNumber}</p>
              </div>
              <div>
                <span className="text-[#718096]">Course & Batch:</span>
                <p className="font-bold text-[#20283A]">{activeStudent?.course} ({activeStudent?.batch})</p>
                <span className="text-[#718096] mt-1 block">Parent Phone:</span>
                <p className="font-semibold text-[#20283A]">{activeStudent?.parentPhone}</p>
              </div>
            </div>

            {/* Financial breakdown */}
            <div className="border border-[#E3E6E9] rounded-xl overflow-hidden text-xs">
              <table className="w-full text-left">
                <thead className="bg-[#FAFAFA] border-b border-[#E3E6E9] text-[#718096]">
                  <tr>
                    <th className="p-3">Description</th>
                    <th className="p-3 text-right">Tax Rate</th>
                    <th className="p-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E3E6E9]">
                  <tr>
                    <td className="p-3">Academic Tuition Fee</td>
                    <td className="p-3 text-right text-[#718096]">18.0%</td>
                    <td className="p-3 text-right font-semibold">{formatCurrency(receiptModal.base_amount)}</td>
                  </tr>
                  <tr>
                    <td className="p-3 text-[#718096]">CGST (Central Tax)</td>
                    <td className="p-3 text-right text-[#718096]">9.0%</td>
                    <td className="p-3 text-right text-[#718096]">{formatCurrency(receiptModal.cgst_amount || 0)}</td>
                  </tr>
                  <tr>
                    <td className="p-3 text-[#718096]">SGST (State Tax)</td>
                    <td className="p-3 text-right text-[#718096]">9.0%</td>
                    <td className="p-3 text-right text-[#718096]">{formatCurrency(receiptModal.sgst_amount || 0)}</td>
                  </tr>
                  <tr className="bg-[#FAFAFA] font-bold text-sm">
                    <td className="p-3 text-[#20283A]" colSpan={2}>Total Paid Amount</td>
                    <td className="p-3 text-right text-[#1B7043]">{formatCurrency(receiptModal.total_amount)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-[#E3E6E9] flex items-center justify-between text-[11px] text-[#718096]">
              <p>This is a computer-generated tax invoice. No signature required.</p>
              <div className="flex gap-2 no-print">
                <Button size="sm" variant="outline" onClick={() => window.print()}>
                  <Printer className="w-3.5 h-3.5" /> Print
                </Button>
                <Button size="sm" onClick={() => setReceiptModal(null)}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
