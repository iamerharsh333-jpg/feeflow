import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatDate } from '../utils/helpers';
import { Badge, Button, Card, Modal, Select, StatCard, Table, EmptyState, Input } from '../components/ui';
import { ShieldAlert, UserCheck, Eye, X, CheckCircle, RefreshCw, AlertTriangle, FileText } from 'lucide-react';
import { api } from '../utils/api';

const COUNSELLORS = ['Dr. Meena Saxena', 'Mr. Amit Bhatnagar', 'Ms. Priya Joshi', 'Mr. Rajesh Kumar'];

interface CounsellorTaskItem {
  id: number;
  student_id: string;
  student_name: string;
  centre_name: string;
  course: string;
  risk_level: string;
  risk_score: number;
  risk_reasons: string[];
  evidence?: any;
  attendance_percent: number;
  test_score_trend: string;
  outstanding_amount: number;
  counsellor_name?: string;
  priority: string;
  due_date?: string;
  status: string;
  dismissal_reason?: string;
  notes?: string;
  flagged_date: string;
  reviewed_at?: string;
  created_at: string;
}

export default function RiskCounselling() {
  const { addNotification } = useApp();
  const [tasks, setTasks] = useState<CounsellorTaskItem[]>([]);
  const [summary, setSummary] = useState({
    total_flagged: 0,
    high_risk_count: 0,
    medium_risk_count: 0,
    immediate_followup_count: 0,
    open_tasks_count: 0,
    resolved_tasks_count: 0,
  });
  const [loading, setLoading] = useState(false);
  const [levelFilter, setLevelFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Modals
  const [viewTask, setViewTask] = useState<CounsellorTaskItem | null>(null);
  const [assignModal, setAssignModal] = useState<CounsellorTaskItem | null>(null);
  const [counsellor, setCounsellor] = useState(COUNSELLORS[0]);
  const [priority, setPriority] = useState('High');
  const [assignNotes, setAssignNotes] = useState('');

  // Dismiss modal
  const [dismissModal, setDismissModal] = useState<CounsellorTaskItem | null>(null);
  const [dismissalReason, setDismissalReason] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [sumRes, tasksRes] = await Promise.allSettled([
        api.getRiskSummary(),
        api.getCounsellorTasks({
          risk_level: levelFilter || undefined,
          status: statusFilter || undefined,
        }),
      ]);

      if (sumRes.status === 'fulfilled' && sumRes.value) {
        setSummary(sumRes.value);
      }
      if (tasksRes.status === 'fulfilled' && Array.isArray(tasksRes.value)) {
        setTasks(tasksRes.value);
      }
    } catch (err: any) {
      console.warn('Could not load risk data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [levelFilter, statusFilter]);

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignModal) return;
    try {
      await api.assignCounsellor(assignModal.id, counsellor, priority, assignNotes);
      addNotification({
        type: 'success',
        title: 'Counsellor Assigned',
        message: `${counsellor} assigned to task #${assignModal.id} (${assignModal.student_name}).`,
      });
      setAssignModal(null);
      loadData();
    } catch (err: any) {
      addNotification({ type: 'error', title: 'Assignment failed', message: err.message });
    }
  };

  const handleDismissSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dismissModal) return;
    if (!dismissalReason.trim()) {
      addNotification({ type: 'error', title: 'Reason required', message: 'Mandatory dismissal reason is required.' });
      return;
    }

    try {
      await api.dismissRiskTask(dismissModal.id, dismissalReason.trim());
      addNotification({
        type: 'info',
        title: 'Task Dismissed as False Positive',
        message: `Task #${dismissModal.id} dismissed with reason recorded in audit log.`,
      });
      setDismissModal(null);
      setDismissalReason('');
      loadData();
    } catch (err: any) {
      addNotification({ type: 'error', title: 'Dismissal failed', message: err.message });
    }
  };

  const handleMarkResolved = async (task: CounsellorTaskItem) => {
    try {
      await api.updateRiskStatus(task.id, 'Resolved', 'Counselling completed successfully');
      addNotification({
        type: 'success',
        title: 'Task Resolved',
        message: `Task #${task.id} for ${task.student_name} marked as Resolved.`,
      });
      loadData();
    } catch (err: any) {
      addNotification({ type: 'error', title: 'Status update failed', message: err.message });
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Academic & Fee Dropout Risk Counselling</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Multi-Signal Explainable AI Engine · Decision Support Only · Zero Automated Fee Actions
          </p>
        </div>

        <Button size="sm" variant="outline" onClick={loadData} disabled={loading} className="self-start sm:self-auto">
          <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Safety Notice */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-bold">Human Oversight & Safety Protocol:</p>
          <p className="text-amber-800 mt-0.5">
            Risk scores are decision-support indicators only. Risk flags <strong>never</strong> modify student fee ledgers, <strong>never</strong> send automated messages to parents, and <strong>never</strong> alter course enrollment. They create counsellor follow-up tasks subject to staff review.
          </p>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <StatCard label="High Risk Flagged" value={summary.high_risk_count.toString()} icon={<ShieldAlert className="w-5 h-5" />} accent="red" />
        <StatCard label="Immediate Follow-Up" value={summary.immediate_followup_count.toString()} icon={<AlertTriangle className="w-5 h-5" />} accent="amber" />
        <StatCard label="Active Tasks" value={summary.open_tasks_count.toString()} icon={<UserCheck className="w-5 h-5" />} accent="indigo" />
        <StatCard label="Resolved Cases" value={summary.resolved_tasks_count.toString()} icon={<CheckCircle className="w-5 h-5" />} accent="green" />
      </div>

      {/* Counsellor Task Table */}
      <Card>
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-4 flex-wrap">
          <h2 className="text-sm font-semibold text-slate-900">Counsellor Intervention Queue</h2>
          <div className="flex gap-2">
            <Select
              options={[
                { value: '', label: 'All Risk Levels' },
                { value: 'High', label: 'High Risk' },
                { value: 'Medium', label: 'Medium Risk' },
                { value: 'Low', label: 'Low Risk' },
              ]}
              value={levelFilter}
              onChange={e => setLevelFilter(e.target.value)}
              className="w-36 text-xs"
            />
            <Select
              options={[
                { value: '', label: 'All Statuses' },
                { value: 'Open', label: 'Open' },
                { value: 'In Progress', label: 'In Progress' },
                { value: 'Resolved', label: 'Resolved' },
                { value: 'False Positive', label: 'False Positive' },
              ]}
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="w-36 text-xs"
            />
          </div>
        </div>

        {tasks.length === 0 ? (
          <EmptyState icon={<ShieldAlert className="w-10 h-10" />} title="No counsellor tasks match your filter" />
        ) : (
          <div className="overflow-x-auto">
            <Table headers={['Student', 'Risk Score', 'Priority & Due', 'Attendance', 'Score Trend', 'Overdue Fees', 'Counsellor', 'Status', 'Actions']}>
              {tasks.map(t => (
                <tr key={t.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-sm font-semibold text-slate-900">{t.student_name}</p>
                    <p className="text-xs text-slate-500">{t.student_id} · {t.centre_name}</p>
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        t.risk_score >= 65 ? 'bg-red-100 text-red-800' : t.risk_score >= 35 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {t.risk_score} / 100
                      </span>
                    </div>
                  </td>

                  <td className="px-4 py-3 text-xs">
                    <p className={`font-semibold ${t.priority === 'Urgent' ? 'text-red-600' : 'text-slate-800'}`}>
                      {t.priority}
                    </p>
                    <p className="text-[10px] text-slate-400">Due: {formatDate(t.due_date || '')}</p>
                  </td>

                  <td className="px-4 py-3 text-xs">
                    <span className={`font-bold ${t.attendance_percent < 65 ? 'text-red-600' : t.attendance_percent < 75 ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {t.attendance_percent}%
                    </span>
                  </td>

                  <td className="px-4 py-3 text-xs">
                    <span className={`font-medium ${t.test_score_trend === 'Declining' ? 'text-red-600' : 'text-slate-700'}`}>
                      {t.test_score_trend === 'Declining' ? '↓ Declining' : t.test_score_trend === 'Improving' ? '↑ Improving' : '→ Stable'}
                    </span>
                  </td>

                  <td className="px-4 py-3 text-xs font-semibold text-red-600">
                    {formatCurrency(t.outstanding_amount)}
                  </td>

                  <td className="px-4 py-3 text-xs text-slate-700">
                    {t.counsellor_name || <span className="text-slate-400 italic">Unassigned</span>}
                  </td>

                  <td className="px-4 py-3">
                    <Badge status={t.status} />
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setViewTask(t)} className="text-xs">
                        <Eye className="w-3 h-3 mr-0.5" /> Evidence
                      </Button>

                      {t.status in { 'Open': 1, 'In Progress': 1, 'Unreviewed': 1 } && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-indigo-600 hover:bg-indigo-50 text-xs"
                            onClick={() => {
                              setAssignModal(t);
                              setCounsellor(t.counsellor_name || COUNSELLORS[0]);
                              setPriority(t.priority || 'High');
                            }}
                          >
                            Assign
                          </Button>

                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-emerald-600 hover:bg-emerald-50 text-xs"
                            onClick={() => handleMarkResolved(t)}
                          >
                            Resolve
                          </Button>

                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-slate-500 hover:bg-red-50 hover:text-red-600 text-xs"
                            onClick={() => {
                              setDismissModal(t);
                              setDismissalReason('');
                            }}
                          >
                            Dismiss
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          </div>
        )}
      </Card>

      {/* VIEW EVIDENCE MODAL */}
      <Modal open={!!viewTask} onClose={() => setViewTask(null)} title="Risk Evidence & Signals Breakdown" size="md">
        {viewTask && (
          <div className="p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between bg-slate-50 p-3 rounded-lg border border-slate-200">
              <div>
                <p className="font-bold text-sm text-slate-900">{viewTask.student_name}</p>
                <p className="text-slate-500">{viewTask.student_id} · {viewTask.course} · {viewTask.centre_name}</p>
              </div>
              <div className="text-right">
                <span className="text-base font-extrabold text-red-600 block">{viewTask.risk_score} / 100</span>
                <span className="text-[10px] uppercase font-bold text-slate-400">{viewTask.risk_level} Risk</span>
              </div>
            </div>

            {/* Evidence signals breakdown */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 bg-slate-50 rounded border border-slate-100">
                <span className="text-slate-500 block">Attendance Rate:</span>
                <span className={`font-bold text-sm ${viewTask.attendance_percent < 75 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {viewTask.attendance_percent}%
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded border border-slate-100">
                <span className="text-slate-500 block">Academic Score Trend:</span>
                <span className={`font-bold text-sm ${viewTask.test_score_trend === 'Declining' ? 'text-red-600' : 'text-slate-900'}`}>
                  {viewTask.test_score_trend}
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded border border-slate-100">
                <span className="text-slate-500 block">Overdue Fee Amount:</span>
                <span className="font-bold text-sm text-red-600">
                  {formatCurrency(viewTask.outstanding_amount)}
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded border border-slate-100">
                <span className="text-slate-500 block">Counsellor Assigned:</span>
                <span className="font-bold text-sm text-slate-900">
                  {viewTask.counsellor_name || 'Unassigned'}
                </span>
              </div>
            </div>

            {/* Contributing factors */}
            <div>
              <p className="font-bold text-slate-800 mb-1.5">Factual Risk Factors:</p>
              <ul className="space-y-1">
                {viewTask.risk_reasons.map((r, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-slate-700 bg-red-50/50 p-1.5 rounded border border-red-100/60">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0 mt-1" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>

            {viewTask.dismissal_reason && (
              <div className="p-2.5 bg-slate-100 rounded border border-slate-200">
                <p className="font-bold text-slate-800">False-Positive Dismissal Reason:</p>
                <p className="text-slate-600 mt-0.5">{viewTask.dismissal_reason}</p>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={() => setViewTask(null)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ASSIGN MODAL */}
      <Modal open={!!assignModal} onClose={() => setAssignModal(null)} title="Assign Counsellor to Task" size="sm">
        {assignModal && (
          <form onSubmit={handleAssignSubmit} className="p-5 space-y-3.5 text-xs">
            <p className="text-slate-600">Assigning follow-up for <strong>{assignModal.student_name}</strong> ({assignModal.student_id}).</p>

            <Select
              label="Select Counsellor"
              options={COUNSELLORS.map(c => ({ value: c, label: c }))}
              value={counsellor}
              onChange={e => setCounsellor(e.target.value)}
            />

            <Select
              label="Priority"
              options={[
                { value: 'Urgent', label: 'Urgent (Within 24 Hours)' },
                { value: 'High', label: 'High (Within 48 Hours)' },
                { value: 'Medium', label: 'Medium (Within 5 Days)' },
              ]}
              value={priority}
              onChange={e => setPriority(e.target.value)}
            />

            <Input
              label="Internal Notes (Optional)"
              value={assignNotes}
              onChange={e => setAssignNotes(e.target.value)}
              placeholder="e.g. Call parent after 5 PM"
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setAssignModal(null)}>Cancel</Button>
              <Button type="submit">Confirm Assignment</Button>
            </div>
          </form>
        )}
      </Modal>

      {/* DISMISS MODAL */}
      <Modal open={!!dismissModal} onClose={() => setDismissModal(null)} title="Dismiss Risk Flag (False Positive)" size="md">
        {dismissModal && (
          <form onSubmit={handleDismissSubmit} className="p-5 space-y-3.5 text-xs">
            <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 text-amber-900">
              <p className="font-bold">Human Oversight Requirement:</p>
              <p className="mt-0.5">Every dismissed risk flag requires a mandatory reason explaining why this was a false positive. This will be audited.</p>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Mandatory Dismissal Reason <span className="text-red-500">*</span>
              </label>
              <textarea
                className="w-full text-xs p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                rows={3}
                value={dismissalReason}
                onChange={e => setDismissalReason(e.target.value)}
                placeholder="e.g. Student was hospitalized with approved medical leave; fee payment scheduled for 10th."
                required
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDismissModal(null)}>Cancel</Button>
              <Button type="submit" className="bg-red-600 hover:bg-red-700 text-white">Confirm Dismissal</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
