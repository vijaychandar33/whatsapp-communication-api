import { Injectable } from '@nestjs/common';
import {
  AccountConnectionStatus,
  ChannelCode,
  Prisma,
  TemplateCategory,
  TemplateStatus,
} from '@prisma/client';
import {
  NotFoundError,
  ProviderUnavailable,
  ValidationError,
} from '../../domain/errors';
import { ChannelAccountContext } from '../../domain/interfaces/channel-provider.interface';
import { PrismaService } from '../../infrastructure/persistence/prisma/prisma.service';
import { UuidIdentifierService } from '../../infrastructure/identifier/uuid-identifier.service';
import { AesSecretService } from '../../infrastructure/secrets/secret.service';
import { ChannelProviderRegistry } from '../../infrastructure/providers/channel-provider.registry';

export interface CreateTemplateCommand {
  organizationId: string;
  channelCode: ChannelCode;
  name: string;
  language?: string;
  category: TemplateCategory;
  body: string;
  components?: unknown;
  status?: TemplateStatus;
  /** When set, submit the template to Meta for this WhatsApp account. */
  communicationAccountId?: string;
  /** Local-only draft (skip Meta). Default false when account is provided. */
  draftOnly?: boolean;
}

@Injectable()
export class CreateTemplateHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identifiers: UuidIdentifierService,
    private readonly secrets: AesSecretService,
    private readonly registry: ChannelProviderRegistry,
  ) {}

  async execute(cmd: CreateTemplateCommand) {
    const name = normalizeTemplateName(cmd.name);
    const language = normalizeTemplateLanguage(cmd.language);
    const components =
      cmd.components ??
      ([
        {
          type: 'BODY',
          text: cmd.body,
        },
      ] as unknown[]);

    if (cmd.draftOnly) {
      return this.prisma.messageTemplate.upsert({
        where: {
          organizationId_channelCode_name_language: {
            organizationId: cmd.organizationId,
            channelCode: cmd.channelCode,
            name,
            language,
          },
        },
        create: {
          id: this.identifiers.generate(),
          organizationId: cmd.organizationId,
          channelCode: cmd.channelCode,
          name,
          language,
          category: cmd.category,
          body: cmd.body,
          components: components as Prisma.InputJsonValue,
          status: cmd.status ?? TemplateStatus.DRAFT,
        },
        update: {
          category: cmd.category,
          body: cmd.body,
          components: components as Prisma.InputJsonValue,
          status: cmd.status ?? TemplateStatus.DRAFT,
          deletedAt: null,
        },
      });
    }

    if (!cmd.communicationAccountId) {
      throw new ValidationError(
        'communicationAccountId is required to submit a template to Meta',
      );
    }

    if (cmd.channelCode !== ChannelCode.WHATSAPP) {
      throw new ValidationError(
        'Meta template submission is only supported for WhatsApp',
      );
    }

    const { account, ctx, provider } = await loadProviderAccount(
      this.prisma,
      this.secrets,
      this.registry,
      cmd.organizationId,
      cmd.communicationAccountId,
    );

    const created = await provider.createTemplate(ctx, {
      name,
      language,
      category: cmd.category,
      body: cmd.body,
      components: Array.isArray(components)
        ? (components as unknown[])
        : undefined,
    });

    return this.prisma.messageTemplate.upsert({
      where: {
        organizationId_channelCode_name_language: {
          organizationId: cmd.organizationId,
          channelCode: account.channelCode,
          name: created.name,
          language: created.language,
        },
      },
      create: {
        id: this.identifiers.generate(),
        organizationId: cmd.organizationId,
        channelCode: account.channelCode,
        name: created.name,
        language: created.language,
        category: mapCategory(created.category) ?? cmd.category,
        status: mapStatus(created.status),
        body: cmd.body,
        components: components as Prisma.InputJsonValue,
        providerTemplateId: created.providerTemplateId,
      },
      update: {
        category: mapCategory(created.category) ?? cmd.category,
        status: mapStatus(created.status),
        body: cmd.body,
        components: components as Prisma.InputJsonValue,
        providerTemplateId: created.providerTemplateId,
        deletedAt: null,
      },
    });
  }
}

@Injectable()
export class SyncTemplatesHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identifiers: UuidIdentifierService,
    private readonly secrets: AesSecretService,
    private readonly registry: ChannelProviderRegistry,
  ) {}

  async execute(organizationId: string, communicationAccountId: string) {
    const { account, ctx, provider } = await loadProviderAccount(
      this.prisma,
      this.secrets,
      this.registry,
      organizationId,
      communicationAccountId,
    );

    const synced = await provider.syncTemplates(ctx);

    const results = [];
    for (const t of synced) {
      const category = mapCategory(t.category);
      const status = mapStatus(t.status);
      const row = await this.prisma.messageTemplate.upsert({
        where: {
          organizationId_channelCode_name_language: {
            organizationId,
            channelCode: account.channelCode,
            name: t.name,
            language: t.language,
          },
        },
        create: {
          id: this.identifiers.generate(),
          organizationId,
          channelCode: account.channelCode,
          name: t.name,
          language: t.language,
          category,
          status,
          body: t.body,
          components: (t.components ?? null) as Prisma.InputJsonValue,
          providerTemplateId: t.providerTemplateId,
        },
        update: {
          category,
          status,
          body: t.body,
          components: (t.components ?? null) as Prisma.InputJsonValue,
          providerTemplateId: t.providerTemplateId,
          deletedAt: null,
        },
      });
      results.push(row);
    }

    return { synced: results.length, templates: results };
  }
}

