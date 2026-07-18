import { Injectable } from '@nestjs/common';
import { ChannelCode, ConversationStatus, Prisma } from '@prisma/client';
import { NotFoundError } from '../../domain/errors';
import { PrismaService } from '../../infrastructure/persistence/prisma/prisma.service';
import { UuidIdentifierService } from '../../infrastructure/identifier/uuid-identifier.service';
import { AesSecretService } from '../../infrastructure/secrets/secret.service';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: AesSecretService,
  ) {}

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
        credentialsEnc: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!account) throw new NotFoundError('CommunicationAccount', id);

    let accessToken: string | undefined;
    let webhookSecret: string | undefined;
    let phoneNumberId: string | undefined;
    let businessAccountId: string | undefined;

    if (account.credentialsEnc) {
      try {
        const creds = JSON.parse(
          this.secrets.decrypt(account.credentialsEnc),
        ) as {
          accessToken?: string;
          webhookSecret?: string;
          phoneNumberId?: string;
          businessAccountId?: string;
        };
        accessToken = creds.accessToken;
        webhookSecret = creds.webhookSecret;
        phoneNumberId = creds.phoneNumberId;
        businessAccountId = creds.businessAccountId;
      } catch {
        // leave secrets unset if decrypt fails
      }
    }

    const { credentialsEnc: _, ...rest } = account;
    const meta = (rest.metadata as Record<string, unknown>) ?? {};

    return {
      ...rest,
      accessToken: accessToken ?? null,
      webhookSecret: webhookSecret ?? null,
      metadata: {
        ...meta,
        phoneNumberId:
          phoneNumberId ??
          (typeof meta.phoneNumberId === 'string' ? meta.phoneNumberId : undefined),
        businessAccountId:
          businessAccountId ??
          (typeof meta.businessAccountId === 'string'
            ? meta.businessAccountId
            : undefined),
      },
    };
  }
}

@Injectable()
export class ListContactsHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    organizationId: string,
    pagination: PaginationDto,
    filters?: { q?: string; tagId?: string },
  ) {
    const where = {
      organizationId,
      deletedAt: null,
      ...(filters?.tagId
        ? { tags: { some: { tagId: filters.tagId } } }
        : {}),
      ...(filters?.q
        ? {
            OR: [
              {
                displayName: {
                  contains: filters.q,
                  mode: 'insensitive' as const,
                },
              },
              {
                phoneNumber: {
                  contains: filters.q,
                  mode: 'insensitive' as const,
                },
              },
              {
                email: { contains: filters.q, mode: 'insensitive' as const },
              },
              {
                company: { contains: filters.q, mode: 'insensitive' as const },
              },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.contact.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { createdAt: 'desc' },
        include: {
          tags: { include: { tag: true } },
          conversations: {
            where: { deletedAt: null },
            select: {
              communicationAccount: {
                select: {
                  id: true,
                  name: true,
                  phoneNumber: true,
                },
              },
            },
            take: 20,
          },
        },
      }),
      this.prisma.contact.count({ where }),
    ]);
    return {
      data: items.map((c) => {
        const accountsById = new Map<
          string,
          { id: string; name: string; phoneNumber: string | null }
        >();
        for (const conv of c.conversations) {
          const a = conv.communicationAccount;
          if (a) accountsById.set(a.id, a);
        }
        const { conversations: _conversations, ...rest } = c;
        return {
          ...rest,
          tags: c.tags.map((t) => t.tag),
          whatsappAccounts: [...accountsById.values()],
        };
      }),
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
      include: {
        tags: { include: { tag: true } },
        notes: { orderBy: { createdAt: 'desc' }, take: 50 },
        conversations: {
          where: { deletedAt: null },
          select: {
            communicationAccount: {
              select: {
                id: true,
                name: true,
                phoneNumber: true,
              },
            },
          },
          take: 20,
        },
      },
    });
    if (!contact) throw new NotFoundError('Contact', id);
    const accountsById = new Map<
      string,
      { id: string; name: string; phoneNumber: string | null }
    >();
    for (const conv of contact.conversations) {
      const a = conv.communicationAccount;
      if (a) accountsById.set(a.id, a);
    }
    const { conversations: _conversations, ...rest } = contact;
    return {
      ...rest,
      tags: contact.tags.map((t) => t.tag),
      whatsappAccounts: [...accountsById.values()],
    };
  }
}

