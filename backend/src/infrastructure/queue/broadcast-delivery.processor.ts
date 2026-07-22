import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { CampaignsService } from '../../application/commands/campaigns.service';
import {
  BROADCAST_QUEUE,
  BroadcastJobPayload,
} from './message-queue.service';

@Processor(BROADCAST_QUEUE, {
  autorun: true,
  limiter: { max: 2, duration: 1000 },
})
export class BroadcastDeliveryProcessor extends WorkerHost {
  private readonly logger = new Logger(BroadcastDeliveryProcessor.name);

  constructor(private readonly campaigns: CampaignsService) {
    super();
  }

  async process(job: Job<BroadcastJobPayload>): Promise<void> {
    this.logger.log(`Delivering campaign ${job.data.broadcastId}`);
    await this.campaigns.deliver(
      job.data.organizationId,
      job.data.broadcastId,
    );
  }
}
