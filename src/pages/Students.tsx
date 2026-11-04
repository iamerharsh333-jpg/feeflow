import { useState, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatDate } from '../utils/helpers';
import { Badge, Button, Card, Input, Select, Table, Drawer, Modal, EmptyState } from '../components/ui';
import type { Student, FeeStatus, Centre, Course } from '../types';
import { api } from '../utils/api';
import { Search, Plus, Eye, Phone, Mail, ChevronLeft, ChevronRight, User, BookOpen, AlertCircle } from 'lucide-react';

const PAGE_SIZE = 10;

const COURSE_OPTIONS = [
  { value: '', label: 'All Courses' },
  { value: 'JEE 2027', label: 'JEE 2027' },
  { value: 'JEE 2026', label: 'JEE 2026' },
  { value: 'NEET 2027', label: 'NEET 2027' },
  { value: 'NEET 2026', label: 'NEET 2026' },
  { value: 'Foundation', label: 'Foundation' },
];
const CENTRE_OPTIONS = [
  { value: '', label: 'All Centres' },
  { value: 'Jaipur Main', label: 'Jaipur Main' },
  { value: 'Jaipur West', label: 'Jaipur West' },
  { value: 'Kota', label: 'Kota' },
  { value: 'Ajmer', label: 'Ajmer' },
];
const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'Paid', label: 'Paid' },
  { value: 'Partially Paid', label: 'Partially Paid' },
  { value: 'Overdue', label: 'Overdue' },
  { value: 'Pending', label: 'Pending' },
];

const CENTRE_ID_MAP: Record<string, number> = {
  'Jaipur Main': 1,
  'Jaipur West': 2,
  'Kota': 3,
  'Ajmer': 4,
};

