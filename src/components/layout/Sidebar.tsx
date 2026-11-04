import React, { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../utils/helpers';
import {
  LayoutDashboard, Users, BookOpen, CreditCard, Bell, Clock,
  Calculator, BarChart3, ShieldAlert, Settings, ChevronRight,
  LogOut, User, ChevronDown, X, Menu, Cpu,
} from 'lucide-react';

const NAV_ITEMS = [
  { to: '/accounts/dashboard', label: 'Overview', icon: LayoutDashboard },
  { to: '/students', label: 'Students', icon: Users },
  { to: '/fee-ledger', label: 'Fee Ledger', icon: BookOpen },
  { to: '/payments', label: 'Payments', icon: CreditCard },
  { to: '/reminders', label: 'Reminders', icon: Clock },
  { to: '/refund-calculator', label: 'Refund Calculator', icon: Calculator },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/risk-counselling', label: 'Risk & Counselling', icon: ShieldAlert },
  { to: '/automation', label: 'Automation', icon: Cpu },
  { to: '/notifications', label: 'Notifications', icon: Bell },
  { to: '/settings', label: 'Settings', icon: Settings },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={onClose} />
      )}

      <aside className={cn(
        'fixed left-0 top-0 h-full w-60 bg-white border-r border-slate-200 flex flex-col z-40 transform transition-transform duration-300 shadow-sm lg:shadow-none',
        open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      )}>
        {/* Brand */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-xs">
              <CreditCard className="w-4 h-4 text-white" />
            </div>
            <div>
              <span className="text-slate-900 font-bold text-base tracking-tight block leading-tight">FeeFlow</span>
              <span className="text-[10px] text-slate-400 font-medium">Fee Management</span>
            </div>
          </div>
          <button onClick={onClose} className="lg:hidden text-slate-400 hover:text-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-3 overflow-y-auto">
          <ul className="space-y-1">
            {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
              const active = to === '/accounts/dashboard'
                ? (location.pathname === '/' || location.pathname === '/accounts/dashboard')
                : location.pathname.startsWith(to);
              return (
                <li key={to}>
                  <NavLink
                    to={to}
                    onClick={onClose}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors',
                      active
                        ? 'bg-indigo-50 text-indigo-700 font-semibold shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    )}
                  >
                    <Icon className={cn('w-4 h-4 flex-shrink-0', active ? 'text-indigo-600' : 'text-slate-400')} />
                    {label}
                    {active && <ChevronRight className="w-3 h-3 ml-auto text-indigo-400" />}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Footer */}
        <div className="border-t border-slate-100 p-3 bg-slate-50/50">
          <button
            onClick={() => setProfileOpen(p => !p)}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-slate-100/80 transition-colors"
          >
            <div className="w-7 h-7 bg-indigo-600 rounded-full flex items-center justify-center flex-shrink-0 shadow-2xs">
              <span className="text-white text-[11px] font-bold">AE</span>
            </div>
            <div className="flex-1 text-left min-w-0">
              <p className="text-slate-900 text-xs font-semibold truncate">{user?.name || 'Accounts Staff'}</p>
              <p className="text-slate-400 text-[10px] truncate">{user?.centreName || 'Jaipur Main'}</p>
            </div>
            <ChevronDown className={cn('w-3.5 h-3.5 text-slate-400 transition-transform', profileOpen && 'rotate-180')} />
          </button>
          {profileOpen && (
            <div className="mt-1 py-1 bg-white rounded-lg border border-slate-200 shadow-md">
              <button
                onClick={() => {
                  logout();
                  navigate('/login');
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" /> Sign out
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

interface TopNavProps {
  title: string;
  breadcrumb?: string[];
  onMenuClick: () => void;
  rightSlot?: React.ReactNode;
}

export function TopNav({ title, breadcrumb, onMenuClick, rightSlot }: TopNavProps) {
  return (
    <header className="h-14 bg-white border-b border-slate-200 flex items-center px-4 gap-4 sticky top-0 z-20">
      <button onClick={onMenuClick} className="lg:hidden text-slate-500 hover:text-slate-900 -ml-1">
        <Menu className="w-5 h-5" />
      </button>
      <div className="flex-1 min-w-0">
        {breadcrumb && (
          <div className="flex items-center gap-1 text-xs text-slate-400 mb-0.5">
            {breadcrumb.map((b, i) => (
              <React.Fragment key={i}>
                {i > 0 && <ChevronRight className="w-3 h-3" />}
                <span>{b}</span>
              </React.Fragment>
            ))}
          </div>
        )}
        <h1 className="text-sm font-semibold text-slate-900 truncate">{title}</h1>
      </div>
      {rightSlot}
    </header>
  );
}

