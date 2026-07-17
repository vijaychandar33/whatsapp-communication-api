import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

/** Shared input/select/textarea surface — matches light + dark monochrome theme */
export const fieldControlClass =
  'w-full rounded-md border border-zinc-200 bg-white text-sm text-zinc-950 placeholder:text-zinc-400 focus:border-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-950/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:border-zinc-300 dark:focus:ring-white/10';

export const fieldLabelClass =
  'text-sm font-medium text-zinc-700 dark:text-zinc-300';

export function formatDate(value?: string | Date | null): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

export function truncate(value: string | undefined | null, len = 40): string {
  if (!value) return '—';
  return value.length > len ? `${value.slice(0, len)}…` : value;
}
