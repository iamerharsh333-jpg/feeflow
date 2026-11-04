import { type ClassValue, clsx } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return String(dateStr);
  }
}

export function formatShortDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
    });
  } catch {
    return String(dateStr);
  }
}

export function daysBetween(a: string, b: string): number {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

export function exportToCsv(filename: string, rows: Record<string, unknown>[]): void {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csvLines = [
    headers.join(','),
    ...rows.map(row =>
      headers.map(h => {
        const val = String(row[h] ?? '');
        return val.includes(',') || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val;
      }).join(',')
    ),
  ];
  const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'Paid': return 'text-emerald-700 bg-emerald-50 border-emerald-200';
    case 'Partially Paid': return 'text-amber-700 bg-amber-50 border-amber-200';
    case 'Overdue': return 'text-red-700 bg-red-50 border-red-200';
    case 'Pending':
    case 'Upcoming': return 'text-slate-600 bg-slate-50 border-slate-200';
    case 'Success': return 'text-emerald-700 bg-emerald-50 border-emerald-200';
    case 'Failed': return 'text-red-700 bg-red-50 border-red-200';
    case 'Unmatched': return 'text-orange-700 bg-orange-50 border-orange-200';
    case 'Under Review': return 'text-blue-700 bg-blue-50 border-blue-200';
    case 'Approved': return 'text-emerald-700 bg-emerald-50 border-emerald-200';
    case 'Processed': return 'text-purple-700 bg-purple-50 border-purple-200';
    case 'Rejected': return 'text-red-700 bg-red-50 border-red-200';
    case 'Scheduled': return 'text-blue-700 bg-blue-50 border-blue-200';
    case 'Sent': return 'text-emerald-700 bg-emerald-50 border-emerald-200';
    case 'Cancelled': return 'text-slate-500 bg-slate-50 border-slate-200';
    case 'High': return 'text-red-700 bg-red-50 border-red-200';
    case 'Medium': return 'text-amber-700 bg-amber-50 border-amber-200';
    case 'Low': return 'text-emerald-700 bg-emerald-50 border-emerald-200';
    default: return 'text-slate-600 bg-slate-50 border-slate-200';
  }
}

