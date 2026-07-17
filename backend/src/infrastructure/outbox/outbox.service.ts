import { Injectable, Logger, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OutboxStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../persistence/prisma/prisma.service';
import { UuidIdentifierService } from '../identifier/uuid-identifier.service';
import { SystemClock } from '../clock/system-clock';
import { AnalyticsService, AuditService } from '../analytics/analytics.service';

export interface WriteOutboxParams {
  organizationId?: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  availableAt?: Date;
}

export const OUTBOX_PROCESSED_EVENT = 'outbox.processed';

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);
  private readonly maxAttempts = 5;

  constructor(
    private readonly prisma: PrismaService,
    private readonly identifiers: UuidIdentifierService,
    private readonly clock: SystemClock,
    @Optional() private readonly eventEmitter?: EventEmitter2,
    @Optional() private readonly analytics?: AnalyticsService,
    @Optional() private readonly audit?: AuditService,
  ) {}

  async write(
    params: WriteOutboxParams,
    tx?: Prisma.TransactionClient,
  ): Promise<string> {
    const client = tx ?? this.prisma;
    const id = this.identifiers.generate();
    await client.outboxEvent.create({
      data: {
        id,
        organizationId: params.organizationId,
        aggregateType: params.aggregateType,
        aggregateId: params.aggregateId,
        eventType: params.eventType,
        payload: params.payload as Prisma.InputJsonValue,
        status: OutboxStatus.PENDING,
        availableAt: params.availableAt ?? this.clock.now(),
      },
    });
    return id;
  }

  async processPending(limit = 50): Promise<number> {
    const now = this.clock.now();
    const events = await this.prisma.outboxEvent.findMany({
      where: {
        OR: [
          {
            status: OutboxStatus.PENDING,
            availableAt: { lte: now },
          },
          {
            status: OutboxStatus.FAILED,
            availableAt: { lte: now },
            attempts: { lt: this.maxAttempts },
          },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    let processed = 0;
    for (const event of events) {
      try {
        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: {
            status: OutboxStatus.PROCESSING,
            attempts: { increment: 1 },
          },
        });

        await this.dispatch(event);

        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: {
            status: OutboxStatus.PROCESSED,
            processedAt: this.clock.now(),
            lastError: null,
          },
        });
        processed += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const nextAttempts = event.attempts + 1;
        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: {
            status:
              nextAttempts >= this.maxAttempts
                ? OutboxStatus.DEAD
                : OutboxStatus.FAILED,
            lastError: message,
            availableAt: new Date(
              this.clock.nowMs() + Math.min(300_000, 30_000 * nextAttempts),
            ),
          },
        });
        this.logger.error(`Outbox ${event.id} failed: ${message}`);
      }
    }
    return processed;
  }

  private async dispatch(event: {
    id: string;
    organizationId: string | null;
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    payload: Prisma.JsonValue;
  }): Promise<void> {
    this.logger.debug(
      `Processing outbox ${event.id} type=${event.eventType}`,
    );

    await this.analytics?.handleOutboxEvent({
      organizationId: event.organizationId,
      eventType: event.eventType,
      payload: event.payload,
    });

    await this.audit?.writeFromOutbox({
      id: event.id,
      organizationId: event.organizationId,
      eventType: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      payload: event.payload,
    });

    if (this.eventEmitter) {
      await this.eventEmitter.emitAsync(OUTBOX_PROCESSED_EVENT, event);
    }
  }
}
