import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Calendar as CalendarIcon, Clock, AlertCircle, CheckCircle2,
  Filter, Search, ArrowRight, RefreshCw, Send, AlertTriangle,
  ChevronLeft, ChevronRight, Eye, ShieldCheck, PlayCircle, X
} from 'lucide-react';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { Card, Badge, Button } from '../components/ui';

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

  const isParent = user?.role === 'parent';
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
        const params: any = {
          limit: 300,
        };
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

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val);
  };

  // Calendar rendering helper
  const renderCalendar = () => {
    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();

    const days = [];
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="min-h-24 bg-slate-50/50 border border-slate-100 rounded-lg p-1.5" />);
    }

    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayItems = calendarData.get(dateStr) || [];
      const isPast = new Date(dateStr) < new Date(new Date().toDateString());
      const isToday = dateStr === new Date().toISOString().split('T')[0];

      const overdueItems = dayItems.filter(i => i.category === 'overdue');
      const upcomingItems = dayItems.filter(i => i.category !== 'overdue');

      days.push(
        <div
          key={dateStr}
          className={`min-h-24 border rounded-lg p-2 transition-all flex flex-col justify-between ${
            isToday
              ? 'border-indigo-400 bg-indigo-50/20 shadow-2xs'
              : dayItems.length > 0
              ? 'border-slate-200 bg-white hover:border-slate-300'
              : 'border-slate-100 bg-slate-50/30'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold ${isToday ? 'text-indigo-600' : 'text-slate-700'}`}>
              {d}
            </span>
            {isToday && (
              <span className="text-[10px] bg-indigo-600 text-white font-semibold px-1.5 py-0.2 rounded">
                Today
              </span>
            )}
          </div>

          <div className="space-y-1 my-1">
            {overdueItems.length > 0 && (
              <div className="bg-red-50 text-red-700 border border-red-200 text-[10px] font-semibold px-1.5 py-0.5 rounded flex items-center justify-between">
                <span>Overdue</span>
                <span>{overdueItems.length}</span>
              </div>
            )}
            {upcomingItems.length > 0 && (
              <div className="bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-semibold px-1.5 py-0.5 rounded flex items-center justify-between">
                <span>Due</span>
                <span>{upcomingItems.length}</span>
              </div>
            )}
          </div>

          {dayItems.length > 0 ? (
            <span className="text-[10px] text-slate-500 font-medium">
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
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-800">
              {selectedMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
            </h2>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedMonth(new Date(selectedMonth.setMonth(selectedMonth.getMonth() - 1)))}
            >
              <ChevronLeft className="w-4 h-4" />
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
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="text-center text-xs font-semibold text-slate-400 py-1">
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-indigo-600" />
            Payment Deadlines & Statutory Milestones
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Tracking -7d, -3d, due-date, and escalating overdue statutory milestones under Asia/Kolkata timezone.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {(isAdmin || isAccounts) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSimModalOpen(true)}
              className="flex items-center gap-1.5 text-xs text-purple-700 bg-purple-50 border-purple-200 hover:bg-purple-100"
            >
              <PlayCircle className="w-3.5 h-3.5" /> Simulate Engine Cycle
            </Button>
          )}

          <div className="border border-slate-200 rounded-lg p-0.5 bg-slate-100 flex items-center">
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                viewMode === 'table' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Table View
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                viewMode === 'calendar' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Calendar View
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => { fetchSummary(); fetchDeadlines(); }}
            disabled={loading}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* KPI Cards (Hidden for counsellor) */}
      {!isCounsellor && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-4 border-l-4 border-l-red-500 bg-linear-to-br from-red-50/20 to-transparent">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Overdue</span>
              <AlertCircle className="w-4 h-4 text-red-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-red-600">{summary.overdue_count}</span>
              <span className="text-xs font-medium text-slate-500">instalments</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Outstanding: <strong className="text-red-700">{formatCurrency(summary.total_overdue_amount)}</strong>
            </p>
          </Card>

          <Card className="p-4 border-l-4 border-l-amber-500 bg-linear-to-br from-amber-50/20 to-transparent">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Due Today</span>
              <Clock className="w-4 h-4 text-amber-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-amber-600">{summary.due_today_count}</span>
              <span className="text-xs font-medium text-slate-500">instalments</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">Milestone 0d notifications active</p>
          </Card>

          <Card className="p-4 border-l-4 border-l-blue-500 bg-linear-to-br from-blue-50/20 to-transparent">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Due in 3 Days</span>
              <Clock className="w-4 h-4 text-blue-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-blue-600">{summary.due_in_3d_count}</span>
              <span className="text-xs font-medium text-slate-500">instalments</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">Milestone -3d upcoming alerts</p>
          </Card>

          <Card className="p-4 border-l-4 border-l-indigo-500 bg-linear-to-br from-indigo-50/20 to-transparent">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Due in 7 Days</span>
              <CalendarIcon className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-indigo-600">{summary.due_in_7d_count}</span>
              <span className="text-xs font-medium text-slate-500">instalments</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Upcoming: <strong className="text-indigo-700">{formatCurrency(summary.total_upcoming_amount)}</strong>
            </p>
          </Card>
        </div>
      )}

      {/* Filter and Tab Bar */}
      {!isCounsellor && (
        <Card className="p-4">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Category Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
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
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                    activeCategory === tab.id
                      ? 'bg-indigo-600 text-white shadow-xs font-semibold'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-64">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search student, ID, batch..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 outline-none focus:border-indigo-500 bg-white"
                />
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Main Content Area */}
      {isCounsellor ? (
        /* Counsellor Retention Tasks Mode */
        <Card className="p-5">
          <div className="mb-4">
            <h2 className="text-sm font-bold text-slate-900">Assigned Student Retention Follow-ups</h2>
            <p className="text-xs text-slate-500">Counselling deadlines prioritised by dropout risk. Confidential academic view.</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Student</th>
                  <th className="py-2.5 px-3">Batch & Centre</th>
                  <th className="py-2.5 px-3">Risk Level</th>
                  <th className="py-2.5 px-3">Priority</th>
                  <th className="py-2.5 px-3">Follow-up Due Date</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {counsellorTasks.map(t => (
                  <tr key={t.task_id} className="hover:bg-slate-50/60">
                    <td className="py-3 px-3">
                      <div className="font-semibold text-slate-900">{t.student_name}</div>
                      <div className="text-[10px] text-slate-400">ID: {t.student_id}</div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="text-slate-800">{t.batch}</div>
                      <div className="text-[10px] text-slate-500">{t.centre_name}</div>
                    </td>
                    <td className="py-3 px-3">
                      <Badge status={t.risk_level} />
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-semibold text-slate-700">{t.priority}</span>
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-medium text-slate-800">
                        {t.due_date ? new Date(t.due_date).toLocaleDateString('en-IN') : 'No Date'}
                      </div>
                      {t.overdue_days > 0 ? (
                        <div className="text-[10px] font-bold text-red-600">{t.overdue_days}d Overdue</div>
                      ) : (
                        <div className="text-[10px] text-slate-500">{t.days_remaining}d remaining</div>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <Badge status={t.status} />
                    </td>
                    <td className="py-3 px-3">
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
        /* Calendar View */
        <Card className="p-5">
          {renderCalendar()}
        </Card>
      ) : (
        /* Table View */
        <Card className="overflow-hidden">
          {loading ? (
            <div className="py-20 text-center text-slate-400 text-sm flex flex-col items-center gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-indigo-600" />
              <span>Scanning statutory deadline milestones...</span>
            </div>
          ) : filteredDeadlines.length === 0 ? (
            <div className="py-20 text-center text-slate-400 text-sm flex flex-col items-center gap-2">
              <CheckCircle2 className="w-10 h-10 text-slate-300" />
              <span className="font-medium text-slate-700">No deadlines in this category</span>
              <span className="text-xs text-slate-400">All student instalments are up to date under current filter.</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-3.5">Student</th>
                    <th className="py-3 px-3.5">Instalment</th>
                    <th className="py-3 px-3.5">Due Date & Timeline</th>
                    <th className="py-3 px-3.5">Outstanding Balance</th>
                    <th className="py-3 px-3.5">Parent Contact</th>
                    <th className="py-3 px-3.5">Reminders</th>
                    <th className="py-3 px-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredDeadlines.map(item => {
                    const isOverdue = item.category === 'overdue';
                    const isDueToday = item.category === 'due_today';
                    const isDue3d = item.category === 'due_in_3d';

                    return (
                      <tr key={item.instalment_id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-3.5">
                          <div className="font-semibold text-slate-900">{item.student_name}</div>
                          <div className="text-[10px] text-slate-500">ID: {item.student_id} • {item.batch}</div>
                          <div className="text-[10px] text-indigo-600 font-medium">{item.centre_name}</div>
                        </td>

                        <td className="py-3 px-3.5">
                          <div className="font-medium text-slate-800">Instalment #{item.instalment_number}</div>
                          <div className="text-[10px] text-slate-400">Ref: {item.instalment_id}</div>
                          <Badge status={item.status} className="text-[9px] mt-0.5" />
                        </td>

                        <td className="py-3 px-3.5">
                          <div className="font-semibold text-slate-800">
                            {new Date(item.due_date).toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric'
                            })}
                          </div>
                          {isOverdue ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.2 rounded mt-0.5">
                              <AlertCircle className="w-2.5 h-2.5" /> {item.overdue_days} days overdue
                            </span>
                          ) : isDueToday ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded mt-0.5">
                              <Clock className="w-2.5 h-2.5" /> Due Today
                            </span>
                          ) : isDue3d ? (
                            <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 border border-blue-200 px-1.5 py-0.2 rounded mt-0.5">
                              {item.days_remaining} days remaining (-3d milestone)
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-500">
                              {item.days_remaining} days remaining
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-3.5">
                          <div className="font-bold text-slate-900 text-sm">
                            {formatCurrency(item.outstanding_balance)}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Total: {formatCurrency(item.amount)}
                            {item.paid_amount > 0 && ` (Paid: ${formatCurrency(item.paid_amount)})`}
                          </div>
                        </td>

                        <td className="py-3 px-3.5">
                          {item.parent_phone ? (
                            <div>
                              <div className="font-medium text-slate-800">{item.parent_name || 'Parent'}</div>
                              <div className="text-[10px] text-slate-500 font-mono">{item.parent_phone}</div>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[10px] italic">Protected</span>
                          )}
                        </td>

                        <td className="py-3 px-3.5">
                          <div className="flex items-center gap-1 text-slate-700">
                            <Send className="w-3 h-3 text-slate-400" />
                            <span className="font-semibold">{item.reminders_sent}</span>
                            <span className="text-[10px] text-slate-400">sent</span>
                          </div>
                          {item.last_reminder_date && (
                            <div className="text-[10px] text-slate-400">
                              Last: {new Date(item.last_reminder_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-3.5 text-right">
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => navigate(`/fee-ledger?student_id=${item.student_id}`)}
                            className="text-[11px] py-1 px-2.5 flex items-center gap-1 ml-auto"
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
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in-0 zoom-in-95">
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <PlayCircle className="w-5 h-5 text-purple-600" />
                <h3 className="font-bold text-slate-900 text-sm">Automated Milestone Engine Simulation</h3>
              </div>
              <button
                onClick={() => { setSimModalOpen(false); setSimResults(null); }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto flex-1">
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-xs text-purple-800 leading-relaxed">
                <strong>Dry-Run Mode:</strong> Simulates statutory milestone evaluation (-7d, -3d, 0d, +1d, +7d, +30d) for any target date without creating real reminders or duplicate database records.
              </div>

              <div className="flex items-center gap-3">
                <label className="text-xs font-semibold text-slate-700">Target Simulation Date:</label>
                <input
                  type="date"
                  value={simDate}
                  onChange={e => setSimDate(e.target.value)}
                  className="border border-slate-200 rounded-lg px-2.5 py-1 text-xs outline-none focus:border-purple-500 bg-white"
                />
                <Button
                  size="sm"
                  onClick={handleTriggerSimTest}
                  disabled={simLoading}
                  className="bg-purple-600 hover:bg-purple-700 text-white text-xs flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3 h-3 ${simLoading ? 'animate-spin' : ''}`} />
                  Run Test Scan
                </Button>
              </div>

              {simResults && (
                <div className="space-y-3 pt-2">
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-2">
                      <div className="font-bold text-slate-800 text-base">{simResults.active_instalments_scanned}</div>
                      <div className="text-[10px] text-slate-400">Instalments Scanned</div>
                    </div>
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-2">
                      <div className="font-bold text-purple-700 text-base">{simResults.milestones_triggered}</div>
                      <div className="text-[10px] text-purple-600">Triggers Discovered</div>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-2">
                      <div className="font-bold text-amber-700 text-base">{simResults.escalations?.length || 0}</div>
                      <div className="text-[10px] text-amber-600">Staff Escalations</div>
                    </div>
                  </div>

                  {simResults.triggers && simResults.triggers.length > 0 ? (
                    <div className="border border-slate-200 rounded-lg max-h-60 overflow-y-auto divide-y divide-slate-100 text-xs">
                      {simResults.triggers.map((trig: any, idx: number) => (
                        <div key={idx} className="p-2.5 hover:bg-slate-50">
                          <div className="flex items-center justify-between font-semibold text-slate-900">
                            <span>{trig.student_name} ({trig.student_id})</span>
                            <span className="text-purple-600">{trig.stage_label}</span>
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            Due: {trig.due_date} • Remaining: ₹{trig.remaining_balance} • Centre: {trig.centre_name}
                          </div>
                          <div className="text-[10px] text-slate-600 mt-1 bg-slate-100 px-2 py-0.5 rounded font-mono">
                            Event Key: {trig.event_key}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-6 text-center text-xs text-slate-500 bg-slate-50 rounded-lg">
                      No statutory milestones align with the selected simulation date ({simDate}).
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-3 border-t border-slate-100 bg-slate-50 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setSimModalOpen(false); setSimResults(null); }}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
