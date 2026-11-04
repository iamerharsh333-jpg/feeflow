import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatDate } from '../utils/helpers';
import { Badge, Button, Card, Modal, Select, Table, StatCard, Input } from '../components/ui';
import type { Payment } from '../types';
import { CreditCard, CheckCircle, Clock, AlertTriangle, Plus, Link as LinkIcon } from 'lucide-react';

export default function Payments() {
  const { payments, students, updatePayment, addPayment, addNotification, refreshData, backendConnected } = useApp();
  const [searchParams] = useSearchParams();
  const [matchModal, setMatchModal] = useState<Payment | null>(null);
  const [matchStudentId, setMatchStudentId] = useState('');
  const [recordOpen, setRecordOpen] = useState(searchParams.get('action') === 'record');
  const [recordError, setRecordError] = useState<string | null>(null);
  const [submittingRecord, setSubmittingRecord] = useState(false);

  const successCount = payments.filter(p => p.status === 'Success').length;
  const pendingCount = payments.filter(p => p.status === 'Pending').length;
  const unmatchedList = payments.filter(p => p.status === 'Unmatched' || p.status === 'Under Review');
  const totalAmount = payments.filter(p => p.status === 'Success').reduce((a, p) => a + p.amount, 0);

  const METHOD_COLOR: Record<string, string> = {
    Cash: 'text-emerald-700', UPI: 'text-[#20283A]', 'Bank Transfer': 'text-blue-700',
    Cheque: 'text-amber-700', Online: 'text-purple-700',
  };

  const handleMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matchModal || !matchStudentId) return;
    const student = students.find(s => s.id === matchStudentId);
    if (!student) return;
    try {
      await updatePayment({ ...matchModal, studentId: matchStudentId, studentName: student.name, status: 'Pending' });
      addNotification({ type: 'success', title: 'Payment matched', message: `Matched to ${student.name}. Sent to Pending for accounts verification.` });
      setMatchModal(null);
      setMatchStudentId('');
    } catch (err: any) {
      addNotification({ type: 'error', title: 'Match failed', message: err.message || 'Matching payment failed' });
    }
  };

  const handleAction = async (p: Payment, action: 'review' | 'reject') => {
    try {
      await updatePayment({ ...p, status: action === 'review' ? 'Under Review' : 'Rejected' });
      addNotification({
        type: action === 'review' ? 'info' : 'warning',
        title: action === 'review' ? 'Marked under review' : 'Payment rejected',
        message: `${p.transactionId} — ${action === 'review' ? 'sent for manual review' : 'marked as rejected'}.`,
      });
    } catch (err: any) {
      addNotification({ type: 'error', title: 'Action failed', message: err.message || 'Status update failed' });
    }
  };

  const handleRecordNew = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setRecordError(null);
    setSubmittingRecord(true);

    const fd = new FormData(e.currentTarget);
    const sid = fd.get('studentId') as string;
    const amount = parseFloat(fd.get('amount') as string) || 0;
    const method = (fd.get('method') as any) || 'UPI';
    const ref = (fd.get('ref') as string) || `REF-${Date.now()}`;
    const date = (fd.get('date') as string) || new Date().toISOString().split('T')[0];
    const student = students.find(s => s.id === sid);
    const centre = (fd.get('centre') as any) || student?.centre || 'Jaipur Main';

    const newPayment: Payment = {
      id: crypto.randomUUID(),
      transactionId: `TXN-${Date.now()}`,
      studentId: sid || '',
      studentName: student?.name || (sid ? 'Student' : 'Unmatched Payment'),
      amount,
      paymentDate: date,
      method,
      referenceNo: ref,
      status: sid ? 'Success' : 'Unmatched',
      centre,
      notes: sid ? 'Manual payment entry' : 'Unmatched payment requiring staff review',
    };

    try {
      await addPayment(newPayment);
      addNotification({
        type: 'success',
        title: 'Payment recorded',
        message: `₹${amount.toLocaleString('en-IN')} payment recorded successfully. Reconciled on backend.`,
      });
      setRecordOpen(false);
      await refreshData();
    } catch (err: any) {
      setRecordError(err.message || 'Payment recording failed');
    } finally {
      setSubmittingRecord(false);
    }
  };

  const studentOptions = [
    { value: '', label: 'Select student…' },
    ...students.map(s => ({ value: s.id, label: `${s.name} (${s.id})` })),
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#20283A] tracking-tight">Payments & Receipts</h1>
          <p className="text-xs text-[#718096] mt-1 font-normal">
            Multi-channel payment reconciliation · Live verified tax ledgers
          </p>
        </div>
        <Button size="sm" onClick={() => setRecordOpen(true)} className="bg-[#E95435] hover:bg-[#D84527] text-white font-semibold">
          <Plus className="w-4 h-4 mr-1.5" /> Record Payment
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Collected" value={formatCurrency(totalAmount)} icon={<CreditCard className="w-5 h-5 text-[#79A9D1]" />} accent="blue" />
        <StatCard label="Successful" value={successCount.toString()} sub="transactions" icon={<CheckCircle className="w-5 h-5 text-emerald-600" />} accent="green" />
        <StatCard label="Pending" value={pendingCount.toString()} icon={<Clock className="w-5 h-5 text-amber-600" />} accent="amber" />
        <StatCard label="Unmatched" value={unmatchedList.length.toString()} sub="require review" icon={<AlertTriangle className="w-5 h-5 text-[#E95435]" />} accent="orange" />
      </div>

      {/* Unmatched queue */}
      {unmatchedList.length > 0 && (
        <Card className="rounded-2xl border border-[#E3E6E9] bg-white overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.03)] border-l-4 border-l-[#E95435]">
          <div className="px-5 py-4 border-b border-[#E3E6E9] bg-amber-50/40">
            <h2 className="text-sm font-bold text-[#20283A]">Unmatched Payment Queue</h2>
            <p className="text-xs text-[#718096] mt-0.5">These payments could not be automatically matched. Manual action required.</p>
          </div>
          <Table headers={['Transaction ID', 'Amount', 'Date', 'Method', 'Reference', 'Status', 'Notes', 'Actions']}>
            {unmatchedList.map(p => (
              <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                <td className="px-4 py-3 text-xs font-mono font-bold text-[#20283A]">{p.transactionId}</td>
                <td className="px-4 py-3 text-sm font-bold text-emerald-700">{formatCurrency(p.amount)}</td>
                <td className="px-4 py-3 text-xs text-[#718096]">{formatDate(p.paymentDate)}</td>
                <td className="px-4 py-3 text-xs text-[#20283A] font-medium">{p.method}</td>
                <td className="px-4 py-3 text-xs font-mono text-[#718096]">{p.referenceNo}</td>
                <td className="px-4 py-3"><Badge status={p.status} /></td>
                <td className="px-4 py-3 text-xs text-[#718096] max-w-[180px] truncate">{p.notes ?? '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <Button variant="outline" size="sm" onClick={() => setMatchModal(p)} className="text-xs border-[#E3E6E9] text-[#20283A]">
                      <LinkIcon className="w-3 h-3" /> Match
                    </Button>
                    {p.status !== 'Under Review' && (
                      <Button variant="ghost" size="sm" onClick={() => handleAction(p, 'review')} className="text-xs text-[#718096] hover:text-[#20283A]">Review</Button>
                    )}
                    <Button variant="ghost" size="sm" className="text-xs text-[#BA2525] hover:bg-rose-50" onClick={() => handleAction(p, 'reject')}>Reject</Button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      {/* All transactions */}
      <Card className="rounded-2xl border border-[#E3E6E9] bg-white overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
        <div className="px-5 py-4 border-b border-[#E3E6E9] bg-slate-50/75">
          <h2 className="text-sm font-bold text-[#20283A]">All Transactions</h2>
          <p className="text-xs text-[#718096]">Full historical ledger across all centres and channels</p>
        </div>
        <Table headers={['Transaction ID', 'Student', 'Amount', 'Date', 'Method / Source', 'Reference', 'Centre', 'Status']}>
          {payments.map(p => (
            <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
              <td className="px-4 py-3 text-xs font-mono text-[#718096]">{p.transactionId}</td>
              <td className="px-4 py-3">
                <p className="text-sm font-semibold text-[#20283A]">{p.studentName}</p>
                {p.studentId && <p className="text-xs text-[#718096]">{p.studentId}</p>}
              </td>
              <td className="px-4 py-3 text-sm font-bold text-[#20283A]">{formatCurrency(p.amount)}</td>
              <td className="px-4 py-3 text-xs text-[#718096]">{formatDate(p.paymentDate)}</td>
              <td className="px-4 py-3">
                <span className={`text-xs font-semibold ${METHOD_COLOR[p.method] ?? 'text-[#718096]'}`}>{p.method}</span>
                {p.notes?.includes('Parent Portal') && (
                  <span className="block mt-0.5 text-[10px] font-bold text-[#79A9D1] bg-slate-50 border border-[#E3E6E9] px-2 py-0.5 rounded-md w-max">
                    Parent Portal
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-xs font-mono text-[#718096]">{p.referenceNo}</td>
              <td className="px-4 py-3 text-xs text-[#20283A] font-medium">{p.centre}</td>
              <td className="px-4 py-3"><Badge status={p.status} /></td>
            </tr>
          ))}
        </Table>
      </Card>

      {/* Match modal */}
      <Modal open={!!matchModal} onClose={() => setMatchModal(null)} title="Match Payment to Student">
        {matchModal && (
          <form onSubmit={handleMatch} className="p-5 space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5 text-xs text-amber-900">
              Matching will set status to Pending for manual verification. Payment will NOT be automatically marked as paid.
            </div>
            <div className="bg-slate-50/75 border border-[#E3E6E9] rounded-xl p-3.5 text-xs space-y-1">
              <p className="font-bold text-[#20283A]">{matchModal.transactionId}</p>
              <p className="text-[#718096]">Amount: <strong className="text-[#20283A]">{formatCurrency(matchModal.amount)}</strong> · {formatDate(matchModal.paymentDate)} · {matchModal.method}</p>
              <p className="text-[#718096]">Ref: {matchModal.referenceNo}</p>
            </div>
            <Select
              label="Select Student"
              options={studentOptions}
              value={matchStudentId}
              onChange={e => setMatchStudentId(e.target.value)}
            />
            <div className="flex gap-3 justify-end pt-3 border-t border-[#E3E6E9]">
              <Button variant="outline" type="button" onClick={() => setMatchModal(null)}>Cancel</Button>
              <Button type="submit" disabled={!matchStudentId} className="bg-[#E95435] hover:bg-[#D84527] text-white">Match Payment</Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Record new payment */}
      <Modal open={recordOpen} onClose={() => setRecordOpen(false)} title="Record New Payment" size="lg">
        <form onSubmit={handleRecordNew} className="p-5 space-y-4">
          <div className={`rounded-xl px-3.5 py-2.5 text-xs border ${
            backendConnected
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}>
            {backendConnected
              ? 'Live Database Payment — saves transaction and updates student balance.'
              : 'Offline Demo Mode — local transaction session only.'}
          </div>

          {recordError && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-[#BA2525] font-medium">
              {recordError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Select label="Student" name="studentId" options={studentOptions} />
            <Input label="Amount (₹)" name="amount" type="number" required />
            <Select label="Payment Method" name="method" options={[
              { value: 'Cash', label: 'Cash' },
              { value: 'UPI', label: 'UPI' },
              { value: 'Bank Transfer', label: 'Bank Transfer' },
              { value: 'Cheque', label: 'Cheque' },
              { value: 'Online', label: 'Online' },
            ]} />
            <Input label="Reference No." name="ref" placeholder="Optional" />
            <Input label="Payment Date" name="date" type="date" defaultValue={new Date().toISOString().split('T')[0]} />
            <Input label="Centre" name="centre" placeholder="e.g. Jaipur Main" />
          </div>
          <div className="flex gap-3 justify-end pt-3 border-t border-[#E3E6E9]">
            <Button variant="outline" type="button" onClick={() => setRecordOpen(false)} disabled={submittingRecord}>Cancel</Button>
            <Button type="submit" disabled={submittingRecord} className="bg-[#E95435] hover:bg-[#D84527] text-white">
              {submittingRecord ? 'Recording…' : 'Record Payment'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
