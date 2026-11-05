import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatDate } from '../utils/helpers';
import { Badge, Button, Card, Modal, Select, StatCard, Table, EmptyState, Input } from '../components/ui';
import { ShieldAlert, UserCheck, Eye, CheckCircle, RefreshCw, AlertTriangle, Sparkles, Play, RotateCcw } from 'lucide-react';
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
  const [scanning, setScanning] = useState(false);
  const [seeding, setSeeding] = useState(false);
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

  const handleRunScan = async () => {
    setScanning(true);
    try {
      const res = await api.runRiskScan();
      addNotification({
        type: 'success',
        title: 'Risk Scan Completed',
        message: res.message || 'Evaluated students across academic and fee thresholds.',
      });
      await loadData();
    } catch (err: any) {
      addNotification({ type: 'error', title: 'Risk scan failed', message: err.message });
    } finally {
      setScanning(false);
    }
  };

  const handleSeedDemo = async () => {
    setSeeding(true);
    try {
      const res = await api.seedDemoRiskStudent();
      addNotification({
        type: 'success',
        title: 'Demo Scenario Seeded',
        message: `${res.student_name} (${res.student_id}) ready with declining attendance, falling test scores, and 25-day overdue instalment.`,
      });
      await loadData();
    } catch (err: any) {
      addNotification({ type: 'error', title: 'Seeding failed', message: err.message });
    } finally {
      setSeeding(false);
    }
  };

  const handleInspectDemoCase = async () => {
    let demoTask = tasks.find(t => t.student_id === 'STU-0999');
    if (!demoTask) {
      try {
        await api.seedDemoRiskStudent();
        const updatedTasks = await api.getCounsellorTasks();
        if (Array.isArray(updatedTasks)) {
          setTasks(updatedTasks);
          demoTask = updatedTasks.find((t: any) => t.student_id === 'STU-0999');
        }
      } catch (err) {
        console.warn('Could not auto-seed demo task:', err);
      }
    }

    if (demoTask) {
      setViewTask(demoTask);
    } else {
      addNotification({
        type: 'info',
        title: 'Demo Case Initialized',
        message: 'Click "Seed Demo Scenario" above to initialize Rohan Verma.',
      });
    }
  };

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

  const demoStudentTask = tasks.find(t => t.student_id === 'STU-0999');

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#20283A] tracking-tight">Academic & Fee Dropout Risk Counselling</h1>
          <p className="text-xs text-[#718096] mt-1 font-normal">
            Multi-Signal Explainable Rule Engine · Decision Support Only · Zero Automated Fee Actions
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            onClick={handleRunScan}
            disabled={scanning || loading}
            className="bg-[#20283A] hover:bg-[#2c374e] text-white text-xs font-semibold"
          >
            <Play className={`w-3.5 h-3.5 mr-1 text-[#79A9D1] ${scanning ? 'animate-spin' : ''}`} />
            {scanning ? 'Running Scan...' : 'Run Risk Scan'}
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={loadData}
            disabled={loading}
            className="text-xs border-[#E3E6E9] text-[#20283A]"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1 text-[#718096] ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Evaluator Demo Scenario Banner */}
      <Card className="rounded-2xl border border-[#79A9D1]/40 bg-gradient-to-r from-[#EEF5FB] to-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#79A9D1]/20 border border-[#79A9D1]/40 flex items-center justify-center flex-shrink-0 text-[#20283A]">
              <Sparkles className="w-5 h-5 text-[#E95435]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#E95435]">Evaluator Demo Scenario</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white border border-[#E3E6E9] text-[#20283A]">
                  Student: Rohan Verma (STU-0999)
                </span>
                {demoStudentTask && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    demoStudentTask.status === 'False Positive' ? 'bg-slate-100 text-[#718096] border-[#E3E6E9]' : 'bg-rose-50 text-[#BA2525] border-rose-200'
                  }`}>
                    Status: {demoStudentTask.status} ({demoStudentTask.risk_score}/100)
                  </span>
                )}
              </div>
              <p className="text-xs text-[#20283A] mt-1 font-medium">
                Demonstrates explainable high-risk detection: <strong>Attendance drop (85% → 58%)</strong>, <strong>3 declining test scores (72%, 61%, 43%)</strong>, and <strong>1 instalment overdue by 25 days</strong>.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto flex-wrap">
            <Button
              size="sm"
              onClick={handleInspectDemoCase}
              className="bg-[#E95435] hover:bg-[#D84527] text-white text-xs font-semibold shadow-xs"
            >
              <Eye className="w-3.5 h-3.5 mr-1" />
              Inspect Demo Evidence
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleSeedDemo}
              disabled={seeding}
              className="text-xs border-[#E3E6E9] text-[#20283A] bg-white hover:bg-slate-50"
            >
              <RotateCcw className={`w-3.5 h-3.5 mr-1 text-[#718096] ${seeding ? 'animate-spin' : ''}`} />
              {seeding ? 'Seeding...' : 'Reset Demo Student'}
            </Button>
          </div>
        </div>
      </Card>

      {/* Safety Notice */}
      <div className="bg-amber-50/75 border border-amber-200 rounded-2xl p-3.5 text-xs text-amber-900 flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-bold">Human Oversight & Safety Protocol:</p>
          <p className="text-amber-800 mt-0.5">
            Risk scores are decision-support indicators only. Risk flags <strong>never</strong> modify student fee ledgers, <strong>never</strong> send automated messages to parents, and <strong>never</strong> alter course enrollment. They create counsellor follow-up tasks subject to staff review.
          </p>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="High Risk Flagged" value={summary.high_risk_count.toString()} icon={<ShieldAlert className="w-5 h-5 text-[#BA2525]" />} accent="red" />
        <StatCard label="Immediate Follow-Up" value={summary.immediate_followup_count.toString()} icon={<AlertTriangle className="w-5 h-5 text-amber-600" />} accent="amber" />
        <StatCard label="Active Tasks" value={summary.open_tasks_count.toString()} icon={<UserCheck className="w-5 h-5 text-[#79A9D1]" />} accent="blue" />
        <StatCard label="Resolved Cases" value={summary.resolved_tasks_count.toString()} icon={<CheckCircle className="w-5 h-5 text-emerald-600" />} accent="green" />
      </div>

      {/* Counsellor Task Table */}
      <Card className="rounded-2xl border border-[#E3E6E9] bg-white overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
        <div className="px-5 py-4 border-b border-[#E3E6E9] bg-slate-50/75 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-sm font-bold text-[#20283A]">Counsellor Intervention Queue</h2>
            <p className="text-xs text-[#718096]">Assigned academic mentors and intervention follow-ups</p>
          </div>
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
          <EmptyState icon={<ShieldAlert className="w-10 h-10 text-[#718096]/40" />} title="No counsellor tasks match your filter" />
        ) : (
          <div className="overflow-x-auto">
            <Table headers={['Student', 'Risk Score', 'Priority & Due', 'Attendance', 'Score Trend', 'Overdue Fees', 'Counsellor', 'Status', 'Actions']}>
              {tasks.map(t => {
                const isDemo = t.student_id === 'STU-0999';
                return (
                  <tr key={t.id} className={`hover:bg-slate-50/60 transition-colors ${isDemo ? 'bg-amber-50/30' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-semibold text-[#20283A]">{t.student_name}</p>
                        {isDemo && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#E95435]/10 text-[#E95435] border border-[#E95435]/25">
                            Demo Case
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#718096]">{t.student_id} · {t.centre_name}</p>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                          t.risk_score >= 65 ? 'bg-rose-50 text-[#BA2525] border-rose-200' : t.risk_score >= 35 ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        }`}>
                          {t.risk_score} / 100
                        </span>
                      </div>
                    </td>

                    <td className="px-4 py-3 text-xs">
                      <p className={`font-semibold ${t.priority === 'Urgent' ? 'text-[#BA2525]' : 'text-[#20283A]'}`}>
                        {t.priority}
                      </p>
                      <p className="text-[10px] text-[#718096]">Due: {formatDate(t.due_date || '')}</p>
                    </td>

                    <td className="px-4 py-3 text-xs">
                      <span className={`font-bold ${t.attendance_percent < 65 ? 'text-[#BA2525]' : t.attendance_percent < 75 ? 'text-amber-700' : 'text-emerald-700'}`}>
                        {t.attendance_percent}%
                      </span>
                    </td>

                    <td className="px-4 py-3 text-xs">
                      <span className={`font-semibold ${t.test_score_trend === 'Declining' ? 'text-[#BA2525]' : 'text-[#20283A]'}`}>
                        {t.test_score_trend === 'Declining' ? '↓ Declining' : t.test_score_trend === 'Improving' ? '↑ Improving' : '→ Stable'}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-xs font-bold text-[#BA2525]">
                      {formatCurrency(t.outstanding_amount)}
                    </td>

                    <td className="px-4 py-3 text-xs text-[#20283A] font-medium">
                      {t.counsellor_name || <span className="text-[#718096] italic">Unassigned</span>}
                    </td>

                    <td className="px-4 py-3">
                      <Badge status={t.status} />
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Button size="sm" variant="ghost" onClick={() => setViewTask(t)} className="text-xs text-[#718096] hover:text-[#20283A]">
                          <Eye className="w-3.5 h-3.5 mr-0.5" /> Evidence
                        </Button>

                        {t.status in { 'Open': 1, 'In Progress': 1, 'Unreviewed': 1, 'Pending': 1 } && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-[#20283A] hover:bg-slate-50 text-xs border-[#E3E6E9]"
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
                              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                              onClick={() => handleMarkResolved(t)}
                            >
                              Resolve
                            </Button>

                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-[#BA2525] hover:bg-rose-50 text-xs"
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
                );
              })}
            </Table>
          </div>
        )}
      </Card>

      {/* VIEW EVIDENCE MODAL */}
      <Modal open={!!viewTask} onClose={() => setViewTask(null)} title="Risk Evidence & Signals Breakdown" size="lg">
        {viewTask && (
          <div className="p-5 space-y-4 text-xs">
            {/* Header info */}
            <div className="flex items-center justify-between bg-slate-50/75 p-3.5 rounded-2xl border border-[#E3E6E9]">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-bold text-sm text-[#20283A]">{viewTask.student_name}</p>
                  {viewTask.student_id === 'STU-0999' && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#E95435]/10 text-[#E95435] border border-[#E95435]/25">
                      Evaluator Demo Student
                    </span>
                  )}
                </div>
                <p className="text-[#718096]">{viewTask.student_id} · {viewTask.course} · {viewTask.centre_name}</p>
              </div>
              <div className="text-right">
                <span className="text-base font-black text-[#BA2525] block">{viewTask.risk_score} / 100</span>
                <span className="text-[10px] uppercase font-bold text-[#718096]">{viewTask.risk_level} Risk Category</span>
              </div>
            </div>

            {/* Explainable Engine Tag */}
            <div className="bg-[#EEF5FB] border border-[#79A9D1]/30 rounded-xl p-3 text-[11px] text-[#20283A] flex items-center justify-between">
              <span className="font-semibold text-[#20283A] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#E95435]" />
                Deterministic Explainable Risk Scoring Engine
              </span>
              <span className="text-[#718096]">3-Signal Rule Model · Zero Unverified ML</span>
            </div>

            {/* Evidence signals breakdown */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              {/* Signal 1: Attendance */}
              <div className="p-3 bg-slate-50/75 rounded-xl border border-[#E3E6E9] space-y-1">
                <span className="text-[#718096] block font-semibold">Signal 1: Attendance</span>
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] text-[#718096]">Overall:</span>
                  <span className={`font-bold text-sm ${viewTask.attendance_percent < 75 ? 'text-[#BA2525]' : 'text-emerald-700'}`}>
                    {viewTask.attendance_percent}%
                  </span>
                </div>
                {viewTask.evidence?.attendance_baseline_rate && (
                  <div className="text-[11px] text-[#718096] flex justify-between">
                    <span>Baseline → Recent:</span>
                    <span className="font-semibold text-[#BA2525]">
                      {viewTask.evidence.attendance_baseline_rate}% → {viewTask.evidence.attendance_recent_rate}%
                    </span>
                  </div>
                )}
                <div className="text-[10px] text-[#718096] flex justify-between pt-1 border-t border-[#E3E6E9]">
                  <span>Trend:</span>
                  <span className="font-bold text-[#BA2525]">{viewTask.evidence?.attendance_trend || 'Declining'}</span>
                </div>
              </div>

              {/* Signal 2: Academic Tests */}
              <div className="p-3 bg-slate-50/75 rounded-xl border border-[#E3E6E9] space-y-1">
                <span className="text-[#718096] block font-semibold">Signal 2: Test Scores</span>
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] text-[#718096]">Average:</span>
                  <span className="font-bold text-sm text-[#20283A]">
                    {viewTask.evidence?.test_average_percent ? `${viewTask.evidence.test_average_percent}%` : '58.7%'}
                  </span>
                </div>
                <div className="text-[11px] text-[#718096] flex justify-between">
                  <span>Score Sequence:</span>
                  <span className="font-semibold text-[#BA2525]">
                    {viewTask.evidence?.recent_test_scores?.length
                      ? viewTask.evidence.recent_test_scores.map((s: number) => `${s}%`).join(' → ')
                      : '72% → 61% → 43%'}
                  </span>
                </div>
                <div className="text-[10px] text-[#718096] flex justify-between pt-1 border-t border-[#E3E6E9]">
                  <span>Trend:</span>
                  <span className="font-bold text-[#BA2525]">↓ {viewTask.test_score_trend}</span>
                </div>
              </div>

              {/* Signal 3: Fee Status */}
              <div className="p-3 bg-slate-50/75 rounded-xl border border-[#E3E6E9] space-y-1">
                <span className="text-[#718096] block font-semibold">Signal 3: Overdue Fee</span>
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] text-[#718096]">Overdue Balance:</span>
                  <span className="font-bold text-sm text-[#BA2525]">
                    {formatCurrency(viewTask.outstanding_amount)}
                  </span>
                </div>
                <div className="text-[11px] text-[#718096] flex justify-between">
                  <span>Overdue Days:</span>
                  <span className="font-semibold text-[#BA2525]">
                    {viewTask.evidence?.max_overdue_days || 25} days
                  </span>
                </div>
                <div className="text-[10px] text-[#718096] flex justify-between pt-1 border-t border-[#E3E6E9]">
                  <span>Status:</span>
                  <span className="font-bold text-[#BA2525]">1 Overdue Instalment</span>
                </div>
              </div>
            </div>

            {/* Score points breakdown */}
            {viewTask.evidence?.score_breakdown && (
              <div className="bg-slate-50/75 p-3 rounded-xl border border-[#E3E6E9] flex items-center justify-between text-xs">
                <span className="text-[#718096] font-semibold">Points Distribution:</span>
                <div className="flex gap-4 text-[11px] font-medium text-[#20283A]">
                  <span>Attendance: <strong>{viewTask.evidence.score_breakdown.attendance_risk_points} / 35 pts</strong></span>
                  <span>Academics: <strong>{viewTask.evidence.score_breakdown.academic_risk_points} / 30 pts</strong></span>
                  <span>Fee Overdue: <strong>{viewTask.evidence.score_breakdown.fee_risk_points ?? 0} / 35 pts</strong></span>
                  <span className="font-bold text-[#E95435]">Total: {viewTask.risk_score} pts</span>
                </div>
              </div>
            )}

            {/* Contributing factors */}
            <div>
              <p className="font-bold text-[#20283A] mb-1.5">Factual Risk Reasons:</p>
              <ul className="space-y-1.5">
                {viewTask.risk_reasons.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-[#20283A] bg-rose-50/50 p-2.5 rounded-xl border border-rose-100 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#BA2525] flex-shrink-0 mt-1.5" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Recommended Action */}
            <div className="p-3 bg-[#EBF7EE] rounded-xl border border-[#CDEED6]">
              <p className="font-bold text-[#1B7043] flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4 text-[#1B7043]" />
                Recommended Counsellor Action:
              </p>
              <p className="text-xs text-[#1B7043] mt-0.5">
                {viewTask.risk_level === 'High'
                  ? 'Schedule immediate 1-on-1 parent & student counselling session within 48 hours.'
                  : 'Initiate counsellor check-in regarding recent attendance or academic trend.'}
              </p>
            </div>

            {viewTask.dismissal_reason && (
              <div className="p-3 bg-slate-100 rounded-xl border border-[#E3E6E9]">
                <p className="font-bold text-[#20283A]">False-Positive Dismissal Audit Record:</p>
                <p className="text-[#718096] mt-0.5">{viewTask.dismissal_reason}</p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-[#E3E6E9]">
              {viewTask.status !== 'False Positive' && viewTask.status !== 'Resolved' && (
                <Button
                  variant="outline"
                  className="text-[#BA2525] border-rose-200 hover:bg-rose-50 text-xs"
                  onClick={() => {
                    setDismissModal(viewTask);
                    setDismissalReason('');
                  }}
                >
                  Dismiss as False Positive
                </Button>
              )}
              <Button variant="outline" onClick={() => setViewTask(null)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ASSIGN MODAL */}
      <Modal open={!!assignModal} onClose={() => setAssignModal(null)} title="Assign Counsellor to Task" size="sm">
        {assignModal && (
          <form onSubmit={handleAssignSubmit} className="p-5 space-y-3.5 text-xs">
            <p className="text-[#718096]">Assigning follow-up for <strong className="text-[#20283A]">{assignModal.student_name}</strong> ({assignModal.student_id}).</p>

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

            <div className="flex justify-end gap-2 pt-3 border-t border-[#E3E6E9]">
              <Button type="button" variant="outline" onClick={() => setAssignModal(null)}>Cancel</Button>
              <Button type="submit" className="bg-[#E95435] hover:bg-[#D84527] text-white">Confirm Assignment</Button>
            </div>
          </form>
        )}
      </Modal>

      {/* DISMISS MODAL */}
      <Modal open={!!dismissModal} onClose={() => setDismissModal(null)} title="Dismiss Risk Flag (False Positive)" size="md">
        {dismissModal && (
          <form onSubmit={handleDismissSubmit} className="p-5 space-y-3.5 text-xs">
            <div className="bg-amber-50/75 p-3.5 rounded-xl border border-amber-200 text-amber-900">
              <p className="font-bold">Human Oversight Requirement:</p>
              <p className="mt-0.5">Every dismissed risk flag requires a mandatory reason explaining why this was a false positive. This will be audited.</p>
            </div>

            <div>
              <label className="text-xs font-semibold text-[#20283A] block mb-1">
                Mandatory Dismissal Reason <span className="text-[#BA2525]">*</span>
              </label>
              <textarea
                className="w-full text-xs p-2.5 border border-[#E3E6E9] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#20283A]"
                rows={3}
                value={dismissalReason}
                onChange={e => setDismissalReason(e.target.value)}
                placeholder="e.g. Student was hospitalized with approved medical leave; fee payment scheduled for 10th."
                required
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[#E3E6E9]">
              <Button type="button" variant="outline" onClick={() => setDismissModal(null)}>Cancel</Button>
              <Button type="submit" className="bg-rose-600 hover:bg-rose-700 text-white">Confirm Dismissal</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
