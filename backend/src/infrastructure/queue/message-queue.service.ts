import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

export const MESSAGE_QUEUE = 'message-jobs';

export interface SendMessageJobPayload {
  messageId: string;
  organizationId: string;
}

@Injectable()
export class MessageQueueService implements OnModuleInit {
  private readonly logger = new Logger(MessageQueueService.name);
  private queue: Queue | null = null;

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
  }

  get isAvailable(): boolean {
    return this.queue !== null;
  }

  async enqueueSend(payload: SendMessageJobPayload): Promise<boolean> {
    if (!this.queue) {
      return false;
    }
    await this.queue.add('send-message', payload, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
    return true;
  }
}
