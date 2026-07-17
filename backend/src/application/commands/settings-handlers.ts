import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { NotFoundError } from '../../domain/errors';
import { PrismaService } from '../../infrastructure/persistence/prisma/prisma.service';
import { UuidIdentifierService } from '../../infrastructure/identifier/uuid-identifier.service';

export interface UpdateSettingsCommand {
  organizationId: string;
  timezone?: string;
  locale?: string;
  webhookUrl?: string | null;
  webhookSecret?: string | null;
  settings?: Record<string, unknown>;
}

@Injectable()
export class UpdateSettingsHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identifiers: UuidIdentifierService,
  ) {}

  async execute(cmd: UpdateSettingsCommand) {
    const org = await this.prisma.organization.findFirst({
      where: { id: cmd.organizationId, deletedAt: null },
    });
    if (!org) throw new NotFoundError('Organization', cmd.organizationId);

    return this.prisma.organizationSettings.upsert({
      where: { organizationId: cmd.organizationId },
      create: {
        id: this.identifiers.generate(),
        organizationId: cmd.organizationId,
        timezone: cmd.timezone ?? 'UTC',
        locale: cmd.locale ?? 'en',
        webhookUrl: cmd.webhookUrl ?? undefined,
        webhookSecret: cmd.webhookSecret ?? undefined,
        settings: (cmd.settings ?? {}) as Prisma.InputJsonValue,
      },
      update: {
        timezone: cmd.timezone,
        locale: cmd.locale,
        webhookUrl: cmd.webhookUrl === null ? null : cmd.webhookUrl,
        webhookSecret: cmd.webhookSecret === null ? null : cmd.webhookSecret,
        settings:
          cmd.settings !== undefined
            ? (cmd.settings as Prisma.InputJsonValue)
            : undefined,
      },
    });
  }
}
