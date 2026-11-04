import React, { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Sidebar, TopNav } from './Sidebar';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Bell, Search, ChevronDown, X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { cn } from '../../utils/helpers';
import { NotificationCenter } from '../notifications/NotificationCenter';

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [notifOpen, setNotifOpen] = useState(false);
  const { notifications, dismissNotification, selectedCentre, setSelectedCentre } = useApp();
  const { user } = useAuth();
  const navigate = useNavigate();

  const allowedCentres = (user?.role === 'accounts' && user.centreName)
    ? [user.centreName]
    : ['All Centres', 'Jaipur Main', 'Jaipur West', 'Kota', 'Ajmer'];

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/students?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
    }
  };

  const notifIcons = {
    success: <CheckCircle className="w-4 h-4 text-emerald-500" />,
    info: <Info className="w-4 h-4 text-blue-500" />,
    warning: <AlertTriangle className="w-4 h-4 text-amber-500" />,
    error: <AlertCircle className="w-4 h-4 text-red-500" />,
  };

  const unread = notifications.length;

  const rightSlot = (
    <div className="flex items-center gap-2">
      {/* Search */}
      <form onSubmit={handleSearch} className="hidden sm:flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-md px-3 py-1.5 text-sm">
        <Search className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
        <input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search students…"
          className="bg-transparent outline-none text-slate-900 placeholder:text-slate-400 text-xs w-36"
        />
      </form>

      {/* Centre selector */}
      <div className="relative hidden md:flex items-center gap-1.5 border border-slate-200 rounded-md px-3 py-1.5 text-xs text-slate-700 bg-white hover:bg-slate-50">
        {allowedCentres.length === 1 ? (
          <span className="font-medium text-slate-800 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 inline-block"></span>
            {allowedCentres[0]}
          </span>
        ) : (
          <>
            <select
              value={selectedCentre}
              onChange={e => setSelectedCentre(e.target.value)}
              className="bg-transparent outline-none appearance-none pr-4 cursor-pointer text-xs"
            >
              {allowedCentres.map(c => <option key={c}>{c}</option>)}
            </select>
            <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 pointer-events-none" />
          </>
        )}
      </div>

      {/* Notifications */}
      <NotificationCenter align="right" />

      {/* User avatar */}
      <div className="w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center">
        <span className="text-indigo-700 text-xs font-semibold">AE</span>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main area — offset by sidebar on large screens */}
      <div className="flex-1 flex flex-col lg:ml-60 min-w-0">
        <TopNav
          title="FeeFlow"
          onMenuClick={() => setSidebarOpen(true)}
          rightSlot={rightSlot}
        />

        {/* Toast notifications */}
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
          {notifications.slice(0, 3).map(n => (
            <div
              key={n.id}
              className={cn(
                'pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-lg shadow-lg border text-sm max-w-xs',
                n.type === 'success' && 'bg-emerald-50 border-emerald-200 text-emerald-900',
                n.type === 'error' && 'bg-red-50 border-red-200 text-red-900',
                n.type === 'warning' && 'bg-amber-50 border-amber-200 text-amber-900',
                n.type === 'info' && 'bg-blue-50 border-blue-200 text-blue-900',
              )}
            >
              {notifIcons[n.type]}
              <div className="flex-1">
                <p className="font-medium text-xs">{n.title}</p>
                <p className="text-xs opacity-80 mt-0.5">{n.message}</p>
              </div>
              <button onClick={() => dismissNotification(n.id)} className="opacity-50 hover:opacity-100">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>

        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

