import { Injectable, Logger } from '@nestjs/common';
import {
  BroadcastAudienceType,
  BroadcastRecipientStatus,
  BroadcastStatus,
  MessageType,
  Prisma,
} from '@prisma/client';
import { NotFoundError, ValidationError } from '../../domain/errors';
import { PhoneNumber } from '../../domain/value-objects/phone-number.vo';
import { PrismaService } from '../../infrastructure/persistence/prisma/prisma.service';
import { UuidIdentifierService } from '../../infrastructure/identifier/uuid-identifier.service';
import { MessageQueueService } from '../../infrastructure/queue/message-queue.service';
import { CommunicationSdk } from '../communication-sdk/communication.sdk';
import {
  PaginationDto,
  buildPaginatedMeta,
} from '../../presentation/dto/pagination.dto';

const MAX_RECIPIENTS = 2000;
const SEND_BATCH_SIZE = 10;
const SEND_BATCH_DELAY_MS = 1000;

export type AudienceFilter = {
  tagIds?: string[];
  contactIds?: string[];
  listIds?: string[];
  phones?: string[];
  paramsByContactId?: Record<string, string[]>;
  paramsByPhone?: Record<string, string[]>;
};

export interface CreateCampaignInput {
  organizationId: string;
  communicationAccountId: string;
  createdByUserId?: string;
  name: string;
  templateName: string;
  templateLanguage?: string;
  templateComponents?: unknown;
  audienceType: BroadcastAudienceType;
  audienceFilter?: AudienceFilter;
  scheduledAt?: string | Date | null;
}

