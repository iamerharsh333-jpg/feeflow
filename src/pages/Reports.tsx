import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { formatCurrency, exportToCsv, formatDate } from '../utils/helpers';
import { Badge, Button, Card, Select, Table } from '../components/ui';
import { api } from '../utils/api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Download, BarChart3, RefreshCw } from 'lucide-react';

type ReportTab = 'centre' | 'batch' | 'ageing' | 'reconciliation';

interface CentreRow {
  centre: string;
  collected: number;
  outstanding: number;
  overdue?: number;
  collection_rate?: number;
}

interface AgeingRow {
  bucket: string;
  amount: number;
  count: number;
}

export default function Reports() {
  const { students, payments, backendConnected } = useApp();
  const [activeTab, setActiveTab] = useState<ReportTab>('centre');
  const [centreFilter, setCentreFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('2024-04-01');
  const [dateTo, setDateTo] = useState('2026-11-04');
  const [centreData, setCentreData] = useState<CentreRow[]>([]);
  const [ageingData, setAgeingData] = useState<AgeingRow[]>([]);
  const [loading, setLoading] = useState(false);

  const tabs: { id: ReportTab; label: string }[] = [
    { id: 'centre', label: 'Centre-wise Collection' },
    { id: 'batch', label: 'Batch-wise Dues' },
    { id: 'ageing', label: 'Overdue Ageing' },
    { id: 'reconciliation', label: 'Payment Reconciliation' },
  ];

  const fetchLiveReports = async () => {
    setLoading(true);
    try {
      const [cRes, aRes] = await Promise.all([
        api.getDashboardCentreWise().catch(() => []),
        api.getDashboardAgeing().catch(() => []),
      ]);
      if (Array.isArray(cRes) && cRes.length > 0) {
        setCentreData(cRes);
      } else {
        // Fallback aggregate from local students
        const centres = ['Jaipur Main', 'Jaipur West', 'Kota', 'Ajmer'];
        const fallback = centres.map(c => {
          const cStudents = students.filter(s => s.centre === c);
          const collected = cStudents.reduce((a, s) => a + s.amountPaid, 0);
          const outstanding = cStudents.reduce((a, s) => a + s.outstanding, 0);
          return { centre: c, collected, outstanding };
        });
        setCentreData(fallback);
      }

      if (Array.isArray(aRes) && aRes.length > 0) {
        setAgeingData(aRes);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveReports();
  }, [students]);

  // Batch report data
  const batchData = (() => {
    const map: Record<string, { batch: string; course: string; students: number; collected: number; outstanding: number }> = {};
    students.forEach(s => {
      if (centreFilter && s.centre !== centreFilter) return;
      const key = `${s.course} — ${s.batch}`;
      if (!map[key]) map[key] = { batch: s.batch, course: s.course, students: 0, collected: 0, outstanding: 0 };
      map[key].students++;
      map[key].collected += s.amountPaid;
      map[key].outstanding += s.outstanding;
    });
    return Object.values(map);
  })();

  // Reconciliation data
  const reconData = payments.filter(p => {
    const date = p.paymentDate;
    const matchDate = (!dateFrom || date >= dateFrom) && (!dateTo || date <= dateTo);
    const matchCentre = !centreFilter || p.centre === centreFilter;
    return matchDate && matchCentre;
  });

  const handleExport = () => {
    if (activeTab === 'centre') {
      exportToCsv('centre-collection.csv', centreData.map(c => ({
        Centre: c.centre,
        'Collected (₹)': c.collected,
        'Outstanding (₹)': c.outstanding,
        'Total (₹)': c.collected + c.outstanding,
        'Collection Rate (%)': c.collected + c.outstanding > 0 ? Math.round((c.collected / (c.collected + c.outstanding)) * 100) : 0,
      })));
    } else if (activeTab === 'batch') {
      exportToCsv('batch-dues.csv', batchData.map(b => ({
        Course: b.course,
        Batch: b.batch,
        Students: b.students,
        'Collected (₹)': b.collected,
        'Outstanding (₹)': b.outstanding,
      })));
    } else if (activeTab === 'ageing') {
      exportToCsv('overdue-ageing.csv', ageingData.map(b => ({
        'Bucket': b.bucket,
        'Instalments Count': b.count,
        'Amount (₹)': b.amount,
      })));
    } else {
      exportToCsv('reconciliation.csv', reconData.map(p => ({
        'Transaction ID': p.transactionId,
        Student: p.studentName,
        'Student ID': p.studentId,
        'Amount (₹)': p.amount,
        'Payment Date': p.paymentDate,
        Method: p.method,
        Reference: p.referenceNo,
        Status: p.status,
        Centre: p.centre,
      })));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-slate-900">Reports & Audit Trails</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Financial analytics, reconciliation logs & ledger audit reports · {backendConnected ? 'Live database synchronized' : 'Local demonstration mode'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchLiveReports} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="w-3.5 h-3.5" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">From Date</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">To Date</label>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <Select
            options={[
              { value: '', label: 'All Centres' },
              { value: 'Jaipur Main', label: 'Jaipur Main' },
              { value: 'Jaipur West', label: 'Jaipur West' },
              { value: 'Kota', label: 'Kota' },
              { value: 'Ajmer', label: 'Ajmer' },
            ]}
            value={centreFilter}
            onChange={e => setCentreFilter(e.target.value)}
            className="min-w-[130px]"
          />
        </div>
      </Card>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === t.id
              ? 'border-indigo-600 text-indigo-700 font-semibold'
              : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Centre-wise */}
      {activeTab === 'centre' && (
        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-indigo-500" /> Centre-wise Fee Performance
            </h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={centreData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="centre" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={v => `₹${(v / 100000).toFixed(0)}L`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Bar dataKey="collected" name="Collected" fill="#6366f1" radius={[3, 3, 0, 0]} />
                <Bar dataKey="outstanding" name="Outstanding" fill="#fbbf24" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Card>
            <Table headers={['Centre', 'Collected', 'Outstanding', 'Total Payable', 'Collection Rate']}>
              {centreData.map(c => {
                const total = c.collected + c.outstanding;
                const rate = total > 0 ? Math.round((c.collected / total) * 100) : 0;
                return (
                  <tr key={c.centre} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm font-semibold text-slate-900">{c.centre}</td>
                    <td className="px-4 py-3 text-sm text-emerald-700 font-bold">{formatCurrency(c.collected)}</td>
                    <td className="px-4 py-3 text-sm text-amber-600 font-semibold">{formatCurrency(c.outstanding)}</td>
                    <td className="px-4 py-3 text-sm text-slate-900 font-medium">{formatCurrency(total)}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 font-bold">
                      {rate}%
                    </td>
                  </tr>
                );
              })}
            </Table>
          </Card>
        </div>
      )}

      {/* Batch-wise */}
      {activeTab === 'batch' && (
        <Card>
          <Table headers={['Course', 'Batch', 'Students', 'Collected', 'Outstanding', 'Collection Rate']}>
            {batchData.map((b, i) => (
              <tr key={i} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-sm font-medium text-slate-900">{b.course}</td>
                <td className="px-4 py-3 text-sm text-slate-700">{b.batch}</td>
                <td className="px-4 py-3 text-sm text-slate-700 font-medium">{b.students}</td>
                <td className="px-4 py-3 text-sm text-emerald-700 font-semibold">{formatCurrency(b.collected)}</td>
                <td className="px-4 py-3 text-sm text-amber-600 font-semibold">{formatCurrency(b.outstanding)}</td>
                <td className="px-4 py-3 text-sm font-bold text-slate-800">
                  {b.collected + b.outstanding > 0
                    ? `${Math.round((b.collected / (b.collected + b.outstanding)) * 100)}%`
                    : 'N/A'}
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      {/* Ageing */}
      {activeTab === 'ageing' && (
        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-4">Overdue Ageing Distribution (Live Records)</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {ageingData.map((b) => {
                const isOverdue = b.bucket !== 'Not Due';
                return (
                  <div
                    key={b.bucket}
                    className={`rounded-lg p-4 border ${
                      isOverdue ? 'bg-rose-50/60 border-rose-200' : 'bg-emerald-50/60 border-emerald-200'
                    }`}
                  >
                    <p className="text-xs font-semibold text-slate-600">{b.bucket}</p>
                    <p className={`text-xl font-bold mt-1 ${isOverdue ? 'text-rose-700' : 'text-emerald-700'}`}>
                      {formatCurrency(b.amount)}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">{b.count} instalment{b.count !== 1 ? 's' : ''}</p>
                  </div>
                );
              })}
            </div>
          </Card>
          <Card>
            <Table headers={['Student', 'Course', 'Centre', 'Overdue Amount', 'Status']}>
              {students.filter(s => s.feeStatus === 'Overdue').map(s => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-slate-900">{s.name}</p>
                    <p className="text-xs text-slate-400 font-mono">{s.id}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">{s.course}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{s.centre}</td>
                  <td className="px-4 py-3 text-sm font-bold text-rose-600">{formatCurrency(s.outstanding)}</td>
                  <td className="px-4 py-3"><Badge status={s.feeStatus} /></td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>
      )}

      {/* Reconciliation */}
      {activeTab === 'reconciliation' && (
        <Card>
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <p className="text-xs text-slate-500">{reconData.length} transactions in selected date range</p>
            <span className="text-xs font-bold text-emerald-700">
              Total: {formatCurrency(reconData.reduce((a, b) => a + b.amount, 0))}
            </span>
          </div>
          <Table headers={['Transaction ID', 'Student', 'Amount', 'Date', 'Method', 'Reference', 'Status']}>
            {reconData.map(p => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-xs font-mono text-slate-500">{p.transactionId}</td>
                <td className="px-4 py-3 text-sm text-slate-900 font-medium">{p.studentName}</td>
                <td className="px-4 py-3 text-sm font-bold text-emerald-700">{formatCurrency(p.amount)}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{formatDate(p.paymentDate)}</td>
                <td className="px-4 py-3 text-sm text-slate-600 font-medium">{p.method}</td>
                <td className="px-4 py-3 text-xs font-mono text-slate-400">{p.referenceNo}</td>
                <td className="px-4 py-3"><Badge status={p.status} /></td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </div>
  );
}

