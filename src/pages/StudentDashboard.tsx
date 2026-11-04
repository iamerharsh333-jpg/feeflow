import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../utils/api';
import { formatCurrency, formatDate } from '../utils/helpers';
import { Badge, Button, Card } from '../components/ui';
import { NotificationCenter } from '../components/notifications/NotificationCenter';
import { LogOut, BookOpen, Calendar, FileText, CheckCircle, Clock, AlertTriangle, RefreshCw } from 'lucide-react';

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
      <div className="min-h-screen bg-[#929DB4] flex items-center justify-center p-4">
        <div className="bg-[#EEF0F1] p-8 rounded-3xl shadow-xl flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-[#20283A] animate-spin" />
          <p className="text-sm font-semibold text-[#20283A]">Loading Student Portal…</p>
          <p className="text-xs text-[#718096]">Fetching fee schedules, attendance and test results</p>
        </div>
      </div>
    );
  }

  if (error || !student) {
    return (
      <div className="min-h-screen bg-[#929DB4] flex items-center justify-center p-4">
        <div className="bg-[#EEF0F1] p-8 rounded-3xl shadow-xl max-w-sm text-center">
          <AlertTriangle className="w-10 h-10 text-[#E95435] mx-auto mb-2" />
          <h2 className="text-base font-bold text-[#20283A]">Unable to Load Portal</h2>
          <p className="text-xs text-[#718096] mt-1">{error || 'Student records not found.'}</p>
          <div className="flex gap-2 mt-4 justify-center">
            <Button size="sm" onClick={loadData} className="bg-[#20283A] text-white">Retry</Button>
            <Button size="sm" variant="outline" onClick={handleLogout}>Log In Again</Button>
          </div>
        </div>
      </div>
    );
  }

  const instalments: any[] = student.instalments || [];
  const outstanding = student.outstanding_amount ?? student.outstanding ?? 0;

  return (
    <div className="min-h-screen bg-[#929DB4] py-3 sm:py-6 px-2 sm:px-4">
      <div className="max-w-2xl mx-auto bg-[#EEF0F1] sm:rounded-3xl border border-[#E3E6E9] shadow-xl overflow-hidden min-h-[92vh] flex flex-col">
        {/* Top Header */}
        <header className="bg-white border-b border-[#E3E6E9] px-4 py-3 sticky top-0 z-20 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#20283A] flex items-center justify-center shadow-xs">
                <span className="w-2.5 h-2.5 rounded-full bg-[#79A9D1]" />
              </div>
              <div>
                <span className="font-bold text-[#20283A] text-sm tracking-tight leading-tight block">FeeFlow Student</span>
                <span className="text-[10px] text-[#718096] block font-medium">{student.roll_number || student.id}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <NotificationCenter align="right" />
              <button
                onClick={loadData}
                className="p-1.5 text-[#718096] hover:text-[#20283A] hover:bg-slate-100 rounded-xl transition-colors"
                title="Refresh"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1 text-xs text-[#718096] hover:text-[#BA2525] px-2 py-1.5 rounded-xl hover:bg-slate-100 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" /> Logout
              </button>
            </div>
          </div>
        </header>

        <main className="p-4 sm:p-5 space-y-4 flex-1">
          {/* Student Profile Card */}
          <Card className="p-5 rounded-3xl border border-[#E3E6E9] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.03)] space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-[#20283A] border border-[#E3E6E9]">
                  {student.course} · {student.batch} Batch
                </span>
                <h1 className="text-xl font-bold text-[#20283A] mt-2 tracking-tight">{student.name}</h1>
                <p className="text-xs text-[#718096] mt-0.5">
                  Roll No: {student.roll_number || student.rollNumber || 'N/A'} · Centre: {student.centre_name || student.centre || 'Jaipur Main'}
                </p>
              </div>
              <Badge status={student.fee_status || (outstanding === 0 ? 'Paid' : 'Pending')} />
            </div>

            <div className="grid grid-cols-3 gap-2.5 pt-3 border-t border-[#E3E6E9] text-center">
              <div className="bg-slate-50/75 rounded-xl p-2.5 border border-[#E3E6E9]">
                <span className="text-[10px] text-[#718096] uppercase font-semibold block">Total Fee</span>
                <span className="text-sm font-bold text-[#20283A]">{formatCurrency(student.total_fee || 0)}</span>
              </div>
              <div className="bg-slate-50/75 rounded-xl p-2.5 border border-[#E3E6E9]">
                <span className="text-[10px] text-[#718096] uppercase font-semibold block">Total Paid</span>
                <span className="text-sm font-bold text-emerald-700">{formatCurrency(student.amount_paid || 0)}</span>
              </div>
              <div className="bg-slate-50/75 rounded-xl p-2.5 border border-[#E3E6E9]">
                <span className="text-[10px] text-[#718096] uppercase font-semibold block">Outstanding</span>
                <span className={`text-sm font-bold ${outstanding > 0 ? 'text-[#BA2525]' : 'text-emerald-700'}`}>
                  {formatCurrency(outstanding)}
                </span>
              </div>
            </div>
          </Card>

          {/* Tab Navigation */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 text-xs font-semibold">
            {[
              { id: 'instalments', label: `Instalments (${instalments.length})` },
              { id: 'attendance', label: 'Attendance' },
              { id: 'tests', label: `Tests (${tests.length})` },
              { id: 'receipts', label: `Receipts (${receipts.length})` },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id as StudentTab)}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold text-center transition-all whitespace-nowrap ${
                  activeTab === t.id
                    ? 'bg-[#20283A] text-white shadow-xs'
                    : 'bg-white text-[#718096] border border-[#E3E6E9] hover:bg-slate-50 hover:text-[#20283A]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* TAB 1: Instalments */}
          {activeTab === 'instalments' && (
            <Card className="rounded-2xl border border-[#E3E6E9] bg-white overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.03)] divide-y divide-[#E3E6E9]">
              {instalments.length === 0 ? (
                <div className="p-8 text-center text-xs text-[#718096]">No instalments found.</div>
              ) : (
                instalments.map(ins => {
                  const paid = ins.paid_amount ?? 0;
                  const remaining = ins.amount - paid;
                  const isPaid = ins.status === 'Paid';

                  return (
                    <div key={ins.id} className="p-4 hover:bg-slate-50/60 transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {isPaid ? (
                            <CheckCircle className="w-4 h-4 text-emerald-600" />
                          ) : ins.status === 'Overdue' ? (
                            <AlertTriangle className="w-4 h-4 text-[#BA2525]" />
                          ) : (
                            <Clock className="w-4 h-4 text-amber-600" />
                          )}
                          <span className="text-xs font-bold text-[#20283A]">
                            Instalment {ins.instalment_number}
                          </span>
                        </div>
                        <Badge status={ins.status} />
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs mt-2 bg-slate-50/75 p-3 rounded-xl border border-[#E3E6E9]">
                        <div>
                          <span className="text-[#718096] block text-[10px]">Due Date:</span>
                          <span className="font-semibold text-[#20283A]">{formatDate(ins.due_date)}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-[#718096] block text-[10px]">Total Amount:</span>
                          <span className="font-bold text-[#20283A]">{formatCurrency(ins.amount)}</span>
                        </div>
                        <div>
                          <span className="text-[#718096] block text-[10px]">Paid Amount:</span>
                          <span className="font-semibold text-emerald-700">{formatCurrency(paid)}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-[#718096] block text-[10px]">Remaining:</span>
                          <span className={`font-bold ${remaining > 0 ? 'text-[#BA2525]' : 'text-emerald-700'}`}>
                            {formatCurrency(remaining)}
                          </span>
                        </div>
                      </div>

                      {ins.receipt_no && (
                        <p className="text-[10px] text-[#718096] mt-2">
                          Receipt: <span className="font-mono font-semibold text-[#20283A]">{ins.receipt_no}</span>
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </Card>
          )}

          {/* TAB 2: Attendance */}
          {activeTab === 'attendance' && (
            <Card className="rounded-2xl border border-[#E3E6E9] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)] space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#79A9D1]" />
                  <h3 className="text-sm font-bold text-[#20283A]">Attendance Record</h3>
                </div>
                {attendance && (
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                    attendance.attendance_rate_percent >= 75 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-[#BA2525] border-rose-200'
                  }`}>
                    {attendance.attendance_rate_percent}% Attendance
                  </span>
                )}
              </div>

              {attendance ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-center text-xs">
                    <div className="bg-slate-50/75 p-3 rounded-xl border border-[#E3E6E9]">
                      <span className="text-[#718096] block">Classes Attended</span>
                      <span className="text-base font-bold text-[#20283A]">{attendance.present_count}</span>
                    </div>
                    <div className="bg-slate-50/75 p-3 rounded-xl border border-[#E3E6E9]">
                      <span className="text-[#718096] block">Total Classes</span>
                      <span className="text-base font-bold text-[#20283A]">{attendance.total_classes}</span>
                    </div>
                  </div>

                  {attendance.records && attendance.records.length > 0 ? (
                    <div className="border border-[#E3E6E9] rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50/75 border-b border-[#E3E6E9] text-[#718096] font-semibold">
                          <tr>
                            <th className="px-3 py-2">Date</th>
                            <th className="px-3 py-2">Batch</th>
                            <th className="px-3 py-2 text-right">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E3E6E9]">
                          {attendance.records.map((r: any, idx: number) => (
                            <tr key={idx} className="hover:bg-slate-50/60">
                              <td className="px-3 py-2 font-medium text-[#20283A]">{formatDate(r.date)}</td>
                              <td className="px-3 py-2 text-[#718096]">{r.batch}</td>
                              <td className="px-3 py-2 text-right">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                  r.status === 'Present' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-[#BA2525] border-rose-200'
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
                    <p className="text-xs text-[#718096] text-center py-4">No attendance sessions recorded yet.</p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-[#718096] text-center py-4">Attendance data unavailable.</p>
              )}
            </Card>
          )}

          {/* TAB 3: Academic Tests */}
          {activeTab === 'tests' && (
            <Card className="rounded-2xl border border-[#E3E6E9] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)] space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <BookOpen className="w-4 h-4 text-[#79A9D1]" />
                <h3 className="text-sm font-bold text-[#20283A]">Test Scores & Evaluations</h3>
              </div>

              {tests.length === 0 ? (
                <p className="text-xs text-[#718096] text-center py-6">No test score evaluations recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {tests.map(t => (
                    <div key={t.id} className="p-3 border border-[#E3E6E9] rounded-xl flex items-center justify-between hover:bg-slate-50/60 transition-colors">
                      <div>
                        <p className="text-xs font-bold text-[#20283A]">{t.test_name}</p>
                        <p className="text-[11px] text-[#718096]">{t.subject} · {formatDate(t.test_date)}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-bold text-[#20283A]">{t.marks_obtained} / {t.max_marks}</span>
                        <span className={`block text-[11px] font-bold ${
                          t.percentage >= 75 ? 'text-emerald-600' : t.percentage >= 50 ? 'text-amber-600' : 'text-[#BA2525]'
                        }`}>
                          {t.percentage}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* TAB 4: Receipts */}
          {activeTab === 'receipts' && (
            <Card className="rounded-2xl border border-[#E3E6E9] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)] space-y-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#79A9D1]" />
                  <h3 className="text-sm font-bold text-[#20283A]">Official Payment Receipts</h3>
                </div>
              </div>

              {receipts.length === 0 ? (
                <p className="text-xs text-[#718096] text-center py-6">No payment receipts issued yet.</p>
              ) : (
                <div className="space-y-2.5">
                  {receipts.map(r => (
                    <div key={r.id} className="p-3.5 border border-[#E3E6E9] rounded-xl hover:bg-slate-50/60 transition-colors space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-bold text-[#20283A]">{r.receipt_no}</span>
                          <span className="text-[10px] text-[#718096] block">{formatDate(r.date)}</span>
                        </div>
                        <span className="font-bold text-emerald-700 text-sm">{formatCurrency(r.total_amount)}</span>
                      </div>

                      <div className="grid grid-cols-3 gap-1.5 text-[11px] bg-slate-50/75 p-2 rounded-lg border border-[#E3E6E9] text-[#718096]">
                        <div>Base: {formatCurrency(r.base_amount)}</div>
                        <div>CGST: {formatCurrency(r.cgst_amount)}</div>
                        <div>SGST: {formatCurrency(r.sgst_amount)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </main>
      </div>
    </div>
  );
}
