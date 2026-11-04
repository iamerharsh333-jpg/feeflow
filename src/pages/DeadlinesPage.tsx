import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Calendar as CalendarIcon, Clock, AlertCircle, CheckCircle2,
  Search, ArrowRight, RefreshCw, Send, AlertTriangle,
  ChevronLeft, ChevronRight, PlayCircle, X, ShieldCheck
} from 'lucide-react';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { Card, Badge, Button, Modal } from '../components/ui';
import { formatCurrency, formatDate } from '../utils/helpers';

interface DeadlineItem {
  instalment_id: string;
  instalment_number: number;
  student_id: string;
  student_name: string;
  course: string;
  batch: string;
  centre_id: number;
  centre_name: string;
  parent_name?: string;
  parent_phone?: string;
  due_date: string;
  amount: number;
  paid_amount: number;
  outstanding_balance: number;
  status: string;
  days_remaining: number;
  overdue_days: number;
  category: string;
  reminders_sent: number;
  last_reminder_date?: string;
}

interface DeadlinesSummary {
  due_today_count: number;
  due_in_3d_count: number;
  due_in_7d_count: number;
  overdue_count: number;
  total_upcoming_amount: number;
  total_overdue_amount: number;
}

interface CounsellorTaskItem {
  task_id: number;
  student_id: string;
  student_name: string;
  course: string;
  batch: string;
  centre_name: string;
  risk_level: string;
  risk_score: number;
  priority: string;
  due_date?: string;
  status: string;
  days_remaining: number;
  overdue_days: number;
  notes?: string;
}

