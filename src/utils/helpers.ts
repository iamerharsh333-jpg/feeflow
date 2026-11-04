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
    case 'Paid':
    case 'Success':
    case 'Approved':
    case 'Sent':
      return 'text-[#1B7043] bg-[#EBF7EE] border-[#CDEED6]';
    case 'Partially Paid':
    case 'Partial':
    case 'Medium':
    case 'Pending Review':
      return 'text-[#9A4C07] bg-[#FEF3C7] border-[#FDE68A]';
    case 'Overdue':
    case 'Failed':
    case 'Rejected':
    case 'High':
      return 'text-[#BA2525] bg-[#FDF2F2] border-[#F9CACA]';
    case 'Unmatched':
      return 'text-[#E95435] bg-[#FDF1ED] border-[#F8D2C8]';
    case 'Upcoming':
    case 'Under Review':
    case 'Scheduled':
      return 'text-[#36688F] bg-[#EEF5FB] border-[#D4E6F4]';
    case 'Processed':
      return 'text-[#5B4699] bg-[#F5F2FC] border-[#E1D8F4]';
    case 'Low':
      return 'text-[#1B7043] bg-[#EBF7EE] border-[#CDEED6]';
    case 'Pending':
    case 'Cancelled':
    default:
      return 'text-[#718096] bg-[#F4F6F8] border-[#E3E6E9]';
  }
}

