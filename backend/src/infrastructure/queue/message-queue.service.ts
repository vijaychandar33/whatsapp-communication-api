import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

export const MESSAGE_QUEUE = 'message-jobs';
export const BROADCAST_QUEUE = 'broadcast-jobs';

export interface SendMessageJobPayload {
  messageId: string;
  organizationId: string;
}

export interface BroadcastJobPayload {
  broadcastId: string;
  organizationId: string;
}

@Injectable()
export class MessageQueueService implements OnModuleInit {
  private readonly logger = new Logger(MessageQueueService.name);
  private queue: Queue | null = null;
  private broadcastQueue: Queue | null = null;

  constructor(private readonly moduleRef: ModuleRef) {}

  onModuleInit(): void {
    try {
      this.queue = this.moduleRef.get<Queue>(getQueueToken(MESSAGE_QUEUE), {
        strict: false,
      });
      this.logger.log('BullMQ message queue attached');
    } catch {
      this.queue = null;
      this.logger.warn('BullMQ queue unavailable — inline processing fallback');
    }
    try {
      this.broadcastQueue = this.moduleRef.get<Queue>(
        getQueueToken(BROADCAST_QUEUE),
        { strict: false },
      );
      this.logger.log('BullMQ broadcast queue attached');
    } catch {
      this.broadcastQueue = null;
    }
  }

  get isAvailable(): boolean {
    return this.queue !== null;
  }

  async enqueueSend(payload: SendMessageJobPayload): Promise<boolean> {
    if (!this.queue) {
      return false;
    }
    await this.queue.add('send-message', payload, {
      jobId: `send:${payload.messageId}`,
      attempts: 5,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
    return true;
  }

  async enqueueBroadcast(payload: BroadcastJobPayload): Promise<boolean> {
    if (!this.broadcastQueue) {
      return false;
    }
    await this.broadcastQueue.add('deliver-broadcast', payload, {
      jobId: `broadcast:${payload.broadcastId}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 200,
      removeOnFail: 500,
    });
    return true;
  }
}
