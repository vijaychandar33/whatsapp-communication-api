export type DatePreset = 'today' | 'yesterday' | 'last7' | 'custom';

export type CustomDateMode = 'single' | 'range';

export type DateRangeValue = {
  preset: DatePreset;
  customMode: CustomDateMode;
  /** YYYY-MM-DD */
  customDate: string;
  /** YYYY-MM-DD */
  customFrom: string;
  /** YYYY-MM-DD */
  customTo: string;
};

export type ResolvedDateRange = {
  from: string;
  to: string;
  label: string;
};

export const defaultDateRangeValue: DateRangeValue = {
  preset: 'today',
  customMode: 'single',
  customDate: toDateInputValue(new Date()),
  customFrom: toDateInputValue(daysAgo(6)),
  customTo: toDateInputValue(new Date()),
};

export function toDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function parseLocalDate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function startOfLocalDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfLocalDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function resolveDateRange(value: DateRangeValue): ResolvedDateRange {
  const today = startOfLocalDay(new Date());

  if (value.preset === 'today') {
    return {
      from: startOfLocalDay(today).toISOString(),
      to: endOfLocalDay(today).toISOString(),
      label: 'Today',
    };
  }

  if (value.preset === 'yesterday') {
    const y = daysAgo(1);
    return {
      from: startOfLocalDay(y).toISOString(),
      to: endOfLocalDay(y).toISOString(),
      label: 'Yesterday',
    };
  }

  if (value.preset === 'last7') {
    const from = daysAgo(6);
    return {
      from: startOfLocalDay(from).toISOString(),
      to: endOfLocalDay(today).toISOString(),
      label: 'Last 7 days',
    };
  }

  if (value.customMode === 'single' && value.customDate) {
    const day = parseLocalDate(value.customDate);
    return {
      from: startOfLocalDay(day).toISOString(),
      to: endOfLocalDay(day).toISOString(),
      label: formatDisplayDate(value.customDate),
    };
  }

  const fromDay = value.customFrom
    ? parseLocalDate(value.customFrom)
    : today;
  const toDay = value.customTo ? parseLocalDate(value.customTo) : today;
  const from = startOfLocalDay(fromDay <= toDay ? fromDay : toDay);
  const to = endOfLocalDay(fromDay <= toDay ? toDay : fromDay);

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    label: `${formatDisplayDate(toDateInputValue(from))} – ${formatDisplayDate(toDateInputValue(to))}`,
  };
}

function formatDisplayDate(isoDate: string): string {
  const d = parseLocalDate(isoDate);
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function periodStatLabel(base: string, preset: DatePreset): string {
  if (preset === 'today') return `${base} today`;
  if (preset === 'yesterday') return `${base} yesterday`;
  return base;
}
