import { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatDate } from '../utils/helpers';
import { Badge, Button, Card, Modal, Select, StatCard, Table, EmptyState } from '../components/ui';
import type { Reminder } from '../types';
import { Bell, Send, X, Eye, Calendar, RefreshCw } from 'lucide-react';

export default function Reminders() {
  const { reminders, cancelReminder, sendReminder, addNotification } = useApp();
  const [statusFilter, setStatusFilter] = useState('');
  const [previewReminder, setPreviewReminder] = useState<Reminder | null>(null);
  const [lang, setLang] = useState<'en' | 'hi'>('en');

  const filtered = useMemo(() =>
    reminders.filter(r => !statusFilter || r.status === statusFilter),
    [reminders, statusFilter]
  );

  const scheduled = reminders.filter(r => r.status === 'Scheduled').length;
  const sent = reminders.filter(r => r.status === 'Sent').length;
  const failed = reminders.filter(r => r.status === 'Failed').length;
  const cancelled = reminders.filter(r => r.status === 'Cancelled').length;

  const handleSend = async (r: Reminder) => {
    try {
      await sendReminder(r.id);
      addNotification({
        type: 'success',
        title: 'Reminder sent',
        message: `Reminder sent to ${r.parentName} via ${r.channel}.`,
      });
      setPreviewReminder(null);
    } catch (err: any) {
      addNotification({ type: 'error', title: 'Send failed', message: err.message || 'Failed to dispatch reminder' });
    }
  };

  const handleCancel = async (r: Reminder) => {
    try {
      await cancelReminder(r.id);
      addNotification({ type: 'info', title: 'Reminder cancelled', message: `Reminder for ${r.studentName} cancelled.` });
    } catch (err: any) {
      addNotification({ type: 'error', title: 'Action failed', message: err.message || 'Failed to cancel reminder' });
    }
  };

  const channelIcon: Record<string, string> = {
    WhatsApp: '💬', SMS: '📱', Email: '📧', Call: '📞',
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-base font-semibold text-slate-900">Reminders</h1>
        <p className="text-xs text-slate-500 mt-0.5">Fee reminder management · Demo data · No real messages sent</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Scheduled" value={scheduled.toString()} icon={<Calendar className="w-5 h-5" />} accent="indigo" />
        <StatCard label="Sent" value={sent.toString()} icon={<Send className="w-5 h-5" />} accent="green" />
        <StatCard label="Failed" value={failed.toString()} icon={<Bell className="w-5 h-5" />} accent="red" />
        <StatCard label="Cancelled" value={cancelled.toString()} icon={<X className="w-5 h-5" />} />
      </div>

      <Card>
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-4">
          <h2 className="text-sm font-semibold text-slate-900">All Reminders</h2>
          <Select
            options={[
              { value: '', label: 'All Statuses' },
              { value: 'Scheduled', label: 'Scheduled' },
              { value: 'Sent', label: 'Sent' },
              { value: 'Failed', label: 'Failed' },
              { value: 'Cancelled', label: 'Cancelled' },
            ]}
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="w-40"
          />
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon={<Bell className="w-10 h-10" />} title="No reminders found" />
        ) : (
          <Table headers={['Student', 'Parent', 'Outstanding', 'Due Date', 'Channel', 'Scheduled', 'Status', 'Actions']}>
            {filtered.map(r => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <p className="text-sm font-medium text-slate-900">{r.studentName}</p>
                  <p className="text-xs text-slate-400">{r.studentId}</p>
                </td>
                <td className="px-4 py-3 text-sm text-slate-700">{r.parentName}</td>
                <td className="px-4 py-3 text-sm font-semibold text-amber-600">{formatCurrency(r.outstanding)}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{formatDate(r.dueDate)}</td>
                <td className="px-4 py-3 text-sm text-slate-700">
                  {channelIcon[r.channel]} {r.channel}
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">{formatDate(r.scheduledDate)}</td>
                <td className="px-4 py-3"><Badge status={r.status} /></td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setPreviewReminder(r)}>
                      <Eye className="w-3 h-3" /> Preview
                    </Button>
                    {r.status === 'Scheduled' && (
                      <>
                        <Button variant="ghost" size="sm" className="text-indigo-600 hover:bg-indigo-50"
                          onClick={() => { setPreviewReminder(r); }}>
                          <Send className="w-3 h-3" /> Send
                        </Button>
                        <Button variant="ghost" size="sm" className="text-red-500 hover:bg-red-50"
                          onClick={() => handleCancel(r)}>
                          <X className="w-3 h-3" /> Cancel
                        </Button>
                      </>
                    )}
                    {r.status === 'Failed' && (
                      <Button variant="ghost" size="sm" className="text-indigo-600 hover:bg-indigo-50"
                        onClick={() => handleSend(r)}>
                        <Send className="w-3 h-3" /> Retry
                      </Button>
                    )}
                    {r.status === 'Sent' && (
                      <Button variant="ghost" size="sm" className="text-indigo-600 hover:bg-indigo-50"
                        onClick={() => handleSend(r)}>
                        <RefreshCw className="w-3 h-3" /> Resend
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {/* Preview modal */}
      <Modal open={!!previewReminder} onClose={() => setPreviewReminder(null)} title="Reminder Preview" size="lg">
        {previewReminder && (
          <div className="p-5 space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-xs text-amber-700">
              Demo only — clicking Send does not deliver any real WhatsApp, SMS, or email message.
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs text-slate-400">Student</p><p className="font-medium text-slate-900">{previewReminder.studentName}</p></div>
              <div><p className="text-xs text-slate-400">Parent</p><p className="font-medium text-slate-900">{previewReminder.parentName}</p></div>
              <div><p className="text-xs text-slate-400">Channel</p><p className="font-medium text-slate-900">{previewReminder.channel}</p></div>
              <div><p className="text-xs text-slate-400">Outstanding</p><p className="font-semibold text-amber-600">{formatCurrency(previewReminder.outstanding)}</p></div>
            </div>

            {/* Language toggle */}
            <div className="flex gap-2">
              <Button size="sm" variant={lang === 'en' ? 'primary' : 'outline'} onClick={() => setLang('en')}>English</Button>
              <Button size="sm" variant={lang === 'hi' ? 'primary' : 'outline'} onClick={() => setLang('hi')}>हिन्दी</Button>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <p className={`text-sm text-slate-800 leading-relaxed ${lang === 'hi' ? 'font-[system-ui]' : ''}`}>
                {lang === 'en' ? previewReminder.messagePreviewEn : previewReminder.messagePreviewHi}
              </p>
            </div>

            {previewReminder.status === 'Sent' && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2 text-xs text-emerald-700">
                Sent on: {previewReminder.sentAt ? new Date(previewReminder.sentAt).toLocaleString('en-IN') : '—'}
              </div>
            )}

            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setPreviewReminder(null)}>Close</Button>
              {(previewReminder.status === 'Scheduled' || previewReminder.status === 'Failed') && (
                <Button onClick={() => handleSend(previewReminder)}>
                  <Send className="w-3.5 h-3.5" /> Send Demo Reminder
                </Button>
              )}
              {previewReminder.status === 'Scheduled' && (
                <Button variant="danger" onClick={() => { handleCancel(previewReminder); setPreviewReminder(null); }}>
                  <X className="w-3.5 h-3.5" /> Cancel Reminder
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

