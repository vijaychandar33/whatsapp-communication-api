import { Injectable, Logger } from '@nestjs/common';
import { ChannelCode, Prisma } from '@prisma/client';
import { PrismaService } from '../persistence/prisma/prisma.service';
import { UuidIdentifierService } from '../identifier/uuid-identifier.service';
import {
  ConversationOpenedEvent,
  MessageReceivedEvent,
  MessageSentEvent,
  MessageStatusUpdatedEvent,
} from '../../domain/events';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly identifiers: UuidIdentifierService,
  ) {}

  async handleOutboxEvent(event: {
    organizationId: string | null;
    eventType: string;
    payload: unknown;
  }): Promise<void> {
    if (!event.organizationId) return;

    const payload = (event.payload ?? {}) as Record<string, unknown>;
    const channelCode = this.resolveChannelCode(payload.channelCode);
    const date = this.utcDateOnly(new Date());

    try {
      switch (event.eventType) {
        case MessageReceivedEvent.TYPE:
          await this.increment(event.organizationId, channelCode, date, {
            messagesReceived: 1,
          });
          break;
        case MessageSentEvent.TYPE:
          await this.increment(event.organizationId, channelCode, date, {
            messagesSent: 1,
          });
          break;
        case MessageStatusUpdatedEvent.TYPE:
          if (String(payload.status).toUpperCase() === 'FAILED') {
            await this.increment(event.organizationId, channelCode, date, {
              messagesFailed: 1,
            });
          }
          break;
        case ConversationOpenedEvent.TYPE:
          await this.increment(event.organizationId, channelCode, date, {
            conversationsOpened: 1,
          });
          break;
        default:
          break;
      }
    } catch (err) {
      this.logger.warn(
        `Analytics upsert failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async increment(
    organizationId: string,
    channelCode: ChannelCode,
    date: Date,
    deltas: {
      messagesSent?: number;
      messagesReceived?: number;
      messagesFailed?: number;
      conversationsOpened?: number;
    },
  ): Promise<void> {
    await this.prisma.analyticsDailyStat.upsert({
      where: {
        organizationId_channelCode_date: {
          organizationId,
          channelCode,
          date,
        },
      },
      create: {
        id: this.identifiers.generate(),
        organizationId,
        channelCode,
        date,
        messagesSent: deltas.messagesSent ?? 0,
        messagesReceived: deltas.messagesReceived ?? 0,
        messagesFailed: deltas.messagesFailed ?? 0,
        conversationsOpened: deltas.conversationsOpened ?? 0,
      },
      update: {
        messagesSent: deltas.messagesSent
          ? { increment: deltas.messagesSent }
          : undefined,
        messagesReceived: deltas.messagesReceived
          ? { increment: deltas.messagesReceived }
          : undefined,
        messagesFailed: deltas.messagesFailed
          ? { increment: deltas.messagesFailed }
          : undefined,
        conversationsOpened: deltas.conversationsOpened
          ? { increment: deltas.conversationsOpened }
          : undefined,
      },
    });
  }

  private resolveChannelCode(value: unknown): ChannelCode {
    if (typeof value === 'string' && value in ChannelCode) {
      return value as ChannelCode;
    }
    return ChannelCode.WHATSAPP;
  }

  private utcDateOnly(d: Date): Date {
    return new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
    );
  }
}

@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identifiers: UuidIdentifierService,
  ) {}

  async writeFromOutbox(event: {
    id: string;
    organizationId: string | null;
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    payload: unknown;
  }): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        id: this.identifiers.generate(),
        organizationId: event.organizationId ?? undefined,
        action: event.eventType,
        resource: event.aggregateType,
        resourceId: event.aggregateId,
        metadata: {
          outboxEventId: event.id,
          payload: event.payload,
        } as Prisma.InputJsonValue,
      },
    });
  }
}
