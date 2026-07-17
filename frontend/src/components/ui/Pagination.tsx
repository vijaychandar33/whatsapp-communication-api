import { Button } from './Button';

type Props = {
  page: number;
  totalPages: number;
  total?: number;
  onChange: (page: number) => void;
};

export function Pagination({ page, totalPages, total, onChange }: Props) {
  if (totalPages <= 1 && !total) return null;

  return (
    <div className="flex items-center justify-between gap-3 border-t border-zinc-100 px-5 py-3 dark:border-zinc-800">
      <p className="text-xs text-zinc-500">
        Page {page} of {Math.max(totalPages, 1)}
        {typeof total === 'number' ? ` · ${total} total` : ''}
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          Previous
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
