import { cn, fieldControlClass, fieldLabelClass } from '../../lib/utils';
import {
  defaultDateRangeValue,
  type CustomDateMode,
  type DatePreset,
  type DateRangeValue,
  toDateInputValue,
} from '../../lib/date-range';

const PRESETS: { id: DatePreset; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'last7', label: 'Last 7 Days' },
  { id: 'custom', label: 'Custom' },
];

type Props = {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  className?: string;
};

export function DateRangeSelector({ value, onChange, className }: Props) {
  const setPreset = (preset: DatePreset) => {
    onChange({ ...value, preset });
  };

  const setCustomMode = (customMode: CustomDateMode) => {
    onChange({ ...value, preset: 'custom', customMode });
  };

  return (
    <div
      className={cn(
        'rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950',
        className,
      )}
    >
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => setPreset(preset.id)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              value.preset === preset.id
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700',
            )}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {value.preset === 'custom' ? (
        <div className="mt-4 space-y-4 border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCustomMode('single')}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium',
                value.customMode === 'single'
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200',
              )}
            >
              Single date
            </button>
            <button
              type="button"
              onClick={() => setCustomMode('range')}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium',
                value.customMode === 'range'
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200',
              )}
            >
              Date range
            </button>
          </div>

          {value.customMode === 'single' ? (
            <label className="block space-y-1.5">
              <span className={fieldLabelClass}>Date</span>
              <input
                type="date"
                className={cn(fieldControlClass, 'h-10 px-3')}
                value={value.customDate || defaultDateRangeValue.customDate}
                onChange={(e) =>
                  onChange({ ...value, customDate: e.target.value })
                }
              />
            </label>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5">
                <span className={fieldLabelClass}>From</span>
                <input
                  type="date"
                  className={cn(fieldControlClass, 'h-10 px-3')}
                  value={value.customFrom || defaultDateRangeValue.customFrom}
                  max={value.customTo || toDateInputValue(new Date())}
                  onChange={(e) =>
                    onChange({ ...value, customFrom: e.target.value })
                  }
                />
              </label>
              <label className="block space-y-1.5">
                <span className={fieldLabelClass}>To</span>
                <input
                  type="date"
                  className={cn(fieldControlClass, 'h-10 px-3')}
                  value={value.customTo || defaultDateRangeValue.customTo}
                  min={value.customFrom}
                  max={toDateInputValue(new Date())}
                  onChange={(e) =>
                    onChange({ ...value, customTo: e.target.value })
                  }
                />
              </label>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
