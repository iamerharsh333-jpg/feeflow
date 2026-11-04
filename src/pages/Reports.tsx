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
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#20283A] tracking-tight">Reports & Financial Analytics</h1>
          <p className="text-xs text-[#718096] mt-1 font-normal">
            Financial analytics, reconciliation logs & ledger audit reports · {backendConnected ? 'Live database synchronized' : 'Local demonstration mode'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchLiveReports} disabled={loading} className="text-xs border-[#E3E6E9] text-[#20283A]">
            <RefreshCw className={`w-3.5 h-3.5 mr-1 text-[#718096] ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button size="sm" onClick={handleExport} className="text-xs bg-[#E95435] hover:bg-[#D84527] text-white">
            <Download className="w-3.5 h-3.5 mr-1" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4 rounded-2xl border border-[#E3E6E9] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-[#20283A]">From Date</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="border border-[#E3E6E9] rounded-xl px-3 py-1.5 text-xs text-[#20283A] outline-none focus:ring-2 focus:ring-[#20283A]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-[#20283A]">To Date</label>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="border border-[#E3E6E9] rounded-xl px-3 py-1.5 text-xs text-[#20283A] outline-none focus:ring-2 focus:ring-[#20283A]"
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
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-semibold">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
              activeTab === t.id
                ? 'bg-[#20283A] text-white shadow-xs'
                : 'bg-white text-[#718096] border border-[#E3E6E9] hover:bg-slate-50 hover:text-[#20283A]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Centre-wise */}
      {activeTab === 'centre' && (
        <div className="space-y-4">
          <Card className="p-5 rounded-2xl border border-[#E3E6E9] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
            <h2 className="text-sm font-bold text-[#20283A] mb-4 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[#79A9D1]" /> Centre-wise Fee Performance
            </h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={centreData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="centre" tick={{ fontSize: 11, fill: '#718096' }} />
                <YAxis tickFormatter={v => `₹${(v / 100000).toFixed(0)}L`} tick={{ fontSize: 11, fill: '#718096' }} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Bar dataKey="collected" name="Collected" fill="#20283A" radius={[4, 4, 0, 0]} />
                <Bar dataKey="outstanding" name="Outstanding" fill="#79A9D1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Card className="rounded-2xl border border-[#E3E6E9] bg-white overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
            <Table headers={['Centre', 'Collected', 'Outstanding', 'Total Payable', 'Collection Rate']}>
              {centreData.map(c => {
                const total = c.collected + c.outstanding;
                const rate = total > 0 ? Math.round((c.collected / total) * 100) : 0;
                return (
                  <tr key={c.centre} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-3 text-sm font-semibold text-[#20283A]">{c.centre}</td>
                    <td className="px-4 py-3 text-sm text-emerald-700 font-bold">{formatCurrency(c.collected)}</td>
                    <td className="px-4 py-3 text-sm text-[#E95435] font-semibold">{formatCurrency(c.outstanding)}</td>
                    <td className="px-4 py-3 text-sm text-[#20283A] font-bold">{formatCurrency(total)}</td>
                    <td className="px-4 py-3 text-sm text-[#20283A] font-bold">
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
        <Card className="rounded-2xl border border-[#E3E6E9] bg-white overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
          <Table headers={['Course', 'Batch', 'Students', 'Collected', 'Outstanding', 'Collection Rate']}>
            {batchData.map((b, i) => (
              <tr key={i} className="hover:bg-slate-50/60 transition-colors">
                <td className="px-4 py-3 text-sm font-semibold text-[#20283A]">{b.course}</td>
                <td className="px-4 py-3 text-xs text-[#718096] font-medium">{b.batch}</td>
                <td className="px-4 py-3 text-xs text-[#20283A] font-semibold">{b.students}</td>
                <td className="px-4 py-3 text-sm text-emerald-700 font-bold">{formatCurrency(b.collected)}</td>
                <td className="px-4 py-3 text-sm text-[#E95435] font-semibold">{formatCurrency(b.outstanding)}</td>
                <td className="px-4 py-3 text-sm font-bold text-[#20283A]">
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
          <Card className="p-5 rounded-2xl border border-[#E3E6E9] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
            <h2 className="text-sm font-bold text-[#20283A] mb-4">Overdue Ageing Distribution (Live Records)</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {ageingData.map((b) => {
                const isOverdue = b.bucket !== 'Not Due';
                return (
                  <div
                    key={b.bucket}
                    className={`rounded-2xl p-4 border ${
                      isOverdue ? 'bg-rose-50/60 border-rose-200' : 'bg-emerald-50/60 border-emerald-200'
                    }`}
                  >
                    <p className="text-xs font-semibold text-[#718096]">{b.bucket}</p>
                    <p className={`text-xl font-black mt-1 ${isOverdue ? 'text-[#BA2525]' : 'text-emerald-700'}`}>
                      {formatCurrency(b.amount)}
                    </p>
                    <p className="text-xs text-[#718096] mt-0.5">{b.count} instalment{b.count !== 1 ? 's' : ''}</p>
                  </div>
                );
              })}
            </div>
          </Card>
          <Card className="rounded-2xl border border-[#E3E6E9] bg-white overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
            <Table headers={['Student', 'Course', 'Centre', 'Overdue Amount', 'Status']}>
              {students.filter(s => s.feeStatus === 'Overdue').map(s => (
                <tr key={s.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-sm font-semibold text-[#20283A]">{s.name}</p>
                    <p className="text-xs text-[#718096] font-mono">{s.id}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-[#20283A] font-medium">{s.course}</td>
                  <td className="px-4 py-3 text-xs text-[#20283A]">{s.centre}</td>
                  <td className="px-4 py-3 text-sm font-bold text-[#BA2525]">{formatCurrency(s.outstanding)}</td>
                  <td className="px-4 py-3"><Badge status={s.feeStatus} /></td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>
      )}

      {/* Reconciliation */}
      {activeTab === 'reconciliation' && (
        <Card className="rounded-2xl border border-[#E3E6E9] bg-white overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
          <div className="px-5 py-4 border-b border-[#E3E6E9] bg-slate-50/75 flex items-center justify-between">
            <p className="text-xs text-[#718096] font-medium">{reconData.length} transactions in selected date range</p>
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-lg">
              Total: {formatCurrency(reconData.reduce((a, b) => a + b.amount, 0))}
            </span>
          </div>
          <Table headers={['Transaction ID', 'Student', 'Amount', 'Date', 'Method', 'Reference', 'Status']}>
            {reconData.map(p => (
              <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                <td className="px-4 py-3 text-xs font-mono text-[#718096]">{p.transactionId}</td>
                <td className="px-4 py-3 text-sm text-[#20283A] font-semibold">{p.studentName}</td>
                <td className="px-4 py-3 text-sm font-bold text-emerald-700">{formatCurrency(p.amount)}</td>
                <td className="px-4 py-3 text-xs text-[#718096]">{formatDate(p.paymentDate)}</td>
                <td className="px-4 py-3 text-xs text-[#20283A] font-medium">{p.method}</td>
                <td className="px-4 py-3 text-xs font-mono text-[#718096]">{p.referenceNo}</td>
                <td className="px-4 py-3"><Badge status={p.status} /></td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </div>
  );
}
