import React, { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Sidebar, TopNav } from './Sidebar';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Search, ChevronDown, X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { cn } from '../../utils/helpers';
import { NotificationCenter } from '../notifications/NotificationCenter';

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
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
    success: <CheckCircle className="w-4 h-4 text-[#1B7043]" />,
    info: <Info className="w-4 h-4 text-[#36688F]" />,
    warning: <AlertTriangle className="w-4 h-4 text-[#9A4C07]" />,
    error: <AlertCircle className="w-4 h-4 text-[#BA2525]" />,
  };

  const rightSlot = (
    <div className="flex items-center gap-2.5">
      {/* Global Search */}
      <form onSubmit={handleSearch} className="hidden sm:flex items-center gap-2 bg-[#FAFAFA] border border-[#E3E6E9] rounded-xl px-3 py-1.5 focus-within:border-[#E95435] transition-all">
        <Search className="w-3.5 h-3.5 text-[#718096] flex-shrink-0" />
        <input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search students, roll no..."
          className="bg-transparent outline-none text-[#20283A] placeholder:text-[#718096] text-xs w-44 font-medium"
        />
      </form>

      {/* Centre selector */}
      <div className="relative hidden md:flex items-center gap-1.5 border border-[#E3E6E9] rounded-xl px-3 py-1.5 text-xs text-[#20283A] bg-[#FAFAFA] hover:bg-white hover:border-[#CCD1D7] transition-all">
        {allowedCentres.length === 1 ? (
          <span className="font-semibold text-[#20283A] flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#E95435] inline-block" />
            {allowedCentres[0]}
          </span>
        ) : (
          <>
            <select
              value={selectedCentre}
              onChange={e => setSelectedCentre(e.target.value)}
              className="bg-transparent outline-none appearance-none pr-5 cursor-pointer text-xs font-semibold text-[#20283A]"
            >
              {allowedCentres.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-[#718096] absolute right-2.5 pointer-events-none" />
          </>
        )}
      </div>

      {/* Notification Bell */}
      <NotificationCenter align="right" />

      {/* User profile avatar & role */}
      <div className="hidden sm:flex items-center gap-2 pl-1 border-l border-[#E3E6E9]">
        <div className="w-7 h-7 bg-[#20283A] text-white rounded-lg flex items-center justify-center text-[11px] font-bold shadow-xs">
          {user?.name ? user.name.slice(0, 2).toUpperCase() : 'AE'}
        </div>
        <div className="hidden lg:block text-left">
          <p className="text-xs font-bold text-[#20283A] leading-tight truncate">{user?.name || 'Accounts Staff'}</p>
          <p className="text-[10px] font-semibold text-[#718096] uppercase tracking-wider leading-tight">
            {user?.role === 'accounts' ? 'Accounts Exec' : user?.role || 'Staff'}
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#929DB4] p-0 sm:p-2 md:p-3 xl:p-4">
      {/* Floating Application Workspace Canvas */}
      <div className="bg-[#EEF0F1] sm:rounded-3xl border border-[#CCD2DE] shadow-[0_12px_36px_rgba(32,40,58,0.12)] min-h-[calc(100vh-2rem)] flex flex-col lg:flex-row overflow-hidden">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0">
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
                  'pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-2xl shadow-lg border text-xs max-w-sm bg-white',
                  n.type === 'success' && 'border-[#CDEED6] text-[#1B7043]',
                  n.type === 'error' && 'border-[#F9CACA] text-[#BA2525]',
                  n.type === 'warning' && 'border-[#FDE68A] text-[#9A4C07]',
                  n.type === 'info' && 'border-[#D4E6F4] text-[#36688F]'
                )}
              >
                {notifIcons[n.type]}
                <div className="flex-1">
                  <p className="font-bold text-xs text-[#20283A]">{n.title}</p>
                  <p className="text-xs text-[#718096] mt-0.5">{n.message}</p>
                </div>
                <button
                  onClick={() => dismissNotification(n.id)}
                  className="text-[#718096] hover:text-[#20283A] p-0.5 rounded cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <main className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto">
            <div className="max-w-7xl mx-auto w-full">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
