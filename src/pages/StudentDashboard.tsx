import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../utils/api';
import { formatCurrency, formatDate } from '../utils/helpers';
import { Badge, Button, Card } from '../components/ui';
import { NotificationCenter } from '../components/notifications/NotificationCenter';
import { CreditCard, LogOut, BookOpen, Calendar, FileText, CheckCircle, Clock, AlertTriangle, RefreshCw, Printer } from 'lucide-react';

type StudentTab = 'instalments' | 'attendance' | 'tests' | 'receipts';

export default function StudentDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [student, setStudent] = useState<any | null>(null);
  const [attendance, setAttendance] = useState<any | null>(null);
  const [tests, setTests] = useState<any[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<StudentTab>('instalments');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const studentId = user?.id || 'STU-0412';

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [stuRes, attRes, testsRes, recRes] = await Promise.allSettled([
        api.getStudent(studentId),
        api.getStudentAttendance(studentId),
        api.getStudentTests(studentId),
        api.getReceipts(studentId),
      ]);

      if (stuRes.status === 'fulfilled' && stuRes.value) {
        setStudent(stuRes.value);
      } else {
        throw new Error('Unable to retrieve student profile');
      }

      if (attRes.status === 'fulfilled' && attRes.value) {
        setAttendance(attRes.value);
      }
      if (testsRes.status === 'fulfilled' && Array.isArray(testsRes.value)) {
        setTests(testsRes.value);
      }
      if (recRes.status === 'fulfilled' && Array.isArray(recRes.value)) {
        setReceipts(recRes.value);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load student data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [studentId]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mb-3" />
        <p className="text-sm font-medium text-slate-700">Loading Student Portal…</p>
        <p className="text-xs text-slate-400 mt-1">Fetching fee schedules, attendance and test results</p>
      </div>
    );
  }

  if (error || !student) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 text-center">
        <AlertTriangle className="w-10 h-10 text-amber-500 mb-2" />
        <h2 className="text-base font-bold text-slate-900">Unable to Load Portal</h2>
        <p className="text-xs text-slate-500 mt-1 max-w-sm">{error || 'Student records not found.'}</p>
        <div className="flex gap-2 mt-4">
          <Button size="sm" onClick={loadData}>Retry</Button>
          <Button size="sm" variant="outline" onClick={handleLogout}>Log In Again</Button>
        </div>
      </div>
    );
  }

  const instalments: any[] = student.instalments || [];
  const outstanding = student.outstanding_amount ?? student.outstanding ?? 0;

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-xs">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center shadow-xs">
              <CreditCard className="w-4 h-4 text-white" />
            </div>
            <div>
              <span className="font-bold text-slate-900 text-sm leading-tight block">FeeFlow Student</span>
              <span className="text-[10px] text-slate-500 block">{student.roll_number || student.id}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <NotificationCenter align="right" />
            <button
              onClick={loadData}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-md"
              title="Refresh"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 px-2 py-1 rounded-md hover:bg-slate-100"
            >
              <LogOut className="w-3.5 h-3.5" /> Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-4">
        {/* Student Profile Card */}
        <Card className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-lg font-bold text-slate-900">{student.name}</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                {student.course} · {student.batch} Batch · {student.centre_name || 'Jaipur Main'}
              </p>
            </div>
            <Badge status={student.fee_status || (outstanding === 0 ? 'Paid' : 'Pending')} />
          </div>

          <div className="grid grid-cols-3 gap-2.5 mt-4 text-center">
            <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
              <span className="text-[10px] text-slate-400 uppercase font-semibold block">Total Fee</span>
              <span className="text-sm font-bold text-slate-900">{formatCurrency(student.total_fee || 0)}</span>
            </div>
            <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
              <span className="text-[10px] text-slate-400 uppercase font-semibold block">Total Paid</span>
              <span className="text-sm font-bold text-emerald-600">{formatCurrency(student.amount_paid || 0)}</span>
            </div>
            <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
              <span className="text-[10px] text-slate-400 uppercase font-semibold block">Outstanding</span>
              <span className={`text-sm font-bold ${outstanding > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {formatCurrency(outstanding)}
              </span>
            </div>
          </div>
        </Card>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 bg-white rounded-t-xl px-2 shadow-xs">
          {[
            { id: 'instalments', label: `Instalments (${instalments.length})` },
            { id: 'attendance', label: 'Attendance' },
            { id: 'tests', label: `Tests (${tests.length})` },
            { id: 'receipts', label: `Receipts (${receipts.length})` },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as StudentTab)}
              className={`flex-1 py-3 text-xs font-semibold text-center border-b-2 transition-colors ${
                activeTab === t.id
                  ? 'border-indigo-600 text-indigo-600 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* TAB 1: Instalments */}
        {activeTab === 'instalments' && (
          <div className="bg-white border border-slate-200 rounded-b-xl overflow-hidden shadow-xs divide-y divide-slate-100">
            {instalments.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">No instalments found.</div>
            ) : (
              instalments.map(ins => {
                const paid = ins.paid_amount ?? 0;
                const remaining = ins.amount - paid;
                const isPaid = ins.status === 'Paid';

                return (
                  <div key={ins.id} className="p-4 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        {isPaid ? (
                          <CheckCircle className="w-4 h-4 text-emerald-600" />
                        ) : ins.status === 'Overdue' ? (
                          <AlertTriangle className="w-4 h-4 text-red-600" />
                        ) : (
                          <Clock className="w-4 h-4 text-amber-500" />
                        )}
                        <span className="text-xs font-bold text-slate-900">
                          Instalment {ins.instalment_number}
                        </span>
                      </div>
                      <Badge status={ins.status} />
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs mt-2 bg-slate-50 p-2.5 rounded-lg">
                      <div>
                        <span className="text-slate-400 block text-[10px]">Due Date:</span>
                        <span className="font-semibold text-slate-800">{formatDate(ins.due_date)}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-400 block text-[10px]">Total Amount:</span>
                        <span className="font-bold text-slate-900">{formatCurrency(ins.amount)}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Paid Amount:</span>
                        <span className="font-semibold text-emerald-600">{formatCurrency(paid)}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-400 block text-[10px]">Remaining:</span>
                        <span className={`font-bold ${remaining > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                          {formatCurrency(remaining)}
                        </span>
                      </div>
                    </div>

                    {ins.receipt_no && (
                      <p className="text-[10px] text-slate-500 mt-2">
                        Receipt: <span className="font-mono font-semibold text-slate-700">{ins.receipt_no}</span>
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* TAB 2: Attendance */}
        {activeTab === 'attendance' && (
          <div className="bg-white border border-slate-200 rounded-b-xl p-4 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">Attendance Record</h3>
              </div>
              {attendance && (
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                  attendance.attendance_rate_percent >= 75 ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                }`}>
                  {attendance.attendance_rate_percent}% Attendance
                </span>
              )}
            </div>

            {attendance ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-center text-xs">
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <span className="text-slate-500 block">Classes Attended</span>
                    <span className="text-base font-bold text-slate-900">{attendance.present_count}</span>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <span className="text-slate-500 block">Total Classes</span>
                    <span className="text-base font-bold text-slate-900">{attendance.total_classes}</span>
                  </div>
                </div>

                {attendance.records && attendance.records.length > 0 ? (
                  <div className="border border-slate-100 rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-100 text-slate-500">
                        <tr>
                          <th className="px-3 py-2">Date</th>
                          <th className="px-3 py-2">Batch</th>
                          <th className="px-3 py-2 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {attendance.records.map((r: any, idx: number) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="px-3 py-1.5 font-medium">{formatDate(r.date)}</td>
                            <td className="px-3 py-1.5 text-slate-600">{r.batch}</td>
                            <td className="px-3 py-1.5 text-right">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                r.status === 'Present' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                              }`}>
                                {r.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 text-center py-4">No attendance sessions recorded yet.</p>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-400 text-center py-4">Attendance data unavailable.</p>
            )}
          </div>
        )}

        {/* TAB 3: Academic Tests */}
        {activeTab === 'tests' && (
          <div className="bg-white border border-slate-200 rounded-b-xl p-4 shadow-xs space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-bold text-slate-900">Test Scores & Evaluations</h3>
            </div>

            {tests.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">No test score evaluations recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {tests.map(t => (
                  <div key={t.id} className="p-3 border border-slate-100 rounded-lg flex items-center justify-between hover:bg-slate-50">
                    <div>
                      <p className="text-xs font-bold text-slate-900">{t.test_name}</p>
                      <p className="text-[11px] text-slate-500">{t.subject} · {formatDate(t.test_date)}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold text-slate-900">{t.marks_obtained} / {t.max_marks}</span>
                      <span className={`block text-[11px] font-bold ${
                        t.percentage >= 75 ? 'text-emerald-600' : t.percentage >= 50 ? 'text-amber-600' : 'text-red-600'
                      }`}>
                        {t.percentage}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: Receipts */}
        {activeTab === 'receipts' && (
          <div className="bg-white border border-slate-200 rounded-b-xl p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">Official Payment Receipts</h3>
              </div>
            </div>

            {receipts.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">No payment receipts issued yet.</p>
            ) : (
              <div className="space-y-2.5">
                {receipts.map(r => (
                  <div key={r.id} className="p-3.5 border border-slate-100 rounded-lg hover:bg-slate-50 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-bold text-slate-900">{r.receipt_no}</span>
                        <span className="text-[10px] text-slate-400 block">{formatDate(r.date)}</span>
                      </div>
                      <span className="font-bold text-emerald-600 text-sm">{formatCurrency(r.total_amount)}</span>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 text-[11px] bg-slate-50 p-2 rounded text-slate-600">
                      <div>Base: {formatCurrency(r.base_amount)}</div>
                      <div>CGST: {formatCurrency(r.cgst_amount)}</div>
                      <div>SGST: {formatCurrency(r.sgst_amount)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
