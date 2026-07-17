import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { CommunicationSdk } from '../../application/communication-sdk/communication.sdk';
import {
  MESSAGE_QUEUE,
  SendMessageJobPayload,
} from './message-queue.service';

@Processor(MESSAGE_QUEUE, { autorun: false })
export class SendMessageProcessor extends WorkerHost {
  private readonly logger = new Logger(SendMessageProcessor.name);

  constructor(private readonly sdk: CommunicationSdk) {
    super();
  }

  async process(job: Job<SendMessageJobPayload>): Promise<void> {
    this.logger.debug(`Processing send-message job ${job.id}`);
    await this.sdk.processOutboundMessage(job.data.messageId);
  }
}
