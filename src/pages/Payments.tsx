import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatDate } from '../utils/helpers';
import { Badge, Button, Card, Modal, Select, Table, StatCard, EmptyState, Input } from '../components/ui';
import type { Payment } from '../types';
import { CreditCard, CheckCircle, Clock, AlertTriangle, Plus, Link as LinkIcon } from 'lucide-react';

export default function Payments() {
  const { payments, students, updatePayment, updateStudent, addPayment, addNotification, refreshData, backendConnected } = useApp();
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
    Cash: 'text-emerald-700', UPI: 'text-indigo-700', 'Bank Transfer': 'text-blue-700',
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-slate-900">Payments</h1>
          <p className="text-xs text-slate-500 mt-0.5">Transaction management · Demo data</p>
        </div>
        <Button size="sm" onClick={() => setRecordOpen(true)}>
          <Plus className="w-3.5 h-3.5" /> Record Payment
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Collected" value={formatCurrency(totalAmount)} icon={<CreditCard className="w-5 h-5" />} accent="indigo" />
        <StatCard label="Successful" value={successCount.toString()} sub="transactions" icon={<CheckCircle className="w-5 h-5" />} accent="green" />
        <StatCard label="Pending" value={pendingCount.toString()} icon={<Clock className="w-5 h-5" />} accent="amber" />
        <StatCard label="Unmatched" value={unmatchedList.length.toString()} sub="require review" icon={<AlertTriangle className="w-5 h-5" />} accent="red" />
      </div>

      {/* Unmatched queue */}
      {unmatchedList.length > 0 && (
        <Card className="border-l-4 border-l-orange-500">
          <div className="px-5 py-3 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900">Unmatched Payment Queue</h2>
            <p className="text-xs text-slate-500 mt-0.5">These payments could not be automatically matched. Manual action required.</p>
          </div>
          <Table headers={['Transaction ID', 'Amount', 'Date', 'Method', 'Reference', 'Status', 'Notes', 'Actions']}>
            {unmatchedList.map(p => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-xs font-mono text-slate-600">{p.transactionId}</td>
                <td className="px-4 py-3 text-sm font-semibold text-slate-900">{formatCurrency(p.amount)}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{formatDate(p.paymentDate)}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{p.method}</td>
                <td className="px-4 py-3 text-xs font-mono text-slate-500">{p.referenceNo}</td>
                <td className="px-4 py-3"><Badge status={p.status} /></td>
                <td className="px-4 py-3 text-xs text-slate-500 max-w-[180px] truncate">{p.notes ?? '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" onClick={() => setMatchModal(p)}>
                      <LinkIcon className="w-3 h-3" /> Match
                    </Button>
                    {p.status !== 'Under Review' && (
                      <Button variant="ghost" size="sm" onClick={() => handleAction(p, 'review')}>Review</Button>
                    )}
                    <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50" onClick={() => handleAction(p, 'reject')}>Reject</Button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      {/* All transactions */}
      <Card>
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">All Transactions</h2>
        </div>
        <Table headers={['Transaction ID', 'Student', 'Amount', 'Date', 'Method / Source', 'Reference', 'Centre', 'Status']}>
          {payments.map(p => (
            <tr key={p.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 text-xs font-mono text-slate-500">{p.transactionId}</td>
              <td className="px-4 py-3">
                <p className="text-sm font-medium text-slate-900">{p.studentName}</p>
                {p.studentId && <p className="text-xs text-slate-400">{p.studentId}</p>}
              </td>
              <td className="px-4 py-3 text-sm font-semibold text-slate-900">{formatCurrency(p.amount)}</td>
              <td className="px-4 py-3 text-sm text-slate-600">{formatDate(p.paymentDate)}</td>
              <td className="px-4 py-3">
                <span className={`text-sm font-medium ${METHOD_COLOR[p.method] ?? 'text-slate-600'}`}>{p.method}</span>
                {p.notes?.includes('Parent Portal') && (
                  <span className="block mt-0.5 text-[10px] font-semibold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded w-max">
                    Parent Portal
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-xs font-mono text-slate-400">{p.referenceNo}</td>
              <td className="px-4 py-3 text-sm text-slate-600">{p.centre}</td>
              <td className="px-4 py-3"><Badge status={p.status} /></td>
            </tr>
          ))}
        </Table>
      </Card>

      {/* Match modal */}
      <Modal open={!!matchModal} onClose={() => setMatchModal(null)} title="Match Payment to Student">
        {matchModal && (
          <form onSubmit={handleMatch} className="p-5 space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-xs text-amber-700">
              Matching will set status to Pending for manual verification. Payment will NOT be automatically marked as paid.
            </div>
            <div className="bg-slate-50 rounded-lg p-3 text-xs space-y-1">
              <p className="font-medium text-slate-900">{matchModal.transactionId}</p>
              <p className="text-slate-600">Amount: {formatCurrency(matchModal.amount)} · {formatDate(matchModal.paymentDate)} · {matchModal.method}</p>
              <p className="text-slate-500">Ref: {matchModal.referenceNo}</p>
            </div>
            <Select
              label="Select Student"
              options={studentOptions}
              value={matchStudentId}
              onChange={e => setMatchStudentId(e.target.value)}
            />
            <div className="flex gap-3 justify-end">
              <Button variant="outline" type="button" onClick={() => setMatchModal(null)}>Cancel</Button>
              <Button type="submit" disabled={!matchStudentId}>Match Payment</Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Record new payment */}
      <Modal open={recordOpen} onClose={() => setRecordOpen(false)} title="Record New Payment" size="lg">
        <form onSubmit={handleRecordNew} className="p-5 space-y-4">
          <div className={`rounded-md px-3 py-2 text-xs border ${
            backendConnected
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}>
            {backendConnected
              ? 'Live Database Payment — saves transaction and updates student balance.'
              : 'Offline Demo Mode — local transaction session only.'}
          </div>

          {recordError && (
            <div className="bg-red-50 border border-red-200 rounded-md p-2.5 text-xs text-red-700 font-medium">
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
          <div className="flex gap-3 justify-end">
            <Button variant="outline" type="button" onClick={() => setRecordOpen(false)} disabled={submittingRecord}>Cancel</Button>
            <Button type="submit" disabled={submittingRecord}>
              {submittingRecord ? 'Recording…' : 'Record Payment'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

