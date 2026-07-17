import { HTMLAttributes, useEffect } from 'react';
import { cn } from '../../lib/utils';

type Tone = 'success' | 'info' | 'warning' | 'danger';

const tones: Record<Tone, string> = {
  success:
    'border-zinc-900/10 bg-white text-zinc-950 shadow-lg shadow-zinc-950/10 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-50 dark:shadow-black/40',
  info: 'border-zinc-900/10 bg-white text-zinc-950 shadow-lg shadow-zinc-950/10 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-50',
  warning:
    'border-amber-500/30 bg-amber-50 text-amber-950 shadow-lg dark:border-amber-400/20 dark:bg-amber-950 dark:text-amber-50',
  danger:
    'border-red-500/30 bg-red-50 text-red-950 shadow-lg dark:border-red-400/20 dark:bg-red-950 dark:text-red-50',
};

export type ToastState = {
  title: string;
  description?: string;
  tone?: Tone;
} | null;

export function Toast({
  open,
  title,
  description,
  tone = 'success',
  onClose,
  durationMs = 4500,
  className,
  ...props
}: {
  open: boolean;
  title: string;
  description?: string;
  tone?: Tone;
  onClose: () => void;
  durationMs?: number;
} & HTMLAttributes<HTMLDivElement>) {
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(onClose, durationMs);
    return () => window.clearTimeout(t);
  }, [open, durationMs, onClose]);

  if (!open) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-4 z-[80] flex justify-center px-4 sm:justify-end sm:pr-6"
      role="status"
      aria-live="polite"
    >
      <div
        className={cn(
          'pointer-events-auto w-full max-w-sm overflow-hidden rounded-xl border backdrop-blur',
          tones[tone],
          className,
        )}
        {...props}
      >
        <div className="flex items-start gap-3 px-4 py-3.5">
          <div
            className={cn(
              'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
              tone === 'success' && 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950',
              tone === 'info' && 'bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100',
              tone === 'warning' && 'bg-amber-500 text-white',
              tone === 'danger' && 'bg-red-600 text-white',
            )}
          >
            {tone === 'success' ? '✓' : tone === 'danger' ? '!' : 'i'}
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="text-sm font-semibold tracking-tight">{title}</div>
            {description ? (
              <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-300">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-1.5 py-0.5 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            Close
          </button>
        </div>
        <div className="h-0.5 w-full overflow-hidden bg-zinc-100 dark:bg-zinc-800">
          <div
            className={cn(
              'h-full origin-left',
              tone === 'success' && 'bg-zinc-950 dark:bg-white',
              tone === 'info' && 'bg-zinc-400',
              tone === 'warning' && 'bg-amber-500',
              tone === 'danger' && 'bg-red-600',
            )}
            style={{
              animation: `toast-progress ${durationMs}ms linear forwards`,
            }}
          />
        </div>
        <style>{`
          @keyframes toast-progress {
            from { transform: scaleX(1); }
            to { transform: scaleX(0); }
          }
        `}</style>
      </div>
    </div>
  );
}