@Injectable()
export class RefreshTemplateStatusHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: AesSecretService,
    private readonly registry: ChannelProviderRegistry,
  ) {}

  async execute(
    organizationId: string,
    templateId: string,
    communicationAccountId?: string,
  ) {
    const template = await this.prisma.messageTemplate.findFirst({
      where: { id: templateId, organizationId, deletedAt: null },
    });
    if (!template) {
      throw new NotFoundError('MessageTemplate', templateId);
    }

    let accountId = communicationAccountId;
    if (!accountId) {
      const account = await this.prisma.communicationAccount.findFirst({
        where: {
          organizationId,
          channelCode: template.channelCode,
          deletedAt: null,
          connectionStatus: AccountConnectionStatus.CONNECTED,
        },
        orderBy: { updatedAt: 'desc' },
      });
      if (!account) {
        throw new ProviderUnavailable(
          template.channelCode,
          'No connected WhatsApp account to refresh template status',
        );
      }
      accountId = account.id;
    }

    const { ctx, provider } = await loadProviderAccount(
      this.prisma,
      this.secrets,
      this.registry,
      organizationId,
      accountId,
    );

    const remote = await provider.getTemplate(ctx, {
      providerTemplateId: template.providerTemplateId,
      name: template.name,
      language: template.language,
    });

    if (!remote) {
      throw new NotFoundError(
        'MetaTemplate',
        `${template.name}/${template.language}`,
      );
    }

    return this.prisma.messageTemplate.update({
      where: { id: template.id },
      data: {
        status: mapStatus(remote.status),
        category: mapCategory(remote.category),
        body: remote.body || template.body,
        components: (remote.components ?? template.components) as
          | Prisma.InputJsonValue
          | undefined,
        providerTemplateId:
          remote.providerTemplateId || template.providerTemplateId,
      },
    });
  }
}

async function loadProviderAccount(
  prisma: PrismaService,
  secrets: AesSecretService,
  registry: ChannelProviderRegistry,
  organizationId: string,
  communicationAccountId: string,
): Promise<{
  account: {
    id: string;
    channelCode: ChannelCode;
    externalAccountId: string | null;
  };
  ctx: ChannelAccountContext;
  provider: ReturnType<ChannelProviderRegistry['get']>;
}> {
  const account = await prisma.communicationAccount.findFirst({
    where: {
      id: communicationAccountId,
      organizationId,
      deletedAt: null,
    },
  });
  if (!account) {
    throw new NotFoundError('CommunicationAccount', communicationAccountId);
  }
  if (!account.credentialsEnc) {
    throw new ProviderUnavailable(
      account.channelCode,
      'Account credentials not configured',
    );
  }

  const credentials = JSON.parse(
    secrets.decrypt(account.credentialsEnc),
  ) as {
    accessToken: string;
    phoneNumberId?: string;
    businessAccountId?: string;
  };

  const meta = (account.metadata as Record<string, unknown>) ?? {};
  const provider = registry.get(account.channelCode);
  const ctx: ChannelAccountContext = {
    accountId: account.id,
    organizationId,
    externalAccountId: account.externalAccountId ?? account.id,
    accessToken: credentials.accessToken,
    phoneNumberId:
      credentials.phoneNumberId ??
      (meta.phoneNumberId as string | undefined) ??
      account.externalAccountId ??
      undefined,
    businessAccountId:
      credentials.businessAccountId ??
      (meta.businessAccountId as string | undefined),
    metadata: meta,
  };

  return { account, ctx, provider };
}

function normalizeTemplateName(raw: string): string {
  const name = raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
  if (!name || !/^[a-z0-9_]+$/.test(name)) {
    throw new ValidationError(
      'Template name must be lowercase letters, numbers, and underscores only',
    );
  }
  return name;
}

function normalizeTemplateLanguage(raw?: string): string {
  const language = (raw ?? 'en_US').trim().replace('-', '_');
  if (/^[a-z]{2}$/i.test(language)) {
    const base = language.toLowerCase();
    if (base === 'en') return 'en_US';
    if (base === 'hi') return 'hi_IN';
    return `${base}_${base.toUpperCase()}`;
  }
  return language;
}

function mapCategory(value: string): TemplateCategory {
  const upper = value.toUpperCase();
  if (upper in TemplateCategory) {
    return upper as TemplateCategory;
  }
  return TemplateCategory.UTILITY;
}

function mapStatus(value: string): TemplateStatus {
  const upper = value.toUpperCase();
  if (upper in TemplateStatus) {
    return upper as TemplateStatus;
  }
  if (upper === 'PENDING_DELETION') return TemplateStatus.DISABLED;
  return TemplateStatus.PENDING;
}
