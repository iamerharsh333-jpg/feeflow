import React, { useState, useEffect, useCallback } from 'react';
import { Card, Button, StatCard, Badge, Table, EmptyState, Modal, Input, Select } from '../components/ui';
import { api } from '../utils/api';
import { formatDate, formatCurrency } from '../utils/helpers';
import { useApp } from '../context/AppContext';
import {
  Cpu, Play, RefreshCw, AlertTriangle, CheckCircle, Clock,
  DollarSign, ShieldAlert, Zap, Power, AlertCircle, ArrowRight,
  UserCheck, X, FileText, Send, User, Check, Layers, ListFilter
} from 'lucide-react';
import { Link } from 'react-router-dom';

interface AutomationStatus {
  scheduler_enabled: boolean;
  scheduler_interval_minutes: number;
  last_reminder_execution: string | null;
  next_scheduled_execution: string | null;
  reminders_today: number;
  reminders_delivered: number;
  reminders_failed: number;
  reminders_cancelled: number;
  payments_matched: number;
  payments_unmatched: number;
  last_risk_execution: string | null;
  failed_jobs_count: number;
  recent_logs: Array<{
    id: number;
    job_name: string;
    status: string;
    items_processed: number;
    details: string;
    duration_ms: number;
    executed_at: string | null;
  }>;
}

type TabType = 'daemon' | 'reminders' | 'unmatched' | 'refunds' | 'risk_tasks' | 'logs';

