import { Injectable } from '@nestjs/common';
import { ChannelCode, ConversationStatus, Prisma } from '@prisma/client';
import { NotFoundError } from '../../domain/errors';
import { PrismaService } from '../../infrastructure/persistence/prisma/prisma.service';
import { UuidIdentifierService } from '../../infrastructure/identifier/uuid-identifier.service';
import {
  buildPaginatedMeta,
  PaginationDto,
} from '../../presentation/dto/pagination.dto';

@Injectable()
export class ListAccountsHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(organizationId: string | undefined, pagination: PaginationDto) {
    const where = {
      deletedAt: null,
      ...(organizationId ? { organizationId } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.communicationAccount.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          organizationId: true,
          channelCode: true,
          name: true,
          phoneNumber: true,
          externalAccountId: true,
          connectionStatus: true,
          metadata: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.communicationAccount.count({ where }),
    ]);
    return {
      data: items,
      meta: buildPaginatedMeta(
        pagination.page ?? 1,
        pagination.limit ?? 20,
        total,
      ),
    };
  }
}

@Injectable()
export class GetAccountHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(id: string) {
    const account = await this.prisma.communicationAccount.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        organizationId: true,
        channelId: true,
        channelCode: true,
        name: true,
        phoneNumber: true,
        externalAccountId: true,
        connectionStatus: true,
        metadata: true,
        webhookVerifyToken: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!account) throw new NotFoundError('CommunicationAccount', id);
    return account;
  }
}

@Injectable()
export class ListContactsHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(organizationId: string, pagination: PaginationDto) {
    const where = { organizationId, deletedAt: null };
    const [items, total] = await Promise.all([
      this.prisma.contact.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.contact.count({ where }),
    ]);
    return {
      data: items,
      meta: buildPaginatedMeta(
        pagination.page ?? 1,
        pagination.limit ?? 20,
        total,
      ),
    };
  }
}

@Injectable()
export class GetContactHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(organizationId: string, id: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!contact) throw new NotFoundError('Contact', id);
    return contact;
  }
}

@Injectable()
export class ListConversationsHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    organizationId: string,
    pagination: PaginationDto,
    filters?: { status?: ConversationStatus },
  ) {
    const where = {
      organizationId,
      deletedAt: null,
      ...(filters?.status ? { status: filters.status } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }],
        include: {
          contact: true,
          communicationAccount: {
            select: {
              id: true,
              name: true,
              channelCode: true,
              phoneNumber: true,
            },
          },
        },
      }),
      this.prisma.conversation.count({ where }),
    ]);
    return {
      data: items,
      meta: buildPaginatedMeta(
        pagination.page ?? 1,
        pagination.limit ?? 20,
        total,
      ),
    };
  }
}

@Injectable()
export class GetConversationHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(organizationId: string, id: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: {
        contact: true,
        communicationAccount: {
          select: {
            id: true,
            name: true,
            channelCode: true,
            phoneNumber: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    });
    if (!conversation) throw new NotFoundError('Conversation', id);
    return conversation;
  }
}

@Injectable()
export class ListTemplatesHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    organizationId: string,
    pagination: PaginationDto,
    channelCode?: ChannelCode,
  ) {
    const where = {
      organizationId,
      deletedAt: null,
      ...(channelCode ? { channelCode } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.messageTemplate.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.messageTemplate.count({ where }),
    ]);
    return {
      data: items,
      meta: buildPaginatedMeta(
        pagination.page ?? 1,
        pagination.limit ?? 20,
        total,
      ),
    };
  }
}

@Injectable()
export class ListMediaHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(organizationId: string, pagination: PaginationDto) {
    const where = { organizationId, deletedAt: null };
    const [items, total] = await Promise.all([
      this.prisma.media.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.media.count({ where }),
    ]);
    return {
      data: items,
      meta: buildPaginatedMeta(
        pagination.page ?? 1,
        pagination.limit ?? 20,
        total,
      ),
    };
  }
}

@Injectable()
export class GetMediaHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(organizationId: string, id: string) {
    const media = await this.prisma.media.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!media) throw new NotFoundError('Media', id);
    return media;
  }
}

@Injectable()
export class GetSettingsHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identifiers: UuidIdentifierService,
  ) {}

  async execute(organizationId: string) {
    let settings = await this.prisma.organizationSettings.findUnique({
      where: { organizationId },
    });
    if (!settings) {
      settings = await this.prisma.organizationSettings.create({
        data: {
          id: this.identifiers.generate(),
          organizationId,
        },
      });
    }
    return settings;
  }
}

@Injectable()
export class ListAuditLogsHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(organizationId: string | undefined, pagination: PaginationDto) {
    const where = organizationId ? { organizationId } : {};
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return {
      data: items,
      meta: buildPaginatedMeta(
        pagination.page ?? 1,
        pagination.limit ?? 20,
        total,
      ),
    };
  }
}

@Injectable()
export class GetDashboardHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(organizationId: string) {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    const [
      messagesToday,
      openConversations,
      failedToday,
      recentStats,
      inboundToday,
      outboundToday,
    ] = await Promise.all([
      this.prisma.message.count({
        where: {
          organizationId,
          createdAt: { gte: startOfDay },
        },
      }),
      this.prisma.conversation.count({
        where: {
          organizationId,
          status: ConversationStatus.OPEN,
          deletedAt: null,
        },
      }),
      this.prisma.message.count({
        where: {
          organizationId,
          status: 'FAILED',
          createdAt: { gte: startOfDay },
        },
      }),
      this.prisma.analyticsDailyStat.findMany({
        where: {
          organizationId,
          date: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
        orderBy: { date: 'desc' },
      }),
      this.prisma.message.count({
        where: {
          organizationId,
          direction: 'INBOUND',
          createdAt: { gte: startOfDay },
        },
      }),
      this.prisma.message.count({
        where: {
          organizationId,
          direction: 'OUTBOUND',
          createdAt: { gte: startOfDay },
        },
      }),
    ]);

    const aggregated = recentStats.reduce(
      (acc, row) => {
        acc.messagesSent += row.messagesSent;
        acc.messagesReceived += row.messagesReceived;
        acc.messagesFailed += row.messagesFailed;
        acc.conversationsOpened += row.conversationsOpened;
        return acc;
      },
      {
        messagesSent: 0,
        messagesReceived: 0,
        messagesFailed: 0,
        conversationsOpened: 0,
      },
    );

    return {
      live: {
        messagesToday,
        inboundToday,
        outboundToday,
        openConversations,
        failedToday,
      },
      last7Days: aggregated,
      dailyStats: recentStats,
    };
  }
}

@Injectable()
export class GetAnalyticsHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(params: {
    organizationId: string;
    from?: Date;
    to?: Date;
    channelCode?: ChannelCode;
  }) {
    const where: Prisma.AnalyticsDailyStatWhereInput = {
      organizationId: params.organizationId,
      ...(params.channelCode ? { channelCode: params.channelCode } : {}),
      ...(params.from || params.to
        ? {
            date: {
              ...(params.from ? { gte: params.from } : {}),
              ...(params.to ? { lte: params.to } : {}),
            },
          }
        : {}),
    };

    const items = await this.prisma.analyticsDailyStat.findMany({
      where,
      orderBy: { date: 'asc' },
    });

    return { data: items };
  }
}