@Injectable()
export class ListConversationsHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    organizationId: string,
    pagination: PaginationDto,
    filters?: {
      status?: ConversationStatus;
      assignedToUserId?: string;
      unreadOnly?: boolean;
      q?: string;
    },
  ) {
    const where = {
      organizationId,
      deletedAt: null,
      ...(filters?.status ? { status: filters.status } : {}),
      ...(filters?.assignedToUserId
        ? { assignedToUserId: filters.assignedToUserId }
        : {}),
      ...(filters?.unreadOnly ? { unreadCount: { gt: 0 } } : {}),
      ...(filters?.q
        ? {
            OR: [
              {
                contact: {
                  displayName: { contains: filters.q, mode: 'insensitive' as const },
                },
              },
              {
                contact: {
                  phoneNumber: { contains: filters.q, mode: 'insensitive' as const },
                },
              },
              {
                lastMessageText: {
                  contains: filters.q,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [
          { isPinned: 'desc' },
          { lastMessageAt: 'desc' },
          { updatedAt: 'desc' },
        ],
        include: {
          contact: {
            include: { tags: { include: { tag: true } } },
          },
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
      data: items.map((c) => ({
        ...c,
        contact: c.contact
          ? {
              ...c.contact,
              tags: c.contact.tags.map((t) => t.tag),
            }
          : c.contact,
      })),
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
        contact: {
          include: {
            tags: { include: { tag: true } },
            notes: { orderBy: { createdAt: 'desc' }, take: 20 },
          },
        },
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
          take: 100,
        },
      },
    });
    if (!conversation) throw new NotFoundError('Conversation', id);
    const lastCustomer = conversation.lastCustomerMessageAt;
    const windowMs = 24 * 60 * 60 * 1000;
    const sessionExpiresAt = lastCustomer
      ? new Date(lastCustomer.getTime() + windowMs)
      : null;
    const sessionOpen = Boolean(
      sessionExpiresAt && sessionExpiresAt.getTime() > Date.now(),
    );
    return {
      ...conversation,
      sessionOpen,
      sessionExpiresAt,
      contact: conversation.contact
        ? {
            ...conversation.contact,
            tags: conversation.contact.tags.map((t) => t.tag),
          }
        : conversation.contact,
      messages: [...conversation.messages].reverse(),
    };
  }
}

@Injectable()
export class ListTemplatesHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    organizationId: string,
    pagination: PaginationDto,
    channelCode?: ChannelCode,
    communicationAccountId?: string,
  ) {
    const where = {
      organizationId,
      deletedAt: null,
      ...(channelCode ? { channelCode } : {}),
      ...(communicationAccountId
        ? { communicationAccountId }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.messageTemplate.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { updatedAt: 'desc' },
        include: {
          communicationAccount: {
            select: {
              id: true,
              name: true,
              phoneNumber: true,
              connectionStatus: true,
            },
          },
        },
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

    const userIds = [
      ...new Set(
        items
          .map((item) => item.userId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const users =
      userIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, email: true },
          })
        : [];
    const emailById = new Map(users.map((u) => [u.id, u.email]));

    return {
      data: items.map((item) => ({
        ...item,
        actorId: item.userId,
        actorEmail: item.userId ? emailById.get(item.userId) ?? null : null,
        resourceType: item.resource,
      })),
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

  async execute(organizationId: string, rangeDays = 7) {
    const days = [7, 30, 90].includes(rangeDays) ? rangeDays : 7;
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const startOfYesterday = new Date(startOfDay);
    startOfYesterday.setUTCDate(startOfYesterday.getUTCDate() - 1);
    const seriesFrom = new Date(startOfDay);
    seriesFrom.setUTCDate(seriesFrom.getUTCDate() - (days - 1));

    const [
      messagesToday,
      openConversations,
      failedToday,
      inboundToday,
      outboundToday,
      newContactsToday,
      messagesYesterday,
      newContactsYesterday,
      openConversationsYesterday,
      recentStats,
      recentMessages,
      recentContacts,
    ] = await Promise.all([
      this.prisma.message.count({
        where: { organizationId, createdAt: { gte: startOfDay } },
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
      this.prisma.contact.count({
        where: {
          organizationId,
          deletedAt: null,
          createdAt: { gte: startOfDay },
        },
      }),
      this.prisma.message.count({
        where: {
          organizationId,
          createdAt: { gte: startOfYesterday, lt: startOfDay },
        },
      }),
      this.prisma.contact.count({
        where: {
          organizationId,
          deletedAt: null,
          createdAt: { gte: startOfYesterday, lt: startOfDay },
        },
      }),
      this.prisma.conversation.count({
        where: {
          organizationId,
          status: ConversationStatus.OPEN,
          deletedAt: null,
          createdAt: { lt: startOfDay },
        },
      }),
      this.prisma.analyticsDailyStat.findMany({
        where: {
          organizationId,
          date: { gte: seriesFrom },
        },
        orderBy: { date: 'asc' },
      }),
      this.prisma.message.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          direction: true,
          body: true,
          createdAt: true,
          status: true,
        },
      }),
      this.prisma.contact.findMany({
        where: { organizationId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          displayName: true,
          phoneNumber: true,
          createdAt: true,
        },
      }),
    ]);

    const byDay = new Map<
      string,
      { day: string; inbound: number; outbound: number }
    >();
    for (let i = 0; i < days; i++) {
      const d = new Date(seriesFrom);
      d.setUTCDate(seriesFrom.getUTCDate() + i);
      const key = d.toISOString().slice(0, 10);
      byDay.set(key, { day: key, inbound: 0, outbound: 0 });
    }
    for (const row of recentStats) {
      const key = row.date.toISOString().slice(0, 10);
      const bucket = byDay.get(key);
      if (bucket) {
        bucket.inbound += row.messagesReceived;
        bucket.outbound += row.messagesSent;
      }
    }

    // Fallback live series from messages if analytics empty
    if (recentStats.length === 0) {
      const msgs = await this.prisma.message.findMany({
        where: {
          organizationId,
          createdAt: { gte: seriesFrom },
        },
        select: { createdAt: true, direction: true },
      });
      for (const m of msgs) {
        const key = m.createdAt.toISOString().slice(0, 10);
        const bucket = byDay.get(key);
        if (!bucket) continue;
        if (m.direction === 'INBOUND') bucket.inbound += 1;
        else bucket.outbound += 1;
      }
    }

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

    const activity = [
      ...recentMessages.map((m) => ({
        id: m.id,
        kind: 'message' as const,
        summary: `${m.direction} ${m.status}${m.body ? `: ${m.body.slice(0, 80)}` : ''}`,
        createdAt: m.createdAt,
      })),
      ...recentContacts.map((c) => ({
        id: c.id,
        kind: 'contact' as const,
        summary: `New contact ${c.displayName || c.phoneNumber || c.id.slice(0, 8)}`,
        createdAt: c.createdAt,
      })),
    ]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 15);

    return {
      live: {
        messagesToday,
        inboundToday,
        outboundToday,
        openConversations,
        failedToday,
        newContactsToday,
        messagesYesterday,
        newContactsYesterday,
        openConversationsYesterday,
      },
      last7Days: aggregated,
      dailyStats: recentStats,
      series: Array.from(byDay.values()),
      activity,
      rangeDays: days,
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
