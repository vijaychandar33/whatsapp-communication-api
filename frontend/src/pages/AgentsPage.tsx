import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { api, getErrorMessage } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { useCan } from '../hooks/useCan';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';
import { cn, fieldControlClass, fieldLabelClass, formatDate } from '../lib/utils';

type Tab = 'setup' | 'knowledge' | 'usage';

type AiConfig = {
  configured: boolean;
  provider: 'OPENAI' | 'ANTHROPIC';
  model: string;
  systemPrompt?: string | null;
  isActive: boolean;
  autoReplyEnabled: boolean;
  autoReplyMaxPerConversation: number;
  handoffUserId?: string | null;
  hasKey: boolean;
};

type KnowledgeDoc = {
  id: string;
  title: string;
  updatedAt?: string;
  _count?: { chunks: number };
};

export function AgentsPage() {
  const { user } = useAuth();
  const can = useCan();
  const orgId = user?.organizationId || '';
  const [tab, setTab] = useState<Tab>('setup');

  return (
    <div>
      <PageHeader
        title="AI Agents"
        description="BYO-key drafts, auto-reply, and knowledge base grounding."
      />

      <div className="mb-4 flex gap-2">
        {(
          [
            ['setup', 'Setup'],
            ['knowledge', 'Knowledge'],
            ['usage', 'Usage'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              tab === id
                ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950'
                : 'border border-zinc-200 bg-white text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'setup' ? (
        <SetupTab orgId={orgId} canAdmin={can.can('admin')} />
      ) : null}
      {tab === 'knowledge' ? (
        <KnowledgeTab orgId={orgId} canAdmin={can.can('admin')} />
      ) : null}
      {tab === 'usage' ? <UsageTab orgId={orgId} /> : null}
    </div>
  );
}

function SetupTab({
  orgId,
  canAdmin,
}: {
  orgId: string;
  canAdmin: boolean;
}) {
  const queryClient = useQueryClient();
  const config = useQuery({
    queryKey: ['ai-config', orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { data } = await api.get<{ data: AiConfig }>('/admin/v1/ai/config', {
        params: { organizationId: orgId },
      });
      return data.data;
    },
  });

  const [provider, setProvider] = useState<'OPENAI' | 'ANTHROPIC'>('OPENAI');
  const [model, setModel] = useState('gpt-4o-mini');
  const [apiKey, setApiKey] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false);
  const [maxReplies, setMaxReplies] = useState(3);

  useEffect(() => {
    if (!config.data) return;
    setProvider(config.data.provider);
    setModel(config.data.model);
    setSystemPrompt(config.data.systemPrompt || '');
    setIsActive(config.data.isActive);
    setAutoReplyEnabled(config.data.autoReplyEnabled);
    setMaxReplies(config.data.autoReplyMaxPerConversation);
  }, [config.data]);

  const save = useMutation({
    mutationFn: async () => {
      await api.put('/admin/v1/ai/config', {
        organizationId: orgId,
        provider,
        model,
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        systemPrompt,
        isActive,
        autoReplyEnabled,
        autoReplyMaxPerConversation: maxReplies,
      });
    },
    onSuccess: async () => {
      setApiKey('');
      await queryClient.invalidateQueries({ queryKey: ['ai-config'] });
    },
  });

  const test = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/admin/v1/ai/test', {
        organizationId: orgId,
        provider,
        model,
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
      });
      return data;
    },
  });

  if (config.isLoading) return <EmptyState title="Loading AI config…" />;
  if (config.isError) {
    return (
      <EmptyState
        title="Could not load AI config"
        description={getErrorMessage(config.error)}
      />
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4 py-5">
        <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          <Sparkles className="h-4 w-4 text-zinc-950 dark:text-zinc-100" />
          {config.data?.hasKey
            ? 'API key on file (encrypted). Leave blank to keep.'
            : 'No API key yet — paste your provider key.'}
        </div>

        <label className="block space-y-1.5">
          <span className={fieldLabelClass}>Provider</span>
          <select
            className={cn(fieldControlClass, 'h-10 px-3')}
            value={provider}
            disabled={!canAdmin}
            onChange={(e) => {
              const p = e.target.value as 'OPENAI' | 'ANTHROPIC';
              setProvider(p);
              setModel(
                p === 'ANTHROPIC'
                  ? 'claude-haiku-4-5-20251001'
                  : 'gpt-4o-mini',
              );
            }}
          >
            <option value="OPENAI">OpenAI</option>
            <option value="ANTHROPIC">Anthropic</option>
          </select>
        </label>

        <Input
          label="Model"
          value={model}
          disabled={!canAdmin}
          onChange={(e) => setModel(e.target.value)}
        />
        <Input
          label="API key"
          type="password"
          placeholder={config.data?.hasKey ? '•••••••• (unchanged)' : 'sk-…'}
          value={apiKey}
          disabled={!canAdmin}
          onChange={(e) => setApiKey(e.target.value)}
        />

        <label className="block space-y-1.5">
          <span className={fieldLabelClass}>Business system prompt</span>
          <textarea
            className={cn(fieldControlClass, 'min-h-28 px-3 py-2')}
            value={systemPrompt}
            disabled={!canAdmin}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="Tone, policies, products…"
          />
        </label>

        <label className="flex items-center gap-2 text-sm text-zinc-800 dark:text-zinc-200">
          <input
            type="checkbox"
            className="rounded border-zinc-300 text-zinc-950 focus:ring-zinc-950 dark:border-zinc-600 dark:bg-zinc-900"
            checked={isActive}
            disabled={!canAdmin}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          AI active (required for drafts / auto-reply)
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-800 dark:text-zinc-200">
          <input
            type="checkbox"
            className="rounded border-zinc-300 text-zinc-950 focus:ring-zinc-950 dark:border-zinc-600 dark:bg-zinc-900"
            checked={autoReplyEnabled}
            disabled={!canAdmin}
            onChange={(e) => setAutoReplyEnabled(e.target.checked)}
          />
          Auto-reply on inbound messages
        </label>
        <Input
          label="Max auto-replies per conversation"
          type="number"
          min={1}
          max={20}
          value={maxReplies}
          disabled={!canAdmin}
          onChange={(e) => setMaxReplies(Number(e.target.value) || 3)}
        />

        {canAdmin ? (
          <div className="flex flex-wrap gap-2">
            <Button loading={save.isPending} onClick={() => save.mutate()}>
              Save
            </Button>
            <Button
              variant="secondary"
              loading={test.isPending}
              onClick={() => test.mutate()}
            >
              Test connection
            </Button>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Admin role required to edit.</p>
        )}

        {save.isError ? (
          <p className="text-sm text-red-600">{getErrorMessage(save.error)}</p>
        ) : null}
        {save.isSuccess ? (
          <p className="text-sm text-zinc-800 dark:text-zinc-200">Saved.</p>
        ) : null}
        {test.isError ? (
          <p className="text-sm text-red-600">{getErrorMessage(test.error)}</p>
        ) : null}
        {test.isSuccess ? (
          <p className="text-sm text-zinc-800 dark:text-zinc-200">Provider OK.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function KnowledgeTab({
  orgId,
  canAdmin,
}: {
  orgId: string;
  canAdmin: boolean;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  const list = useQuery({
    queryKey: ['ai-knowledge', orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { data } = await api.get<{ data: KnowledgeDoc[] }>(
        '/admin/v1/ai/knowledge',
        { params: { organizationId: orgId } },
      );
      return Array.isArray(data.data) ? data.data : [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (editId) {
        await api.patch(
          `/admin/v1/ai/knowledge/${editId}`,
          { title, content },
          { params: { organizationId: orgId } },
        );
      } else {
        await api.post('/admin/v1/ai/knowledge', {
          organizationId: orgId,
          title,
          content,
        });
      }
    },
    onSuccess: async () => {
      setOpen(false);
      setEditId(null);
      setTitle('');
      setContent('');
      await queryClient.invalidateQueries({ queryKey: ['ai-knowledge'] });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/admin/v1/ai/knowledge/${id}`, {
        params: { organizationId: orgId },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['ai-knowledge'] });
    },
  });

  const reindex = useMutation({
    mutationFn: async () => {
      await api.post('/admin/v1/ai/knowledge/reindex', {
        organizationId: orgId,
      });
    },
  });

  const openEdit = async (id: string) => {
    const { data } = await api.get<{
      data: { id: string; title: string; content: string };
    }>(`/admin/v1/ai/knowledge/${id}`, {
      params: { organizationId: orgId },
    });
    setEditId(id);
    setTitle(data.data.title);
    setContent(data.data.content);
    setOpen(true);
  };

  return (
    <div>
      <div className="mb-3 flex gap-2">
        {canAdmin ? (
          <>
            <Button
              onClick={() => {
                setEditId(null);
                setTitle('');
                setContent('');
                setOpen(true);
              }}
            >
              Add document
            </Button>
            <Button
              variant="secondary"
              loading={reindex.isPending}
              onClick={() => reindex.mutate()}
            >
              Reindex chunks
            </Button>
          </>
        ) : null}
      </div>

      <Card>
        {list.isLoading ? (
          <EmptyState title="Loading…" />
        ) : list.isError ? (
          <EmptyState
            title="Could not load knowledge"
            description={getErrorMessage(list.error)}
          />
        ) : (list.data || []).length === 0 ? (
          <EmptyState
            title="No documents"
            description="Paste FAQs, policies, and product info for grounded drafts."
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {(list.data || []).map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div>
                  <div className="font-medium text-slate-900">{doc.title}</div>
                  <div className="text-xs text-slate-500">
                    {doc._count?.chunks ?? 0} chunks · {formatDate(doc.updatedAt)}
                  </div>
                </div>
                {canAdmin ? (
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void openEdit(doc.id)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      loading={remove.isPending}
                      onClick={() => remove.mutate(doc.id)}
                    >
                      Delete
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal
        open={open}
        title={editId ? 'Edit document' : 'Add document'}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={save.isPending}
              disabled={!title.trim() || !content.trim()}
              onClick={() => save.mutate()}
            >
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <label className="block space-y-1.5">
            <span className={fieldLabelClass}>Content</span>
            <textarea
              className={cn(fieldControlClass, 'min-h-40 px-3 py-2')}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </label>
          {save.isError ? (
            <p className="text-sm text-red-600">{getErrorMessage(save.error)}</p>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}

function UsageTab({ orgId }: { orgId: string }) {
  const usage = useQuery({
    queryKey: ['ai-usage', orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { data } = await api.get<{
        data: {
          totals: {
            promptTokens: number;
            completionTokens: number;
            calls: number;
          };
          byMode: Record<string, number>;
        };
      }>('/admin/v1/ai/usage', {
        params: { organizationId: orgId, days: 30 },
      });
      return data.data;
    },
  });

  if (usage.isLoading) return <EmptyState title="Loading usage…" />;
  if (usage.isError) {
    return (
      <EmptyState
        title="Could not load usage"
        description={getErrorMessage(usage.error)}
      />
    );
  }

  const t = usage.data?.totals;
  return (
    <Card>
      <CardContent className="space-y-3 py-5">
        <h3 className="font-semibold text-slate-900">Last 30 days</h3>
        <dl className="grid gap-3 sm:grid-cols-3 text-sm">
          <div>
            <dt className="text-xs uppercase text-slate-400">Calls</dt>
            <dd className="text-lg font-semibold">{t?.calls ?? 0}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-slate-400">Prompt tokens</dt>
            <dd className="text-lg font-semibold">{t?.promptTokens ?? 0}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-slate-400">Completion tokens</dt>
            <dd className="text-lg font-semibold">
              {t?.completionTokens ?? 0}
            </dd>
          </div>
        </dl>
        <div className="text-sm text-slate-600">
          By mode:{' '}
          {Object.entries(usage.data?.byMode || {})
            .map(([k, v]) => `${k}: ${v}`)
            .join(' · ') || '—'}
        </div>
      </CardContent>
    </Card>
  );
}