export default function DeadlinesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [deadlines, setDeadlines] = useState<DeadlineItem[]>([]);
  const [counsellorTasks, setCounsellorTasks] = useState<CounsellorTaskItem[]>([]);
  const [summary, setSummary] = useState<DeadlinesSummary>({
    due_today_count: 0,
    due_in_3d_count: 0,
    due_in_7d_count: 0,
    overdue_count: 0,
    total_upcoming_amount: 0,
    total_overdue_amount: 0,
  });

  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'table' | 'calendar'>('table');
  const [activeCategory, setActiveCategory] = useState<string>(searchParams.get('category') || 'all');
  const [searchQuery, setSearchQuery] = useState('');
  const [batchFilter, setBatchFilter] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<Date>(new Date());

  // Simulation test-run modal state
  const [simModalOpen, setSimModalOpen] = useState(false);
  const [simDate, setSimDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [simLoading, setSimLoading] = useState(false);
  const [simResults, setSimResults] = useState<any>(null);

  const isCounsellor = (user as any)?.role === 'counsellor';
  const isAccounts = user?.role === 'accounts' || (user as any)?.role === 'accounts_executive';
  const isAdmin = (user as any)?.role === 'admin';

  const fetchSummary = useCallback(async () => {
    if (isCounsellor) return;
    try {
      const res = await api.getDeadlinesSummary();
      setSummary(res);
    } catch (e) {
      console.error('Failed to load deadline summary:', e);
    }
  }, [isCounsellor]);

  const fetchDeadlines = useCallback(async () => {
    setLoading(true);
    try {
      if (isCounsellor) {
        const tasks = await api.getCounsellorDeadlines();
        setCounsellorTasks(tasks || []);
      } else {
        const params: any = { limit: 300 };
        if (activeCategory !== 'all') {
          params.category = activeCategory;
        }
        if (batchFilter) {
          params.batch = batchFilter;
        }
        const data = await api.getDeadlines(params);
        setDeadlines(data || []);
      }
    } catch (e) {
      console.error('Failed to load deadlines:', e);
    } finally {
      setLoading(false);
    }
  }, [isCounsellor, activeCategory, batchFilter]);

  useEffect(() => {
    fetchSummary();
    fetchDeadlines();
  }, [fetchSummary, fetchDeadlines]);

  const handleCategoryChange = (cat: string) => {
    setActiveCategory(cat);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (cat === 'all') next.delete('category');
      else next.set('category', cat);
      return next;
    });
  };

  const handleTriggerSimTest = async () => {
    setSimLoading(true);
    try {
      const res = await api.runAutomationTestRun(simDate);
      setSimResults(res);
    } catch (e: any) {
      alert(`Simulation failed: ${e.message}`);
    } finally {
      setSimLoading(false);
    }
  };

  const filteredDeadlines = useMemo(() => {
    let list = deadlines;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(d =>
        d.student_name.toLowerCase().includes(q) ||
        d.student_id.toLowerCase().includes(q) ||
        d.course.toLowerCase().includes(q) ||
        (d.parent_name && d.parent_name.toLowerCase().includes(q))
      );
    }
    return list;
  }, [deadlines, searchQuery]);

  // Calendar grouping
  const calendarData = useMemo(() => {
    const map = new Map<string, DeadlineItem[]>();
    filteredDeadlines.forEach(item => {
      const key = item.due_date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    });
    return map;
  }, [filteredDeadlines]);

  // Calendar rendering helper
  const renderCalendar = () => {
    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();

    const days = [];
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="min-h-24 bg-[#FAFAFA] border border-[#E3E6E9] rounded-xl p-2" />);
    }

    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayItems = calendarData.get(dateStr) || [];
      const isToday = dateStr === new Date().toISOString().split('T')[0];

      const overdueItems = dayItems.filter(i => i.category === 'overdue');
      const upcomingItems = dayItems.filter(i => i.category !== 'overdue');

      days.push(
        <div
          key={dateStr}
          className={`min-h-24 border rounded-xl p-2 transition-all flex flex-col justify-between ${
            isToday
              ? 'border-[#E95435] bg-[#FDF1ED]'
              : dayItems.length > 0
              ? 'border-[#E3E6E9] bg-white hover:border-[#CCD1D7]'
              : 'border-[#E3E6E9] bg-[#FAFAFA]'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold ${isToday ? 'text-[#E95435]' : 'text-[#20283A]'}`}>
              {d}
            </span>
            {isToday && (
              <span className="text-[9px] bg-[#E95435] text-white font-bold px-1.5 py-0.2 rounded">
                Today
              </span>
            )}
          </div>

          <div className="space-y-1 my-1">
            {overdueItems.length > 0 && (
              <div className="bg-[#FDF2F2] text-[#BA2525] border border-[#F9CACA] text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center justify-between">
                <span>Overdue</span>
                <span>{overdueItems.length}</span>
              </div>
            )}
            {upcomingItems.length > 0 && (
              <div className="bg-[#EEF5FB] text-[#36688F] border border-[#D4E6F4] text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center justify-between">
                <span>Due</span>
                <span>{upcomingItems.length}</span>
              </div>
            )}
          </div>

          {dayItems.length > 0 ? (
            <span className="text-[10px] text-[#718096] font-semibold tabular-nums">
              {formatCurrency(dayItems.reduce((acc, c) => acc + c.outstanding_balance, 0))}
            </span>
          ) : (
            <span />
          )}
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-[#20283A]">
            {selectedMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
          </h2>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedMonth(new Date(selectedMonth.setMonth(selectedMonth.getMonth() - 1)))}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedMonth(new Date())}
            >
              Current Month
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedMonth(new Date(selectedMonth.setMonth(selectedMonth.getMonth() + 1)))}
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="text-center text-[10px] font-bold uppercase tracking-wider text-[#718096] py-1">
              {day}
            </div>
          ))}
          {days}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-[#E3E6E9] rounded-2xl px-5 py-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
        <div>
          <h1 className="text-sm font-bold text-[#20283A] flex items-center gap-2 leading-tight">
            <CalendarIcon className="w-4 h-4 text-[#E95435]" />
            Upcoming Payment Deadlines & Milestone Operations
          </h1>
          <p className="text-[11px] text-[#718096] leading-tight mt-0.5">
            Real-time milestone tracking: -7d, -3d, due-date, +1d, +7d, +30d under Asia/Kolkata timezone
          </p>
        </div>

        <div className="flex items-center gap-2">
          {(isAdmin || isAccounts) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSimModalOpen(true)}
              className="text-xs flex items-center gap-1.5"
            >
              <PlayCircle className="w-3.5 h-3.5 text-[#E95435]" /> Simulate Engine
            </Button>
          )}

          <div className="border border-[#E3E6E9] rounded-xl p-0.5 bg-[#EEF0F1] flex items-center">
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                viewMode === 'table' ? 'bg-white text-[#20283A] shadow-xs' : 'text-[#718096] hover:text-[#20283A]'
              }`}
            >
              Table View
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                viewMode === 'calendar' ? 'bg-white text-[#20283A] shadow-xs' : 'text-[#718096] hover:text-[#20283A]'
              }`}
            >
              Calendar
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => { fetchSummary(); fetchDeadlines(); }}
            disabled={loading}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#E95435]' : 'text-[#718096]'}`} />
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      {!isCounsellor && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <Card className="p-5 border-l-4 border-l-[#BA2525]">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-[#718096] uppercase tracking-wider">Overdue</span>
              <AlertCircle className="w-4 h-4 text-[#BA2525]" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-[#BA2525] tabular-nums">{summary.overdue_count}</span>
              <span className="text-xs font-medium text-[#718096]">instalments</span>
            </div>
            <p className="text-[11px] text-[#718096] mt-1">
              Outstanding: <strong className="text-[#BA2525]">{formatCurrency(summary.total_overdue_amount)}</strong>
            </p>
          </Card>

          <Card className="p-5 border-l-4 border-l-[#E95435]">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-[#718096] uppercase tracking-wider">Due Today</span>
              <Clock className="w-4 h-4 text-[#E95435]" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-[#E95435] tabular-nums">{summary.due_today_count}</span>
              <span className="text-xs font-medium text-[#718096]">instalments</span>
            </div>
            <p className="text-[11px] text-[#718096] mt-1">Milestone 0d active</p>
          </Card>

          <Card className="p-5 border-l-4 border-l-[#79A9D1]">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-[#718096] uppercase tracking-wider">Due in 3 Days</span>
              <Clock className="w-4 h-4 text-[#79A9D1]" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-[#36688F] tabular-nums">{summary.due_in_3d_count}</span>
              <span className="text-xs font-medium text-[#718096]">instalments</span>
            </div>
            <p className="text-[11px] text-[#718096] mt-1">Milestone -3d alert</p>
          </Card>

          <Card className="p-5 border-l-4 border-l-[#20283A]">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-[#718096] uppercase tracking-wider">Due in 7 Days</span>
              <CalendarIcon className="w-4 h-4 text-[#20283A]" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-[#20283A] tabular-nums">{summary.due_in_7d_count}</span>
              <span className="text-xs font-medium text-[#718096]">instalments</span>
            </div>
            <p className="text-[11px] text-[#718096] mt-1">
              Upcoming: <strong className="text-[#20283A]">{formatCurrency(summary.total_upcoming_amount)}</strong>
            </p>
          </Card>
        </div>
      )}

      {/* Filter and Tab Bar */}
      {!isCounsellor && (
        <Card className="p-4">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Category Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
              {[
                { id: 'all', label: 'All Deadlines' },
                { id: 'overdue', label: 'Overdue' },
                { id: 'due_today', label: 'Due Today' },
                { id: 'due_in_3d', label: 'Due in 3 Days' },
                { id: 'due_in_7d', label: 'Due in 7 Days' },
                { id: 'upcoming', label: 'All Upcoming' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => handleCategoryChange(tab.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                    activeCategory === tab.id
                      ? 'bg-[#20283A] text-white shadow-xs'
                      : 'bg-[#EEF0F1] text-[#718096] hover:bg-[#E3E6E9] hover:text-[#20283A]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#718096]" />
              <input
                type="text"
                placeholder="Search student, roll, batch..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-[#E3E6E9] outline-none focus:border-[#E95435] bg-white font-medium"
              />
            </div>
          </div>
        </Card>
      )}

      {/* Main Content: Table or Calendar */}
      {isCounsellor ? (
        <Card className="p-6">
          <div className="mb-4">
            <h2 className="text-sm font-bold text-[#20283A]">Assigned Student Retention Follow-ups</h2>
            <p className="text-[11px] text-[#718096]">Confidential counselling deadlines prioritized by dropout risk.</p>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-[#E3E6E9]">
            <table className="w-full text-xs text-left">
              <thead className="bg-[#FAFAFA] text-[#718096] border-b border-[#E3E6E9] uppercase font-semibold text-[10px] tracking-wider">
                <tr>
                  <th className="py-2.5 px-3.5">Student</th>
                  <th className="py-2.5 px-3.5">Batch & Centre</th>
                  <th className="py-2.5 px-3.5">Risk Level</th>
                  <th className="py-2.5 px-3.5">Priority</th>
                  <th className="py-2.5 px-3.5">Follow-up Due</th>
                  <th className="py-2.5 px-3.5">Status</th>
                  <th className="py-2.5 px-3.5">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E3E6E9]">
                {counsellorTasks.map(t => (
                  <tr key={t.task_id} className="hover:bg-[#F8FAFC]">
                    <td className="py-3 px-3.5">
                      <div className="font-bold text-[#20283A]">{t.student_name}</div>
                      <div className="text-[10px] text-[#718096]">ID: {t.student_id}</div>
                    </td>
                    <td className="py-3 px-3.5">
                      <div className="text-[#20283A] font-medium">{t.batch}</div>
                      <div className="text-[10px] text-[#718096]">{t.centre_name}</div>
                    </td>
                    <td className="py-3 px-3.5">
                      <Badge status={t.risk_level} />
                    </td>
                    <td className="py-3 px-3.5 font-semibold text-[#20283A]">{t.priority}</td>
                    <td className="py-3 px-3.5">
                      <div className="font-semibold text-[#20283A]">
                        {t.due_date ? formatDate(t.due_date) : 'No Date'}
                      </div>
                      {t.overdue_days > 0 ? (
                        <div className="text-[10px] font-bold text-[#BA2525]">{t.overdue_days}d Overdue</div>
                      ) : (
                        <div className="text-[10px] text-[#718096]">{t.days_remaining}d remaining</div>
                      )}
                    </td>
                    <td className="py-3 px-3.5">
                      <Badge status={t.status} />
                    </td>
                    <td className="py-3 px-3.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate('/risk-counselling')}
                        className="text-[11px] py-1"
                      >
                        Open Case
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : viewMode === 'calendar' ? (
        <Card className="p-6">
          {renderCalendar()}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {loading ? (
            <div className="py-20 text-center text-[#718096] text-xs flex flex-col items-center gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-[#E95435]" />
              <span>Scanning statutory milestones across centres...</span>
            </div>
          ) : filteredDeadlines.length === 0 ? (
            <div className="py-20 text-center text-[#718096] text-xs flex flex-col items-center gap-2">
              <CheckCircle2 className="w-10 h-10 text-[#CBD5E1]" />
              <span className="font-bold text-[#20283A]">No deadlines in this category</span>
              <span className="text-[#718096]">All instalments are up to date under the selected filter.</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-[#FAFAFA] text-[#718096] border-b border-[#E3E6E9] uppercase font-semibold text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Student</th>
                    <th className="py-3 px-4">Instalment</th>
                    <th className="py-3 px-4">Due Date & Timeline</th>
                    <th className="py-3 px-4">Outstanding Balance</th>
                    <th className="py-3 px-4">Parent Contact</th>
                    <th className="py-3 px-4">Reminders</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E3E6E9]">
                  {filteredDeadlines.map(item => {
                    const isOverdue = item.category === 'overdue';
                    const isDueToday = item.category === 'due_today';
                    const isDue3d = item.category === 'due_in_3d';

                    return (
                      <tr key={item.instalment_id} className="hover:bg-[#F8FAFC] transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-[#20283A]">{item.student_name}</div>
                          <div className="text-[10px] text-[#718096] mt-0.5">ID: {item.student_id} · {item.batch}</div>
                          <div className="text-[10px] text-[#36688F] font-semibold mt-0.5">{item.centre_name}</div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="font-bold text-[#20283A]">Instalment #{item.instalment_number}</div>
                          <div className="text-[10px] text-[#718096] mt-0.5 font-mono">{item.instalment_id}</div>
                          <Badge status={item.status} className="mt-1" />
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="font-bold text-[#20283A]">
                            {formatDate(item.due_date)}
                          </div>
                          {isOverdue ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#BA2525] bg-[#FDF2F2] border border-[#F9CACA] px-1.5 py-0.5 rounded-md mt-1">
                              <AlertCircle className="w-3 h-3" /> {item.overdue_days} days overdue
                            </span>
                          ) : isDueToday ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#E95435] bg-[#FDF1ED] border border-[#F8D2C8] px-1.5 py-0.5 rounded-md mt-1">
                              <Clock className="w-3 h-3" /> Due Today
                            </span>
                          ) : isDue3d ? (
                            <span className="text-[10px] font-bold text-[#36688F] bg-[#EEF5FB] border border-[#D4E6F4] px-1.5 py-0.5 rounded-md mt-1 inline-block">
                              {item.days_remaining}d remaining (-3d milestone)
                            </span>
                          ) : (
                            <span className="text-[10px] text-[#718096] block mt-0.5">
                              {item.days_remaining} days remaining
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="font-bold text-[#20283A] text-sm tabular-nums">
                            {formatCurrency(item.outstanding_balance)}
                          </div>
                          <div className="text-[10px] text-[#718096] mt-0.5">
                            Total: {formatCurrency(item.amount)}
                            {item.paid_amount > 0 && ` (Paid: ${formatCurrency(item.paid_amount)})`}
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          {item.parent_phone ? (
                            <div>
                              <div className="font-semibold text-[#20283A]">{item.parent_name || 'Parent'}</div>
                              <div className="text-[10px] text-[#718096] font-mono mt-0.5">{item.parent_phone}</div>
                            </div>
                          ) : (
                            <span className="text-[#718096] text-[10px] italic">Confidential</span>
                          )}
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-1.5 text-[#20283A]">
                            <Send className="w-3 h-3 text-[#718096]" />
                            <span className="font-bold">{item.reminders_sent}</span>
                            <span className="text-[10px] text-[#718096]">sent</span>
                          </div>
                          {item.last_reminder_date && (
                            <div className="text-[10px] text-[#718096] mt-0.5">
                              Last: {formatDate(item.last_reminder_date)}
                            </div>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <Button
                            size="sm"
                            onClick={() => navigate(`/fee-ledger?student_id=${item.student_id}`)}
                            className="text-[11px] py-1 px-3 flex items-center gap-1 ml-auto"
                          >
                            <span>Ledger</span>
                            <ArrowRight className="w-3 h-3" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Admin Simulation Modal */}
      {simModalOpen && (
        <Modal
          open={simModalOpen}
          onClose={() => { setSimModalOpen(false); setSimResults(null); }}
          title="Automated Milestone Engine Simulation"
          size="lg"
        >
          <div className="space-y-4">
            <div className="bg-[#EEF5FB] border border-[#D4E6F4] rounded-2xl p-4 text-xs text-[#36688F] leading-relaxed">
              <strong>Dry-Run Mode:</strong> Simulates statutory milestone evaluation (-7d, -3d, 0d, +1d, +7d, +30d) for any target date without creating real reminders or duplicate database records.
            </div>

            <div className="flex items-center gap-3">
              <label className="text-xs font-semibold text-[#20283A]">Target Simulation Date:</label>
              <input
                type="date"
                value={simDate}
                onChange={e => setSimDate(e.target.value)}
                className="border border-[#E3E6E9] rounded-xl px-3 py-1.5 text-xs outline-none focus:border-[#E95435] bg-white font-medium"
              />
              <Button
                size="sm"
                onClick={handleTriggerSimTest}
                disabled={simLoading}
                className="text-xs flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${simLoading ? 'animate-spin' : ''}`} />
                Run Test Scan
              </Button>
            </div>

            {simResults && (
              <div className="space-y-3 pt-2">
                <div className="grid grid-cols-3 gap-2.5 text-center text-xs">
                  <div className="bg-[#FAFAFA] border border-[#E3E6E9] rounded-xl p-3">
                    <div className="font-bold text-[#20283A] text-lg tabular-nums">{simResults.active_instalments_scanned}</div>
                    <div className="text-[10px] text-[#718096] uppercase font-semibold mt-0.5">Scanned</div>
                  </div>
                  <div className="bg-[#FDF1ED] border border-[#F8D2C8] rounded-xl p-3">
                    <div className="font-bold text-[#E95435] text-lg tabular-nums">{simResults.milestones_triggered}</div>
                    <div className="text-[10px] text-[#E95435] uppercase font-semibold mt-0.5">Triggers</div>
                  </div>
                  <div className="bg-[#FDF2F2] border border-[#F9CACA] rounded-xl p-3">
                    <div className="font-bold text-[#BA2525] text-lg tabular-nums">{simResults.escalations?.length || 0}</div>
                    <div className="text-[10px] text-[#BA2525] uppercase font-semibold mt-0.5">Escalations</div>
                  </div>
                </div>

                {simResults.triggers && simResults.triggers.length > 0 ? (
                  <div className="border border-[#E3E6E9] rounded-2xl max-h-60 overflow-y-auto divide-y divide-[#E3E6E9] text-xs">
                    {simResults.triggers.map((trig: any, idx: number) => (
                      <div key={idx} className="p-3 hover:bg-[#FAFAFA]">
                        <div className="flex items-center justify-between font-bold text-[#20283A]">
                          <span>{trig.student_name} ({trig.student_id})</span>
                          <span className="text-[#E95435]">{trig.stage_label}</span>
                        </div>
                        <div className="text-[11px] text-[#718096] mt-0.5">
                          Due: {trig.due_date} · Balance: ₹{trig.remaining_balance} · Centre: {trig.centre_name}
                        </div>
                        <div className="text-[10px] text-[#718096] mt-1 bg-[#EEF0F1] px-2 py-0.5 rounded font-mono inline-block">
                          {trig.event_key}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 text-center text-xs text-[#718096] bg-[#FAFAFA] rounded-2xl border border-[#E3E6E9]">
                    No statutory milestones align with simulation date ({simDate}).
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end pt-3 border-t border-[#E3E6E9]">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setSimModalOpen(false); setSimResults(null); }}
              >
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
