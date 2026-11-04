import React, { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../utils/helpers';
import {
  LayoutDashboard, Users, BookOpen, CreditCard, Bell, Clock,
  Calculator, BarChart3, ShieldAlert, Settings, ChevronRight,
  LogOut, User, ChevronDown, X, Menu, Cpu, Calendar, Wallet
} from 'lucide-react';

const NAV_ITEMS = [
  { to: '/accounts/dashboard', label: 'Overview', icon: LayoutDashboard },
  { to: '/students', label: 'Students', icon: Users },
  { to: '/deadlines', label: 'Upcoming Deadlines', icon: Calendar },
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
      {/* Mobile backdrop */}
      {open && (
        <div className="fixed inset-0 z-40 bg-[#20283A]/40 backdrop-blur-xs lg:hidden" onClick={onClose} />
      )}

      <aside className={cn(
        'fixed lg:sticky top-0 left-0 h-screen w-64 bg-white border-r border-[#E3E6E9] flex flex-col z-50 transform transition-transform duration-250 ease-in-out shadow-sm lg:shadow-none flex-shrink-0',
        open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      )}>
        {/* Brand Header */}
        <div className="flex items-center justify-between px-5 py-4.5 border-b border-[#E3E6E9]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-[#20283A] rounded-xl flex items-center justify-center shadow-xs">
              <span className="w-2 h-2 rounded-full bg-[#E95435] inline-block -ml-0.5" />
              <span className="w-2 h-2 rounded-full bg-[#79A9D1] inline-block ml-0.5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[#20283A] font-bold text-base tracking-tight leading-none">FeeFlow</span>
                <span className="bg-[#FDF1ED] text-[#E95435] text-[9px] font-bold px-1.5 py-0.2 rounded-full border border-[#F8D2C8]">OS</span>
              </div>
              <span className="text-[10px] text-[#718096] font-medium tracking-wider uppercase block mt-0.5">Finance Suite</span>
            </div>
          </div>
          <button onClick={onClose} className="lg:hidden text-[#718096] hover:text-[#20283A] p-1 rounded-md">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation list */}
        <nav className="flex-1 px-3 py-3 overflow-y-auto scrollbar-none">
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
                      'flex items-center gap-3 px-3 py-2 rounded-xl text-xs transition-all duration-150',
                      active
                        ? 'bg-[#20283A] text-white font-semibold shadow-xs'
                        : 'text-[#718096] hover:text-[#20283A] hover:bg-[#EEF0F1] font-medium'
                    )}
                  >
                    <Icon className={cn('w-4 h-4 flex-shrink-0', active ? 'text-[#E95435]' : 'text-[#718096]')} />
                    <span className="truncate">{label}</span>
                    {active && <ChevronRight className="w-3.5 h-3.5 ml-auto text-white/50" />}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* User Footer Profile */}
        <div className="border-t border-[#E3E6E9] p-3 bg-[#FAFAFA]">
          <div className="relative">
            <button
              onClick={() => setProfileOpen(p => !p)}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-[#EEF0F1] transition-colors border border-transparent hover:border-[#E3E6E9] cursor-pointer"
            >
              <div className="w-7 h-7 bg-[#20283A] text-white rounded-lg flex items-center justify-center flex-shrink-0 text-[11px] font-bold shadow-xs">
                {user?.name ? user.name.slice(0, 2).toUpperCase() : 'AE'}
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className="text-[#20283A] text-xs font-semibold truncate leading-tight">{user?.name || 'Accounts Staff'}</p>
                <p className="text-[#718096] text-[10px] truncate leading-tight mt-0.5">{user?.centreName || 'Jaipur Main'}</p>
              </div>
              <ChevronDown className={cn('w-3.5 h-3.5 text-[#718096] transition-transform duration-150', profileOpen && 'rotate-180')} />
            </button>

            {profileOpen && (
              <div className="absolute bottom-full left-0 w-full mb-1 py-1 bg-white rounded-xl border border-[#E3E6E9] shadow-lg z-50">
                <div className="px-3 py-1.5 border-b border-[#E3E6E9] mb-1">
                  <div className="text-[10px] font-semibold text-[#718096] uppercase">Role</div>
                  <div className="text-xs font-bold text-[#20283A] capitalize">{user?.role || 'accounts'}</div>
                </div>
                <button
                  onClick={() => {
                    logout();
                    navigate('/login');
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-[#BA2525] hover:bg-[#FDF2F2] transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" /> Sign out
                </button>
              </div>
            )}
          </div>
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
    <header className="h-15 bg-white border-b border-[#E3E6E9] flex items-center px-4 md:px-6 gap-4 sticky top-0 z-30">
      <button
        onClick={onMenuClick}
        className="lg:hidden text-[#718096] hover:text-[#20283A] p-1.5 rounded-lg hover:bg-[#EEF0F1] transition-colors"
        aria-label="Open sidebar"
      >
        <Menu className="w-5 h-5" />
      </button>

      <div className="flex-1 min-w-0">
        {breadcrumb && (
          <div className="flex items-center gap-1.5 text-[11px] text-[#718096] mb-0.5 font-medium">
            {breadcrumb.map((b, i) => (
              <React.Fragment key={i}>
                {i > 0 && <ChevronRight className="w-3 h-3 text-[#A0AEC0]" />}
                <span>{b}</span>
              </React.Fragment>
            ))}
          </div>
        )}
        <h1 className="text-sm font-bold text-[#20283A] tracking-tight truncate">{title}</h1>
      </div>

      {rightSlot}
    </header>
  );
}
