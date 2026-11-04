import React from 'react';
import { cn, getStatusColor } from '../../utils/helpers';

interface BadgeProps {
  status: string;
  className?: string;
  showDot?: boolean;
}

export function Badge({ status, className, showDot = true }: BadgeProps) {
  const dotColor: Record<string, string> = {
    Paid: 'bg-[#1B7043]',
    Success: 'bg-[#1B7043]',
    'Partially Paid': 'bg-[#9A4C07]',
    Partial: 'bg-[#9A4C07]',
    Overdue: 'bg-[#BA2525]',
    Failed: 'bg-[#BA2525]',
    Pending: 'bg-[#718096]',
    Upcoming: 'bg-[#36688F]',
    Unmatched: 'bg-[#E95435]',
    'Under Review': 'bg-[#36688F]',
    Scheduled: 'bg-[#36688F]',
    Approved: 'bg-[#1B7043]',
    Rejected: 'bg-[#BA2525]',
    Processed: 'bg-[#5B4699]',
    High: 'bg-[#BA2525]',
    Medium: 'bg-[#9A4C07]',
    Low: 'bg-[#1B7043]',
  };

  const currentDot = dotColor[status] || 'bg-[#718096]';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border transition-colors',
        getStatusColor(status),
        className
      )}
    >
      {showDot && <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', currentDot)} />}
      <span>{status}</span>
    </span>
  );
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'success';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 font-medium rounded-xl transition-all duration-150 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#E95435] focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed select-none active:scale-[0.98] cursor-pointer';

  const variants = {
    primary: 'bg-[#E95435] text-white hover:bg-[#D84527] active:bg-[#C43A1E] shadow-[0_1px_2px_rgba(233,84,53,0.18)]',
    secondary: 'bg-[#EEF0F1] text-[#20283A] hover:bg-[#E3E6E9] active:bg-[#D5D9DF]',
    ghost: 'text-[#718096] hover:bg-[#EEF0F1] hover:text-[#20283A]',
    danger: 'bg-[#BA2525] text-white hover:bg-[#A31F1F] active:bg-[#8E1B1B] shadow-[0_1px_2px_rgba(186,37,37,0.18)]',
    success: 'bg-[#1B7043] text-white hover:bg-[#155A35] active:bg-[#10482A] shadow-[0_1px_2px_rgba(27,112,67,0.18)]',
    outline: 'border border-[#E3E6E9] bg-white text-[#20283A] hover:bg-[#F8F9FA] hover:border-[#CCD1D7] shadow-[0_1px_2px_rgba(0,0,0,0.02)]',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-xs font-semibold',
    md: 'px-4 py-2 text-xs font-semibold',
    lg: 'px-5 py-2.5 text-sm font-semibold',
  };

  return (
    <button
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      aria-busy={loading}
      {...props}
    >
      {loading && (
        <svg className="animate-spin h-3.5 w-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  );
}

interface CardProps {
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
}

export function Card({ className, children, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-white border border-[#E3E6E9] rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.03)] transition-all',
        onClick && 'cursor-pointer hover:border-[#CCD1D7] hover:shadow-[0_4px_12px_rgba(0,0,0,0.05)]',
        className
      )}
    >
      {children}
    </div>
  );
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export function Input({ label, error, helperText, className, id, ...props }: InputProps) {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-xs font-semibold text-[#20283A]">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={cn(
          'border border-[#E3E6E9] rounded-xl px-3.5 py-2 text-xs text-[#20283A] bg-white placeholder:text-[#718096] focus:outline-hidden focus:ring-2 focus:ring-[#E95435] focus:border-transparent transition-all',
          error && 'border-[#BA2525] focus:ring-[#BA2525] bg-[#FDF2F2]',
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-[#BA2525] font-medium">{error}</p>}
      {!error && helperText && <p className="text-xs text-[#718096]">{helperText}</p>}
    </div>
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string }[];
  error?: string;
}

export function Select({ label, options, error, className, id, ...props }: SelectProps) {
  const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={selectId} className="text-xs font-semibold text-[#20283A]">
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={cn(
          'border border-[#E3E6E9] rounded-xl px-3.5 py-2 text-xs text-[#20283A] bg-white focus:outline-hidden focus:ring-2 focus:ring-[#E95435] focus:border-transparent cursor-pointer transition-all',
          error && 'border-[#BA2525] focus:ring-[#BA2525]',
          className
        )}
        {...props}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-[#BA2525] font-medium">{error}</p>}
    </div>
  );
}

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  if (!open) return null;
  const widths = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-[#20283A]/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={cn(
          'relative bg-white rounded-3xl shadow-[0_20px_40px_rgba(0,0,0,0.12)] w-full max-h-[90vh] flex flex-col border border-[#E3E6E9] overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150',
          widths[size]
        )}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E3E6E9] bg-[#FAFAFA]">
          <h2 className="text-sm font-bold text-[#20283A]">{title}</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[#718096] hover:text-[#20283A] hover:bg-[#EEF0F1] transition-colors"
            aria-label="Close dialog"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto p-6 flex-1">{children}</div>
      </div>
    </div>
  );
}

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {icon && <div className="mb-3 text-[#718096] p-3 rounded-2xl bg-[#EEF0F1] border border-[#E3E6E9]">{icon}</div>}
      <h3 className="text-sm font-semibold text-[#20283A] mb-1">{title}</h3>
      {description && <p className="text-xs text-[#718096] mb-4 max-w-sm leading-relaxed">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ReactNode;
  accent?: 'default' | 'green' | 'amber' | 'red' | 'indigo' | 'orange' | 'blue';
  trend?: { value: string; up: boolean };
  onClick?: () => void;
  className?: string;
}

export function StatCard({ label, value, sub, icon, accent = 'default', trend, onClick, className }: StatCardProps) {
  const iconWrappers = {
    default: 'bg-[#EEF0F1] text-[#20283A] border-[#E3E6E9]',
    green: 'bg-[#EBF7EE] text-[#1B7043] border-[#CDEED6]',
    amber: 'bg-[#FEF3C7] text-[#9A4C07] border-[#FDE68A]',
    red: 'bg-[#FDF2F2] text-[#BA2525] border-[#F9CACA]',
    indigo: 'bg-[#EEF5FB] text-[#36688F] border-[#D4E6F4]',
    orange: 'bg-[#FDF1ED] text-[#E95435] border-[#F8D2C8]',
    blue: 'bg-[#EEF5FB] text-[#79A9D1] border-[#D4E6F4]',
  };

  return (
    <Card
      onClick={onClick}
      className={cn(
        'p-5 flex flex-col justify-between transition-all hover:shadow-[0_4px_12px_rgba(0,0,0,0.05)] border border-[#E3E6E9]',
        onClick && 'cursor-pointer hover:border-[#CCD1D7]',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold text-[#718096] uppercase tracking-wider mb-1 truncate">{label}</p>
          <p className="text-2xl font-bold text-[#20283A] tracking-tight tabular-nums truncate">{value}</p>
        </div>
        {icon && (
          <div className={cn('p-2.5 rounded-xl border flex-shrink-0', iconWrappers[accent])}>
            {icon}
          </div>
        )}
      </div>

      {(sub || trend) && (
        <div className="mt-3 pt-3 border-t border-[#E3E6E9] flex items-center justify-between text-xs text-[#718096]">
          {sub && <span className="truncate">{sub}</span>}
          {trend && (
            <span className={cn('font-semibold flex-shrink-0 ml-auto', trend.up ? 'text-[#1B7043]' : 'text-[#BA2525]')}>
              {trend.up ? '↑' : '↓'} {trend.value}
            </span>
          )}
        </div>
      )}
    </Card>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="flex flex-col items-center gap-2">
        <svg className="animate-spin h-6 w-6 text-[#E95435]" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span className="text-xs text-[#718096] font-medium">Loading data...</span>
      </div>
    </div>
  );
}

interface TableProps {
  headers: string[];
  children: React.ReactNode;
  className?: string;
}

export function Table({ headers, children, className }: TableProps) {
  return (
    <div className={cn('overflow-x-auto rounded-2xl border border-[#E3E6E9] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.02)]', className)}>
      <table className="w-full text-xs text-left border-collapse">
        <thead className="bg-[#FAFAFA] border-b border-[#E3E6E9] text-[#718096] text-[11px] font-semibold uppercase tracking-wider">
          <tr>
            {headers.map((h, i) => (
              <th key={i} className="py-3 px-4 whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E3E6E9] bg-white text-[#20283A]">
          {children}
        </tbody>
      </table>
    </div>
  );
}

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function Drawer({ open, onClose, title, children }: DrawerProps) {
  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-[#20283A]/40 backdrop-blur-xs transition-opacity"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <div
        className={cn(
          'fixed right-0 top-0 h-full w-full max-w-lg bg-white shadow-2xl z-50 transform transition-transform duration-250 ease-out flex flex-col border-l border-[#E3E6E9]',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        <div className="flex items-center justify-between px-6 py-4.5 border-b border-[#E3E6E9] bg-[#FAFAFA] sticky top-0 z-10">
          <h2 className="text-sm font-bold text-[#20283A]">{title}</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[#718096] hover:text-[#20283A] hover:bg-[#EEF0F1] transition-colors"
            aria-label="Close drawer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">{children}</div>
      </div>
    </>
  );
}
