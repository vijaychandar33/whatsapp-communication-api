import { Badge } from './Badge';
import { cn } from '../../lib/utils';

export type AccountRef = {
  id?: string;
  name?: string | null;
  phoneNumber?: string | null;
} | null | undefined;

export function formatAccountLabel(account: AccountRef): string {
  if (!account) return 'Unassigned';
  const name = account.name?.trim();
  const phone = account.phoneNumber?.trim();
  if (name && phone) return `${name} · ${phone}`;
  return name || phone || 'Unassigned';
}

export function AccountBadge({
  account,
  className,
}: {
  account?: AccountRef | AccountRef[];
  className?: string;
}) {
  const list = Array.isArray(account)
    ? account.filter(Boolean)
    : account
      ? [account]
      : [];

  if (list.length === 0) {
    return (
      <Badge tone="neutral" className={cn('font-normal normal-case', className)}>
        Unassigned
      </Badge>
    );
  }

  return (
    <span className={cn('inline-flex flex-wrap gap-1', className)}>
      {list.map((a, i) => (
        <Badge
          key={a?.id || `${formatAccountLabel(a)}-${i}`}
          tone="info"
          className="font-normal normal-case"
          title={formatAccountLabel(a)}
        >
          {formatAccountLabel(a)}
        </Badge>
      ))}
    </span>
  );
}
