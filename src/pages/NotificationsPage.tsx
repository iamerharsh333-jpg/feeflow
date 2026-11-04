import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, Check, CheckCheck, RefreshCw, AlertCircle,
  CheckCircle2, XCircle, Clock, ShieldAlert, CreditCard,
  Calendar, Filter
} from 'lucide-react';
import { api } from '../utils/api';
import type { NotificationItem } from '../types';
import { useAuth } from '../context/AuthContext';
import { Card, Badge, Button } from '../components/ui';

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [category, setCategory] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('');

  const { user } = useAuth();
  const navigate = useNavigate();

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

  const handleNotificationClick = (notif: NotificationItem) => {
    if (!notif.is_read) {
      handleMarkAsRead(notif.id);
    }
    if (user?.role === 'accounts') {
      if (notif.event_type.startsWith('PAYMENT') || notif.event_type === 'UNMATCHED_PAYMENT') {
        navigate('/payments');
      } else if (notif.event_type.startsWith('REFUND')) {
        navigate('/refund-calculator');
      } else if (notif.event_type === 'HIGH_RISK_DROPOUT') {
        navigate('/risk-counselling');
      } else if (notif.event_type.startsWith('FEE')) {
        navigate('/reminders');
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
        return <CheckCircle2 className="w-5 h-5 text-emerald-600" />;
      case 'PAYMENT_FAILED':
      case 'PAYMENT_CANCELLED':
        return <XCircle className="w-5 h-5 text-rose-600" />;
      case 'UNMATCHED_PAYMENT':
        return <CreditCard className="w-5 h-5 text-amber-600" />;
      case 'FEE_UPCOMING':
        return <Clock className="w-5 h-5 text-blue-600" />;
      case 'FEE_OVERDUE':
        return <AlertCircle className="w-5 h-5 text-red-600" />;
      case 'REFUND_REQUESTED':
      case 'REFUND_APPROVED':
      case 'REFUND_PROCESSED':
        return <RefreshCw className="w-5 h-5 text-purple-600" />;
      case 'REFUND_REJECTED':
        return <XCircle className="w-5 h-5 text-slate-500" />;
      case 'HIGH_RISK_DROPOUT':
        return <ShieldAlert className="w-5 h-5 text-rose-700" />;
      default:
        return <Bell className="w-5 h-5 text-indigo-600" />;
    }
  };

  const categories = [
    { id: 'all', label: 'All Alerts' },
    { id: 'payments', label: 'Payments' },
    { id: 'refunds', label: 'Refunds' },
    { id: 'fees', label: 'Fee Dues' },
    ...(user?.role === 'accounts'
      ? [{ id: 'risk', label: 'Risk & Ops' }]
      : [])
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900">Alerts & Notifications Centre</h1>
            {unreadCount > 0 && (
              <span className="bg-rose-100 text-rose-700 text-xs px-2 py-0.5 rounded-full font-bold">
                {unreadCount} unread
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Real-time multi-channel alerts across fee payments, refunds, dues, and student operations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleMarkAllAsRead}
              className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800"
            >
              <CheckCheck className="w-4 h-4" /> Mark All as Read
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={fetchNotifications}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-slate-600"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-600' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setCategory(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  category === cat.id
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 select-none">
              <input
                type="checkbox"
                checked={unreadOnly}
                onChange={e => setUnreadOnly(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
              />
              <span className="font-medium">Unread Only</span>
            </label>

            <div className="flex items-center gap-1.5 border border-slate-200 rounded-lg px-2.5 py-1 bg-white text-xs text-slate-700">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <input
                type="date"
                value={dateFilter}
                onChange={e => setDateFilter(e.target.value)}
                className="bg-transparent outline-none text-xs"
              />
              {dateFilter && (
                <button onClick={() => setDateFilter('')} className="text-slate-400 hover:text-slate-600 text-xs">
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Notifications List */}
      <Card className="divide-y divide-slate-100 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-400 text-sm flex flex-col items-center gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-indigo-600" />
            <span>Loading notifications...</span>
          </div>
        ) : notifications.length === 0 ? (
          <div className="py-20 text-center text-slate-400 text-sm flex flex-col items-center gap-2">
            <CheckCircle2 className="w-10 h-10 text-slate-300" />
            <span className="font-medium text-slate-700">No alerts found</span>
            <span className="text-xs text-slate-400">All notifications match the selected filter criteria.</span>
          </div>
        ) : (
          notifications.map(notif => (
            <div
              key={notif.id}
              onClick={() => handleNotificationClick(notif)}
              className={`p-4 sm:p-5 flex items-start gap-4 cursor-pointer transition-colors ${
                notif.is_read ? 'bg-white hover:bg-slate-50' : 'bg-indigo-50/30 hover:bg-indigo-50/60'
              }`}
            >
              <div className="p-2.5 rounded-xl bg-white border border-slate-100 shadow-2xs mt-0.5 flex-shrink-0">
                {getEventIcon(notif.event_type)}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <h3 className="text-sm font-semibold text-slate-900 truncate">
                      {notif.title}
                    </h3>
                    {!notif.is_read && (
                      <span className="w-2 h-2 rounded-full bg-indigo-600 flex-shrink-0" />
                    )}
                  </div>
                  <span className="text-xs text-slate-400 flex-shrink-0">
                    {new Date(notif.created_at).toLocaleString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>

                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                  {notif.message}
                </p>

                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <span className="text-[10px] font-semibold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md border border-slate-200">
                    {notif.event_type.replace(/_/g, ' ')}
                  </span>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md border ${
                    notif.delivery_status === 'delivered'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}>
                    Channel: {notif.channel.toUpperCase()} {notif.delivery_status === 'simulated' ? '(Simulated Delivery)' : '(Delivered)'}
                  </span>
                  {notif.related_student_id && (
                    <span className="text-[10px] text-slate-500 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-md">
                      Student: {notif.related_student_id}
                    </span>
                  )}
                </div>
              </div>

              {!notif.is_read && (
                <button
                  onClick={e => handleMarkAsRead(notif.id, e)}
                  className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-md border border-transparent hover:border-slate-200 transition-colors flex-shrink-0"
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
