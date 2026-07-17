import { Injectable } from '@nestjs/common';
import {
  ChannelCode,
  Prisma,
  TemplateCategory,
  TemplateStatus,
} from '@prisma/client';
import { NotFoundError, ProviderUnavailable } from '../../domain/errors';
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
}

@Injectable()
export class CreateTemplateHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identifiers: UuidIdentifierService,
  ) {}

  async execute(cmd: CreateTemplateCommand) {
    return this.prisma.messageTemplate.create({
      data: {
        id: this.identifiers.generate(),
        organizationId: cmd.organizationId,
        channelCode: cmd.channelCode,
        name: cmd.name,
        language: cmd.language ?? 'en',
        category: cmd.category,
        body: cmd.body,
        components: (cmd.components ?? null) as Prisma.InputJsonValue,
        status: cmd.status ?? TemplateStatus.DRAFT,
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
    const account = await this.prisma.communicationAccount.findFirst({
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
      this.secrets.decrypt(account.credentialsEnc),
    ) as {
      accessToken: string;
      phoneNumberId?: string;
      businessAccountId?: string;
    };

    const meta = (account.metadata as Record<string, unknown>) ?? {};
    const provider = this.registry.get(account.channelCode);
    const synced = await provider.syncTemplates({
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
    });

    const results = [];
    for (const t of synced) {
      const category = this.mapCategory(t.category);
      const status = this.mapStatus(t.status);
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

  private mapCategory(value: string): TemplateCategory {
    const upper = value.toUpperCase();
    if (upper in TemplateCategory) {
      return upper as TemplateCategory;
    }
    return TemplateCategory.UTILITY;
  }

  private mapStatus(value: string): TemplateStatus {
    const upper = value.toUpperCase();
    if (upper in TemplateStatus) {
      return upper as TemplateStatus;
    }
    if (upper === 'PENDING_DELETION') return TemplateStatus.DISABLED;
    return TemplateStatus.PENDING;
  }
}
