import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, Check, CheckCheck, RefreshCw, AlertCircle,
  CheckCircle2, XCircle, Clock, ShieldAlert, CreditCard,
  Calendar
} from 'lucide-react';
import { api } from '../utils/api';
import type { NotificationItem } from '../types';
import { useAuth } from '../context/AuthContext';
import { Card, Button } from '../components/ui';

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [category, setCategory] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('');

  const { user } = useAuth();
  const navigate = useNavigate();

  const isStaff = user?.role === 'accounts' || (user as any)?.role === 'accounts_executive' || (user as any)?.role === 'admin' || (user as any)?.role === 'centre_manager';

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getNotifications({
        unread_only: unreadOnly,
        category: category !== 'all' ? category : undefined,
        from_date: dateFilter || undefined,
        limit: 100
      });
      setNotifications(res || []);
      const unread = (res || []).filter((n: NotificationItem) => !n.is_read).length;
      if (!unreadOnly) {
        setUnreadCount(unread);
      }
    } catch {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, [unreadOnly, category, dateFilter]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleMarkAsRead = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await api.markNotificationRead(id);
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n))
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark read:', err);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setNotifications(prev =>
        prev.map(n => ({ ...n, is_read: true, read_at: new Date().toISOString() }))
      );
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all read:', err);
    }
  };

  const handleRetryNotification = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRetrying(id);
    try {
      const updated = await api.retryNotification(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, delivery_status: updated.delivery_status || 'delivered' } : n));
    } catch (err) {
      console.error('Failed to retry notification delivery:', err);
    } finally {
      setRetrying(null);
    }
  };

  const handleRetryAllFailed = async () => {
    setLoading(true);
    try {
      await api.retryFailedNotifications();
      fetchNotifications();
    } catch (err) {
      console.error('Failed to retry all failed deliveries:', err);
    } finally {
      setLoading(false);
    }
  };

  const failedCount = notifications.filter(n => n.delivery_status === 'failed').length;

  const handleNotificationClick = (notif: NotificationItem) => {
    if (!notif.is_read) {
      handleMarkAsRead(notif.id);
    }
    if (isStaff) {
      if (notif.event_type.startsWith('STAFF_DEADLINE') || notif.event_type.startsWith('OVERDUE_ESCALATION')) {
        navigate('/deadlines');
      } else if (notif.event_type.startsWith('PAYMENT') || notif.event_type === 'UNMATCHED_PAYMENT') {
        navigate('/payments');
      } else if (notif.event_type.startsWith('REFUND')) {
        navigate('/refund-calculator');
      } else if (notif.event_type === 'HIGH_RISK_DROPOUT') {
        navigate('/risk-counselling');
      } else if (notif.event_type.startsWith('FEE')) {
        navigate('/deadlines');
      }
    } else if (user?.role === 'parent') {
      navigate('/parent/dashboard');
    } else if (user?.role === 'student') {
      navigate('/student/dashboard');
    }
  };

  const getEventIcon = (event: string) => {
    switch (event) {
      case 'PAYMENT_SUCCESS':
        return <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
      case 'PAYMENT_FAILED':
      case 'PAYMENT_CANCELLED':
        return <XCircle className="w-4 h-4 text-[#BA2525]" />;
      case 'UNMATCHED_PAYMENT':
        return <CreditCard className="w-4 h-4 text-amber-600" />;
      case 'STAFF_DEADLINE_ALERT':
      case 'FEE_UPCOMING':
        return <Clock className="w-4 h-4 text-[#79A9D1]" />;
      case 'OVERDUE_ESCALATION':
      case 'OVERDUE_CRITICAL_ESCALATION':
      case 'FEE_OVERDUE':
        return <AlertCircle className="w-4 h-4 text-[#E95435]" />;
      case 'REFUND_REQUESTED':
      case 'REFUND_APPROVED':
      case 'REFUND_PROCESSED':
        return <RefreshCw className="w-4 h-4 text-purple-600" />;
      case 'REFUND_REJECTED':
        return <XCircle className="w-4 h-4 text-[#718096]" />;
      case 'HIGH_RISK_DROPOUT':
        return <ShieldAlert className="w-4 h-4 text-[#BA2525]" />;
      default:
        return <Bell className="w-4 h-4 text-[#718096]" />;
    }
  };

  const categories = [
    { id: 'all', label: 'All Alerts' },
    { id: 'deadlines', label: 'Deadlines & Dues' },
    { id: 'payments', label: 'Payments' },
    { id: 'refunds', label: 'Refunds' },
    ...(isStaff
      ? [{ id: 'risk', label: 'Risk & Ops' }]
      : [])
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-[#20283A] tracking-tight">Alerts & Notifications</h1>
            {unreadCount > 0 && (
              <span className="bg-[#E95435]/10 text-[#E95435] border border-[#E95435]/20 text-xs px-2.5 py-0.5 rounded-full font-bold">
                {unreadCount} unread
              </span>
            )}
          </div>
          <p className="text-xs text-[#718096] mt-1 font-normal">
            Multi-channel operational delivery across instalments, receipts, refunds, and student health.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isStaff && failedCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRetryAllFailed}
              className="flex items-center gap-1.5 text-xs text-[#BA2525] bg-rose-50 border-rose-200 hover:bg-rose-100"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Retry Failed ({failedCount})
            </Button>
          )}
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleMarkAllAsRead}
              className="flex items-center gap-1.5 text-xs text-[#20283A] border-[#E3E6E9] hover:bg-slate-50"
            >
              <CheckCheck className="w-4 h-4 text-emerald-600" /> Mark All as Read
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={fetchNotifications}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-[#20283A] border-[#E3E6E9] hover:bg-slate-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#718096] ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <Card className="p-4 rounded-2xl border border-[#E3E6E9] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setCategory(cat.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                  category === cat.id
                    ? 'bg-[#20283A] text-white shadow-xs'
                    : 'bg-white text-[#718096] border border-[#E3E6E9] hover:bg-slate-50 hover:text-[#20283A]'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-[#20283A] select-none font-medium">
              <input
                type="checkbox"
                checked={unreadOnly}
                onChange={e => setUnreadOnly(e.target.checked)}
                className="rounded border-[#E3E6E9] text-[#20283A] focus:ring-[#20283A] h-4 w-4"
              />
              <span>Unread Only</span>
            </label>

            <div className="flex items-center gap-1.5 border border-[#E3E6E9] rounded-xl px-2.5 py-1.5 bg-white text-xs text-[#20283A]">
              <Calendar className="w-3.5 h-3.5 text-[#718096]" />
              <input
                type="date"
                value={dateFilter}
                onChange={e => setDateFilter(e.target.value)}
                className="bg-transparent outline-none text-xs text-[#20283A]"
              />
              {dateFilter && (
                <button onClick={() => setDateFilter('')} className="text-[#718096] hover:text-[#20283A] text-xs">
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Notifications List */}
      <Card className="divide-y divide-[#E3E6E9] overflow-hidden rounded-2xl border border-[#E3E6E9] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
        {loading ? (
          <div className="py-16 text-center text-[#718096] text-xs flex flex-col items-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-[#718096]" />
            <span>Retrieving live notifications...</span>
          </div>
        ) : notifications.length === 0 ? (
          <div className="py-20 text-center text-xs flex flex-col items-center gap-2">
            <CheckCircle2 className="w-10 h-10 text-[#718096]/40" />
            <span className="font-semibold text-[#20283A]">No notifications match the filter</span>
            <span className="text-[#718096]">All operational alerts for this view are resolved or empty.</span>
          </div>
        ) : (
          notifications.map(notif => (
            <div
              key={notif.id}
              onClick={() => handleNotificationClick(notif)}
              className={`p-4 sm:p-5 flex items-start gap-4 cursor-pointer transition-colors ${
                notif.is_read ? 'bg-white hover:bg-slate-50/70' : 'bg-slate-50/60 hover:bg-slate-100/60'
              }`}
            >
              <div className="p-2.5 rounded-xl bg-white border border-[#E3E6E9] shadow-2xs mt-0.5 flex-shrink-0">
                {getEventIcon(notif.event_type)}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <h3 className="text-sm font-semibold text-[#20283A] truncate">
                      {notif.title}
                    </h3>
                    {!notif.is_read && (
                      <span className="w-2 h-2 rounded-full bg-[#E95435] flex-shrink-0" />
                    )}
                  </div>
                  <span className="text-xs text-[#718096] flex-shrink-0">
                    {new Date(notif.created_at).toLocaleString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>

                <p className="text-xs text-[#718096] mt-1.5 leading-relaxed">
                  {notif.message}
                </p>

                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <span className="text-[10px] font-semibold bg-slate-100 text-[#20283A] px-2.5 py-0.5 rounded-lg border border-[#E3E6E9]">
                    {notif.event_type.replace(/_/g, ' ')}
                  </span>
                  <span className={`text-[10px] font-medium px-2.5 py-0.5 rounded-lg border ${
                    notif.delivery_status === 'delivered'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : notif.delivery_status === 'failed'
                      ? 'bg-rose-50 text-[#BA2525] border-rose-200'
                      : 'bg-blue-50 text-[#20283A] border-blue-200'
                  }`}>
                    Channel: {notif.channel.toUpperCase()} {notif.delivery_status === 'simulated' ? '(Simulated Delivery)' : notif.delivery_status === 'failed' ? '(Delivery Failed)' : '(Delivered)'}
                  </span>
                  {isStaff && notif.delivery_status === 'failed' && (
                    <button
                      onClick={e => handleRetryNotification(notif.id, e)}
                      disabled={retrying === notif.id}
                      className="text-[10px] font-semibold text-[#BA2525] bg-rose-50 hover:bg-rose-100 px-2 py-0.5 rounded border border-rose-200 flex items-center gap-1 transition-colors"
                    >
                      <RefreshCw className={`w-2.5 h-2.5 ${retrying === notif.id ? 'animate-spin' : ''}`} /> Retry
                    </button>
                  )}
                  {notif.related_student_id && (
                    <span className="text-[10px] text-[#718096] bg-white border border-[#E3E6E9] px-2 py-0.5 rounded-lg">
                      Student: {notif.related_student_id}
                    </span>
                  )}
                </div>
              </div>

              {!notif.is_read && (
                <button
                  onClick={e => handleMarkAsRead(notif.id, e)}
                  className="p-1.5 text-[#718096] hover:text-[#20283A] hover:bg-white rounded-lg border border-transparent hover:border-[#E3E6E9] transition-colors flex-shrink-0"
                  title="Mark as read"
                >
                  <Check className="w-4 h-4" />
                </button>
              )}
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
