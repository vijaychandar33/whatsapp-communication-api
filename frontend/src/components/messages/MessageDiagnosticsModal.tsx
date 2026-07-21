import { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  Check,
  CheckCheck,
  Clock,
  LoaderCircle,
} from 'lucide-react';
import { api, getErrorMessage } from '../../lib/api';
import { formatDate } from '../../lib/utils';
import { EmptyState } from '../ui/EmptyState';
import { Modal } from '../ui/Modal';

type JsonValue = unknown;

type StatusHistory = {
  id: string;
  status: string;
  metadata?: JsonValue;
  createdAt: string;
};

type FailedMessage = {
  errorCode?: string | null;
  errorMessage: string;
  retryCount: number;
  nextRetryAt?: string | null;
  payload?: JsonValue;
  createdAt: string;
  updatedAt: string;
};

type DiagnosticMessage = {
  id: string;
  status: string;
  direction: string;
  messageType: string;
  channelCode: string;
  providerMessageId?: string | null;
  idempotencyKey?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  content?: JsonValue;
  rawProviderPayload?: JsonValue;
  createdAt: string;
  updatedAt: string;
  sentAt?: string | null;
  deliveredAt?: string | null;
  readAt?: string | null;
  statusHistory: StatusHistory[];
  failedMessage?: FailedMessage | null;
  media?: JsonValue[];
  webhookEvents?: Array<{
    id: string;
    eventType: string;
    payload: JsonValue;
    processedAt?: string | null;
    errorMessage?: string | null;
    createdAt: string;
  }>;
  outboxEvents?: Array<{
    id: string;
    eventType: string;
    status: string;
    attempts: number;
    payload: JsonValue;
    availableAt: string;
    processedAt?: string | null;
    lastError?: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
};

type Props = {
  messageId: string | null;
  organizationId: string;
  onClose: () => void;
};

const statusConfig: Record<
  string,
  { label: string; className: string; icon: typeof Check }
> = {
  FAILED: {
    label: 'Failed',
    className: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300',
    icon: AlertCircle,
  },
  SENT: {
    label: 'Sent · Single tick',
    className: 'border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200',
    icon: Check,
  },
  DELIVERED: {
    label: 'Delivered · Double tick',
    className: 'border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200',
    icon: CheckCheck,
  },
  READ: {
    label: 'Read',
    className: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300',
    icon: CheckCheck,
  },
  QUEUED: {
    label: 'Queued',
    className: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
    icon: Clock,
  },
  SENDING: {
    label: 'Sending',
    className: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
    icon: LoaderCircle,
  },
};

function JsonBlock({ value }: { value: JsonValue }) {
  if (value == null) return <span className="text-zinc-500">None</span>;
  return (
    <pre className="max-h-64 overflow-auto rounded-md bg-zinc-950 p-3 text-[11px] leading-5 text-zinc-100">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value?: string | number | null;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </dt>
      <dd className={mono ? 'break-all font-mono text-xs' : 'text-sm'}>
        {value ?? '—'}
      </dd>
    </div>
  );
}

function TechnicalSection({
  title,
  children,
  open = false,
}: {
  title: string;
  children: ReactNode;
  open?: boolean;
}) {
  return (
    <details open={open} className="rounded-md border border-zinc-200 dark:border-zinc-800">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
        {title}
      </summary>
      <div className="border-t border-zinc-200 p-3 dark:border-zinc-800">
        {children}
      </div>
    </details>
  );
}

export function MessageDiagnosticsModal({
  messageId,
  organizationId,
  onClose,
}: Props) {
  const query = useQuery({
    queryKey: ['message-diagnostics', messageId, organizationId],
    enabled: Boolean(messageId && organizationId),
    queryFn: async () => {
      const { data } = await api.get<{ data: DiagnosticMessage }>(
        `/admin/v1/messages/${messageId}`,
        { params: { organizationId } },
      );
      return data.data;
    },
  });

  const message = query.data;
  const config = statusConfig[(message?.status || '').toUpperCase()] || {
    label: message?.status || 'Unknown',
    className: 'border-zinc-200 bg-zinc-50 text-zinc-700',
    icon: Clock,
  };
  const StatusIcon = config.icon;
  const failure = message?.failedMessage;

  return (
    <Modal
      open={Boolean(messageId)}
      title="Message delivery details"
      onClose={onClose}
      className="max-h-[90vh] max-w-3xl overflow-hidden"
    >
      <div className="max-h-[calc(90vh-5rem)] space-y-4 overflow-y-auto pr-1">
        {query.isLoading ? (
          <EmptyState title="Loading message diagnostics…" />
        ) : query.isError ? (
          <EmptyState
            title="Could not load message diagnostics"
            description={getErrorMessage(query.error)}
          />
        ) : message ? (
          <>
            <div className={`flex items-center gap-3 rounded-lg border p-4 ${config.className}`}>
              <StatusIcon
                className={`h-7 w-7 shrink-0 ${
                  message.status === 'SENDING' ? 'animate-spin' : ''
                }`}
              />
              <div>
                <div className="text-xl font-semibold">{config.label}</div>
                <div className="text-xs opacity-80">
                  Last updated {formatDate(message.updatedAt)}
                </div>
              </div>
            </div>

            {message.status === 'FAILED' ? (
              <section className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/30">
                <h4 className="mb-2 font-semibold text-red-800 dark:text-red-200">
                  Failure diagnostics
                </h4>
                <dl className="grid gap-3 sm:grid-cols-2">
                  <DetailRow
                    label="Error code"
                    value={message.errorCode || failure?.errorCode}
                    mono
                  />
                  <DetailRow label="Retry attempts" value={failure?.retryCount ?? 0} />
                  <div className="sm:col-span-2">
                    <DetailRow
                      label="Error message"
                      value={
                        message.errorMessage ||
                        failure?.errorMessage ||
                        'WhatsApp did not return an error description.'
                      }
                    />
                  </div>
                  <DetailRow
                    label="Next retry"
                    value={
                      failure?.nextRetryAt
                        ? formatDate(failure.nextRetryAt)
                        : 'No retry scheduled'
                    }
                  />
                  <DetailRow
                    label="Failure recorded"
                    value={failure?.createdAt ? formatDate(failure.createdAt) : undefined}
                  />
                </dl>
                {failure?.payload != null ? (
                  <div className="mt-3">
                    <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-red-700 dark:text-red-300">
                      Provider/application error details
                    </div>
                    <JsonBlock value={failure.payload} />
                  </div>
                ) : null}
              </section>
            ) : null}

            <section>
              <h4 className="mb-2 font-semibold">Delivery lifecycle</h4>
              {message.statusHistory.length ? (
                <ol className="space-y-0">
                  {message.statusHistory.map((entry, index) => {
                    const itemConfig = statusConfig[entry.status] || statusConfig.QUEUED;
                    const Icon = itemConfig.icon;
                    return (
                      <li key={entry.id} className="relative flex gap-3 pb-4 last:pb-0">
                        {index < message.statusHistory.length - 1 ? (
                          <span className="absolute left-3 top-6 h-full w-px bg-zinc-200 dark:bg-zinc-700" />
                        ) : null}
                        <span className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <span className="text-sm font-medium">
                              {itemConfig.label}
                            </span>
                            <time className="text-xs text-zinc-500">
                              {formatDate(entry.createdAt)}
                            </time>
                          </div>
                          {entry.metadata != null &&
                          Object.keys(entry.metadata as object).length ? (
                            <div className="mt-1">
                              <JsonBlock value={entry.metadata} />
                            </div>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="text-sm text-zinc-500">No status history recorded.</p>
              )}
            </section>

            <section>
              <h4 className="mb-2 font-semibold">Message information</h4>
              <dl className="grid gap-3 rounded-lg border border-zinc-200 p-3 sm:grid-cols-2 dark:border-zinc-800">
                <DetailRow label="Message ID" value={message.id} mono />
                <DetailRow
                  label="WhatsApp message ID"
                  value={message.providerMessageId}
                  mono
                />
                <DetailRow label="Direction" value={message.direction} />
                <DetailRow label="Type" value={message.messageType} />
                <DetailRow label="Channel" value={message.channelCode} />
                <DetailRow label="Created" value={formatDate(message.createdAt)} />
                <DetailRow
                  label="Sent"
                  value={message.sentAt ? formatDate(message.sentAt) : undefined}
                />
                <DetailRow
                  label="Delivered"
                  value={
                    message.deliveredAt ? formatDate(message.deliveredAt) : undefined
                  }
                />
                <DetailRow
                  label="Read"
                  value={message.readAt ? formatDate(message.readAt) : undefined}
                />
                <DetailRow
                  label="Idempotency key"
                  value={message.idempotencyKey}
                  mono
                />
              </dl>
            </section>

            <div className="space-y-2">
              <TechnicalSection
                title={`WhatsApp webhook events (${message.webhookEvents?.length || 0})`}
                open={Boolean(message.webhookEvents?.length)}
              >
                {message.webhookEvents?.length ? (
                  <div className="space-y-3">
                    {message.webhookEvents.map((event) => (
                      <div key={event.id}>
                        <div className="mb-1 flex justify-between gap-2 text-xs">
                          <span className="font-medium">{event.eventType}</span>
                          <span className="text-zinc-500">
                            {formatDate(event.createdAt)}
                          </span>
                        </div>
                        {event.errorMessage ? (
                          <p className="mb-1 text-xs text-red-600">
                            Processing error: {event.errorMessage}
                          </p>
                        ) : null}
                        <JsonBlock value={event.payload} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-zinc-500">
                    No related webhook event was found.
                  </p>
                )}
              </TechnicalSection>

              <TechnicalSection
                title={`Internal event log (${message.outboxEvents?.length || 0})`}
              >
                <JsonBlock value={message.outboxEvents || []} />
              </TechnicalSection>

              <TechnicalSection title="Raw WhatsApp API response">
                <JsonBlock value={message.rawProviderPayload} />
              </TechnicalSection>

              <TechnicalSection title="Message content and media">
                <JsonBlock
                  value={{ content: message.content, media: message.media || [] }}
                />
              </TechnicalSection>
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  );
}