@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);
  private readonly delivering = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly identifiers: UuidIdentifierService,
    private readonly sdk: CommunicationSdk,
    private readonly queue: MessageQueueService,
  ) {}

  async list(organizationId: string, pagination: PaginationDto) {
    const where = { organizationId };
    const [items, total] = await Promise.all([
      this.prisma.broadcast.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { createdAt: 'desc' },
        include: {
          communicationAccount: {
            select: {
              id: true,
              name: true,
              phoneNumber: true,
              channelCode: true,
            },
          },
        },
      }),
      this.prisma.broadcast.count({ where }),
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

  async get(organizationId: string, id: string) {
    const broadcast = await this.prisma.broadcast.findFirst({
      where: { id, organizationId },
      include: {
        communicationAccount: {
          select: {
            id: true,
            name: true,
            phoneNumber: true,
            channelCode: true,
          },
        },
        recipients: {
          orderBy: { createdAt: 'asc' },
          take: 200,
          include: {
            contact: {
              select: {
                id: true,
                displayName: true,
                phoneNumber: true,
              },
            },
          },
        },
      },
    });
    if (!broadcast) throw new NotFoundError('Campaign', id);
    return broadcast;
  }

  async previewAudience(organizationId: string, input: CreateCampaignInput) {
    const contacts = await this.resolveAudience(organizationId, input);
    return {
      count: contacts.length,
      sample: contacts.slice(0, 20).map((c) => ({
        contactId: c.contactId,
        phoneNumber: c.phoneNumber,
        displayName: c.displayName,
      })),
    };
  }

  async create(input: CreateCampaignInput) {
    await this.requireAccount(
      input.organizationId,
      input.communicationAccountId,
    );
    this.validateTemplate(input);

    const audience = await this.resolveAudience(input.organizationId, input);
    if (audience.length === 0) {
      throw new ValidationError('Audience resolved to zero contacts with phones');
    }
    if (audience.length > MAX_RECIPIENTS) {
      throw new ValidationError(
        `Audience capped at ${MAX_RECIPIENTS}; split larger campaigns`,
      );
    }

    const scheduledAt = input.scheduledAt
      ? new Date(input.scheduledAt)
      : null;
    const status =
      scheduledAt && scheduledAt.getTime() > Date.now()
        ? BroadcastStatus.SCHEDULED
        : BroadcastStatus.DRAFT;

    return this.prisma.broadcast.create({
      data: {
        id: this.identifiers.generate(),
        organizationId: input.organizationId,
        communicationAccountId: input.communicationAccountId,
        createdByUserId: input.createdByUserId || null,
        name: input.name.trim(),
        status,
        audienceType: input.audienceType,
        audienceFilter: (input.audienceFilter ?? {}) as Prisma.InputJsonValue,
        templateName: input.templateName.trim(),
        templateLanguage: input.templateLanguage?.trim() || 'en',
        templateComponents: (input.templateComponents ??
          null) as Prisma.InputJsonValue,
        scheduledAt,
        totalCount: audience.length,
      },
    });
  }

  async start(organizationId: string, id: string) {
    const broadcast = await this.prisma.broadcast.findFirst({
      where: { id, organizationId },
    });
    if (!broadcast) throw new NotFoundError('Campaign', id);
    if (
      broadcast.status !== BroadcastStatus.DRAFT &&
      broadcast.status !== BroadcastStatus.SCHEDULED
    ) {
      throw new ValidationError(
        `Cannot start campaign in status ${broadcast.status}`,
      );
    }

    const audience = await this.resolveAudience(organizationId, {
      audienceType: broadcast.audienceType,
      audienceFilter: (broadcast.audienceFilter || {}) as AudienceFilter,
    });

    if (audience.length === 0) {
      throw new ValidationError('No recipients to send');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.broadcastRecipient.deleteMany({ where: { broadcastId: id } });
      await tx.broadcastRecipient.createMany({
        data: audience.map((r) => ({
          id: this.identifiers.generate(),
          broadcastId: id,
          contactId: r.contactId,
          phoneNumber: r.phoneNumber,
          status: BroadcastRecipientStatus.PENDING,
          params: (r.params ?? []) as Prisma.InputJsonValue,
        })),
      });
      await tx.broadcast.update({
        where: { id },
        data: {
          status: BroadcastStatus.SENDING,
          startedAt: new Date(),
          totalCount: audience.length,
          sentCount: 0,
          deliveredCount: 0,
          readCount: 0,
          failedCount: 0,
          skippedCount: 0,
          errorMessage: null,
          completedAt: null,
        },
      });
    });

    const enqueued = await this.queue.enqueueBroadcast({
      broadcastId: id,
      organizationId,
    });
    if (!enqueued) {
      setImmediate(() => {
        void this.deliver(organizationId, id);
      });
    }

    return this.get(organizationId, id);
  }

  async cancel(organizationId: string, id: string) {
    const broadcast = await this.prisma.broadcast.findFirst({
      where: { id, organizationId },
    });
    if (!broadcast) throw new NotFoundError('Campaign', id);
    if (
      broadcast.status === BroadcastStatus.COMPLETED ||
      broadcast.status === BroadcastStatus.CANCELLED
    ) {
      throw new ValidationError(`Campaign already ${broadcast.status}`);
    }

    await this.prisma.$transaction(async (tx) => {
      const skipped = await tx.broadcastRecipient.updateMany({
        where: {
          broadcastId: id,
          status: BroadcastRecipientStatus.PENDING,
        },
        data: { status: BroadcastRecipientStatus.CANCELLED },
      });
      await tx.broadcast.update({
        where: { id },
        data: {
          status: BroadcastStatus.CANCELLED,
          completedAt: new Date(),
          skippedCount: { increment: skipped.count },
        },
      });
    });

    return this.get(organizationId, id);
  }

  async deliver(organizationId: string, broadcastId: string) {
    if (this.delivering.has(broadcastId)) return;
    this.delivering.add(broadcastId);

    try {
      const broadcast = await this.prisma.broadcast.findFirst({
        where: { id: broadcastId, organizationId },
      });
      if (!broadcast) return;
      if (broadcast.status === BroadcastStatus.CANCELLED) return;
      if (
        broadcast.status !== BroadcastStatus.SENDING &&
        broadcast.status !== BroadcastStatus.DRAFT &&
        broadcast.status !== BroadcastStatus.FAILED
      ) {
        return;
      }

      if (broadcast.status !== BroadcastStatus.SENDING) {
        await this.prisma.broadcast.update({
          where: { id: broadcastId },
          data: { status: BroadcastStatus.SENDING, startedAt: new Date() },
        });
      }

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const current = await this.prisma.broadcast.findUnique({
          where: { id: broadcastId },
        });
        if (!current || current.status === BroadcastStatus.CANCELLED) break;

        const batch = await this.prisma.broadcastRecipient.findMany({
          where: {
            broadcastId,
            status: BroadcastRecipientStatus.PENDING,
          },
          take: SEND_BATCH_SIZE,
          orderBy: { createdAt: 'asc' },
        });
        if (batch.length === 0) break;

        for (const recipient of batch) {
          const still = await this.prisma.broadcast.findUnique({
            where: { id: broadcastId },
            select: { status: true },
          });
          if (!still || still.status === BroadcastStatus.CANCELLED) {
            await this.prisma.broadcastRecipient.updateMany({
              where: {
                broadcastId,
                status: BroadcastRecipientStatus.PENDING,
              },
              data: { status: BroadcastRecipientStatus.CANCELLED },
            });
            return;
          }

          try {
            const params = Array.isArray(recipient.params)
              ? (recipient.params as string[])
              : [];
            const components =
              params.length > 0
                ? [
                    {
                      type: 'body',
                      parameters: params.map((text) => ({
                        type: 'text',
                        text,
                      })),
                    },
                  ]
                : ((broadcast.templateComponents as unknown[]) ?? undefined);

            const result = await this.sdk.send({
              organizationId,
              communicationAccountId: broadcast.communicationAccountId,
              to: recipient.phoneNumber,
              messageType: MessageType.TEMPLATE,
              templateName: broadcast.templateName,
              templateLanguage: broadcast.templateLanguage,
              templateComponents: components,
              contactId: recipient.contactId || undefined,
              idempotencyKey: `broadcast:${broadcastId}:${recipient.id}`,
            });

            await this.prisma.broadcastRecipient.update({
              where: { id: recipient.id },
              data: {
                status: BroadcastRecipientStatus.QUEUED,
                messageId: result.messageId,
                sentAt: new Date(),
              },
            });
            await this.prisma.broadcast.update({
              where: { id: broadcastId },
              data: { sentCount: { increment: 1 } },
            });
          } catch (err) {
            const message =
              err instanceof Error ? err.message : 'Send failed';
            this.logger.warn(
              `Campaign ${broadcastId} recipient ${recipient.id}: ${message}`,
            );
            await this.prisma.broadcastRecipient.update({
              where: { id: recipient.id },
              data: {
                status: BroadcastRecipientStatus.FAILED,
                errorMessage: message.slice(0, 500),
              },
            });
            await this.prisma.broadcast.update({
              where: { id: broadcastId },
              data: { failedCount: { increment: 1 } },
            });
          }
        }

        await sleep(SEND_BATCH_DELAY_MS);
      }

      const remaining = await this.prisma.broadcastRecipient.count({
        where: {
          broadcastId,
          status: BroadcastRecipientStatus.PENDING,
        },
      });
      const latest = await this.prisma.broadcast.findUnique({
        where: { id: broadcastId },
      });
      if (!latest) return;
      if (latest.status === BroadcastStatus.CANCELLED) return;

      if (remaining === 0) {
        await this.prisma.broadcast.update({
          where: { id: broadcastId },
          data: {
            status: BroadcastStatus.COMPLETED,
            completedAt: new Date(),
          },
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Delivery failed';
      this.logger.error(`Campaign ${broadcastId} failed: ${message}`);
      await this.prisma.broadcast.update({
        where: { id: broadcastId },
        data: {
          status: BroadcastStatus.FAILED,
          errorMessage: message.slice(0, 500),
          completedAt: new Date(),
        },
      });
    } finally {
      this.delivering.delete(broadcastId);
    }
  }

  async applyMessageStatus(
    messageId: string,
    status: BroadcastRecipientStatus,
  ) {
    const recipient = await this.prisma.broadcastRecipient.findFirst({
      where: { messageId },
    });
    if (!recipient) return;

    const rank: Record<string, number> = {
      PENDING: 0,
      QUEUED: 1,
      SENT: 2,
      DELIVERED: 3,
      READ: 4,
      FAILED: 5,
      SKIPPED: 5,
      CANCELLED: 5,
    };
    if ((rank[status] || 0) <= (rank[recipient.status] || 0)) {
      if (status !== BroadcastRecipientStatus.FAILED) return;
    }

    const data: Prisma.BroadcastRecipientUpdateInput = { status };
    if (status === BroadcastRecipientStatus.DELIVERED) {
      data.deliveredAt = new Date();
    }
    if (status === BroadcastRecipientStatus.READ) {
      data.readAt = new Date();
      if (!recipient.deliveredAt) data.deliveredAt = new Date();
    }

    await this.prisma.broadcastRecipient.update({
      where: { id: recipient.id },
      data,
    });

    const increments: Prisma.BroadcastUpdateInput = {};
    if (
      status === BroadcastRecipientStatus.DELIVERED &&
      recipient.status !== BroadcastRecipientStatus.DELIVERED &&
      recipient.status !== BroadcastRecipientStatus.READ
    ) {
      increments.deliveredCount = { increment: 1 };
    }
    if (
      status === BroadcastRecipientStatus.READ &&
      recipient.status !== BroadcastRecipientStatus.READ
    ) {
      increments.readCount = { increment: 1 };
      if (recipient.status !== BroadcastRecipientStatus.DELIVERED) {
        increments.deliveredCount = { increment: 1 };
      }
    }
    if (
      status === BroadcastRecipientStatus.FAILED &&
      recipient.status !== BroadcastRecipientStatus.FAILED
    ) {
      increments.failedCount = { increment: 1 };
    }
    if (status === BroadcastRecipientStatus.SENT && recipient.status === BroadcastRecipientStatus.QUEUED) {
      // already counted in sentCount at queue time
    }

    if (Object.keys(increments).length > 0) {
      await this.prisma.broadcast.update({
        where: { id: recipient.broadcastId },
        data: increments,
      });
    }
  }

  private validateTemplate(input: CreateCampaignInput) {
    if (!input.name?.trim()) throw new ValidationError('name required');
    if (!input.templateName?.trim()) {
      throw new ValidationError('templateName required');
    }
  }

  private async requireAccount(organizationId: string, accountId: string) {
    const account = await this.prisma.communicationAccount.findFirst({
      where: {
        id: accountId,
        organizationId,
        deletedAt: null,
      },
    });
    if (!account) throw new NotFoundError('CommunicationAccount', accountId);
    return account;
  }

  private async resolveAudience(
    organizationId: string,
    input: Pick<
      CreateCampaignInput,
      'audienceType' | 'audienceFilter'
    >,
  ): Promise<
    {
      contactId: string;
      phoneNumber: string;
      displayName?: string | null;
      params: string[];
    }[]
  > {
    const filter = input.audienceFilter || {};
    const paramsByContactId = filter.paramsByContactId || {};
    const paramsByPhone = filter.paramsByPhone || {};

    let contacts: {
      id: string;
      phoneNumber: string | null;
      displayName: string | null;
    }[] = [];

    if (input.audienceType === BroadcastAudienceType.ALL) {
      contacts = await this.prisma.contact.findMany({
        where: {
          organizationId,
          deletedAt: null,
          phoneNumber: { not: null },
        },
        select: { id: true, phoneNumber: true, displayName: true },
        take: MAX_RECIPIENTS + 1,
      });
    } else if (input.audienceType === BroadcastAudienceType.TAGS) {
      const tagIds = filter.tagIds || [];
      if (tagIds.length === 0) {
        throw new ValidationError('tagIds required for TAGS audience');
      }
      contacts = await this.prisma.contact.findMany({
        where: {
          organizationId,
          deletedAt: null,
          phoneNumber: { not: null },
          tags: { some: { tagId: { in: tagIds } } },
        },
        select: { id: true, phoneNumber: true, displayName: true },
        take: MAX_RECIPIENTS + 1,
      });
    } else if (input.audienceType === BroadcastAudienceType.CONTACTS) {
      const contactIds = filter.contactIds || [];
      if (contactIds.length === 0) {
        throw new ValidationError('contactIds required for CONTACTS audience');
      }
      contacts = await this.prisma.contact.findMany({
        where: {
          organizationId,
          deletedAt: null,
          id: { in: contactIds },
          phoneNumber: { not: null },
        },
        select: { id: true, phoneNumber: true, displayName: true },
        take: MAX_RECIPIENTS + 1,
      });
    } else if (input.audienceType === BroadcastAudienceType.CONTACT_LISTS) {
      const listIds = filter.listIds || [];
      if (listIds.length === 0) {
        throw new ValidationError(
          'listIds required for CONTACT_LISTS audience',
        );
      }
      contacts = await this.prisma.contact.findMany({
        where: {
          organizationId,
          deletedAt: null,
          phoneNumber: { not: null },
          listMemberships: { some: { listId: { in: listIds } } },
        },
        select: { id: true, phoneNumber: true, displayName: true },
        take: MAX_RECIPIENTS + 1,
      });
    } else if (input.audienceType === BroadcastAudienceType.MANUAL) {
      const phones = filter.phones || [];
      if (phones.length === 0) {
        throw new ValidationError('phones required for MANUAL audience');
      }
      const resolved: typeof contacts = [];
      for (const raw of phones.slice(0, MAX_RECIPIENTS + 1)) {
        let phone: string;
        try {
          phone = PhoneNumber.create(raw).toString();
        } catch {
          continue;
        }
        let contact = await this.prisma.contact.findUnique({
          where: {
            organizationId_phoneNumber: { organizationId, phoneNumber: phone },
          },
        });
        if (!contact) {
          contact = await this.prisma.contact.create({
            data: {
              id: this.identifiers.generate(),
              organizationId,
              phoneNumber: phone,
              displayName: phone,
            },
          });
        } else if (contact.deletedAt) {
          contact = await this.prisma.contact.update({
            where: { id: contact.id },
            data: { deletedAt: null },
          });
        }
        resolved.push({
          id: contact.id,
          phoneNumber: contact.phoneNumber,
          displayName: contact.displayName,
        });
      }
      contacts = resolved;
    } else {
      throw new ValidationError('Invalid audienceType');
    }

    const seen = new Set<string>();
    const out: {
      contactId: string;
      phoneNumber: string;
      displayName?: string | null;
      params: string[];
    }[] = [];

    for (const c of contacts) {
      if (!c.phoneNumber || seen.has(c.id)) continue;
      seen.add(c.id);
      out.push({
        contactId: c.id,
        phoneNumber: c.phoneNumber,
        displayName: c.displayName,
        params:
          paramsByContactId[c.id] ||
          paramsByPhone[c.phoneNumber] ||
          [],
      });
    }
    return out;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
