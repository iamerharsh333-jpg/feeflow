import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { formatCurrency, formatDate } from '../utils/helpers';
import { StatCard, Card, Button } from '../components/ui';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { api } from '../utils/api';
import {
  Users, TrendingUp, AlertTriangle, Clock, CheckCircle, ArrowRight,
  RefreshCw, AlertCircle, ShieldCheck, UserPlus, CreditCard, Bell,
  FileText, Calculator, ChevronRight, Calendar, ArrowUpRight
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

const CustomChartTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-[#E3E6E9] rounded-xl shadow-lg p-3 text-xs z-50">
        <p className="font-bold text-[#20283A] mb-1.5">{label}</p>
        <div className="space-y-1">
          {payload.map((entry: any, index: number) => (
            <div key={`item-${index}`} className="flex items-center justify-between gap-4 text-[#718096]">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
                <span>{entry.name}:</span>
              </span>
              <span className="font-bold text-[#20283A] tabular-nums">
                {formatCurrency(entry.value)}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

interface DashboardSummaryData {
  total_students: number;
  total_fee: number;
  fees_collected: number;
  outstanding_fees: number;
  overdue_fees: number;
  collection_rate: number;
  overdue_students_count: number;
  unmatched_payments_count: number;
}

interface MonthlyData {
  month: string;
  collected: number;
  target: number;
}

interface CentreWiseData {
  centre_id: number;
  centre: string;
  students: number;
  collected: number;
  outstanding: number;
  overdue: number;
  collection_rate: number;
}

interface AgeingData {
  bucket: string;
  amount: number;
  count: number;
}

interface BatchWiseData {
  course: string;
  batch: string;
  label: string;
  students: number;
  collected: number;
  outstanding: number;
  overdue: number;
}

const CENTRE_MAP: Record<string, number> = {
  'Jaipur Main': 1,
  'Jaipur West': 2,
  'Kota': 3,
  'Ajmer': 4,
};

export default function Overview() {
  const navigate = useNavigate();
  const { students, payments, selectedCentre, backendConnected } = useApp();
  const { user } = useAuth();

  const [summary, setSummary] = useState<DashboardSummaryData | null>(null);
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [centreData, setCentreData] = useState<CentreWiseData[]>([]);
  const [ageingData, setAgeingData] = useState<AgeingData[]>([]);
  const [batchData, setBatchData] = useState<BatchWiseData[]>([]);
  const [deadlinesSummary, setDeadlinesSummary] = useState<any>(null);
  const [pendingRefundCount, setPendingRefundCount] = useState<number>(0);
  const [pendingRiskCount, setPendingRiskCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchLiveDashboard = useCallback(async () => {
    setLoading(true);
    setFetchError(null);

    const cid = selectedCentre !== 'All Centres' ? CENTRE_MAP[selectedCentre] : undefined;

    try {
      const [sumRes, monthRes, centreRes, ageRes, batchRes, refundRes, taskRes, deadRes] = await Promise.all([
        api.getDashboardSummary(cid),
        api.getDashboardMonthly(cid),
        api.getDashboardCentreWise(),
        api.getDashboardAgeing(cid),
        api.getDashboardBatchWise(cid),
        api.getRefundRequests().catch(() => []),
        api.getCounsellorTasks({ status: 'Pending' }).catch(() => []),
        api.getDeadlinesSummary(cid).catch(() => null),
      ]);

      setSummary(sumRes);
      setMonthlyData(monthRes || []);
      setCentreData(centreRes || []);
      setAgeingData(ageRes || []);
      setBatchData(batchRes || []);
      setDeadlinesSummary(deadRes);

      const pendingRefunds = Array.isArray(refundRes)
        ? refundRes.filter((r: any) => r.status === 'Submitted').length
        : 0;
      setPendingRefundCount(pendingRefunds);

      const highRiskTasks = Array.isArray(taskRes)
        ? taskRes.filter((t: any) => t.status === 'Pending' && t.risk_level === 'High').length
        : 0;
      setPendingRiskCount(highRiskTasks);
    } catch (err: any) {
      setFetchError(err.message || 'Failed to fetch live dashboard aggregations');
    } finally {
      setLoading(false);
    }
  }, [selectedCentre]);

  useEffect(() => {
    fetchLiveDashboard();
  }, [fetchLiveDashboard]);

  // Fallback calculation from local state if offline or initial load
  const filteredStudents = selectedCentre === 'All Centres'
    ? students
    : students.filter(s => s.centre === selectedCentre);

  const fallbackTotalCollected = filteredStudents.reduce((a, s) => a + s.amountPaid, 0);
  const fallbackTotalOutstanding = filteredStudents.reduce((a, s) => a + s.outstanding, 0);
  const fallbackOverdueStudents = filteredStudents.filter(s => s.feeStatus === 'Overdue');
  const fallbackTotalOverdue = fallbackOverdueStudents.reduce((a, s) => a + s.outstanding, 0);
  const fallbackCollectionRate = fallbackTotalCollected + fallbackTotalOutstanding > 0
    ? Number(((fallbackTotalCollected / (fallbackTotalCollected + fallbackTotalOutstanding)) * 100).toFixed(1))
    : 0.0;

  const displaySummary: DashboardSummaryData = summary || {
    total_students: filteredStudents.length,
    total_fee: fallbackTotalCollected + fallbackTotalOutstanding,
    fees_collected: fallbackTotalCollected,
    outstanding_fees: fallbackTotalOutstanding,
    overdue_fees: fallbackTotalOverdue,
    collection_rate: fallbackCollectionRate,
    overdue_students_count: fallbackOverdueStudents.length,
    unmatched_payments_count: payments.filter(p => p.status === 'Unmatched' || p.status === 'Under Review').length,
  };

  const recentPayments = [...payments]
    .filter(p => p.status === 'Success')
    .sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime())
    .slice(0, 5);

  const attentionStudents = filteredStudents
    .filter(s => s.feeStatus === 'Overdue' || s.feeStatus === 'Partially Paid')
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Top Bar: Centre Context & Mode Pill */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-[#E3E6E9] rounded-2xl px-5 py-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-[#1B7043] animate-pulse" />
          <div>
            <h1 className="text-sm font-bold text-[#20283A] leading-tight">Accounts Executive Workspace</h1>
            <p className="text-[11px] text-[#718096] leading-tight mt-0.5">
              Reconciled ledger metrics · {selectedCentre} {backendConnected ? '(Live Database)' : '(Demo Mode)'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/deadlines"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#20283A] bg-[#EEF0F1] hover:bg-[#E3E6E9] px-3 py-1.5 rounded-xl transition-colors"
          >
            <Calendar className="w-3.5 h-3.5 text-[#E95435]" />
            <span>Deadlines</span>
          </Link>

          <Button
            size="sm"
            variant="outline"
            onClick={fetchLiveDashboard}
            disabled={loading}
            className="text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#E95435]' : 'text-[#718096]'}`} />
            <span>Sync</span>
          </Button>
        </div>
      </div>

      {/* Operational Attention Queues */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {displaySummary.unmatched_payments_count > 0 ? (
          <Link
            to="/payments?status=Unmatched"
            className="flex items-center justify-between p-4 rounded-2xl bg-[#FDF1ED] border border-[#F8D2C8] hover:bg-[#FBE7E1] transition-all group"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-2 h-2 rounded-full bg-[#E95435] flex-shrink-0" />
              <div className="truncate">
                <p className="text-xs font-bold text-[#20283A] truncate">
                  {displaySummary.unmatched_payments_count} Unmatched Payment{displaySummary.unmatched_payments_count > 1 ? 's' : ''}
                </p>
                <p className="text-[11px] text-[#718096] truncate mt-0.5">Requires accounts reconciliation</p>
              </div>
            </div>
            <span className="text-xs font-semibold text-[#E95435] group-hover:translate-x-0.5 transition-transform flex items-center gap-1 flex-shrink-0">
              Match <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </Link>
        ) : (
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-white border border-[#E3E6E9] text-[#718096] text-xs">
            <CheckCircle className="w-4 h-4 text-[#1B7043] flex-shrink-0" />
            <span className="font-medium text-[#20283A]">All bank payments reconciled</span>
          </div>
        )}

        {pendingRefundCount > 0 ? (
          <Link
            to="/refund-calculator"
            className="flex items-center justify-between p-4 rounded-2xl bg-[#FDF2F2] border border-[#F9CACA] hover:bg-[#FBE8E8] transition-all group"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-2 h-2 rounded-full bg-[#BA2525] flex-shrink-0" />
              <div className="truncate">
                <p className="text-xs font-bold text-[#20283A] truncate">
                  {pendingRefundCount} Pending Refund{pendingRefundCount > 1 ? 's' : ''}
                </p>
                <p className="text-[11px] text-[#718096] truncate mt-0.5">10-day statutory window</p>
              </div>
            </div>
            <span className="text-xs font-semibold text-[#BA2525] group-hover:translate-x-0.5 transition-transform flex items-center gap-1 flex-shrink-0">
              Review <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </Link>
        ) : (
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-white border border-[#E3E6E9] text-[#718096] text-xs">
            <CheckCircle className="w-4 h-4 text-[#1B7043] flex-shrink-0" />
            <span className="font-medium text-[#20283A]">No pending refund claims</span>
          </div>
        )}

        {pendingRiskCount > 0 ? (
          <Link
            to="/risk-counselling"
            className="flex items-center justify-between p-4 rounded-2xl bg-[#EEF5FB] border border-[#D4E6F4] hover:bg-[#E3EFF9] transition-all group"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-2 h-2 rounded-full bg-[#36688F] flex-shrink-0" />
              <div className="truncate">
                <p className="text-xs font-bold text-[#20283A] truncate">
                  {pendingRiskCount} High-Risk Follow-up{pendingRiskCount > 1 ? 's' : ''}
                </p>
                <p className="text-[11px] text-[#718096] truncate mt-0.5">Academic & fee retention alerts</p>
              </div>
            </div>
            <span className="text-xs font-semibold text-[#36688F] group-hover:translate-x-0.5 transition-transform flex items-center gap-1 flex-shrink-0">
              Assign <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </Link>
        ) : (
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-white border border-[#E3E6E9] text-[#718096] text-xs">
            <CheckCircle className="w-4 h-4 text-[#1B7043] flex-shrink-0" />
            <span className="font-medium text-[#20283A]">Retention queue healthy</span>
          </div>
        )}
      </div>

      {fetchError && (
        <div className="bg-[#FDF2F2] border border-[#F9CACA] rounded-2xl p-4 flex items-center justify-between text-xs text-[#BA2525]">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-[#BA2525]" />
            <span>{fetchError}</span>
          </div>
          <Button size="sm" variant="outline" onClick={fetchLiveDashboard}>
            Retry
          </Button>
        </div>
      )}

      {/* Core Executive KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <StatCard
          label="Fees Collected"
          value={formatCurrency(displaySummary.fees_collected)}
          sub="Verified ledger receipts"
          icon={<CheckCircle className="w-4.5 h-4.5" />}
          accent="green"
          onClick={() => navigate('/payments')}
        />
        <StatCard
          label="Outstanding Dues"
          value={formatCurrency(displaySummary.outstanding_fees)}
          sub={`Total Course Fee: ${formatCurrency(displaySummary.total_fee || displaySummary.fees_collected + displaySummary.outstanding_fees)}`}
          icon={<Clock className="w-4.5 h-4.5" />}
          accent="blue"
          onClick={() => navigate('/fee-ledger')}
        />
        <StatCard
          label="Due Today"
          value={deadlinesSummary ? String(deadlinesSummary.due_today_count) : '0'}
          sub={deadlinesSummary ? `${formatCurrency(deadlinesSummary.total_upcoming_amount)} active upcoming` : 'Milestone 0d'}
          icon={<Calendar className="w-4.5 h-4.5" />}
          accent="orange"
          onClick={() => navigate('/deadlines?category=due_today')}
        />
        <StatCard
          label="Overdue Amount"
          value={formatCurrency(displaySummary.overdue_fees)}
          sub={`${displaySummary.overdue_students_count} students past deadline`}
          icon={<AlertTriangle className="w-4.5 h-4.5" />}
          accent="red"
          onClick={() => navigate('/deadlines?category=overdue')}
        />
        <StatCard
          label="Recovery Rate"
          value={`${displaySummary.collection_rate.toFixed(1)}%`}
          sub="Collected vs Target"
          icon={<TrendingUp className="w-4.5 h-4.5" />}
          accent="default"
          onClick={() => navigate('/reports')}
        />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Monthly Collection Trend */}
        <Card className="p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-[#20283A]">Collection Overview & Trajectory</h2>
              <p className="text-[11px] text-[#718096] mt-0.5">Monthly transaction aggregate vs scheduled instalment targets</p>
            </div>
            <Link to="/reports" className="text-xs font-semibold text-[#E95435] hover:text-[#D84527] flex items-center gap-1">
              Ledger report <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {monthlyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={230}>
              <LineChart data={monthlyData} margin={{ left: -10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F1" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#718096' }} axisLine={{ stroke: '#E3E6E9' }} />
                <YAxis tickFormatter={v => `${(v / 100000).toFixed(1)}L`} tick={{ fontSize: 11, fill: '#718096' }} axisLine={{ stroke: '#E3E6E9' }} />
                <Tooltip content={<CustomChartTooltip />} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Line
                  type="monotone"
                  dataKey="collected"
                  name="Collected"
                  stroke="#79A9D1"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: '#79A9D1' }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="target"
                  name="Target Due"
                  stroke="#20283A"
                  strokeWidth={2}
                  strokeDasharray="4 3"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-44 flex items-center justify-center text-xs text-[#718096]">
              No collection data for selected period
            </div>
          )}
        </Card>

        {/* Overdue Ageing Buckets */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-[#20283A]">Ageing Breakdown</h2>
              <p className="text-[11px] text-[#718096] mt-0.5">Overdue instalments by latency</p>
            </div>
            <Link to="/deadlines?category=overdue" className="text-xs font-semibold text-[#BA2525] hover:underline">
              Inspect
            </Link>
          </div>

          <div className="space-y-3.5">
            {ageingData.map((b) => {
              const totalAgeing = ageingData.reduce((a, x) => a + x.amount, 0);
              const pct = totalAgeing > 0 ? Math.round((b.amount / totalAgeing) * 100) : 0;
              const barColor = b.bucket === 'Not Due'
                ? 'bg-[#1B7043]'
                : b.bucket === '1–30 days'
                ? 'bg-[#E95435]'
                : b.bucket === '31–60 days'
                ? 'bg-[#BA2525]'
                : 'bg-[#718096]';

              return (
                <div key={b.bucket}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-[#20283A] font-semibold">{b.bucket}</span>
                    <span className="text-[#20283A] font-bold tabular-nums">{formatCurrency(b.amount)}</span>
                  </div>
                  <div className="h-2 bg-[#EEF0F1] rounded-full overflow-hidden">
                    <div className={`h-full ${barColor} rounded-full transition-all duration-300`} style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-[10px] text-[#718096] mt-0.5 font-medium">{b.count} instalment{b.count !== 1 ? 's' : ''} ({pct}%)</p>
                </div>
              );
            })}
          </div>

          <div className="mt-5 pt-3.5 border-t border-[#E3E6E9] flex justify-between text-xs">
            <span className="text-[#718096] font-medium">Total Ageing Pipeline</span>
            <span className="text-[#BA2525] font-bold tabular-nums">
              {formatCurrency(ageingData.reduce((a, b) => a + b.amount, 0))}
            </span>
          </div>
        </Card>
      </div>

      {/* Centre-wise Performance Comparison */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold text-[#20283A]">Centre-wise Collection Comparison</h2>
            <p className="text-[11px] text-[#718096] mt-0.5">Branch performance and recovery balance across 4 centres</p>
          </div>
          <span className="text-[11px] font-semibold text-[#718096] bg-[#EEF0F1] px-2.5 py-1 rounded-lg">
            4 Branches Active
          </span>
        </div>

        {centreData.length > 0 ? (
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={centreData} margin={{ left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F1" />
              <XAxis dataKey="centre" tick={{ fontSize: 11, fill: '#718096' }} axisLine={{ stroke: '#E3E6E9' }} />
              <YAxis tickFormatter={v => `${(v / 100000).toFixed(1)}L`} tick={{ fontSize: 11, fill: '#718096' }} axisLine={{ stroke: '#E3E6E9' }} />
              <Tooltip content={<CustomChartTooltip />} />
              <Legend iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
              <Bar dataKey="collected" name="Collected" fill="#79A9D1" radius={[4, 4, 0, 0]} />
              <Bar dataKey="outstanding" name="Outstanding" fill="#20283A" radius={[4, 4, 0, 0]} />
              <Bar dataKey="overdue" name="Overdue" fill="#E95435" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-32 flex items-center justify-center text-xs text-[#718096]">
            No centre data available
          </div>
        )}
      </Card>

      {/* Batch Performance & Collection Bottlenecks */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold text-[#20283A]">Batch & Cohort Recovery</h2>
            <p className="text-[11px] text-[#718096] mt-0.5">Identifies batches with payment bottlenecks</p>
          </div>
          <span className="text-[11px] text-[#718096] font-medium">{batchData.length} cohorts active</span>
        </div>

        {batchData.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-[#FAFAFA] text-[#718096] border-b border-[#E3E6E9] uppercase font-semibold text-[10px] tracking-wider">
                <tr>
                  <th className="py-2.5 px-3.5">Course & Batch</th>
                  <th className="py-2.5 px-3.5 text-center">Enrolled</th>
                  <th className="py-2.5 px-3.5 text-right">Collected</th>
                  <th className="py-2.5 px-3.5 text-right">Outstanding</th>
                  <th className="py-2.5 px-3.5 text-right">Overdue</th>
                  <th className="py-2.5 px-3.5 text-right">Recovery</th>
                  <th className="py-2.5 px-3.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E3E6E9]">
                {batchData.map((b) => {
                  const total = b.collected + b.outstanding;
                  const rate = total > 0 ? Math.round((b.collected / total) * 100) : 0;
                  const isProblematic = b.overdue > 0 || rate < 70;

                  return (
                    <tr key={b.label} className="hover:bg-[#F8FAFC] transition-colors">
                      <td className="py-3 px-3.5 font-medium text-[#20283A]">
                        <div className="flex items-center gap-2">
                          <span className="font-bold">{b.course}</span>
                          <span className="text-[#A0AEC0]">·</span>
                          <span className="text-[#718096]">{b.batch}</span>
                          {isProblematic && (
                            <span className="px-1.5 py-0.2 rounded-md text-[10px] font-bold bg-[#FDF1ED] text-[#E95435] border border-[#F8D2C8]">
                              Attention
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3.5 text-center text-[#20283A] font-semibold">{b.students}</td>
                      <td className="py-3 px-3.5 text-right font-bold text-[#1B7043]">{formatCurrency(b.collected)}</td>
                      <td className="py-3 px-3.5 text-right font-bold text-[#20283A]">{formatCurrency(b.outstanding)}</td>
                      <td className="py-3 px-3.5 text-right font-bold text-[#BA2525]">
                        {b.overdue > 0 ? formatCurrency(b.overdue) : <span className="text-[#718096] font-normal">₹0</span>}
                      </td>
                      <td className="py-3 px-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 bg-[#EEF0F1] rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${rate >= 75 ? 'bg-[#1B7043]' : rate >= 50 ? 'bg-[#E95435]' : 'bg-[#BA2525]'}`}
                              style={{ width: `${rate}%` }}
                            />
                          </div>
                          <span className="font-bold tabular-nums text-[#20283A]">{rate}%</span>
                        </div>
                      </td>
                      <td className="py-3 px-3.5 text-center">
                        <Link
                          to={`/students?course=${encodeURIComponent(b.course)}`}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#E95435] hover:text-[#D84527]"
                        >
                          Directory <ArrowRight className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="h-20 flex items-center justify-center text-xs text-[#718096]">
            No batch records available
          </div>
        )}
      </Card>

      {/* Recent Payments & Overdue Attention Rows */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Verified Payments */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-[#20283A]">Recent Verified Payments</h2>
              <p className="text-[11px] text-[#718096] mt-0.5">Posted and reconciled transactions</p>
            </div>
            <Link to="/payments" className="text-xs font-semibold text-[#E95435] hover:underline flex items-center gap-0.5">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="space-y-2.5">
            {recentPayments.map(p => (
              <Link
                key={p.id}
                to={`/fee-ledger?student_id=${p.studentId}`}
                className="flex items-center gap-3 p-3 rounded-xl bg-[#FAFAFA] border border-[#E3E6E9] hover:border-[#CCD1D7] hover:bg-white transition-all group"
              >
                <div className="w-8 h-8 bg-[#EBF7EE] rounded-lg flex items-center justify-center flex-shrink-0 text-[#1B7043]">
                  <CheckCircle className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-[#20283A] group-hover:text-[#E95435] transition-colors truncate">
                    {p.studentName}
                  </p>
                  <p className="text-[10px] text-[#718096]">{formatDate(p.paymentDate)} · {p.method}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className="text-xs font-bold text-[#1B7043] block tabular-nums">
                    {formatCurrency(p.amount)}
                  </span>
                  <span className="text-[10px] text-[#718096] group-hover:text-[#E95435]">Open ledger →</span>
                </div>
              </Link>
            ))}
            {recentPayments.length === 0 && (
              <p className="text-xs text-[#718096] text-center py-6">No recent payments recorded</p>
            )}
          </div>
        </Card>

        {/* Overdue Attention List */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-[#20283A]">Requires Immediate Follow-up</h2>
              <p className="text-[11px] text-[#718096] mt-0.5">Overdue instalments requiring staff contact</p>
            </div>
            <Link to="/deadlines?category=overdue" className="text-xs font-semibold text-[#BA2525] hover:underline flex items-center gap-0.5">
              Deadlines <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="space-y-2.5">
            {attentionStudents.map(s => (
              <Link
                key={s.id}
                to={`/fee-ledger?student_id=${s.id}`}
                className="flex items-center gap-3 p-3 rounded-xl bg-[#FAFAFA] border border-[#E3E6E9] hover:border-[#CCD1D7] hover:bg-white transition-all group"
              >
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${s.feeStatus === 'Overdue' ? 'bg-[#BA2525]' : 'bg-[#9A4C07]'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-[#20283A] group-hover:text-[#E95435] transition-colors truncate">
                    {s.name}
                  </p>
                  <p className="text-[10px] text-[#718096]">{s.course} · {s.centre}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={`text-xs font-bold tabular-nums ${s.feeStatus === 'Overdue' ? 'text-[#BA2525]' : 'text-[#9A4C07]'}`}>
                    {formatCurrency(s.outstanding)}
                  </p>
                  <p className="text-[10px] text-[#718096] group-hover:text-[#E95435]">Inspect ledger →</p>
                </div>
              </Link>
            ))}
            {attentionStudents.length === 0 && (
              <p className="text-xs text-[#718096] text-center py-6">All students are current on payments</p>
            )}
          </div>
        </Card>
      </div>

      {/* Quick Launchpad */}
      <Card className="p-6">
        <h2 className="text-sm font-bold text-[#20283A] mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {[
            { label: 'Add Student', to: '/students?action=add', icon: UserPlus, desc: 'Enrol student' },
            { label: 'Record Payment', to: '/payments?action=record', icon: CreditCard, desc: 'Post offline fee' },
            { label: 'Upcoming Deadlines', to: '/deadlines', icon: Calendar, desc: 'Milestone scan' },
            { label: 'View Overdue', to: '/deadlines?category=overdue', icon: AlertTriangle, desc: 'Past due date' },
            { label: 'Audit Reports', to: '/reports', icon: FileText, desc: 'Ledger export' },
            { label: 'Refund Calculator', to: '/refund-calculator', icon: Calculator, desc: 'Pro-rata refund' },
          ].map(a => {
            const Icon = a.icon;
            return (
              <Link
                key={a.label}
                to={a.to}
                className="group p-3.5 rounded-xl border border-[#E3E6E9] hover:border-[#CCD1D7] bg-white hover:bg-[#FAFAFA] transition-all flex flex-col justify-between"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="w-8 h-8 rounded-lg bg-[#EEF0F1] group-hover:bg-[#FDF1ED] flex items-center justify-center text-[#718096] group-hover:text-[#E95435] transition-colors">
                    <Icon className="w-4 h-4" />
                  </div>
                  <ArrowUpRight className="w-3.5 h-3.5 text-[#A0AEC0] group-hover:text-[#E95435] transition-colors" />
                </div>
                <div>
                  <p className="text-xs font-bold text-[#20283A] group-hover:text-[#E95435] transition-colors">{a.label}</p>
                  <p className="text-[10px] text-[#718096] mt-0.5">{a.desc}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
