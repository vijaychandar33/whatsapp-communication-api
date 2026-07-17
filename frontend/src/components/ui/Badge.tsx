import { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'teal';

const tones: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-red-50 text-red-700',
  info: 'bg-sky-50 text-sky-700',
  teal: 'bg-accent-muted text-teal-800',
};

export function Badge({
  className,
  tone = 'neutral',
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium capitalize',
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

export function statusTone(status?: string): Tone {
  const s = (status || '').toLowerCase();
  if (['active', 'delivered', 'read', 'completed', 'open', 'verified', 'ok'].includes(s)) {
    return 'success';
  }
  if (['queued', 'pending', 'processing', 'sent', 'connecting'].includes(s)) {
    return 'info';
  }
  if (['failed', 'error', 'revoked', 'blocked', 'closed', 'inactive'].includes(s)) {
    return 'danger';
  }
  if (['draft', 'paused', 'expired', 'warning'].includes(s)) {
    return 'warning';
  }
  return 'neutral';
}
