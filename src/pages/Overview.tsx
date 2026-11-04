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
  FileText, Calculator, ChevronRight, Inbox, RefreshCcw, ExternalLink
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

const CustomChartTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs z-50">
        <p className="font-bold text-slate-900 mb-1.5">{label}</p>
        <div className="space-y-1">
          {payload.map((entry: any, index: number) => (
            <div key={`item-${index}`} className="flex items-center justify-between gap-4 text-slate-600">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
                <span>{entry.name}:</span>
              </span>
              <span className="font-bold text-slate-900 tabular-nums">
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

const currFmt = (v: number) => `₹${(v / 100000).toFixed(1)}L`;

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
  const [pendingRefundCount, setPendingRefundCount] = useState<number>(0);
  const [pendingRiskCount, setPendingRiskCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchLiveDashboard = useCallback(async () => {
    setLoading(true);
    setFetchError(null);

    const cid = selectedCentre !== 'All Centres' ? CENTRE_MAP[selectedCentre] : undefined;

    try {
      const [sumRes, monthRes, centreRes, ageRes, batchRes, refundRes, taskRes] = await Promise.all([
        api.getDashboardSummary(cid),
        api.getDashboardMonthly(cid),
        api.getDashboardCentreWise(),
        api.getDashboardAgeing(cid),
        api.getDashboardBatchWise(cid),
        api.getRefundRequests().catch(() => []),
        api.getCounsellorTasks({ status: 'Pending' }).catch(() => []),
      ]);

      setSummary(sumRes);
      setMonthlyData(monthRes || []);
      setCentreData(centreRes || []);
      setAgeingData(ageRes || []);
      setBatchData(batchRes || []);

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

  // Fallback calculation from local state if offline or during initial load
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
      {/* Live / Offline Banner */}
      <div className={`rounded-lg px-4 py-2.5 flex items-center justify-between gap-2 border text-xs ${
        backendConnected
          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
          : 'bg-amber-50 border-amber-200 text-amber-800'
      }`}>
        <div className="flex items-center gap-2">
          {backendConnected ? (
            <>
              <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span className="font-semibold">Live Backend Mode</span>
              <span className="text-emerald-700">· Real-time ledger queries reconciled directly with database</span>
            </>
          ) : (
            <>
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span className="font-semibold">Offline Demo Mode</span>
              <span className="text-amber-700">· Live backend unreachable. Using local demonstration records.</span>
            </>
          )}
        </div>
        <button
          onClick={fetchLiveDashboard}
          disabled={loading}
          className="flex items-center gap-1 font-medium hover:underline text-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Operational Attention Queue Banners */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {displaySummary.unmatched_payments_count > 0 ? (
          <Link
            to="/payments?status=Unmatched"
            className="flex items-center justify-between p-3.5 rounded-lg bg-amber-50/80 border border-amber-200/90 hover:bg-amber-100/70 transition-colors group"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse flex-shrink-0" />
              <div className="truncate">
                <p className="text-xs font-bold text-amber-950 truncate">
                  {displaySummary.unmatched_payments_count} Unmatched Payment{displaySummary.unmatched_payments_count > 1 ? 's' : ''}
                </p>
                <p className="text-[11px] text-amber-800 truncate">Requires reconciliation to ledger</p>
              </div>
            </div>
            <span className="text-xs font-semibold text-amber-900 group-hover:translate-x-0.5 transition-transform flex items-center gap-1 flex-shrink-0">
              Match <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </Link>
        ) : (
          <div className="flex items-center gap-2.5 p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-500 text-xs">
            <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
            <span>All bank payments reconciled</span>
          </div>
        )}

        {pendingRefundCount > 0 ? (
          <Link
            to="/refund-calculator"
            className="flex items-center justify-between p-3.5 rounded-lg bg-rose-50/80 border border-rose-200/90 hover:bg-rose-100/70 transition-colors group"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-2 h-2 rounded-full bg-rose-500 flex-shrink-0" />
              <div className="truncate">
                <p className="text-xs font-bold text-rose-950 truncate">
                  {pendingRefundCount} Pending Refund{pendingRefundCount > 1 ? 's' : ''}
                </p>
                <p className="text-[11px] text-rose-800 truncate">Pro-rata calculation awaiting approval</p>
              </div>
            </div>
            <span className="text-xs font-semibold text-rose-900 group-hover:translate-x-0.5 transition-transform flex items-center gap-1 flex-shrink-0">
              Review <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </Link>
        ) : (
          <div className="flex items-center gap-2.5 p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-500 text-xs">
            <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
            <span>No pending refund requests</span>
          </div>
        )}

        {pendingRiskCount > 0 ? (
          <Link
            to="/risk-counselling"
            className="flex items-center justify-between p-3.5 rounded-lg bg-indigo-50/80 border border-indigo-200/90 hover:bg-indigo-100/70 transition-colors group"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0" />
              <div className="truncate">
                <p className="text-xs font-bold text-indigo-950 truncate">
                  {pendingRiskCount} High-Risk Counsellor Task{pendingRiskCount > 1 ? 's' : ''}
                </p>
                <p className="text-[11px] text-indigo-800 truncate">Flagged by academic & fee risk model</p>
              </div>
            </div>
            <span className="text-xs font-semibold text-indigo-900 group-hover:translate-x-0.5 transition-transform flex items-center gap-1 flex-shrink-0">
              Assign <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </Link>
        ) : (
          <div className="flex items-center gap-2.5 p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-500 text-xs">
            <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
            <span>Counsellor intervention queue clear</span>
          </div>
        )}
      </div>

      {/* Error state alert if API request failed */}
      {fetchError && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 flex items-center justify-between text-xs text-red-700">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500" />
            <span>{fetchError}</span>
          </div>
          <Button size="sm" variant="outline" onClick={fetchLiveDashboard}>
            Retry
          </Button>
        </div>
      )}

      {/* Interactive Operational KPIs with Direct Drill-Down */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard
          label="Total Students"
          value={displaySummary.total_students.toLocaleString('en-IN')}
          sub={selectedCentre === 'All Centres' ? 'Click to inspect directory' : `${selectedCentre} · View directory`}
          icon={<Users className="w-5 h-5" />}
          accent="indigo"
          onClick={() => navigate('/students')}
        />
        <StatCard
          label="Fees Collected"
          value={formatCurrency(displaySummary.fees_collected)}
          sub="Click to view payment history"
          icon={<CheckCircle className="w-5 h-5" />}
          accent="green"
          onClick={() => navigate('/payments')}
        />
        <StatCard
          label="Outstanding"
          value={formatCurrency(displaySummary.outstanding_fees)}
          sub={`Total Fee: ${formatCurrency(displaySummary.total_fee || displaySummary.fees_collected + displaySummary.outstanding_fees)}`}
          icon={<Clock className="w-5 h-5" />}
          accent="amber"
          onClick={() => navigate('/fee-ledger')}
        />
        <StatCard
          label="Overdue"
          value={formatCurrency(displaySummary.overdue_fees)}
          sub={`${displaySummary.overdue_students_count} overdue students · Drill down`}
          icon={<AlertTriangle className="w-5 h-5" />}
          accent="red"
          onClick={() => navigate('/students?status=Overdue')}
        />
        <StatCard
          label="Collection Rate"
          value={`${displaySummary.collection_rate.toFixed(1)}%`}
          sub="Collected vs Effective Fee"
          icon={<TrendingUp className="w-5 h-5" />}
          accent="indigo"
          onClick={() => navigate('/reports')}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Monthly collection */}
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Monthly Fee Collection (₹ Lakh)</h2>
              <p className="text-[11px] text-slate-500">Live transaction aggregation vs academic instalment target</p>
            </div>
            <Link to="/reports" className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
              Ledger report <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {monthlyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={monthlyData} margin={{ left: -10, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={v => `${(v / 100000).toFixed(1)}L`} tick={{ fontSize: 11 }} />
                <Tooltip content={<CustomChartTooltip />} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="collected" name="Collected" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 3.5, fill: '#6366f1' }} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="target" name="Target (Due)" stroke="#cbd5e1" strokeWidth={2} strokeDasharray="4 2" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-44 flex items-center justify-center text-xs text-slate-400">
              No collection data for the selected period
            </div>
          )}
        </Card>

        {/* Ageing buckets */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Overdue Ageing</h2>
              <p className="text-[11px] text-slate-500">Instalments past due date</p>
            </div>
            <Link to="/students?status=Overdue" className="text-xs font-semibold text-rose-600 hover:text-rose-800">
              View overdue
            </Link>
          </div>
          <div className="space-y-3">
            {ageingData.map((b) => {
              const totalAgeing = ageingData.reduce((a, x) => a + x.amount, 0);
              const pct = totalAgeing > 0 ? Math.round((b.amount / totalAgeing) * 100) : 0;
              const barColor = b.bucket === 'Not Due'
                ? 'bg-emerald-500'
                : b.bucket === '1–30 days'
                ? 'bg-amber-400'
                : b.bucket === '31–60 days'
                ? 'bg-orange-500'
                : 'bg-red-600';

              return (
                <div key={b.bucket}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-600 font-medium">{b.bucket}</span>
                    <span className="text-slate-900 font-semibold">{formatCurrency(b.amount)}</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full ${barColor} rounded-full transition-all duration-300`} style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">{b.count} instalment{b.count !== 1 ? 's' : ''}</p>
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500 font-medium">Total Active Dues</span>
              <span className="text-red-600 font-semibold">
                {formatCurrency(ageingData.reduce((a, b) => a + b.amount, 0))}
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* Batch-wise Collection Breakdown Table */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Batch & Course Collection Performance</h2>
            <p className="text-[11px] text-slate-500">Answers which courses and cohorts have fee collection bottlenecks</p>
          </div>
          <span className="text-[11px] text-slate-400">{batchData.length} active batches</span>
        </div>
        {batchData.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 uppercase font-semibold text-[10px] tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">Course & Batch</th>
                  <th className="py-2.5 px-3 text-center">Enrolled</th>
                  <th className="py-2.5 px-3 text-right">Collected</th>
                  <th className="py-2.5 px-3 text-right">Outstanding</th>
                  <th className="py-2.5 px-3 text-right">Overdue</th>
                  <th className="py-2.5 px-3 text-right">Recovery Rate</th>
                  <th className="py-2.5 px-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {batchData.map((b) => {
                  const total = b.collected + b.outstanding;
                  const rate = total > 0 ? Math.round((b.collected / total) * 100) : 0;
                  const isProblematic = b.overdue > 0 || rate < 70;

                  return (
                    <tr key={b.label} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-3 font-medium text-slate-900">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold">{b.course}</span>
                          <span className="text-slate-400">·</span>
                          <span className="text-slate-600">{b.batch}</span>
                          {isProblematic && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              Bottleneck
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center text-slate-700 font-medium">{b.students}</td>
                      <td className="py-3 px-3 text-right font-semibold text-emerald-700">{formatCurrency(b.collected)}</td>
                      <td className="py-3 px-3 text-right font-semibold text-slate-800">{formatCurrency(b.outstanding)}</td>
                      <td className="py-3 px-3 text-right font-semibold text-rose-600">
                        {b.overdue > 0 ? formatCurrency(b.overdue) : <span className="text-slate-400">₹0</span>}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${rate >= 75 ? 'bg-emerald-500' : rate >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`}
                              style={{ width: `${rate}%` }}
                            />
                          </div>
                          <span className="font-bold tabular-nums text-slate-800">{rate}%</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <Link
                          to={`/students?course=${encodeURIComponent(b.course)}`}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800"
                        >
                          Students <ArrowRight className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="h-24 flex items-center justify-center text-xs text-slate-400">
            No batch performance records available
          </div>
        )}
      </Card>

      {/* Centre bar chart */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Centre-wise Collection (₹ Lakh)</h2>
            <p className="text-[11px] text-slate-500">Multi-centre performance comparison with role isolation</p>
          </div>
          <span className="text-[11px] text-slate-400">4 branches active</span>
        </div>
        {centreData.length > 0 ? (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={centreData} margin={{ left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="centre" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={v => `${(v / 100000).toFixed(1)}L`} tick={{ fontSize: 11 }} />
              <Tooltip content={<CustomChartTooltip />} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="collected" name="Collected" fill="#6366f1" radius={[3, 3, 0, 0]} />
              <Bar dataKey="outstanding" name="Outstanding" fill="#fbbf24" radius={[3, 3, 0, 0]} />
              <Bar dataKey="overdue" name="Overdue" fill="#f87171" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-32 flex items-center justify-center text-xs text-slate-400">
            No centre records available
          </div>
        )}
      </Card>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent payments */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Recent Payments</h2>
              <p className="text-[11px] text-slate-500">Directly posted or verified transactions</p>
            </div>
            <Link to="/payments" className="text-xs text-indigo-600 hover:underline flex items-center gap-0.5">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-3">
            {recentPayments.map(p => (
              <Link
                key={p.id}
                to={`/fee-ledger?student_id=${p.studentId}`}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors group"
              >
                <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 group-hover:text-indigo-600 transition-colors truncate">
                    {p.studentName}
                  </p>
                  <p className="text-xs text-slate-500">{formatDate(p.paymentDate)} · {p.method}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className="text-sm font-semibold text-emerald-700 block">
                    {formatCurrency(p.amount)}
                  </span>
                  <span className="text-[10px] text-slate-400 group-hover:text-indigo-500">Open ledger →</span>
                </div>
              </Link>
            ))}
            {recentPayments.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-4">No recent payments recorded</p>
            )}
          </div>
        </Card>

        {/* Students requiring attention */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Requires Attention</h2>
              <p className="text-[11px] text-slate-500">Students with overdue instalments or partial payments</p>
            </div>
            <Link to="/students?status=Overdue" className="text-xs text-indigo-600 hover:underline flex items-center gap-0.5">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-3">
            {attentionStudents.map(s => (
              <Link
                key={s.id}
                to={`/fee-ledger?student_id=${s.id}`}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors group"
              >
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${s.feeStatus === 'Overdue' ? 'bg-red-500' : 'bg-amber-400'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 group-hover:text-indigo-600 transition-colors truncate">
                    {s.name}
                  </p>
                  <p className="text-xs text-slate-500">{s.course} · {s.centre}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={`text-sm font-semibold ${s.feeStatus === 'Overdue' ? 'text-red-600' : 'text-amber-600'}`}>
                    {formatCurrency(s.outstanding)}
                  </p>
                  <p className="text-[10px] text-slate-400 group-hover:text-indigo-500">Inspect ledger →</p>
                </div>
              </Link>
            ))}
            {attentionStudents.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-4">All students are up to date</p>
            )}
          </div>
        </Card>
      </div>

      {/* Quick actions */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-slate-900 mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {[
            { label: 'Add Student', to: '/students?action=add', icon: UserPlus, desc: 'Enrol new student' },
            { label: 'Record Payment', to: '/payments?action=record', icon: CreditCard, desc: 'Post offline fee' },
            { label: 'Send Reminders', to: '/reminders', icon: Bell, desc: 'Batch WhatsApp/SMS' },
            { label: 'View Overdue', to: '/students?status=Overdue', icon: AlertTriangle, desc: 'Dues past deadline' },
            { label: 'Audit Reports', to: '/reports', icon: FileText, desc: 'Tally & ledger export' },
            { label: 'Refund Calculator', to: '/refund-calculator', icon: Calculator, desc: 'Pro-rata & policy' },
          ].map(a => {
            const Icon = a.icon;
            return (
              <Link
                key={a.label}
                to={a.to}
                className="group p-3 rounded-lg border border-slate-200 hover:border-indigo-300 bg-white hover:bg-indigo-50/50 transition-all flex flex-col justify-between"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="w-8 h-8 rounded-md bg-slate-100 group-hover:bg-indigo-100 flex items-center justify-center text-slate-600 group-hover:text-indigo-600 transition-colors">
                    <Icon className="w-4 h-4" />
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-indigo-500 transition-colors" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900 group-hover:text-indigo-700 transition-colors">{a.label}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{a.desc}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
