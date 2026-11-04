import { useState, useEffect } from 'react';
import { Card, Button, Input, Badge, Modal, StatCard, Table, EmptyState } from '../components/ui';
import { formatCurrency, formatDate, daysBetween } from '../utils/helpers';
import { Calculator, AlertTriangle, Download, CheckCircle, XCircle, Clock, Send, ShieldCheck, DollarSign } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api } from '../utils/api';

interface RefundRequestItem {
  id: number;
  student_id: string;
  student_name: string;
  centre_name?: string;
  course_start_date: string;
  course_end_date: string;
  withdrawal_date: string;
  withdrawal_reason?: string;
  amount_paid: number;
  discount_applied: number;
  total_days: number;
  days_attended: number;
  unused_days: number;
  pro_rata_amount: number;
  processing_fee: number;
  material_fee: number;
  estimated_refund: number;
  approved_refund?: number;
  policy_code: string;
  policy_version: string;
  status: string;
  deadline_met: boolean;
  processing_deadline?: string;
  days_remaining?: number;
  is_overdue: boolean;
  processed_date?: string;
  payout_reference?: string;
  notes?: string;
  approved_by?: string;
  decision_reason?: string;
  decision_date?: string;
  created_at: string;
}

export default function RefundCalculator() {
  const { addNotification } = useApp();
  const [activeTab, setActiveTab] = useState<'queue' | 'calculator'>('queue');
  const [requests, setRequests] = useState<RefundRequestItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Calculator state
  const [form, setForm] = useState({
    studentId: 'STU-0412',
    courseStartDate: '2026-04-01',
    courseEndDate: '2027-03-31',
    withdrawalDate: '2026-04-08',
    withdrawalReason: 'Relocation to another city',
    amountPaid: '60000',
    processingFeePercent: '5',
    materialFee: '5000',
  });
  const [calcResult, setCalcResult] = useState<any>(null);
  const [calculating, setCalculating] = useState(false);

  // Approval Modal
  const [approveModalItem, setApproveModalItem] = useState<RefundRequestItem | null>(null);
  const [approvedAmount, setApprovedAmount] = useState('');
  const [approvalReason, setApprovalReason] = useState('Approved per statutory pro-rata refund policy');

  // Rejection Modal
  const [rejectModalItem, setRejectModalItem] = useState<RefundRequestItem | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Breakdown Modal
  const [viewBreakdownItem, setViewBreakdownItem] = useState<RefundRequestItem | null>(null);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const data = await api.getRefundRequests();
      if (Array.isArray(data)) {
        setRequests(data);
      }
    } catch (err: any) {
      console.warn('Could not fetch refund requests:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const handleFormChange = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(f => ({ ...f, [k]: e.target.value }));
  };

  const runCalculation = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setCalculating(true);
    try {
      const res = await api.estimateRefund({
        student_id: form.studentId.trim() || 'STU-0412',
        course_start_date: form.courseStartDate,
        course_end_date: form.courseEndDate,
        withdrawal_date: form.withdrawalDate,
        amount_paid: parseFloat(form.amountPaid) || 0,
        processing_fee_percent: parseFloat(form.processingFeePercent) || 5,
        material_fee: parseFloat(form.materialFee) || 5000,
      });
      setCalcResult(res);
    } catch (err: any) {
      addNotification({ type: 'error', title: 'Calculation failed', message: err.message || 'Failed to estimate refund' });
    } finally {
      setCalculating(false);
    }
  };

  const submitNewRequest = async () => {
    try {
      await api.submitRefundRequest({
        student_id: form.studentId.trim() || 'STU-0412',
        course_start_date: form.courseStartDate,
        course_end_date: form.courseEndDate,
        withdrawal_date: form.withdrawalDate,
        withdrawal_reason: form.withdrawalReason,
        amount_paid: parseFloat(form.amountPaid) || 0,
        processing_fee_percent: parseFloat(form.processingFeePercent) || 5,
        material_fee: parseFloat(form.materialFee) || 5000,
        policy_confirmed: true,
      });
      addNotification({
        type: 'success',
        title: 'Refund Request Created',
        message: `Registered request for ${form.studentId}. Added to review queue.`,
      });
      setActiveTab('queue');
      fetchRequests();
    } catch (err: any) {
      addNotification({ type: 'error', title: 'Submission failed', message: err.message });
    }
  };

  const handleApprove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!approveModalItem) return;
    const amount = parseFloat(approvedAmount);
    if (!amount || amount <= 0) {
      addNotification({ type: 'error', title: 'Invalid amount', message: 'Amount must be greater than zero.' });
      return;
    }
    if (amount > approveModalItem.amount_paid) {
      addNotification({ type: 'error', title: 'Exceeds paid amount', message: `Cannot approve more than paid (₹${approveModalItem.amount_paid}).` });
      return;
    }
    if (!approvalReason.trim()) {
      addNotification({ type: 'error', title: 'Reason required', message: 'Mandatory approval reason is required.' });
      return;
    }

    try {
      await api.approveRefund(approveModalItem.id, {
        approved_amount: amount,
        reason: approvalReason.trim(),
        policy_code: approveModalItem.policy_code || 'REFUND_STD_POLICY_2026',
      });
      addNotification({
        type: 'success',
        title: 'Refund Approved',
        message: `Approved refund of ${formatCurrency(amount)} for ${approveModalItem.student_name}.`,
      });
      setApproveModalItem(null);
      fetchRequests();
    } catch (err: any) {
      addNotification({ type: 'error', title: 'Approval failed', message: err.message });
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectModalItem) return;
    if (!rejectionReason.trim()) {
      addNotification({ type: 'error', title: 'Reason required', message: 'Mandatory rejection reason is required.' });
      return;
    }

    try {
      await api.rejectRefund(rejectModalItem.id, rejectionReason.trim());
      addNotification({
        type: 'info',
        title: 'Refund Rejected',
        message: `Refund request #${rejectModalItem.id} marked as Rejected.`,
      });
      setRejectModalItem(null);
      fetchRequests();
    } catch (err: any) {
      addNotification({ type: 'error', title: 'Rejection failed', message: err.message });
    }
  };

  const handleSimulatePayout = async (req: RefundRequestItem) => {
    try {
      const res = await api.processRefund(req.id);
      addNotification({
        type: 'success',
        title: 'Payout Processed (Simulated)',
        message: `Recorded simulated bank payout. Ref: ${res.payout_reference}`,
      });
      fetchRequests();
    } catch (err: any) {
      addNotification({ type: 'error', title: 'Payout failed', message: err.message });
    }
  };

  // KPI calculations
  const pendingCount = requests.filter(r => r.status === 'Pending Review').length;
  const approvedCount = requests.filter(r => r.status === 'Approved').length;
  const overdueCount = requests.filter(r => r.is_overdue).length;
  const processedCount = requests.filter(r => r.status === 'Processed').length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Student Refund Management</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Published Policy: <span className="font-semibold text-slate-700">REFUND_STD_POLICY_2026 (v2026.1)</span> · Statutory 10-day processing deadline
          </p>
        </div>

        <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
          <button
            onClick={() => setActiveTab('queue')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
              activeTab === 'queue' ? 'bg-white shadow-xs text-indigo-600 font-bold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Refund Requests & Queue ({requests.length})
          </button>
          <button
            onClick={() => {
              setActiveTab('calculator');
              if (!calcResult) runCalculation();
            }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
              activeTab === 'calculator' ? 'bg-white shadow-xs text-indigo-600 font-bold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Refund Calculator & New Request
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Pending Review" value={pendingCount.toString()} icon={<Clock className="w-5 h-5" />} accent="amber" />
        <StatCard label="Approved (Ready)" value={approvedCount.toString()} icon={<CheckCircle className="w-5 h-5" />} accent="indigo" />
        <StatCard label="Overdue Processing" value={overdueCount.toString()} icon={<AlertTriangle className="w-5 h-5" />} accent="red" />
        <StatCard label="Processed (Paid Out)" value={processedCount.toString()} icon={<DollarSign className="w-5 h-5" />} accent="green" />
      </div>

      {/* TAB 1: Queue */}
      {activeTab === 'queue' && (
        <Card className="overflow-hidden">
          <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Refund Requests Queue</h2>
            <Button size="sm" variant="outline" onClick={fetchRequests} disabled={loading}>
              Refresh Queue
            </Button>
          </div>

          {requests.length === 0 ? (
            <EmptyState icon={<Calculator className="w-10 h-10" />} title="No refund requests found" description="Use the calculator to submit a new refund request for review." />
          ) : (
            <div className="overflow-x-auto">
              <Table headers={['Student', 'Withdrawal Date', '10-Day Deadline', 'Amount Paid', 'Est. / Approved', 'Policy', 'Status', 'Actions']}>
                {requests.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold text-slate-900">{r.student_name}</p>
                      <p className="text-xs text-slate-500">{r.student_id} · {r.centre_name || 'N/A'}</p>
                    </td>

                    <td className="px-4 py-3 text-xs text-slate-700">
                      {formatDate(r.withdrawal_date)}
                    </td>

                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <span className="text-xs font-medium text-slate-800 block">
                          {formatDate(r.processing_deadline || '')}
                        </span>
                        {r.is_overdue ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800 border border-red-200">
                            <AlertTriangle className="w-3 h-3 text-red-600" />
                            Overdue ({Math.abs(r.days_remaining || 0)}d past)
                          </span>
                        ) : r.status in { 'Pending Review': 1, 'Approved': 1 } ? (
                          <span className="text-[10px] font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                            {r.days_remaining} day(s) remaining
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400">Completed</span>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3 text-xs font-semibold text-slate-900">
                      {formatCurrency(r.amount_paid)}
                    </td>

                    <td className="px-4 py-3">
                      <p className="text-xs font-bold text-emerald-700">
                        {r.approved_refund ? formatCurrency(r.approved_refund) : formatCurrency(r.estimated_refund)}
                      </p>
                      <span className="text-[10px] text-slate-400">
                        {r.approved_refund ? 'Approved' : 'Estimate'}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-xs text-slate-600">
                      <span className="font-mono text-[10px] bg-slate-100 px-1.5 py-0.5 rounded">
                        {r.policy_version || 'v2026.1'}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <Badge status={r.status} />
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Button size="sm" variant="ghost" onClick={() => setViewBreakdownItem(r)} className="text-xs">
                          Breakdown
                        </Button>

                        {r.status === 'Pending Review' && (
                          <>
                            <Button
                              size="sm"
                              className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                              onClick={() => {
                                setApproveModalItem(r);
                                setApprovedAmount(r.estimated_refund.toString());
                              }}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs text-red-600 hover:bg-red-50 border-red-200"
                              onClick={() => {
                                setRejectModalItem(r);
                                setRejectionReason('');
                              }}
                            >
                              Reject
                            </Button>
                          </>
                        )}

                        {r.status === 'Approved' && (
                          <Button
                            size="sm"
                            className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1"
                            onClick={() => handleSimulatePayout(r)}
                          >
                            <DollarSign className="w-3 h-3" /> Payout (Sim)
                          </Button>
                        )}

                        {r.status === 'Processed' && (
                          <span className="text-[10px] font-mono text-slate-400 block max-w-[90px] truncate" title={r.payout_reference}>
                            {r.payout_reference}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </Table>
            </div>
          )}
        </Card>
      )}

      {/* TAB 2: Calculator & Submission Form */}
      {activeTab === 'calculator' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-1 flex items-center gap-2">
              <Calculator className="w-4 h-4 text-indigo-600" /> Pro-Rata Refund Calculator
            </h2>
            <p className="text-xs text-slate-500 mb-4">Input student enrolment and withdrawal details to compute eligible refund.</p>

            <form onSubmit={runCalculation} className="space-y-3.5">
              <Input
                label="Student ID"
                value={form.studentId}
                onChange={handleFormChange('studentId')}
                placeholder="e.g. STU-0412"
                required
              />

              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Course Start Date"
                  type="date"
                  value={form.courseStartDate}
                  onChange={handleFormChange('courseStartDate')}
                  required
                />
                <Input
                  label="Course End Date"
                  type="date"
                  value={form.courseEndDate}
                  onChange={handleFormChange('courseEndDate')}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Withdrawal Date"
                  type="date"
                  value={form.withdrawalDate}
                  onChange={handleFormChange('withdrawalDate')}
                  required
                />
                <Input
                  label="Amount Paid (₹)"
                  type="number"
                  value={form.amountPaid}
                  onChange={handleFormChange('amountPaid')}
                  required
                />
              </div>

              <Input
                label="Withdrawal Reason"
                value={form.withdrawalReason}
                onChange={handleFormChange('withdrawalReason')}
                placeholder="e.g. Medical reasons / relocation"
                required
              />

              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Processing Fee (%)"
                  type="number"
                  value={form.processingFeePercent}
                  onChange={handleFormChange('processingFeePercent')}
                  min="0"
                  max="50"
                />
                <Input
                  label="Material / Kit Deduction (₹)"
                  type="number"
                  value={form.materialFee}
                  onChange={handleFormChange('materialFee')}
                  min="0"
                />
              </div>

              <Button type="submit" disabled={calculating} className="w-full justify-center">
                <Calculator className="w-4 h-4" /> Calculate Eligible Refund
              </Button>
            </form>
          </Card>

          {/* Calculator Breakdown Card */}
          {calcResult ? (
            <Card className="p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Calculation Breakdown</h2>
                    <span className="text-[10px] font-mono text-slate-400">Policy: {calcResult.policy_code} ({calcResult.policy_version})</span>
                  </div>
                  <Badge status={calcResult.deadline_met ? 'Active' : 'Overdue'} />
                </div>

                <div className="space-y-2.5 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-500">Total Course Duration</span>
                    <span className="font-semibold text-slate-900">{calcResult.total_days} days</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-500">Days Attended</span>
                    <span className="font-semibold text-slate-900">{calcResult.days_attended} days</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-500">Unused Duration</span>
                    <span className="font-semibold text-slate-900">{calcResult.unused_days} days</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-500">Total Amount Paid</span>
                    <span className="font-semibold text-slate-900">{formatCurrency(calcResult.amount_paid)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-500">Pro-Rata Eligible Amount</span>
                    <span className="font-semibold text-slate-900">{formatCurrency(calcResult.pro_rata_refund)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100 text-red-600">
                    <span>Processing Fee ({form.processingFeePercent}%)</span>
                    <span>− {formatCurrency(calcResult.processing_fee)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100 text-red-600">
                    <span>Material / Kit Deduction</span>
                    <span>− {formatCurrency(calcResult.material_fee)}</span>
                  </div>
                  <div className="flex justify-between py-2 pt-3 border-t-2 border-slate-200 text-sm">
                    <span className="font-bold text-slate-900">Estimated Refund</span>
                    <span className="font-black text-emerald-600 text-lg">{formatCurrency(calcResult.estimated_refund)}</span>
                  </div>
                </div>

                <div className="mt-3 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs">
                  <p className="font-semibold">10-Day Statutory Deadline:</p>
                  <p>Processing must complete by <strong>{formatDate(calcResult.processing_deadline)}</strong>.</p>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-200 flex gap-2">
                <Button className="flex-1 justify-center" onClick={submitNewRequest}>
                  <Send className="w-4 h-4" /> Submit for Review
                </Button>
              </div>
            </Card>
          ) : (
            <Card className="p-8 flex flex-col items-center justify-center text-center">
              <Calculator className="w-12 h-12 text-slate-300 mb-2" />
              <p className="text-sm font-medium text-slate-700">Live Breakdown Preview</p>
              <p className="text-xs text-slate-400 mt-1 max-w-xs">Fill the details on the left to compute the exact pro-rata breakdown and statutory deadline.</p>
            </Card>
          )}
        </div>
      )}

      {/* APPROVE MODAL */}
      <Modal open={!!approveModalItem} onClose={() => setApproveModalItem(null)} title="Approve Student Refund" size="md">
        {approveModalItem && (
          <form onSubmit={handleApprove} className="p-5 space-y-4">
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs space-y-1">
              <p><strong>Student:</strong> {approveModalItem.student_name} ({approveModalItem.student_id})</p>
              <p><strong>Amount Paid:</strong> {formatCurrency(approveModalItem.amount_paid)}</p>
              <p><strong>Calculated Estimate:</strong> {formatCurrency(approveModalItem.estimated_refund)}</p>
            </div>

            <Input
              label="Approved Refund Amount (₹)"
              type="number"
              value={approvedAmount}
              onChange={e => setApprovedAmount(e.target.value)}
              required
            />

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Mandatory Approval Reason <span className="text-red-500">*</span>
              </label>
              <textarea
                className="w-full text-xs p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                rows={3}
                value={approvalReason}
                onChange={e => setApprovalReason(e.target.value)}
                required
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setApproveModalItem(null)}>Cancel</Button>
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white">Confirm Approval</Button>
            </div>
          </form>
        )}
      </Modal>

      {/* REJECT MODAL */}
      <Modal open={!!rejectModalItem} onClose={() => setRejectModalItem(null)} title="Reject Refund Request" size="md">
        {rejectModalItem && (
          <form onSubmit={handleReject} className="p-5 space-y-4">
            <div className="bg-red-50 p-3 rounded-lg border border-red-200 text-xs text-red-800 space-y-1">
              <p>Rejecting refund request #{rejectModalItem.id} for <strong>{rejectModalItem.student_name}</strong>.</p>
              <p>This action will be logged in the permanent audit trail.</p>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Mandatory Rejection Reason <span className="text-red-500">*</span>
              </label>
              <textarea
                className="w-full text-xs p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                rows={3}
                value={rejectionReason}
                onChange={e => setRejectionReason(e.target.value)}
                placeholder="e.g. Formal withdrawal notice was submitted after completion of course."
                required
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setRejectModalItem(null)}>Cancel</Button>
              <Button type="submit" className="bg-red-600 hover:bg-red-700 text-white">Confirm Rejection</Button>
            </div>
          </form>
        )}
      </Modal>

      {/* BREAKDOWN MODAL */}
      <Modal open={!!viewBreakdownItem} onClose={() => setViewBreakdownItem(null)} title="Refund Calculation Breakdown" size="md">
        {viewBreakdownItem && (
          <div className="p-5 space-y-3.5 text-xs">
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1">
              <p className="font-bold text-sm text-slate-900">{viewBreakdownItem.student_name} ({viewBreakdownItem.student_id})</p>
              <p className="text-slate-500">Withdrawal Reason: {viewBreakdownItem.withdrawal_reason || 'N/A'}</p>
            </div>

            <div className="space-y-2 border-b border-slate-200 pb-3">
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Course Commencement to End:</span>
                <span className="font-semibold">{formatDate(viewBreakdownItem.course_start_date)} to {formatDate(viewBreakdownItem.course_end_date)} ({viewBreakdownItem.total_days} days)</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Withdrawal Date:</span>
                <span className="font-semibold">{formatDate(viewBreakdownItem.withdrawal_date)} ({viewBreakdownItem.days_attended} days attended)</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Unused Days:</span>
                <span className="font-semibold">{viewBreakdownItem.unused_days} days</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Total Fees Paid:</span>
                <span className="font-semibold">{formatCurrency(viewBreakdownItem.amount_paid)}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Pro-Rata Eligible Amount:</span>
                <span className="font-semibold">{formatCurrency(viewBreakdownItem.pro_rata_amount)}</span>
              </div>
              <div className="flex justify-between py-1 text-red-600">
                <span>Processing Fee:</span>
                <span>− {formatCurrency(viewBreakdownItem.processing_fee)}</span>
              </div>
              <div className="flex justify-between py-1 text-red-600">
                <span>Material / Kit Fee:</span>
                <span>− {formatCurrency(viewBreakdownItem.material_fee)}</span>
              </div>
            </div>

            <div className="flex justify-between py-1 text-sm font-bold">
              <span>Estimated Refund:</span>
              <span className="text-emerald-600">{formatCurrency(viewBreakdownItem.estimated_refund)}</span>
            </div>

            {viewBreakdownItem.approved_refund && (
              <div className="flex justify-between py-1 text-sm font-bold bg-emerald-50 p-2 rounded border border-emerald-200 text-emerald-900">
                <span>Final Approved Amount:</span>
                <span>{formatCurrency(viewBreakdownItem.approved_refund)}</span>
              </div>
            )}

            {viewBreakdownItem.payout_reference && (
              <div className="bg-indigo-50 p-2.5 rounded border border-indigo-200 text-indigo-900 space-y-0.5">
                <p className="font-bold">Simulated Payout Details:</p>
                <p className="font-mono text-[11px]">Ref: {viewBreakdownItem.payout_reference}</p>
                <p className="text-[10px] text-indigo-700">Processed: {formatDate(viewBreakdownItem.processed_date || '')}</p>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={() => setViewBreakdownItem(null)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