export default function AutomationPage() {
  const { students, addNotification, refreshData } = useApp();
  const [activeTab, setActiveTab] = useState<TabType>('daemon');
  const [status, setStatus] = useState<AutomationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [runningJob, setRunningJob] = useState<string | null>(null);

  // Operational Queues Data State
  const [reminders, setReminders] = useState<any[]>([]);
  const [unmatchedPayments, setUnmatchedPayments] = useState<any[]>([]);
  const [refundRequests, setRefundRequests] = useState<any[]>([]);
  const [riskTasks, setRiskTasks] = useState<any[]>([]);
  const [loadingQueues, setLoadingQueues] = useState(false);

  // Modals state
  const [selectedPayment, setSelectedPayment] = useState<any | null>(null);
  const [matchingStudentId, setMatchingStudentId] = useState<string>('');
  const [selectedRefund, setSelectedRefund] = useState<any | null>(null);
  const [refundDecision, setRefundDecision] = useState<'approve' | 'reject'>('approve');
  const [refundAmount, setRefundAmount] = useState<number>(0);
  const [refundReason, setRefundReason] = useState<string>('');
  const [selectedRiskTask, setSelectedRiskTask] = useState<any | null>(null);
  const [counsellorName, setCounsellorName] = useState<string>('Pooja Sharma (Senior Academic Counsellor)');
  const [dismissReason, setDismissReason] = useState<string>('');
  const [isDismissModalOpen, setIsDismissModalOpen] = useState(false);
  const [submittingAction, setSubmittingAction] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await api.getAutomationStatus();
      if (data && typeof data === 'object') {
        setStatus(data);
      }
    } catch (err: any) {
      console.warn('Failed to fetch automation status:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchOperationalQueues = useCallback(async () => {
    setLoadingQueues(true);
    try {
      const [rems, unmat, refs, tasks] = await Promise.all([
        api.getReminders().catch(() => []),
        api.getUnmatchedPayments().catch(() => []),
        api.getRefundRequests().catch(() => []),
        api.getCounsellorTasks().catch(() => []),
      ]);
      setReminders(Array.isArray(rems) ? rems : []);
      setUnmatchedPayments(Array.isArray(unmat) ? unmat : []);
      setRefundRequests(Array.isArray(refs) ? refs : []);
      setRiskTasks(Array.isArray(tasks) ? tasks : []);
    } catch (err) {
      console.warn('Failed to load operational queues', err);
    } finally {
      setLoadingQueues(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchOperationalQueues();
    const timer = setInterval(() => {
      fetchStatus();
      fetchOperationalQueues();
    }, 20000);
    return () => clearInterval(timer);
  }, [fetchStatus, fetchOperationalQueues]);

  const handleToggleScheduler = async () => {
    if (!status) return;
    setToggling(true);
    try {
      const newEnabled = !status.scheduler_enabled;
      await api.toggleReminderAutomation(newEnabled);
      setStatus(s => s ? { ...s, scheduler_enabled: newEnabled } : null);
      addNotification({
        type: newEnabled ? 'success' : 'info',
        title: newEnabled ? 'Scheduler Activated' : 'Scheduler Paused',
        message: `Background 5-minute reminder cycles are now ${newEnabled ? 'ACTIVE' : 'PAUSED'}.`
      });
    } catch (err: any) {
      addNotification({ type: 'error', title: 'Toggle Failed', message: err.message });
    } finally {
      setToggling(false);
    }
  };

  const handleRunReminders = async () => {
    setRunningJob('reminders');
    try {
      const res = await api.runReminderCycle();
      addNotification({
        type: 'success',
        title: 'Reminder Cycle Completed',
        message: `Processed ${res.sent_count || 0} due reminder(s), cancelled ${res.cancelled_count || 0}.`
      });
      await Promise.all([fetchStatus(), fetchOperationalQueues()]);
    } catch (err: any) {
      addNotification({ type: 'error', title: 'Execution Failed', message: err.message });
    } finally {
      setRunningJob(null);
    }
  };

  const handleRunRiskScan = async () => {
    setRunningJob('risk');
    try {
      const res = await api.runRiskScan();
      addNotification({
        type: 'success',
        title: 'Daily AI Risk Scan Complete',
        message: `Analyzed ${res.students_analyzed || 0} student(s). High risk: ${res.high_risk_count || 0}.`
      });
      await Promise.all([fetchStatus(), fetchOperationalQueues()]);
    } catch (err: any) {
      addNotification({ type: 'error', title: 'Risk Scan Failed', message: err.message });
    } finally {
      setRunningJob(null);
    }
  };

  const handleRetryFailed = async () => {
    setRunningJob('retry');
    try {
      const res = await api.retryFailedReminders();
      addNotification({
        type: 'success',
        title: 'Retry Finished',
        message: res.message || 'Retried failed deliveries without duplicates.'
      });
      await Promise.all([fetchStatus(), fetchOperationalQueues()]);
    } catch (err: any) {
      addNotification({ type: 'error', title: 'Retry Failed', message: err.message });
    } finally {
      setRunningJob(null);
    }
  };

  // Payment Matching Handler
  const handleMatchPayment = async () => {
    if (!selectedPayment || !matchingStudentId) return;
    setSubmittingAction(true);
    try {
      await api.matchPayment(selectedPayment.id, matchingStudentId);
      addNotification({
        type: 'success',
        title: 'Payment Reconciled',
        message: `Payment ${selectedPayment.referenceNo || selectedPayment.transactionId} matched to student ${matchingStudentId}. Fee ledger & receipts updated.`
      });
      setSelectedPayment(null);
      await Promise.all([fetchStatus(), fetchOperationalQueues(), refreshData()]);
    } catch (err: any) {
      addNotification({ type: 'error', title: 'Matching Failed', message: err.message });
    } finally {
      setSubmittingAction(false);
    }
  };

  // Refund Decision Handler
  const handleRefundDecision = async () => {
    if (!selectedRefund) return;
    setSubmittingAction(true);
    try {
      if (refundDecision === 'approve') {
        await api.approveRefund(selectedRefund.id, {
          approved_amount: refundAmount,
          reason: refundReason || 'Approved as per UGC/institute pro-rata refund policy'
        });
        addNotification({
          type: 'success',
          title: 'Refund Approved',
          message: `Approved ₹${refundAmount.toLocaleString('en-IN')} for student ${selectedRefund.student_name}. Audit log created.`
        });
      } else {
        await api.rejectRefund(selectedRefund.id, refundReason || 'Non-compliant with refund policy guidelines');
        addNotification({
          type: 'info',
          title: 'Refund Request Rejected',
          message: `Request for ${selectedRefund.student_name} rejected with audit record.`
        });
      }
      setSelectedRefund(null);
      await Promise.all([fetchStatus(), fetchOperationalQueues(), refreshData()]);
    } catch (err: any) {
      addNotification({ type: 'error', title: 'Refund Action Failed', message: err.message });
    } finally {
      setSubmittingAction(false);
    }
  };

  // Assign Counsellor Handler
  const handleAssignCounsellor = async () => {
    if (!selectedRiskTask) return;
    setSubmittingAction(true);
    try {
      await api.assignCounsellor(selectedRiskTask.id, counsellorName, 'High', 'Assigned via Automation Hub');
      addNotification({
        type: 'success',
        title: 'Counsellor Assigned',
        message: `${counsellorName} assigned to student ${selectedRiskTask.student_name}.`
      });
      setSelectedRiskTask(null);
      await Promise.all([fetchStatus(), fetchOperationalQueues()]);
    } catch (err: any) {
      addNotification({ type: 'error', title: 'Assignment Failed', message: err.message });
    } finally {
      setSubmittingAction(false);
    }
  };

  // Dismiss Risk Task Handler
  const handleDismissRiskTask = async () => {
    if (!selectedRiskTask || !dismissReason) return;
    setSubmittingAction(true);
    try {
      await api.dismissRiskTask(selectedRiskTask.id, dismissReason);
      addNotification({
        type: 'info',
        title: 'Task Dismissed as False Positive',
        message: `Task for ${selectedRiskTask.student_name} marked as false positive: "${dismissReason}".`
      });
      setSelectedRiskTask(null);
      setIsDismissModalOpen(false);
      setDismissReason('');
      await Promise.all([fetchStatus(), fetchOperationalQueues()]);
    } catch (err: any) {
      addNotification({ type: 'error', title: 'Dismissal Failed', message: err.message });
    } finally {
      setSubmittingAction(false);
    }
  };

  const studentOptions = students.map(s => ({
    value: s.id,
    label: `${s.name} (${s.id}) · ${s.course} · ${formatCurrency(s.outstanding)} due`
  }));

  return (
    <div className="space-y-5">
      {/* Header with Title and Control Buttons */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900">Automation Engine & Operations Hub</h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-700">
              5-Min Daemon Running
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time management of automated reminder schedules, payment matching, refund approvals, and AI retention tasks.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            onClick={() => { fetchStatus(); fetchOperationalQueues(); }}
            disabled={loading || loadingQueues}
            className="text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading || loadingQueues ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={handleRetryFailed}
            disabled={runningJob !== null}
            className="text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${runningJob === 'retry' ? 'animate-spin' : ''}`} />
            Retry Failed ({status?.reminders_failed || 0})
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={handleRunRiskScan}
            disabled={runningJob !== null}
            className="text-xs text-indigo-600 border-indigo-200 hover:bg-indigo-50"
          >
            <Zap className={`w-3.5 h-3.5 mr-1 ${runningJob === 'risk' ? 'animate-spin' : ''}`} />
            Run Risk Scan Now
          </Button>

          <Button
            size="sm"
            onClick={handleRunReminders}
            disabled={runningJob !== null}
            className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
          >
            <Play className={`w-3.5 h-3.5 mr-1 ${runningJob === 'reminders' ? 'animate-spin' : ''}`} />
            Run Reminders Now
          </Button>
        </div>
      </div>

      {/* Operational Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto text-xs font-semibold">
        {[
          { id: 'daemon', label: 'Daemon & Engine Control', count: null },
          { id: 'reminders', label: 'Reminder Schedules', count: reminders.length },
          { id: 'unmatched', label: 'Unmatched Payments', count: unmatchedPayments.length },
          { id: 'refunds', label: 'Pending Refunds', count: refundRequests.filter(r => r.status === 'Submitted').length },
          { id: 'risk_tasks', label: 'AI Counsellor Tasks', count: riskTasks.filter(t => t.status === 'Pending').length },
          { id: 'logs', label: 'Execution Logs', count: status?.recent_logs?.length || 0 },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as TabType)}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span>{tab.label}</span>
            {tab.count !== null && tab.count > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeTab === tab.id ? 'bg-indigo-800 text-white' : 'bg-slate-200 text-slate-800'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* TAB 1: DAEMON & CONTROLS */}
      {activeTab === 'daemon' && (
        <div className="space-y-4">
          {/* Scheduler Switch Card */}
          <Card className="p-4 bg-white border border-slate-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  status?.scheduler_enabled ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'
                }`}>
                  <Power className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">
                      Automated Reminder Scheduler
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      status?.scheduler_enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                    }`}>
                      {status?.scheduler_enabled ? 'RUNNING (5-MIN INTERVAL)' : 'PAUSED'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Evaluates student fee instalments every 5 minutes against statutory -7d, -3d, due-date, and overdue milestones.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right text-xs">
                  <span className="text-slate-400 block text-[10px]">Next Scheduled Execution:</span>
                  <span className="font-semibold text-slate-700">
                    {status?.next_scheduled_execution ? formatDate(status.next_scheduled_execution) : 'In ~5 minutes'}
                  </span>
                </div>
                <button
                  onClick={handleToggleScheduler}
                  disabled={toggling}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    status?.scheduler_enabled ? 'bg-emerald-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                      status?.scheduler_enabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </Card>

          {/* KPI Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard
              label="Reminders Today"
              value={(status?.reminders_today || 0).toString()}
              sub="Generated today"
              icon={<Clock className="w-4 h-4" />}
              accent="indigo"
              onClick={() => setActiveTab('reminders')}
            />
            <StatCard
              label="Delivered (Sim)"
              value={(status?.reminders_delivered || 0).toString()}
              sub="Delivered via provider"
              icon={<CheckCircle className="w-4 h-4" />}
              accent="green"
              onClick={() => setActiveTab('reminders')}
            />
            <StatCard
              label="Auto-Cancelled"
              value={(status?.reminders_cancelled || 0).toString()}
              sub="Cancelled on full pay"
              icon={<AlertCircle className="w-4 h-4" />}
              accent="amber"
              onClick={() => setActiveTab('reminders')}
            />
            <StatCard
              label="Delivery Failures"
              value={(status?.reminders_failed || 0).toString()}
              sub="Eligible for retry"
              icon={<AlertTriangle className="w-4 h-4" />}
              accent="red"
              onClick={() => setActiveTab('reminders')}
            />
            <StatCard
              label="Payments Matched"
              value={(status?.payments_matched || 0).toString()}
              sub="Reconciled to ledger"
              icon={<DollarSign className="w-4 h-4" />}
              accent="green"
            />
            <StatCard
              label="Unmatched Queue"
              value={(status?.payments_unmatched || 0).toString()}
              sub="Requires staff review"
              icon={<ShieldAlert className="w-4 h-4" />}
              accent="amber"
              onClick={() => setActiveTab('unmatched')}
            />
          </div>

          {/* Middle Row: Schedule Rules & Payment Matching Info */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="p-4 lg:col-span-2">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-slate-900">Configured Reminder Milestone Rules</h2>
                <span className="text-[11px] text-slate-400">Strict unique event-key deduplication</span>
              </div>

              <div className="border border-slate-100 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100">
                    <tr>
                      <th className="p-2.5">Milestone Trigger</th>
                      <th className="p-2.5">Timing</th>
                      <th className="p-2.5">Event Key Prefix</th>
                      <th className="p-2.5">Pre-Send Condition</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    <tr>
                      <td className="p-2.5 font-medium">7 Days Before Due Date</td>
                      <td className="p-2.5 text-slate-500">Due date - 7 days</td>
                      <td className="p-2.5 font-mono text-[11px] text-indigo-600">&#123;ins_id&#125;_UPCOMING_7D</td>
                      <td className="p-2.5 text-slate-500">Balance &gt; 0, unpaid</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-medium">3 Days Before Due Date</td>
                      <td className="p-2.5 text-slate-500">Due date - 3 days</td>
                      <td className="p-2.5 font-mono text-[11px] text-indigo-600">&#123;ins_id&#125;_UPCOMING_3D</td>
                      <td className="p-2.5 text-slate-500">Balance &gt; 0, unpaid</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-medium">On Due Date</td>
                      <td className="p-2.5 text-slate-500">Exact due date (day 0)</td>
                      <td className="p-2.5 font-mono text-[11px] text-indigo-600">&#123;ins_id&#125;_DUE_TODAY</td>
                      <td className="p-2.5 text-slate-500">Balance &gt; 0, unpaid</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-medium">1 Day Overdue</td>
                      <td className="p-2.5 text-slate-500">Due date + 1 day</td>
                      <td className="p-2.5 font-mono text-[11px] text-indigo-600">&#123;ins_id&#125;_OVERDUE_1D</td>
                      <td className="p-2.5 text-slate-500">Overdue alert + late policy</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-medium">Weekly Overdue Follow-ups</td>
                      <td className="p-2.5 text-slate-500">Every 7 days (+8d, +15d, +22d, +29d)</td>
                      <td className="p-2.5 font-mono text-[11px] text-indigo-600">&#123;ins_id&#125;_OVERDUE_&#123;N&#125;D</td>
                      <td className="p-2.5 text-slate-500">Subject to max 4 limit</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Card>

            <Card className="p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-semibold text-slate-900">Payment Matching Engine</h2>
                  <span className="text-[10px] font-mono bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold">
                    HMAC-SHA256
                  </span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Every incoming transaction is verified server-side. Valid matched payments atomically update the fee ledger, generate tax receipts, and auto-cancel pending reminders.
                </p>

                <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-amber-900">Unmatched Queue</span>
                    <span className="font-extrabold text-amber-900 text-sm">{unmatchedPayments.length}</span>
                  </div>
                  <p className="text-[11px] text-amber-700 mt-1">
                    Direct bank transfers or unreferenced transactions safely held without marking any student paid.
                  </p>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100">
                <button
                  onClick={() => setActiveTab('unmatched')}
                  className="w-full flex items-center justify-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 py-1.5 rounded-lg border border-indigo-200 hover:bg-indigo-50 transition-colors"
                >
                  Open Reconciliation Queue <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* TAB 2: REMINDER SCHEDULES QUEUE */}
      {activeTab === 'reminders' && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Scheduled, Sent & Suppressed Reminders</h2>
              <p className="text-xs text-slate-500">Live reminder ledger with language preferences and event-key suppression</p>
            </div>
            <span className="text-xs text-slate-400">{reminders.length} items logged</span>
          </div>

          {reminders.length === 0 ? (
            <EmptyState
              icon={<Clock className="w-8 h-8" />}
              title="No reminders scheduled"
              description="Click 'Run Reminders Now' above to generate due reminders from active instalments."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-100">
                  <tr>
                    <th className="py-2.5 px-3">Student & Recipient</th>
                    <th className="py-2.5 px-3">Channel / Lang</th>
                    <th className="py-2.5 px-3">Due Date</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Message Content</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reminders.map(rem => (
                    <tr key={rem.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-2.5 px-3">
                        <p className="font-semibold text-slate-900">{rem.student_name}</p>
                        <p className="text-[11px] text-slate-500">{rem.parent_name} ({rem.parent_phone})</p>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="font-medium text-slate-800">{rem.channel}</span>
                        <span className="text-[10px] ml-1.5 px-1 rounded bg-slate-100 text-slate-600 uppercase font-mono">
                          {rem.lang || 'en'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 font-medium">
                        {formatDate(rem.due_date)}
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge status={rem.status} />
                      </td>
                      <td className="py-2.5 px-3 max-w-xs truncate text-slate-600" title={rem.message}>
                        "{rem.message}"
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {rem.status === 'Failed' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => api.resendReminder(rem.id).then(() => fetchOperationalQueues())}
                            className="text-[11px] py-1 px-2"
                          >
                            Retry
                          </Button>
                        )}
                        {rem.status === 'Scheduled' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => api.sendReminder(rem.id).then(() => fetchOperationalQueues())}
                            className="text-[11px] py-1 px-2 text-indigo-600"
                          >
                            Send Now
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* TAB 3: UNMATCHED PAYMENTS QUEUE */}
      {activeTab === 'unmatched' && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Unmatched Payments Reconciliation Queue</h2>
              <p className="text-xs text-slate-500">Payments received without a clear student reference. Held securely pending accounts match.</p>
            </div>
            <span className="text-xs text-amber-700 font-semibold">{unmatchedPayments.length} pending</span>
          </div>

          {unmatchedPayments.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
              All bank transactions are matched and reconciled to student accounts.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-100">
                  <tr>
                    <th className="py-2.5 px-3">Reference / UTR</th>
                    <th className="py-2.5 px-3 text-right">Amount</th>
                    <th className="py-2.5 px-3">Method</th>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Bank Notes</th>
                    <th className="py-2.5 px-3 text-center">Reconciliation Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {unmatchedPayments.map(p => (
                    <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-3 font-mono font-bold text-slate-900">{p.reference_no || p.transaction_id}</td>
                      <td className="py-3 px-3 text-right font-bold text-slate-900">{formatCurrency(p.amount)}</td>
                      <td className="py-3 px-3 text-slate-600 font-medium">{p.method}</td>
                      <td className="py-3 px-3 text-slate-600">{formatDate(p.payment_date)}</td>
                      <td className="py-3 px-3"><Badge status={p.status} /></td>
                      <td className="py-3 px-3 text-slate-500 max-w-xs truncate">{p.notes || '—'}</td>
                      <td className="py-3 px-3 text-center">
                        <Button
                          size="sm"
                          onClick={() => {
                            setSelectedPayment(p);
                            setMatchingStudentId(students[0]?.id || '');
                          }}
                          className="text-[11px] py-1 px-3"
                        >
                          Match to Student
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* TAB 4: PENDING REFUNDS APPROVAL */}
      {activeTab === 'refunds' && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Pending Refund Approvals Queue</h2>
              <p className="text-xs text-slate-500">Pro-rata statutory calculations awaiting accounts executive review and audit justification.</p>
            </div>
            <span className="text-xs text-slate-400">{refundRequests.length} total</span>
          </div>

          {refundRequests.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              No refund requests submitted.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-100">
                  <tr>
                    <th className="py-2.5 px-3">Student</th>
                    <th className="py-2.5 px-3">Withdrawal Date</th>
                    <th className="py-2.5 px-3 text-right">Paid</th>
                    <th className="py-2.5 px-3 text-right">Pro-Rata Due</th>
                    <th className="py-2.5 px-3 text-right">Est. Refund</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {refundRequests.map(r => (
                    <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-3">
                        <p className="font-semibold text-slate-900">{r.student_name}</p>
                        <p className="text-[11px] text-slate-400">{r.student_id} · {r.centre_name}</p>
                      </td>
                      <td className="py-3 px-3 text-slate-600">{formatDate(r.withdrawal_date)}</td>
                      <td className="py-3 px-3 text-right font-medium text-slate-800">{formatCurrency(r.amount_paid)}</td>
                      <td className="py-3 px-3 text-right text-slate-600">{formatCurrency(r.pro_rata_amount)}</td>
                      <td className="py-3 px-3 text-right font-bold text-indigo-700">{formatCurrency(r.estimated_refund)}</td>
                      <td className="py-3 px-3"><Badge status={r.status} /></td>
                      <td className="py-3 px-3 text-center">
                        {r.status === 'Submitted' || r.status === 'Pending Review' ? (
                          <Button
                            size="sm"
                            onClick={() => {
                              setSelectedRefund(r);
                              setRefundAmount(r.estimated_refund);
                              setRefundReason('Approved as per UGC 2024 pro-rata refund schedule');
                            }}
                            className="text-[11px] py-1 px-3"
                          >
                            Review & Decide
                          </Button>
                        ) : (
                          <span className="text-xs text-slate-400 font-medium">Decided ({r.approved_by || 'Staff'})</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* TAB 5: AI RETENTION & COUNSELLOR TASKS */}
      {activeTab === 'risk_tasks' && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">AI Dropout Risk & Counsellor Task Queue</h2>
              <p className="text-xs text-slate-500">Students flagged by automated academic attendance, score trends and fee overdue signals.</p>
            </div>
            <span className="text-xs text-slate-400">{riskTasks.length} tasks</span>
          </div>

          {riskTasks.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              No students flagged for counsellor intervention.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-100">
                  <tr>
                    <th className="py-2.5 px-3">Student</th>
                    <th className="py-2.5 px-3">Risk Level</th>
                    <th className="py-2.5 px-3">Risk Factors / Evidence</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Assigned Counsellor</th>
                    <th className="py-2.5 px-3 text-center">Intervention Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {riskTasks.map(t => (
                    <tr key={t.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-3">
                        <p className="font-semibold text-slate-900">{t.student_name}</p>
                        <p className="text-[11px] text-slate-500">{t.student_id} · {t.course}</p>
                      </td>
                      <td className="py-3 px-3"><Badge status={t.risk_level} /></td>
                      <td className="py-3 px-3 max-w-sm">
                        <div className="space-y-1 text-[11px]">
                          {Array.isArray(t.factors) ? (
                            t.factors.map((f: string, i: number) => (
                              <span key={i} className="inline-block bg-slate-100 px-1.5 py-0.5 rounded mr-1 text-slate-700">
                                {f}
                              </span>
                            ))
                          ) : (
                            <span className="text-slate-500">Overdue fees & low attendance detected</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3"><Badge status={t.status} /></td>
                      <td className="py-3 px-3 text-slate-700 font-medium">
                        {t.assigned_to || <span className="text-slate-400 italic">Unassigned</span>}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedRiskTask(t)}
                            className="text-[11px] py-1 px-2.5"
                          >
                            Assign
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setSelectedRiskTask(t);
                              setIsDismissModalOpen(true);
                            }}
                            className="text-[11px] py-1 px-2 text-rose-600 hover:bg-rose-50"
                          >
                            Dismiss
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* TAB 6: SYSTEM LOGS */}
      {activeTab === 'logs' && (
        <Card className="overflow-hidden">
          <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Recent Automation Execution History</h2>
              <p className="text-xs text-slate-400">Persisted in database with duration and item telemetry</p>
            </div>
            <span className="text-xs text-slate-500 font-medium">{status?.recent_logs?.length || 0} Runs Logged</span>
          </div>

          {(!status?.recent_logs || (status.recent_logs?.length ?? 0) === 0) ? (
            <EmptyState
              icon={<Cpu className="w-8 h-8" />}
              title="No automation runs logged yet"
              description="Background daemon runs will appear here automatically every 5 minutes."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-100 font-semibold">
                  <tr>
                    <th className="p-3">Job Name</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Items Processed</th>
                    <th className="p-3">Details</th>
                    <th className="p-3">Latency</th>
                    <th className="p-3 text-right">Executed At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {(status?.recent_logs || []).map(log => (
                    <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="p-3 font-semibold text-slate-900">
                        <span className="font-mono text-[11px] bg-slate-100 px-1.5 py-0.5 rounded">
                          {log.job_name}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          log.status === 'SUCCESS' ? 'bg-emerald-100 text-emerald-800' :
                          log.status === 'PARTIAL_FAILURE' ? 'bg-amber-100 text-amber-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {log.status}
                        </span>
                      </td>
                      <td className="p-3 font-bold text-slate-800 tabular-nums">
                        {log.items_processed}
                      </td>
                      <td className="p-3 text-slate-500 max-w-xs truncate" title={log.details}>
                        {log.details || '—'}
                      </td>
                      <td className="p-3 font-mono text-[11px] text-slate-500">
                        {log.duration_ms} ms
                      </td>
                      <td className="p-3 text-right text-slate-500">
                        {log.executed_at ? formatDate(log.executed_at) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* MODAL: MATCH PAYMENT */}
      <Modal
        open={!!selectedPayment}
        onClose={() => setSelectedPayment(null)}
        title="Reconcile & Match Unmatched Payment"
      >
        {selectedPayment && (
          <div className="p-5 space-y-4">
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs space-y-1">
              <p><span className="text-slate-500 font-medium">Txn Reference:</span> <span className="font-mono font-bold text-slate-900">{selectedPayment.reference_no || selectedPayment.transaction_id}</span></p>
              <p><span className="text-slate-500 font-medium">Amount Received:</span> <span className="font-bold text-emerald-700">{formatCurrency(selectedPayment.amount)}</span></p>
              <p><span className="text-slate-500 font-medium">Bank / Method:</span> {selectedPayment.method} ({formatDate(selectedPayment.payment_date)})</p>
              {selectedPayment.notes && <p><span className="text-slate-500 font-medium">Bank Note:</span> {selectedPayment.notes}</p>}
            </div>

            <Select
              label="Select Student to Reconcile to"
              value={matchingStudentId}
              onChange={e => setMatchingStudentId(e.target.value)}
              options={studentOptions}
            />

            <p className="text-[11px] text-slate-500">
              Matching this payment updates the student's fee ledger atomically, creates an official GST tax invoice, and cancels pending reminders for satisfied instalments.
            </p>

            <div className="flex justify-end gap-3 pt-3 border-t">
              <Button variant="outline" onClick={() => setSelectedPayment(null)} disabled={submittingAction}>
                Cancel
              </Button>
              <Button onClick={handleMatchPayment} disabled={submittingAction || !matchingStudentId}>
                {submittingAction ? 'Matching…' : 'Match & Post to Ledger'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL: REFUND APPROVAL */}
      <Modal
        open={!!selectedRefund}
        onClose={() => setSelectedRefund(null)}
        title="Review & Decide Refund Request"
        size="lg"
      >
        {selectedRefund && (
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3 rounded-lg border border-slate-200">
              <div>
                <p className="font-bold text-slate-900">{selectedRefund.student_name}</p>
                <p className="text-slate-500">{selectedRefund.student_id} · {selectedRefund.centre_name}</p>
                <p className="mt-1"><span className="text-slate-500">Withdrawal Reason:</span> {selectedRefund.withdrawal_reason}</p>
              </div>
              <div className="space-y-0.5">
                <p><span className="text-slate-500">Amount Paid:</span> <span className="font-semibold">{formatCurrency(selectedRefund.amount_paid)}</span></p>
                <p><span className="text-slate-500">Pro-rata Value:</span> <span className="font-semibold">{formatCurrency(selectedRefund.pro_rata_amount)}</span></p>
                <p><span className="text-slate-500">Deductions (Processing + Material):</span> <span className="text-rose-600">- {formatCurrency(selectedRefund.processing_fee + selectedRefund.material_fee)}</span></p>
                <p className="font-bold text-indigo-700 text-sm mt-1">
                  Est. Net Refund: {formatCurrency(selectedRefund.estimated_refund)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                <input
                  type="radio"
                  name="refund_action"
                  checked={refundDecision === 'approve'}
                  onChange={() => setRefundDecision('approve')}
                />
                Approve Refund
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                <input
                  type="radio"
                  name="refund_action"
                  checked={refundDecision === 'reject'}
                  onChange={() => setRefundDecision('reject')}
                />
                Reject Request
              </label>
            </div>

            {refundDecision === 'approve' && (
              <Input
                label="Approved Refund Amount (₹)"
                type="number"
                value={refundAmount}
                onChange={e => setRefundAmount(parseFloat(e.target.value) || 0)}
                required
              />
            )}

            <Input
              label="Decision Reason & Policy Compliance Note"
              value={refundReason}
              onChange={e => setRefundReason(e.target.value)}
              placeholder="e.g. Approved strictly according to UGC-REG-2024-V2 pro-rata guidelines"
              required
            />

            <div className="flex justify-end gap-3 pt-3 border-t">
              <Button variant="outline" onClick={() => setSelectedRefund(null)} disabled={submittingAction}>
                Cancel
              </Button>
              <Button
                variant={refundDecision === 'approve' ? 'primary' : 'danger'}
                onClick={handleRefundDecision}
                disabled={submittingAction || !refundReason}
              >
                {submittingAction ? 'Processing…' : refundDecision === 'approve' ? 'Approve Refund' : 'Reject Request'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL: ASSIGN COUNSELLOR */}
      <Modal
        open={!!selectedRiskTask && !isDismissModalOpen}
        onClose={() => setSelectedRiskTask(null)}
        title="Assign Retention Counsellor"
      >
        {selectedRiskTask && (
          <div className="p-5 space-y-4">
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
              <p className="font-bold text-slate-900">{selectedRiskTask.student_name}</p>
              <p className="text-slate-500">{selectedRiskTask.student_id} · Risk Level: {selectedRiskTask.risk_level}</p>
            </div>

            <Select
              label="Assign to Counsellor"
              value={counsellorName}
              onChange={e => setCounsellorName(e.target.value)}
              options={[
                { value: 'Pooja Sharma (Senior Academic Counsellor)', label: 'Pooja Sharma (Senior Academic Counsellor)' },
                { value: 'Rajesh Meena (Student Welfare Executive)', label: 'Rajesh Meena (Student Welfare Executive)' },
                { value: 'Dr. Vivek Soni (Centre Head & Mentor)', label: 'Dr. Vivek Soni (Centre Head & Mentor)' },
              ]}
            />

            <div className="flex justify-end gap-3 pt-3 border-t">
              <Button variant="outline" onClick={() => setSelectedRiskTask(null)} disabled={submittingAction}>
                Cancel
              </Button>
              <Button onClick={handleAssignCounsellor} disabled={submittingAction}>
                {submittingAction ? 'Assigning…' : 'Confirm Assignment'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL: DISMISS RISK TASK */}
      <Modal
        open={!!selectedRiskTask && isDismissModalOpen}
        onClose={() => {
          setSelectedRiskTask(null);
          setIsDismissModalOpen(false);
        }}
        title="Dismiss as False Positive"
      >
        {selectedRiskTask && (
          <div className="p-5 space-y-4">
            <p className="text-xs text-slate-600">
              Please document the legitimate reason why student <span className="font-bold">{selectedRiskTask.student_name}</span> is not at risk of dropout or non-payment.
            </p>

            <Input
              label="Justification Reason"
              value={dismissReason}
              onChange={e => setDismissReason(e.target.value)}
              placeholder="e.g. Student took approved medical leave for 10 days; parent committed payment next week"
              required
            />

            <div className="flex justify-end gap-3 pt-3 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedRiskTask(null);
                  setIsDismissModalOpen(false);
                }}
                disabled={submittingAction}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleDismissRiskTask}
                disabled={submittingAction || !dismissReason}
              >
                {submittingAction ? 'Dismissing…' : 'Dismiss Task'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

