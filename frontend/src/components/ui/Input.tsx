import { InputHTMLAttributes, forwardRef } from 'react';
import { cn, fieldControlClass, fieldLabelClass } from '../../lib/utils';

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
  hint?: string;
};

export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { className, label, error, hint, id, ...props },
  ref,
) {
  const inputId = id || props.name;
  return (
    <label className="block space-y-1.5">
      {label ? <span className={fieldLabelClass}>{label}</span> : null}
      <input
        ref={ref}
        id={inputId}
        className={cn(
          fieldControlClass,
          'h-10 px-3',
          error &&
            'border-red-400 focus:border-red-500 focus:ring-red-200 dark:border-red-500',
          className,
        )}
        {...props}
      />
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
      {!error && hint ? (
        <span className="text-xs text-zinc-500">{hint}</span>
      ) : null}
    </label>
  );
});
