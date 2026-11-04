import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, Check, CheckCheck, X, RefreshCw, AlertCircle,
  CheckCircle2, XCircle, Clock, ShieldAlert, CreditCard,
  Filter, Calendar, ExternalLink
} from 'lucide-react';
import { api } from '../../utils/api';
import type { NotificationItem } from '../../types';
import { useAuth } from '../../context/AuthContext';

interface NotificationCenterProps {
  align?: 'left' | 'right';
  className?: string;
}

export function NotificationCenter({ align = 'right', className = '' }: NotificationCenterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [category, setCategory] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('');
  const [isFullView, setIsFullView] = useState(false);

  const { user } = useAuth();
  const navigate = useNavigate();
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await api.getUnreadNotificationCount();
      setUnreadCount(res.unread_count);
    } catch {
      // offline or unauthenticated fallback
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getNotifications({
        unread_only: unreadOnly,
        category: category !== 'all' ? category : undefined,
        from_date: dateFilter || undefined,
        limit: 50
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
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000); // 30s poll
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen, fetchNotifications]);

  // Click outside listener
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen && !isFullView) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, isFullView]);

  const handleMarkAsRead = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await api.markNotificationRead(id);
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n))
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
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
      console.error('Failed to mark all notifications as read:', err);
    }
  };

  const handleNotificationClick = (notif: NotificationItem) => {
    if (!notif.is_read) {
      handleMarkAsRead(notif.id);
    }
    setIsOpen(false);
    setIsFullView(false);

    // Deep navigation based on entity and role
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
        return <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
      case 'PAYMENT_FAILED':
      case 'PAYMENT_CANCELLED':
        return <XCircle className="w-4 h-4 text-rose-600" />;
      case 'UNMATCHED_PAYMENT':
        return <CreditCard className="w-4 h-4 text-amber-600" />;
      case 'FEE_UPCOMING':
        return <Clock className="w-4 h-4 text-blue-600" />;
      case 'FEE_OVERDUE':
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      case 'REFUND_REQUESTED':
      case 'REFUND_APPROVED':
      case 'REFUND_PROCESSED':
        return <RefreshCw className="w-4 h-4 text-purple-600" />;
      case 'REFUND_REJECTED':
        return <XCircle className="w-4 h-4 text-slate-500" />;
      case 'HIGH_RISK_DROPOUT':
        return <ShieldAlert className="w-4 h-4 text-rose-700" />;
      default:
        return <Bell className="w-4 h-4 text-indigo-600" />;
    }
  };

  const formatTimestamp = (iso: string) => {
    try {
      const d = new Date(iso);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    } catch {
      return iso;
    }
  };

  const categories = [
    { id: 'all', label: 'All' },
    { id: 'payments', label: 'Payments' },
    { id: 'refunds', label: 'Refunds' },
    { id: 'fees', label: 'Fees' },
    ...(user?.role === 'accounts'
      ? [{ id: 'risk', label: 'Risk & Ops' }]
      : [])
  ];

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Bell Trigger Button */}
      <button
        onClick={() => setIsOpen(prev => !prev)}
        className="relative p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors focus:outline-hidden"
        title="Alerts & Notifications"
        aria-label="Alerts & Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[18px] h-[18px] bg-rose-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 shadow-xs animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Popover / Dropdown Menu */}
      {isOpen && (
        <>
          {/* Overlay for mobile modal mode */}
          {isFullView && (
            <div
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4"
              onClick={() => setIsFullView(false)}
            >
              <div
                className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
                onClick={e => e.stopPropagation()}
              >
                {/* Modal Header */}
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                  <div className="flex items-center gap-2">
                    <Bell className="w-5 h-5 text-indigo-600" />
                    <h2 className="text-base font-bold text-slate-900">Notifications & Alerts Centre</h2>
                    {unreadCount > 0 && (
                      <span className="bg-indigo-100 text-indigo-700 text-xs px-2 py-0.5 rounded-full font-semibold">
                        {unreadCount} unread
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {unreadCount > 0 && (
                      <button
                        onClick={handleMarkAllAsRead}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1 bg-white border border-slate-200 px-2.5 py-1 rounded-md shadow-2xs hover:bg-slate-50 transition-colors"
                      >
                        <CheckCheck className="w-3.5 h-3.5" /> Mark all read
                      </button>
                    )}
                    <button
                      onClick={() => setIsFullView(false)}
                      className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Filters */}
                <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs bg-white">
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                    {categories.map(cat => (
                      <button
                        key={cat.id}
                        onClick={() => setCategory(cat.id)}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                          category === cat.id
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 cursor-pointer text-slate-600 select-none">
                      <input
                        type="checkbox"
                        checked={unreadOnly}
                        onChange={e => setUnreadOnly(e.target.checked)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                      />
                      <span>Unread only</span>
                    </label>

                    <div className="flex items-center gap-1 border border-slate-200 rounded-md px-2 py-0.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <input
                        type="date"
                        value={dateFilter}
                        onChange={e => setDateFilter(e.target.value)}
                        className="text-xs bg-transparent outline-none text-slate-700"
                        title="Filter by date"
                      />
                    </div>
                  </div>
                </div>

                {/* Full view list */}
                <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-2">
                  {loading ? (
                    <div className="py-12 text-center text-slate-400 text-sm flex flex-col items-center gap-2">
                      <RefreshCw className="w-5 h-5 animate-spin text-indigo-600" />
                      <span>Loading notifications...</span>
                    </div>
                  ) : notifications.length === 0 ? (
                    <div className="py-16 text-center text-slate-400 text-sm flex flex-col items-center gap-2">
                      <CheckCircle2 className="w-8 h-8 text-slate-300" />
                      <span>No notifications found</span>
                    </div>
                  ) : (
                    notifications.map(notif => (
                      <div
                        key={notif.id}
                        onClick={() => handleNotificationClick(notif)}
                        className={`p-3.5 rounded-xl cursor-pointer transition-colors flex items-start gap-3.5 ${
                          notif.is_read ? 'bg-white hover:bg-slate-50' : 'bg-indigo-50/40 hover:bg-indigo-50/70'
                        }`}
                      >
                        <div className="p-2 rounded-lg bg-white border border-slate-100 shadow-2xs mt-0.5">
                          {getEventIcon(notif.event_type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="text-sm font-semibold text-slate-900 truncate">
                              {notif.title}
                            </h4>
                            <span className="text-[11px] text-slate-400 flex-shrink-0">
                              {formatTimestamp(notif.created_at)}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 mt-1 line-clamp-2 leading-relaxed">
                            {notif.message}
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-[10px] font-medium bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md border border-slate-200">
                              {notif.event_type.replace(/_/g, ' ')}
                            </span>
                            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md border ${
                              notif.delivery_status === 'delivered'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}>
                              {notif.channel.toUpperCase()} {notif.delivery_status === 'simulated' ? '(Simulated)' : ''}
                            </span>
                          </div>
                        </div>
                        {!notif.is_read && (
                          <button
                            onClick={e => handleMarkAsRead(notif.id, e)}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-md border border-transparent hover:border-slate-200 transition-colors"
                            title="Mark as read"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Regular Dropdown Popover */}
          {!isFullView && (
            <div
              className={`absolute top-full mt-2 w-84 sm:w-96 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden ${
                align === 'right' ? 'right-0' : 'left-0'
              }`}
            >
              {/* Dropdown Header */}
              <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80 backdrop-blur-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-slate-900">Notifications</span>
                  {unreadCount > 0 && (
                    <span className="bg-rose-100 text-rose-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                      {unreadCount} new
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllAsRead}
                      className="text-[11px] text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1 px-1.5 py-0.5 rounded-md hover:bg-indigo-50 transition-colors"
                      title="Mark all as read"
                    >
                      <CheckCheck className="w-3.5 h-3.5" /> Mark all read
                    </button>
                  )}
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded-md"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Category tabs */}
              <div className="px-3 py-2 border-b border-slate-100 flex items-center gap-1 overflow-x-auto text-[11px] bg-white scrollbar-none">
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setCategory(cat.id)}
                    className={`px-2.5 py-1 rounded-full font-medium whitespace-nowrap transition-colors ${
                      category === cat.id
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* List Container */}
              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                {loading ? (
                  <div className="py-10 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-indigo-600" />
                    <span>Loading alerts...</span>
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="py-10 text-center text-slate-400 text-xs flex flex-col items-center gap-1.5">
                    <CheckCircle2 className="w-6 h-6 text-slate-300" />
                    <span>All caught up! No notifications.</span>
                  </div>
                ) : (
                  notifications.map(notif => (
                    <div
                      key={notif.id}
                      onClick={() => handleNotificationClick(notif)}
                      className={`px-4 py-3 cursor-pointer transition-colors flex items-start gap-3 ${
                        notif.is_read ? 'bg-white hover:bg-slate-50' : 'bg-indigo-50/30 hover:bg-indigo-50/60'
                      }`}
                    >
                      <div className="p-1.5 rounded-lg bg-white border border-slate-100 shadow-2xs mt-0.5 flex-shrink-0">
                        {getEventIcon(notif.event_type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <h4 className="text-xs font-semibold text-slate-900 truncate">
                            {notif.title}
                          </h4>
                          {!notif.is_read && (
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 flex-shrink-0" />
                          )}
                        </div>
                        <p className="text-[11px] text-slate-600 mt-0.5 line-clamp-2 leading-relaxed">
                          {notif.message}
                        </p>
                        <div className="flex items-center justify-between mt-1.5 text-[10px] text-slate-400">
                          <span>{formatTimestamp(notif.created_at)}</span>
                          <span className={`px-1.5 py-0.2 rounded-xs border font-medium ${
                            notif.delivery_status === 'delivered'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}>
                            {notif.channel} {notif.delivery_status === 'simulated' ? '• sim' : ''}
                          </span>
                        </div>
                      </div>
                      {!notif.is_read && (
                        <button
                          onClick={e => handleMarkAsRead(notif.id, e)}
                          className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-white rounded transition-colors flex-shrink-0 mt-0.5"
                          title="Mark read"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Dropdown Footer: Full View Link */}
              <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs">
                <button
                  onClick={() => setIsFullView(true)}
                  className="text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1 hover:underline"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Full Notifications Page
                </button>
                <button
                  onClick={fetchNotifications}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
                  title="Refresh"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
