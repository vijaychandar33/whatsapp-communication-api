import { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'teal';

const tones: Record<Tone, string> = {
  neutral: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200',
  success: 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900',
  warning: 'bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100',
  danger: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
  info: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200',
  teal: 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100',
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
  return 'neutral';
}