export default function Students() {
  const { students, addNotification, refreshData, backendConnected } = useApp();
  const [searchParams] = useSearchParams();

  const [q, setQ] = useState(searchParams.get('q') ?? '');
  const [centreFilter, setCentreFilter] = useState('');
  const [courseFilter, setCourseFilter] = useState(searchParams.get('course') ?? '');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') ?? '');
  const [page, setPage] = useState(1);
  const [drawerStudent, setDrawerStudent] = useState<Student | null>(null);
  const [addOpen, setAddOpen] = useState(searchParams.get('action') === 'add');

  const filtered = useMemo(() => {
    return students.filter(s => {
      const matchQ = !q || s.name.toLowerCase().includes(q.toLowerCase()) || s.id.toLowerCase().includes(q.toLowerCase()) || s.rollNumber.toLowerCase().includes(q.toLowerCase());
      const matchCentre = !centreFilter || s.centre === centreFilter;
      const matchCourse = !courseFilter || s.course.toLowerCase().includes(courseFilter.toLowerCase());
      const matchStatus = !statusFilter || s.feeStatus === statusFilter;
      return matchQ && matchCentre && matchCourse && matchStatus;
    });
  }, [students, q, centreFilter, courseFilter, statusFilter]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-slate-900">Students Directory</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {filtered.length} students enrolled · {backendConnected ? 'Live database synchronized' : 'Local demonstration mode'}
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)} size="sm">
          <Plus className="w-3.5 h-3.5" /> Add Student
        </Button>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-md px-3 py-2 flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <input
              value={q}
              onChange={e => { setQ(e.target.value); setPage(1); }}
              placeholder="Search by name, student ID or roll number…"
              className="bg-transparent text-sm text-slate-900 placeholder:text-slate-400 outline-none flex-1 min-w-0"
            />
          </div>
          <Select
            options={CENTRE_OPTIONS}
            value={centreFilter}
            onChange={e => { setCentreFilter(e.target.value); setPage(1); }}
            className="min-w-[130px]"
          />
          <Select
            options={COURSE_OPTIONS}
            value={courseFilter}
            onChange={e => { setCourseFilter(e.target.value); setPage(1); }}
            className="min-w-[130px]"
          />
          <Select
            options={STATUS_OPTIONS}
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            className="min-w-[130px]"
          />
        </div>
      </Card>

      {/* Table */}
      <Card>
        {paginated.length === 0 ? (
          <EmptyState
            icon={<User className="w-10 h-10" />}
            title="No students found"
            description="Try adjusting your search or filter criteria."
          />
        ) : (
          <Table headers={['Student', 'Course / Batch', 'Centre', 'Parent Contact', 'Fee Status', 'Outstanding', 'Actions']}>
            {paginated.map(s => (
              <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3">
                  <p className="text-sm font-semibold text-slate-900">{s.name}</p>
                  <p className="text-xs text-slate-400 font-mono">{s.id} · {s.rollNumber}</p>
                </td>
                <td className="px-4 py-3">
                  <p className="text-sm text-slate-700">{s.course}</p>
                  <p className="text-xs text-slate-400">{s.batch} batch</p>
                </td>
                <td className="px-4 py-3 text-sm text-slate-700">{s.centre}</td>
                <td className="px-4 py-3">
                  <p className="text-sm text-slate-700">{s.parentName}</p>
                  <p className="text-xs text-slate-400">{s.parentPhone}</p>
                </td>
                <td className="px-4 py-3">
                  <Badge status={s.feeStatus} />
                </td>
                <td className="px-4 py-3">
                  <span className={`text-sm font-semibold ${s.outstanding > 0 ? (s.feeStatus === 'Overdue' ? 'text-red-600' : 'text-amber-600') : 'text-emerald-600'}`}>
                    {formatCurrency(s.outstanding)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <Link
                      to={`/fee-ledger?student_id=${s.id}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-md transition-colors"
                      title="Open complete student financial ledger"
                    >
                      <BookOpen className="w-3 h-3" /> Ledger
                    </Link>
                    <Button variant="ghost" size="sm" onClick={() => setDrawerStudent(s)} className="text-xs px-2 py-1">
                      <Eye className="w-3 h-3" /> View
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
            <p className="text-xs text-slate-500">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
            </p>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              <span className="text-xs text-slate-500 px-2">Page {page} of {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Student Drawer */}
      <Drawer open={!!drawerStudent} onClose={() => setDrawerStudent(null)} title={drawerStudent?.name ?? ''}>
        {drawerStudent && <StudentDetail student={drawerStudent} />}
      </Drawer>

      {/* Add Student Modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Enrol New Student" size="lg">
        <AddStudentForm
          onClose={() => setAddOpen(false)}
          onSuccess={() => {
            setAddOpen(false);
            refreshData();
          }}
        />
      </Modal>
    </div>
  );
}

function StudentDetail({ student: s }: { student: Student }) {
  return (
    <div className="space-y-5">
      <div className="bg-slate-50 rounded-lg p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
            <span className="text-indigo-700 font-semibold text-sm">{s.name.charAt(0)}</span>
          </div>
          <div>
            <p className="font-semibold text-slate-900">{s.name}</p>
            <p className="text-xs text-slate-500">{s.id} · Roll: {s.rollNumber}</p>
          </div>
          <div className="ml-auto"><Badge status={s.feeStatus} /></div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {[
            ['Course', s.course],
            ['Batch', s.batch],
            ['Centre', s.centre],
            ['Enrolled', formatDate(s.enrollmentDate)],
            ['Attendance', `${s.attendancePercent}%`],
            ['Score Trend', s.testScoresTrend],
          ].map(([k, v]) => (
            <div key={k}>
              <span className="text-slate-400">{k}</span>
              <p className="text-slate-800 font-medium mt-0.5">{v}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Direct Ledger Link Button */}
      <Link
        to={`/fee-ledger?student_id=${s.id}`}
        className="w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-xs"
      >
        <BookOpen className="w-4 h-4" /> Open Full Financial Ledger
      </Link>

      <div>
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Parent Contact</h3>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-slate-700">
            <User className="w-3.5 h-3.5 text-slate-400" /> {s.parentName}
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-700">
            <Phone className="w-3.5 h-3.5 text-slate-400" /> {s.parentPhone}
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-700">
            <Mail className="w-3.5 h-3.5 text-slate-400" /> {s.parentEmail || 'Not registered'}
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Fee Summary</h3>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total Fee', value: formatCurrency(s.totalFee), color: 'text-slate-900' },
            { label: 'Paid', value: formatCurrency(s.amountPaid), color: 'text-emerald-600' },
            { label: 'Outstanding', value: formatCurrency(s.outstanding), color: s.outstanding > 0 ? 'text-red-600' : 'text-emerald-600' },
          ].map(f => (
            <div key={f.label} className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs text-slate-400">{f.label}</p>
              <p className={`text-sm font-semibold mt-0.5 ${f.color}`}>{f.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Instalment Schedule</h3>
        <div className="space-y-2">
          {s.instalments.map(ins => (
            <div key={ins.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              <div>
                <p className="text-xs font-medium text-slate-700">Instalment {ins.number}</p>
                <p className="text-xs text-slate-400">Due: {formatDate(ins.dueDate)}</p>
                {ins.paidDate && <p className="text-xs text-emerald-600">Paid: {formatDate(ins.paidDate)}</p>}
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-slate-900">{formatCurrency(ins.amount)}</p>
                {ins.paid < ins.amount && ins.paid > 0 && (
                  <p className="text-xs text-amber-600">Paid: {formatCurrency(ins.paid)}</p>
                )}
                <Badge status={ins.status} className="mt-1" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AddStudentForm({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { addNotification, backendConnected } = useApp();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    const name = (fd.get('name') as string)?.trim();
    const rollNumber = (fd.get('rollNumber') as string)?.trim() || `JEE27-MOR-${Math.floor(1000 + Math.random() * 9000)}`;
    const studentId = `STU-${Math.floor(1000 + Math.random() * 9000)}`;
    const course = (fd.get('course') as string) || 'JEE 2027';
    const batch = (fd.get('batch') as string) || 'Morning';
    const centreName = (fd.get('centre') as string) || 'Jaipur Main';
    const centreId = CENTRE_ID_MAP[centreName] || 1;
    const totalFee = parseFloat(fd.get('totalFee') as string) || 120000;
    const parentName = (fd.get('parentName') as string)?.trim() || 'Parent of ' + name;
    const parentPhone = (fd.get('parentPhone') as string)?.trim() || '9876543210';
    const parentEmail = (fd.get('parentEmail') as string)?.trim() || undefined;

    try {
      if (backendConnected) {
        await api.createStudent({
          id: studentId,
          roll_number: rollNumber,
          name,
          centre_id: centreId,
          course,
          batch,
          parent_name: parentName,
          parent_phone: parentPhone,
          parent_email: parentEmail,
          total_fee: totalFee,
          instalment_count: 4,
        });
      }

      addNotification({
        type: 'success',
        title: 'Student Enrolled',
        message: `${name} (${studentId}) registered with 4 statutory instalments.`,
      });
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to enrol student. Please check input data.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-5 space-y-4">
      <div className="bg-slate-50 border border-slate-200 rounded-md px-3.5 py-2.5 text-xs text-slate-600">
        Registering a student initializes their profile in the database and automatically structures 4 statutory fee instalments with due dates.
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-md text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Input label="Student Name" name="name" placeholder="Full name" required />
        <Input label="Roll Number" name="rollNumber" placeholder="e.g. JEE27-MOR-1005" />
        <Select label="Course" name="course" options={COURSE_OPTIONS.slice(1)} />
        <Select label="Batch" name="batch" options={[{ value: 'Morning', label: 'Morning' }, { value: 'Evening', label: 'Evening' }, { value: 'Weekend', label: 'Weekend' }]} />
        <Select label="Centre" name="centre" options={CENTRE_OPTIONS.slice(1)} />
        <Input label="Total Course Fee (₹)" name="totalFee" type="number" defaultValue="120000" required />
        <Input label="Parent Name" name="parentName" placeholder="Parent / Guardian name" required />
        <Input label="Parent Phone" name="parentPhone" type="tel" placeholder="98XXXXXXXX" required />
        <Input label="Parent Email" name="parentEmail" type="email" placeholder="email@example.com" />
      </div>

      <div className="flex gap-3 justify-end pt-2 border-t">
        <Button variant="outline" type="button" onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Enrolling…' : 'Enrol Student & Generate Instalments'}
        </Button>
      </div>
    </form>
  );
}

