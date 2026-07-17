import { Injectable, Logger } from '@nestjs/common';
import {
  AiProviderCode,
  AiUsageMode,
  MessageDirection,
  MessageType,
  Prisma,
} from '@prisma/client';
import { NotFoundError, ValidationError } from '../../domain/errors';
import { PrismaService } from '../../infrastructure/persistence/prisma/prisma.service';
import { UuidIdentifierService } from '../../infrastructure/identifier/uuid-identifier.service';
import { AesSecretService } from '../../infrastructure/secrets/secret.service';
import { CommunicationSdk } from '../communication-sdk/communication.sdk';
import {
  AI_PROVIDER_DEFAULT_MODEL,
  aiContextMessageLimit,
  buildSystemPrompt,
  chunkText,
  stripHandoff,
} from './ai.defaults';
import { LlmClient } from './llm.client';

export interface UpsertAiConfigInput {
  organizationId: string;
  provider?: AiProviderCode;
  model?: string;
  apiKey?: string;
  systemPrompt?: string | null;
  isActive?: boolean;
  autoReplyEnabled?: boolean;
  autoReplyMaxPerConversation?: number;
  handoffUserId?: string | null;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly identifiers: UuidIdentifierService,
    private readonly secrets: AesSecretService,
    private readonly llm: LlmClient,
    private readonly sdk: CommunicationSdk,
  ) {}

  async getConfig(organizationId: string) {
    const config = await this.prisma.aiConfig.findUnique({
      where: { organizationId },
    });
    if (!config) {
      return {
        configured: false,
        provider: AiProviderCode.OPENAI,
        model: AI_PROVIDER_DEFAULT_MODEL.OPENAI,
        systemPrompt: null,
        isActive: false,
        autoReplyEnabled: false,
        autoReplyMaxPerConversation: 3,
        handoffUserId: null,
        hasKey: false,
      };
    }
    return {
      configured: true,
      provider: config.provider,
      model: config.model,
      systemPrompt: config.systemPrompt,
      isActive: config.isActive,
      autoReplyEnabled: config.autoReplyEnabled,
      autoReplyMaxPerConversation: config.autoReplyMaxPerConversation,
      handoffUserId: config.handoffUserId,
      hasKey: Boolean(config.apiKeyEnc),
    };
  }

  async upsertConfig(input: UpsertAiConfigInput) {
    const provider = input.provider ?? AiProviderCode.OPENAI;
    const model =
      input.model?.trim() ||
      AI_PROVIDER_DEFAULT_MODEL[
        provider === AiProviderCode.ANTHROPIC ? 'ANTHROPIC' : 'OPENAI'
      ];

    const existing = await this.prisma.aiConfig.findUnique({
      where: { organizationId: input.organizationId },
    });

    let apiKeyEnc = existing?.apiKeyEnc ?? null;
    if (input.apiKey !== undefined) {
      const key = input.apiKey.trim();
      if (key) {
        apiKeyEnc = this.secrets.encrypt(key);
      }
    }

    if (input.isActive && !apiKeyEnc) {
      throw new ValidationError('API key required to activate AI');
    }

    const max =
      input.autoReplyMaxPerConversation ??
      existing?.autoReplyMaxPerConversation ??
      3;
    if (max < 1 || max > 20) {
      throw new ValidationError('autoReplyMaxPerConversation must be 1–20');
    }

    const data = {
      provider,
      model,
      apiKeyEnc,
      systemPrompt:
        input.systemPrompt !== undefined
          ? input.systemPrompt
          : (existing?.systemPrompt ?? null),
      isActive: input.isActive ?? existing?.isActive ?? false,
      autoReplyEnabled:
        input.autoReplyEnabled ?? existing?.autoReplyEnabled ?? false,
      autoReplyMaxPerConversation: max,
      handoffUserId:
        input.handoffUserId !== undefined
          ? input.handoffUserId
          : (existing?.handoffUserId ?? null),
    };

    await this.prisma.aiConfig.upsert({
      where: { organizationId: input.organizationId },
      create: {
        id: this.identifiers.generate(),
        organizationId: input.organizationId,
        ...data,
      },
      update: data,
    });

    return this.getConfig(input.organizationId);
  }

  async deleteConfig(organizationId: string) {
    await this.prisma.aiConfig.deleteMany({ where: { organizationId } });
    return { success: true };
  }

  async testConfig(
    organizationId: string,
    input?: { provider?: AiProviderCode; model?: string; apiKey?: string },
  ) {
    const { apiKey, provider, model } = await this.resolveCredentials(
      organizationId,
      input,
    );
    const result = await this.llm.complete(provider, apiKey, model, {
      prompt: 'Reply with exactly: ok',
      systemPrompt: 'You are a connectivity test. Reply with exactly: ok',
      maxTokens: 16,
      temperature: 0,
    });
    await this.logUsage({
      organizationId,
      mode: AiUsageMode.TEST,
      provider,
      model: result.model,
      promptTokens: result.usage?.promptTokens ?? 0,
      completionTokens: result.usage?.completionTokens ?? 0,
    });
    return { ok: true, sample: result.text.slice(0, 40) };
  }

  listDocuments(organizationId: string) {
    return this.prisma.knowledgeDocument.findMany({
      where: { organizationId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        updatedAt: true,
        createdAt: true,
        _count: { select: { chunks: true } },
      },
    });
  }

  async getDocument(organizationId: string, id: string) {
    const doc = await this.prisma.knowledgeDocument.findFirst({
      where: { id, organizationId },
    });
    if (!doc) throw new NotFoundError('KnowledgeDocument', id);
    return doc;
  }

  async createDocument(
    organizationId: string,
    title: string,
    content: string,
  ) {
    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();
    if (!trimmedTitle || !trimmedContent) {
      throw new ValidationError('title and content required');
    }
    const id = this.identifiers.generate();
    await this.prisma.$transaction(async (tx) => {
      await tx.knowledgeDocument.create({
        data: {
          id,
          organizationId,
          title: trimmedTitle,
          content: trimmedContent,
        },
      });
      await this.writeChunks(tx, organizationId, id, trimmedContent);
    });
    return this.getDocument(organizationId, id);
  }

  async updateDocument(
    organizationId: string,
    id: string,
    input: { title?: string; content?: string },
  ) {
    const doc = await this.getDocument(organizationId, id);
    const title = input.title?.trim() ?? doc.title;
    const content = input.content?.trim() ?? doc.content;
    await this.prisma.$transaction(async (tx) => {
      await tx.knowledgeDocument.update({
        where: { id },
        data: { title, content },
      });
      if (input.content !== undefined) {
        await tx.knowledgeChunk.deleteMany({ where: { documentId: id } });
        await this.writeChunks(tx, organizationId, id, content);
      }
    });
    return this.getDocument(organizationId, id);
  }

  async deleteDocument(organizationId: string, id: string) {
    await this.getDocument(organizationId, id);
    await this.prisma.knowledgeDocument.delete({ where: { id } });
    return { id };
  }

  async reindex(organizationId: string) {
    const docs = await this.prisma.knowledgeDocument.findMany({
      where: { organizationId },
    });
    let reindexed = 0;
    for (const doc of docs) {
      await this.prisma.$transaction(async (tx) => {
        await tx.knowledgeChunk.deleteMany({ where: { documentId: doc.id } });
        await this.writeChunks(tx, organizationId, doc.id, doc.content);
      });
      reindexed++;
    }
    return { reindexed, total: docs.length };
  }

  async draft(organizationId: string, conversationId: string) {
    const { text, usage, provider, model } = await this.generateForConversation(
      organizationId,
      conversationId,
      'draft',
    );
    await this.logUsage({
      organizationId,
      mode: AiUsageMode.DRAFT,
      provider,
      model,
      promptTokens: usage?.promptTokens ?? 0,
      completionTokens: usage?.completionTokens ?? 0,
      conversationId,
    });
    return { draft: text };
  }

  async setAutoreplyPaused(
    organizationId: string,
    conversationId: string,
    paused: boolean,
    assignToUserId?: string,
  ) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, organizationId, deletedAt: null },
    });
    if (!conversation) throw new NotFoundError('Conversation', conversationId);

    return this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        aiAutoreplyDisabled: paused,
        ...(paused && assignToUserId
          ? { assignedToUserId: assignToUserId }
          : {}),
        ...(!paused ? { aiHandoffSummary: null } : {}),
      },
      select: {
        id: true,
        aiAutoreplyDisabled: true,
        aiReplyCount: true,
        aiHandoffSummary: true,
        assignedToUserId: true,
      },
    });
  }

  async tryAutoReply(organizationId: string, conversationId: string) {
    try {
      const config = await this.prisma.aiConfig.findUnique({
        where: { organizationId },
      });
      if (!config?.isActive || !config.autoReplyEnabled || !config.apiKeyEnc) {
        return;
      }

      const conversation = await this.prisma.conversation.findFirst({
        where: { id: conversationId, organizationId, deletedAt: null },
        include: { contact: true },
      });
      if (!conversation || conversation.aiAutoreplyDisabled) return;
      if (conversation.aiReplyCount >= config.autoReplyMaxPerConversation) {
        return;
      }

      const claimed = await this.prisma.conversation.updateMany({
        where: {
          id: conversationId,
          organizationId,
          aiAutoreplyDisabled: false,
          aiReplyCount: { lt: config.autoReplyMaxPerConversation },
        },
        data: { aiReplyCount: { increment: 1 } },
      });
      if (claimed.count === 0) return;

      const generated = await this.generateForConversation(
        organizationId,
        conversationId,
        'auto_reply',
      );

      await this.logUsage({
        organizationId,
        mode: AiUsageMode.AUTO_REPLY,
        provider: generated.provider,
        model: generated.model,
        promptTokens: generated.usage?.promptTokens ?? 0,
        completionTokens: generated.usage?.completionTokens ?? 0,
        conversationId,
      });

      if (generated.handoff || !generated.text) {
        const summary =
          'AI handed off — needs human review based on the latest customer message.';
        await this.prisma.conversation.update({
          where: { id: conversationId },
          data: {
            aiAutoreplyDisabled: true,
            aiHandoffSummary: summary,
            ...(config.handoffUserId
              ? { assignedToUserId: config.handoffUserId }
              : {}),
          },
        });
        return;
      }

      const to = conversation.contact?.phoneNumber;
      if (!to) return;

      const result = await this.sdk.send({
        organizationId,
        communicationAccountId: conversation.communicationAccountId,
        to,
        body: generated.text,
        messageType: MessageType.TEXT,
        contactId: conversation.contactId,
        conversationId,
        content: { aiGenerated: true },
      });

      await this.prisma.message.update({
        where: { id: result.messageId },
        data: { aiGenerated: true },
      });
    } catch (err) {
      this.logger.warn(
        `Auto-reply failed for ${conversationId}: ${(err as Error).message}`,
      );
    }
  }

  async usage(organizationId: string, days = 30) {
    const from = new Date();
    from.setUTCDate(from.getUTCDate() - days);
    const rows = await this.prisma.aiUsageLog.findMany({
      where: { organizationId, createdAt: { gte: from } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    const totals = rows.reduce(
      (acc, r) => {
        acc.promptTokens += r.promptTokens;
        acc.completionTokens += r.completionTokens;
        acc.calls += 1;
        return acc;
      },
      { promptTokens: 0, completionTokens: 0, calls: 0 },
    );
    const byMode: Record<string, number> = {};
    for (const r of rows) {
      byMode[r.mode] = (byMode[r.mode] || 0) + 1;
    }
    return { windowDays: days, totals, byMode, recent: rows.slice(0, 50) };
  }

  private async generateForConversation(
    organizationId: string,
    conversationId: string,
    mode: 'draft' | 'auto_reply',
  ) {
    const config = await this.prisma.aiConfig.findUnique({
      where: { organizationId },
    });
    if (!config?.isActive || !config.apiKeyEnc) {
      throw new ValidationError('AI is not configured or inactive');
    }

    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, organizationId, deletedAt: null },
    });
    if (!conversation) throw new NotFoundError('Conversation', conversationId);

    const limit = aiContextMessageLimit();
    const messages = await this.prisma.message.findMany({
      where: { conversationId, organizationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        direction: true,
        body: true,
        messageType: true,
        createdAt: true,
      },
    });
    const chronological = [...messages].reverse();
    const chat = chronological
      .map((m) => {
        const content =
          (m.body || '').trim() ||
          (m.messageType ? `[${m.messageType}]` : '');
        if (!content) return null;
        return {
          role:
            m.direction === MessageDirection.INBOUND
              ? ('user' as const)
              : ('assistant' as const),
          content,
        };
      })
      .filter(Boolean) as { role: 'user' | 'assistant'; content: string }[];

    if (chat.length === 0) {
      throw new ValidationError('No messages in conversation');
    }

    const latestUser =
      [...chat].reverse().find((m) => m.role === 'user')?.content || '';
    const knowledge = await this.retrieveKnowledge(organizationId, latestUser);

    const systemPrompt = buildSystemPrompt({
      userPrompt: config.systemPrompt,
      mode,
      knowledge,
    });

    const apiKey = this.secrets.decrypt(config.apiKeyEnc);
    const result = await this.llm.complete(
      config.provider,
      apiKey,
      config.model,
      {
        prompt: '',
        systemPrompt,
        messages: [{ role: 'system', content: systemPrompt }, ...chat],
      },
    );

    const parsed = stripHandoff(result.text);
    return {
      text: parsed.text,
      handoff: parsed.handoff,
      usage: result.usage,
      provider: config.provider,
      model: result.model,
    };
  }

  private async retrieveKnowledge(
    organizationId: string,
    query: string,
    k = 5,
  ): Promise<string[]> {
    const q = query.trim();
    if (!q) return [];

    const tokens = q
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter((t) => t.length > 2)
      .slice(0, 8);
    if (tokens.length === 0) return [];

    const chunks = await this.prisma.knowledgeChunk.findMany({
      where: {
        organizationId,
        OR: tokens.map((t) => ({
          content: { contains: t, mode: 'insensitive' as const },
        })),
      },
      take: 40,
      orderBy: { createdAt: 'desc' },
      select: { content: true },
    });

    // Rank by token hit count
    const scored = chunks.map((c) => {
      const lower = c.content.toLowerCase();
      const score = tokens.reduce(
        (s, t) => s + (lower.includes(t) ? 1 : 0),
        0,
      );
      return { content: c.content, score };
    });
    scored.sort((a, b) => b.score - a.score);
    const unique: string[] = [];
    for (const row of scored) {
      if (unique.includes(row.content)) continue;
      unique.push(row.content);
      if (unique.length >= k) break;
    }
    return unique;
  }

  private async writeChunks(
    tx: Prisma.TransactionClient,
    organizationId: string,
    documentId: string,
    content: string,
  ) {
    const parts = chunkText(content);
    if (parts.length === 0) return;
    await tx.knowledgeChunk.createMany({
      data: parts.map((part, index) => ({
        id: this.identifiers.generate(),
        organizationId,
        documentId,
        chunkIndex: index,
        content: part,
      })),
    });
  }

  private async resolveCredentials(
    organizationId: string,
    input?: { provider?: AiProviderCode; model?: string; apiKey?: string },
  ) {
    const config = await this.prisma.aiConfig.findUnique({
      where: { organizationId },
    });
    const provider = input?.provider ?? config?.provider ?? AiProviderCode.OPENAI;
    const model =
      input?.model?.trim() ||
      config?.model ||
      AI_PROVIDER_DEFAULT_MODEL[
        provider === AiProviderCode.ANTHROPIC ? 'ANTHROPIC' : 'OPENAI'
      ];
    let apiKey = input?.apiKey?.trim() || '';
    if (!apiKey && config?.apiKeyEnc) {
      apiKey = this.secrets.decrypt(config.apiKeyEnc);
    }
    if (!apiKey) throw new ValidationError('API key required');
    return { apiKey, provider, model };
  }

  private async logUsage(input: {
    organizationId: string;
    mode: AiUsageMode;
    provider: AiProviderCode;
    model: string;
    promptTokens: number;
    completionTokens: number;
    conversationId?: string;
  }) {
    try {
      await this.prisma.aiUsageLog.create({
        data: {
          id: this.identifiers.generate(),
          ...input,
        },
      });
    } catch {
      // non-fatal
    }
  }
}
