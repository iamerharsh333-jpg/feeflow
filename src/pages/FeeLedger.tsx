import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatDate } from '../utils/helpers';
import { Badge, Button, Card, Modal, Select, Table, EmptyState, Input } from '../components/ui';
import type { Student, Instalment } from '../types';
import { api } from '../utils/api';
import {
  Search, BookOpen, Plus, FileText, Printer, CheckCircle,
  AlertTriangle, Clock, Bell, ArrowRight, ShieldCheck, Download
} from 'lucide-react';

export default function FeeLedger() {
  const [searchParams] = useSearchParams();
  const paramStudentId = searchParams.get('student_id');

  const { students, updateStudent, addPayment, addNotification, refreshData, backendConnected } = useApp();
  const [q, setQ] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [paymentModal, setPaymentModal] = useState<Instalment | null>(null);
  const [receiptModal, setReceiptModal] = useState<any | null>(null);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [studentReminders, setStudentReminders] = useState<any[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const filtered = useMemo(() =>
    students.filter(s =>
      s.name.toLowerCase().includes(q.toLowerCase()) ||
      s.id.toLowerCase().includes(q.toLowerCase()) ||
      s.rollNumber.toLowerCase().includes(q.toLowerCase())
    ), [students, q]
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
      return { isOverdue: true, text: `${diffDays} day${diffDays !== 1 ? 's' : ''} overdue` };
    } else if (diffDays === 0) {
      return { isOverdue: false, text: 'Due today' };
    } else {
      const inDays = Math.abs(diffDays);
      return { isOverdue: false, text: `Due in ${inDays} day${inDays !== 1 ? 's' : ''}` };
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-slate-900">Student Fee Ledger</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Complete financial record, statutory instalment schedule, official GST receipts & reminder history
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Student list */}
        <Card className="overflow-hidden">
          <div className="p-3 border-b border-slate-100">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
              <Search className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              <input
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Search by name, ID or roll #…"
                className="bg-transparent text-xs text-slate-900 placeholder:text-slate-400 outline-none flex-1"
              />
            </div>
          </div>
          <div className="overflow-y-auto max-h-[700px] divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <EmptyState icon={<BookOpen className="w-8 h-8" />} title="No students found" />
            ) : (
              filtered.map(s => (
                <button
                  key={s.id}
                  onClick={() => setSelectedStudent(s)}
                  className={`w-full text-left px-4 py-3 transition-colors ${
                    activeStudent?.id === s.id ? 'bg-indigo-50/70 border-l-4 border-l-indigo-600' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{s.name}</p>
                      <p className="text-xs text-slate-500">{s.id} · {s.course}</p>
                    </div>
                    <Badge status={s.feeStatus} />
                  </div>
                  <div className="flex items-center justify-between mt-1 text-xs">
                    <span className="text-slate-500">{s.centre}</span>
                    {s.outstanding > 0 ? (
                      <span className="font-semibold text-rose-600">{formatCurrency(s.outstanding)} due</span>
                    ) : (
                      <span className="font-semibold text-emerald-600">Cleared</span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </Card>

        {/* Ledger detail */}
        <div className="lg:col-span-2 space-y-4">
          {activeStudent ? (
            <>
              {/* Header card with complete financial hierarchy */}
              <Card className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-slate-900">{activeStudent.name}</h2>
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                        {activeStudent.rollNumber}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Student ID: <span className="font-mono font-medium text-slate-700">{activeStudent.id}</span> · {activeStudent.course} · {activeStudent.batch} Batch · {activeStudent.centre}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Parent: <span className="font-medium text-slate-700">{activeStudent.parentName}</span> ({activeStudent.parentPhone})
                    </p>
                  </div>
                  <Badge status={activeStudent.feeStatus} className="text-xs px-3 py-1" />
                </div>

                {/* Complete Financial Hierarchy (Gross, Discount, Net, Paid, Outstanding) */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Gross Course Fee</p>
                    <p className="text-base font-bold text-slate-900 mt-0.5">{formatCurrency(activeStudent.totalFee)}</p>
                    {activeStudent.totalDiscount && activeStudent.totalDiscount > 0 ? (
                      <p className="text-[11px] text-emerald-700 font-medium mt-0.5">
                        - {formatCurrency(activeStudent.totalDiscount)} Scholarship
                      </p>
                    ) : (
                      <p className="text-[11px] text-slate-400 mt-0.5">Standard Fee</p>
                    )}
                  </div>

                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Effective Net Fee</p>
                    <p className="text-base font-bold text-slate-900 mt-0.5">
                      {formatCurrency(activeStudent.effectiveFee || (activeStudent.totalFee - (activeStudent.totalDiscount || 0)))}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Post-discount payable</p>
                  </div>

                  <div className="bg-emerald-50/70 border border-emerald-100 rounded-lg p-3">
                    <p className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider">Total Received</p>
                    <p className="text-base font-bold text-emerald-700 mt-0.5">{formatCurrency(activeStudent.amountPaid)}</p>
                    <p className="text-[11px] text-emerald-600 mt-0.5">Reconciled to bank</p>
                  </div>

                  <div className={`rounded-lg p-3 border ${
                    activeStudent.outstanding > 0
                      ? 'bg-rose-50/70 border-rose-200'
                      : 'bg-emerald-50/70 border-emerald-100'
                  }`}>
                    <p className={`text-[11px] font-semibold uppercase tracking-wider ${
                      activeStudent.outstanding > 0 ? 'text-rose-800' : 'text-emerald-800'
                    }`}>
                      Remaining Balance
                    </p>
                    <p className={`text-base font-bold mt-0.5 ${
                      activeStudent.outstanding > 0 ? 'text-rose-600' : 'text-emerald-600'
                    }`}>
                      {formatCurrency(activeStudent.outstanding)}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {activeStudent.outstanding > 0 ? 'Action required' : 'Fully cleared'}
                    </p>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mt-4 pt-2">
                  <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                    <span className="font-medium">Fee Collection Completion</span>
                    <span className="font-bold text-slate-700">
                      {Math.round((activeStudent.amountPaid / (activeStudent.effectiveFee || activeStudent.totalFee)) * 100)}%
                    </span>
                  </div>
                  <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.min(100, (activeStudent.amountPaid / (activeStudent.effectiveFee || activeStudent.totalFee)) * 100)}%`
                      }}
                    />
                  </div>
                </div>
              </Card>

              {/* Instalment schedule with dynamic overdue indicators */}
              <Card className="overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Instalment Schedule</h3>
                    <p className="text-[11px] text-slate-500">Statutory payment breakdown with overdue tracking</p>
                  </div>
                  <span className="text-xs text-slate-400">{activeStudent.instalments.length} instalments</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {activeStudent.instalments.map(ins => {
                    const dueInfo = getDueOrOverdueInfo(ins);
                    const remaining = Math.max(0, ins.amount - ins.paid);

                    return (
                      <div key={ins.id} className="px-5 py-4 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className={`w-2.5 h-10 rounded-full flex-shrink-0 ${
                            ins.status === 'Paid' ? 'bg-emerald-500' :
                            ins.status === 'Overdue' ? 'bg-rose-500' :
                            ins.status === 'Partially Paid' ? 'bg-amber-400' : 'bg-slate-300'
                          }`} />
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-bold text-slate-900">Instalment {ins.number}</p>
                              {dueInfo?.isOverdue && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                  {dueInfo.text}
                                </span>
                              )}
                              {!dueInfo?.isOverdue && dueInfo?.text && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600">
                                  {dueInfo.text}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">
                              Due Date: <span className="font-medium text-slate-700">{formatDate(ins.dueDate)}</span>
                              {ins.paidDate && ` · Paid on: ${formatDate(ins.paidDate)}`}
                            </p>
                            {ins.receiptNo && (
                              <p className="text-[11px] text-indigo-600 font-medium mt-0.5">
                                Receipt #{ins.receiptNo}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-sm font-bold text-slate-900">{formatCurrency(ins.amount)}</p>
                            {ins.paid > 0 && ins.paid < ins.amount && (
                              <p className="text-xs text-amber-600 font-medium">Paid: {formatCurrency(ins.paid)}</p>
                            )}
                            {remaining > 0 && ins.paid > 0 && (
                              <p className="text-[11px] text-rose-600 font-medium">Due: {formatCurrency(remaining)}</p>
                            )}
                            <div className="mt-1">
                              <Badge status={ins.status} />
                            </div>
                          </div>

                          {ins.status !== 'Paid' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setPaymentModal(ins)}
                              className="flex-shrink-0"
                            >
                              <Plus className="w-3.5 h-3.5" /> Record
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>

              {/* Official Receipts History */}
              <Card className="overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Official GST Fee Receipts</h3>
                    <p className="text-[11px] text-slate-500">Verified payment vouchers with 18% GST tax breakdown</p>
                  </div>
                  <span className="text-xs text-slate-400">{receipts.length} receipt{receipts.length !== 1 ? 's' : ''}</span>
                </div>
                {receipts.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 text-slate-600 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-100">
                        <tr>
                          <th className="py-2.5 px-4">Receipt #</th>
                          <th className="py-2.5 px-4">Date</th>
                          <th className="py-2.5 px-4 text-right">Base Amount</th>
                          <th className="py-2.5 px-4 text-right">GST (18%)</th>
                          <th className="py-2.5 px-4 text-right">Total Paid</th>
                          <th className="py-2.5 px-4">Method / Ref</th>
                          <th className="py-2.5 px-4 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {receipts.map(r => (
                          <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-3 px-4 font-mono font-bold text-indigo-700">{r.receipt_no}</td>
                            <td className="py-3 px-4 text-slate-600">{formatDate(r.date)}</td>
                            <td className="py-3 px-4 text-right font-medium text-slate-700">{formatCurrency(r.base_amount)}</td>
                            <td className="py-3 px-4 text-right text-slate-500">
                              {formatCurrency(r.cgst_amount + r.sgst_amount)}
                            </td>
                            <td className="py-3 px-4 text-right font-bold text-emerald-700">{formatCurrency(r.total_amount)}</td>
                            <td className="py-3 px-4 text-slate-600">
                              <span className="font-medium text-slate-800">{r.payment_method}</span>
                              <span className="text-[10px] text-slate-400 block font-mono">{r.transaction_id}</span>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setReceiptModal(r)}
                                className="inline-flex items-center gap-1 text-[11px] py-1 px-2"
                              >
                                <FileText className="w-3 h-3 text-indigo-600" /> View Tax Invoice
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="py-8 text-center text-xs text-slate-400">
                    No receipts generated yet for this student.
                  </div>
                )}
              </Card>

              {/* Automated Reminder History */}
              <Card className="overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Communication & Reminder History</h3>
                    <p className="text-[11px] text-slate-500">Scheduled, sent and suppressed fee alerts for parent</p>
                  </div>
                  <span className="text-xs text-slate-400">{studentReminders.length} logged</span>
                </div>
                {studentReminders.length > 0 ? (
                  <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                    {studentReminders.map(rem => (
                      <div key={rem.id} className="p-4 flex items-start justify-between gap-3 text-xs">
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900">{rem.channel} Notification</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-medium uppercase">
                              {rem.lang === 'hi' ? 'Hindi' : 'English'}
                            </span>
                            <Badge status={rem.status} className="text-[10px] py-0.2" />
                          </div>
                          <p className="text-slate-600 bg-slate-50 p-2 rounded border border-slate-100 text-[11px] leading-relaxed">
                            "{rem.message}"
                          </p>
                          <div className="flex items-center gap-3 text-[10px] text-slate-400">
                            <span>Target: {rem.parent_phone}</span>
                            <span>·</span>
                            <span>Instalment Due: {formatDate(rem.due_date)}</span>
                            {rem.sent_at && (
                              <>
                                <span>·</span>
                                <span>Delivered: {formatDate(rem.sent_at)}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-xs text-slate-400">
                    No reminder logs found for this student.
                  </div>
                )}
              </Card>
            </>
          ) : (
            <Card>
              <EmptyState
                icon={<BookOpen className="w-10 h-10" />}
                title="Select a student"
                description="Choose a student from the list to view their fee ledger."
              />
            </Card>
          )}
        </div>
      </div>

      {/* Payment recording modal */}
      <Modal open={!!paymentModal} onClose={() => setPaymentModal(null)} title="Record Payment">
        {paymentModal && activeStudent && (
          <form onSubmit={handleRecordPayment} className="p-5 space-y-4">
            <div className={`rounded-md px-3 py-2 text-xs border ${
              backendConnected
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}>
              {backendConnected
                ? 'Live Transaction — recorded directly to fee ledger database.'
                : 'Offline Demo Mode — updates local demonstration session only.'}
            </div>

            {modalError && (
              <div className="bg-red-50 border border-red-200 rounded-md p-2.5 text-xs text-red-700 font-medium">
                {modalError}
              </div>
            )}

            <div className="bg-slate-50 rounded-lg p-3 text-sm">
              <p className="font-medium text-slate-900">{activeStudent.name}</p>
              <p className="text-xs text-slate-500">Instalment {paymentModal.number} · Due {formatDate(paymentModal.dueDate)}</p>
              <p className="text-xs text-slate-700 mt-1">
                Instalment: {formatCurrency(paymentModal.amount)} · Already paid: {formatCurrency(paymentModal.paid)} · Remaining: {formatCurrency(paymentModal.amount - paymentModal.paid)}
              </p>
            </div>
            <Input
              label="Amount (₹)"
              name="amount"
              type="number"
              required
              min={1}
              max={paymentModal.amount - paymentModal.paid}
              defaultValue={paymentModal.amount - paymentModal.paid}
            />
            <Select label="Payment Method" name="method" options={[
              { value: 'Cash', label: 'Cash' },
              { value: 'UPI', label: 'UPI' },
              { value: 'Bank Transfer', label: 'Bank Transfer' },
              { value: 'Cheque', label: 'Cheque' },
              { value: 'Online', label: 'Online' },
            ]} />
            <Input label="Reference / Transaction ID" name="ref" placeholder="e.g. UTR / Chq # / Bank Ref" />
            <Input label="Payment Date" name="date" type="date" defaultValue={new Date().toISOString().split('T')[0]} />
            <div className="flex gap-3 justify-end pt-2">
              <Button variant="outline" type="button" onClick={() => setPaymentModal(null)} disabled={submitting}>Cancel</Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Recording…' : 'Record Payment'}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Printable Tax Invoice Modal */}
      <Modal open={!!receiptModal} onClose={() => setReceiptModal(null)} title="Official Tax Invoice / Fee Receipt" size="lg">
        {receiptModal && (
          <div className="p-6 space-y-6 text-slate-800" id="printable-receipt">
            {/* Header with institute identity and GST */}
            <div className="flex items-start justify-between border-b pb-4">
              <div>
                <h2 className="text-lg font-black tracking-tight text-indigo-900 uppercase">FEEFLOW INSTITUTE OF EXCELLENCE</h2>
                <p className="text-xs text-slate-600 mt-0.5">Corporate Office: FeeFlow Towers, JLN Marg, Jaipur, Rajasthan 302015</p>
                <p className="text-xs text-slate-500">Branch: {receiptModal.centre_name} Centre · Tel: +91 141 289 4000</p>
                <p className="text-xs font-semibold text-slate-700 mt-1">GSTIN: {receiptModal.gst_number}</p>
              </div>
              <div className="text-right">
                <span className="px-3 py-1 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-bold uppercase tracking-wider inline-block">
                  Tax Invoice
                </span>
                <p className="text-xs text-slate-500 mt-1.5">Original for Recipient</p>
              </div>
            </div>

            {/* Receipt metadata grid */}
            <div className="grid grid-cols-2 gap-4 text-xs bg-slate-50 p-4 rounded-lg border border-slate-200">
              <div>
                <p><span className="text-slate-500 font-medium">Receipt Number:</span> <span className="font-bold text-slate-900 font-mono">{receiptModal.receipt_no}</span></p>
                <p className="mt-1"><span className="text-slate-500 font-medium">Date of Issue:</span> <span className="font-semibold text-slate-800">{formatDate(receiptModal.date)}</span></p>
                <p className="mt-1"><span className="text-slate-500 font-medium">Payment Mode:</span> <span className="font-semibold text-slate-800">{receiptModal.payment_method}</span></p>
                <p className="mt-1"><span className="text-slate-500 font-medium">Bank Ref / Txn ID:</span> <span className="font-mono text-slate-700">{receiptModal.transaction_id}</span></p>
              </div>
              <div>
                <p><span className="text-slate-500 font-medium">Student Name:</span> <span className="font-bold text-slate-900">{receiptModal.student_name}</span></p>
                <p className="mt-1"><span className="text-slate-500 font-medium">Student ID / Roll:</span> <span className="font-mono text-slate-800">{receiptModal.student_id} ({receiptModal.roll_number})</span></p>
                <p className="mt-1"><span className="text-slate-500 font-medium">Course & Batch:</span> <span className="font-semibold text-slate-800">{receiptModal.course} · {receiptModal.batch}</span></p>
                <p className="mt-1"><span className="text-slate-500 font-medium">Parent / Guardian:</span> <span className="text-slate-700">{receiptModal.parent_name}</span></p>
              </div>
            </div>

            {/* Statutory breakdown table */}
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100/80 text-slate-700 font-semibold uppercase text-[10px]">
                  <tr>
                    <th className="py-2.5 px-3">Description of Service (SAC: 999293)</th>
                    <th className="py-2.5 px-3 text-center">Instalment</th>
                    <th className="py-2.5 px-3 text-right">Taxable Value</th>
                    <th className="py-2.5 px-3 text-right">CGST (9%)</th>
                    <th className="py-2.5 px-3 text-right">SGST (9%)</th>
                    <th className="py-2.5 px-3 text-right">Total (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="py-3 px-3">
                      <p className="font-semibold text-slate-900">Coaching & Academic Instruction Fee</p>
                      <p className="text-[10px] text-slate-500">Comprehensive curriculum, classroom lectures & academic material</p>
                    </td>
                    <td className="py-3 px-3 text-center font-medium">#{receiptModal.instalment_number || 1}</td>
                    <td className="py-3 px-3 text-right font-medium">{formatCurrency(receiptModal.base_amount)}</td>
                    <td className="py-3 px-3 text-right text-slate-600">{formatCurrency(receiptModal.cgst_amount)}</td>
                    <td className="py-3 px-3 text-right text-slate-600">{formatCurrency(receiptModal.sgst_amount)}</td>
                    <td className="py-3 px-3 text-right font-bold text-slate-900">{formatCurrency(receiptModal.total_amount)}</td>
                  </tr>
                </tbody>
                <tfoot className="bg-slate-50 font-bold border-t border-slate-200">
                  <tr>
                    <td colSpan={5} className="py-2.5 px-3 text-right text-slate-700 uppercase tracking-wider text-[11px]">
                      Net Amount Received
                    </td>
                    <td className="py-2.5 px-3 text-right text-indigo-900 text-sm">
                      {formatCurrency(receiptModal.total_amount)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Note & Signatory */}
            <div className="flex items-end justify-between pt-4 border-t border-slate-100 text-xs">
              <div className="space-y-1 text-[11px] text-slate-500">
                <p>• {receiptModal.tax_treatment}</p>
                <p>• Fees once paid are subject to the institute refund policy rules.</p>
                <p>• This is a computer generated electronic voucher authenticated by accounts system.</p>
              </div>
              <div className="text-center">
                <div className="w-32 h-10 border-b border-dashed border-slate-400 mb-1 flex items-center justify-center">
                  <span className="text-[10px] text-slate-400 uppercase tracking-widest font-mono">DIGITALLY SIGNED</span>
                </div>
                <p className="text-[11px] font-semibold text-slate-700">Accounts Department</p>
                <p className="text-[10px] text-slate-400">FeeFlow Institute</p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex justify-end gap-3 pt-3 border-t">
              <Button variant="outline" onClick={() => setReceiptModal(null)}>Close</Button>
              <Button onClick={() => window.print()} className="inline-flex items-center gap-1.5">
                <Printer className="w-4 h-4" /> Print / Save PDF
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

