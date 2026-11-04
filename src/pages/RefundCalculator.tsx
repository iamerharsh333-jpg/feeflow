import { useState, useEffect } from 'react';
import { Card, Button, Input, Badge, Modal, StatCard, Table, EmptyState } from '../components/ui';
import { formatCurrency, formatDate } from '../utils/helpers';
import { Calculator, AlertTriangle, CheckCircle, Clock, Send, DollarSign } from 'lucide-react';
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

  const pendingCount = requests.filter(r => r.status === 'Pending Review' || r.status === 'Submitted').length;
  const approvedCount = requests.filter(r => r.status === 'Approved').length;
  const overdueCount = requests.filter(r => r.is_overdue).length;
  const processedCount = requests.filter(r => r.status === 'Processed').length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#20283A] tracking-tight">Student Refund Management</h1>
          <p className="text-xs text-[#718096] mt-1 font-normal">
            Published Policy: <span className="font-semibold text-[#20283A]">REFUND_STD_POLICY_2026 (v2026.1)</span> · Statutory 10-day processing deadline
          </p>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto">
          <button
            onClick={() => setActiveTab('queue')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
              activeTab === 'queue' ? 'bg-[#20283A] text-white shadow-xs' : 'bg-white text-[#718096] border border-[#E3E6E9] hover:bg-slate-50'
            }`}
          >
            Refund Requests & Queue ({requests.length})
          </button>
          <button
            onClick={() => {
              setActiveTab('calculator');
              if (!calcResult) runCalculation();
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
              activeTab === 'calculator' ? 'bg-[#20283A] text-white shadow-xs' : 'bg-white text-[#718096] border border-[#E3E6E9] hover:bg-slate-50'
            }`}
          >
            Refund Calculator & New Request
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Pending Review" value={pendingCount.toString()} icon={<Clock className="w-5 h-5 text-amber-600" />} accent="amber" />
        <StatCard label="Approved (Ready)" value={approvedCount.toString()} icon={<CheckCircle className="w-5 h-5 text-emerald-600" />} accent="green" />
        <StatCard label="Overdue Processing" value={overdueCount.toString()} icon={<AlertTriangle className="w-5 h-5 text-[#BA2525]" />} accent="red" />
        <StatCard label="Processed (Paid Out)" value={processedCount.toString()} icon={<DollarSign className="w-5 h-5 text-[#79A9D1]" />} accent="blue" />
      </div>

      {/* TAB 1: Queue */}
      {activeTab === 'queue' && (
        <Card className="rounded-2xl border border-[#E3E6E9] bg-white overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
          <div className="px-5 py-4 bg-slate-50/75 border-b border-[#E3E6E9] flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-[#20283A]">Refund Requests Queue</h2>
              <p className="text-xs text-[#718096]">Submissions awaiting accounts executive decision and audit justification</p>
            </div>
            <Button size="sm" variant="outline" onClick={fetchRequests} disabled={loading} className="text-xs border-[#E3E6E9] text-[#20283A]">
              Refresh Queue
            </Button>
          </div>

          {requests.length === 0 ? (
            <EmptyState icon={<Calculator className="w-10 h-10 text-[#718096]/40" />} title="No refund requests found" description="Use the calculator to submit a new refund request for review." />
          ) : (
            <div className="overflow-x-auto">
              <Table headers={['Student', 'Withdrawal Date', '10-Day Deadline', 'Amount Paid', 'Est. / Approved', 'Policy', 'Status', 'Actions']}>
                {requests.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold text-[#20283A]">{r.student_name}</p>
                      <p className="text-xs text-[#718096]">{r.student_id} · {r.centre_name || 'N/A'}</p>
                    </td>

                    <td className="px-4 py-3 text-xs text-[#20283A] font-medium">
                      {formatDate(r.withdrawal_date)}
                    </td>

                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <span className="text-xs font-semibold text-[#20283A] block">
                          {formatDate(r.processing_deadline || '')}
                        </span>
                        {r.is_overdue ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-[#BA2525] border border-rose-200">
                            <AlertTriangle className="w-3 h-3 text-[#BA2525]" />
                            Overdue ({Math.abs(r.days_remaining || 0)}d past)
                          </span>
                        ) : r.status in { 'Pending Review': 1, 'Approved': 1, 'Submitted': 1 } ? (
                          <span className="text-[10px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            {r.days_remaining} day(s) remaining
                          </span>
                        ) : (
                          <span className="text-[10px] text-[#718096]">Completed</span>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3 text-xs font-bold text-[#20283A]">
                      {formatCurrency(r.amount_paid)}
                    </td>

                    <td className="px-4 py-3">
                      <p className="text-xs font-bold text-emerald-700">
                        {r.approved_refund ? formatCurrency(r.approved_refund) : formatCurrency(r.estimated_refund)}
                      </p>
                      <span className="text-[10px] text-[#718096]">
                        {r.approved_refund ? 'Approved' : 'Estimate'}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-xs text-[#718096]">
                      <span className="font-mono text-[10px] bg-slate-100 px-2 py-0.5 rounded border border-[#E3E6E9]">
                        {r.policy_version || 'v2026.1'}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <Badge status={r.status} />
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Button size="sm" variant="ghost" onClick={() => setViewBreakdownItem(r)} className="text-xs text-[#718096] hover:text-[#20283A]">
                          Breakdown
                        </Button>

                        {(r.status === 'Pending Review' || r.status === 'Submitted') && (
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
                              className="text-xs text-[#BA2525] hover:bg-rose-50 border-rose-200"
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
                            className="text-xs bg-[#E95435] hover:bg-[#D84527] text-white flex items-center gap-1"
                            onClick={() => handleSimulatePayout(r)}
                          >
                            <DollarSign className="w-3 h-3" /> Payout (Sim)
                          </Button>
                        )}

                        {r.status === 'Processed' && (
                          <span className="text-[10px] font-mono text-[#718096] block max-w-[90px] truncate" title={r.payout_reference}>
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
          <Card className="p-5 rounded-2xl border border-[#E3E6E9] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
            <h2 className="text-sm font-bold text-[#20283A] mb-1 flex items-center gap-2">
              <Calculator className="w-4 h-4 text-[#79A9D1]" /> Pro-Rata Refund Calculator
            </h2>
            <p className="text-xs text-[#718096] mb-4">Input student enrolment and withdrawal details to compute eligible refund.</p>

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

              <Button type="submit" disabled={calculating} className="w-full justify-center bg-[#E95435] hover:bg-[#D84527] text-white">
                <Calculator className="w-4 h-4 mr-1.5" /> Calculate Eligible Refund
              </Button>
            </form>
          </Card>

          {/* Calculator Breakdown Card */}
          {calcResult ? (
            <Card className="p-5 flex flex-col justify-between rounded-2xl border border-[#E3E6E9] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
              <div>
                <div className="flex items-center justify-between border-b border-[#E3E6E9] pb-3 mb-3">
                  <div>
                    <h2 className="text-sm font-bold text-[#20283A]">Calculation Breakdown</h2>
                    <span className="text-[10px] font-mono text-[#718096]">Policy: {calcResult.policy_code} ({calcResult.policy_version})</span>
                  </div>
                  <Badge status={calcResult.deadline_met ? 'Active' : 'Overdue'} />
                </div>

                <div className="space-y-2.5 text-xs">
                  <div className="flex justify-between py-1 border-b border-[#E3E6E9]">
                    <span className="text-[#718096]">Total Course Duration</span>
                    <span className="font-semibold text-[#20283A]">{calcResult.total_days} days</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#E3E6E9]">
                    <span className="text-[#718096]">Days Attended</span>
                    <span className="font-semibold text-[#20283A]">{calcResult.days_attended} days</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#E3E6E9]">
                    <span className="text-[#718096]">Unused Duration</span>
                    <span className="font-semibold text-[#20283A]">{calcResult.unused_days} days</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#E3E6E9]">
                    <span className="text-[#718096]">Total Amount Paid</span>
                    <span className="font-semibold text-[#20283A]">{formatCurrency(calcResult.amount_paid)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#E3E6E9]">
                    <span className="text-[#718096]">Pro-Rata Eligible Amount</span>
                    <span className="font-semibold text-[#20283A]">{formatCurrency(calcResult.pro_rata_refund)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#E3E6E9] text-[#BA2525]">
                    <span>Processing Fee ({form.processingFeePercent}%)</span>
                    <span>− {formatCurrency(calcResult.processing_fee)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#E3E6E9] text-[#BA2525]">
                    <span>Material / Kit Deduction</span>
                    <span>− {formatCurrency(calcResult.material_fee)}</span>
                  </div>
                  <div className="flex justify-between py-2 pt-3 border-t-2 border-[#E3E6E9] text-sm">
                    <span className="font-bold text-[#20283A]">Estimated Refund</span>
                    <span className="font-black text-emerald-700 text-lg">{formatCurrency(calcResult.estimated_refund)}</span>
                  </div>
                </div>

                <div className="mt-3.5 p-3 bg-amber-50/75 border border-amber-200 rounded-xl text-amber-900 text-xs">
                  <p className="font-semibold">10-Day Statutory Deadline:</p>
                  <p>Processing must complete by <strong>{formatDate(calcResult.processing_deadline)}</strong>.</p>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-[#E3E6E9] flex gap-2">
                <Button className="flex-1 justify-center bg-[#20283A] text-white hover:bg-[#20283A]/90" onClick={submitNewRequest}>
                  <Send className="w-4 h-4 mr-1.5" /> Submit for Review
                </Button>
              </div>
            </Card>
          ) : (
            <Card className="p-8 flex flex-col items-center justify-center text-center rounded-2xl border border-[#E3E6E9] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
              <Calculator className="w-12 h-12 text-[#718096]/30 mb-2" />
              <p className="text-sm font-semibold text-[#20283A]">Live Breakdown Preview</p>
              <p className="text-xs text-[#718096] mt-1 max-w-xs">Fill the details on the left to compute the exact pro-rata breakdown and statutory deadline.</p>
            </Card>
          )}
        </div>
      )}

      {/* APPROVE MODAL */}
      <Modal open={!!approveModalItem} onClose={() => setApproveModalItem(null)} title="Approve Student Refund" size="md">
        {approveModalItem && (
          <form onSubmit={handleApprove} className="p-5 space-y-4">
            <div className="bg-slate-50/75 p-3.5 rounded-xl border border-[#E3E6E9] text-xs space-y-1">
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
              <label className="text-xs font-semibold text-[#20283A] block mb-1">
                Mandatory Approval Reason <span className="text-[#BA2525]">*</span>
              </label>
              <textarea
                className="w-full text-xs p-2.5 border border-[#E3E6E9] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#20283A]"
                rows={3}
                value={approvalReason}
                onChange={e => setApprovalReason(e.target.value)}
                required
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#E3E6E9]">
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
            <div className="bg-rose-50 p-3.5 rounded-xl border border-rose-200 text-xs text-[#BA2525] space-y-1">
              <p>Rejecting refund request #{rejectModalItem.id} for <strong>{rejectModalItem.student_name}</strong>.</p>
              <p>This action will be logged in the permanent audit trail.</p>
            </div>

            <div>
              <label className="text-xs font-semibold text-[#20283A] block mb-1">
                Mandatory Rejection Reason <span className="text-[#BA2525]">*</span>
              </label>
              <textarea
                className="w-full text-xs p-2.5 border border-[#E3E6E9] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#20283A]"
                rows={3}
                value={rejectionReason}
                onChange={e => setRejectionReason(e.target.value)}
                placeholder="e.g. Formal withdrawal notice was submitted after completion of course."
                required
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#E3E6E9]">
              <Button type="button" variant="outline" onClick={() => setRejectModalItem(null)}>Cancel</Button>
              <Button type="submit" className="bg-rose-600 hover:bg-rose-700 text-white">Confirm Rejection</Button>
            </div>
          </form>
        )}
      </Modal>

      {/* BREAKDOWN MODAL */}
      <Modal open={!!viewBreakdownItem} onClose={() => setViewBreakdownItem(null)} title="Refund Calculation Breakdown" size="md">
        {viewBreakdownItem && (
          <div className="p-5 space-y-3.5 text-xs">
            <div className="bg-slate-50/75 p-3.5 rounded-xl border border-[#E3E6E9] space-y-1">
              <p className="font-bold text-sm text-[#20283A]">{viewBreakdownItem.student_name} ({viewBreakdownItem.student_id})</p>
              <p className="text-[#718096]">Withdrawal Reason: {viewBreakdownItem.withdrawal_reason || 'N/A'}</p>
            </div>

            <div className="space-y-2 border-b border-[#E3E6E9] pb-3">
              <div className="flex justify-between py-1">
                <span className="text-[#718096]">Course Commencement to End:</span>
                <span className="font-semibold text-[#20283A]">{formatDate(viewBreakdownItem.course_start_date)} to {formatDate(viewBreakdownItem.course_end_date)} ({viewBreakdownItem.total_days} days)</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-[#718096]">Withdrawal Date:</span>
                <span className="font-semibold text-[#20283A]">{formatDate(viewBreakdownItem.withdrawal_date)} ({viewBreakdownItem.days_attended} days attended)</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-[#718096]">Unused Days:</span>
                <span className="font-semibold text-[#20283A]">{viewBreakdownItem.unused_days} days</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-[#718096]">Total Fees Paid:</span>
                <span className="font-semibold text-[#20283A]">{formatCurrency(viewBreakdownItem.amount_paid)}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-[#718096]">Pro-Rata Eligible Amount:</span>
                <span className="font-semibold text-[#20283A]">{formatCurrency(viewBreakdownItem.pro_rata_amount)}</span>
              </div>
              <div className="flex justify-between py-1 text-[#BA2525]">
                <span>Processing Fee:</span>
                <span>− {formatCurrency(viewBreakdownItem.processing_fee)}</span>
              </div>
              <div className="flex justify-between py-1 text-[#BA2525]">
                <span>Material / Kit Fee:</span>
                <span>− {formatCurrency(viewBreakdownItem.material_fee)}</span>
              </div>
            </div>

            <div className="flex justify-between py-1 text-sm font-bold">
              <span className="text-[#20283A]">Estimated Refund:</span>
              <span className="text-emerald-700">{formatCurrency(viewBreakdownItem.estimated_refund)}</span>
            </div>

            {viewBreakdownItem.approved_refund && (
              <div className="flex justify-between py-1 text-sm font-bold bg-emerald-50 p-2.5 rounded-xl border border-emerald-200 text-emerald-900">
                <span>Final Approved Amount:</span>
                <span>{formatCurrency(viewBreakdownItem.approved_refund)}</span>
              </div>
            )}

            {viewBreakdownItem.payout_reference && (
              <div className="bg-slate-50 p-3 rounded-xl border border-[#E3E6E9] text-[#20283A] space-y-0.5">
                <p className="font-bold">Simulated Payout Details:</p>
                <p className="font-mono text-[11px]">Ref: {viewBreakdownItem.payout_reference}</p>
                <p className="text-[10px] text-[#718096]">Processed: {formatDate(viewBreakdownItem.processed_date || '')}</p>
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
