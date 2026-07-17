import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { OutboxService } from '../infrastructure/outbox/outbox.service';
import { CommunicationSdk } from '../application/communication-sdk/communication.sdk';
import { MessageQueueService } from '../infrastructure/queue/message-queue.service';

/**
 * Lightweight worker loop for outbox + optional queue fallback.
 * Prefer BullMQ workers in production when REDIS_URL is set.
 */
async function runWorker(): Promise<void> {
  const logger = new Logger('Worker');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const outbox = app.get(OutboxService);
  const queue = app.get(MessageQueueService);
  const sdk = app.get(CommunicationSdk);

  logger.log(
    `Worker started (queue=${queue.isAvailable ? 'bullmq' : 'inline-fallback'})`,
  );

  const tick = async () => {
    try {
      const n = await outbox.processPending(50);
      if (n > 0) logger.debug(`Processed ${n} outbox events`);
    } catch (err) {
      logger.error(
        `Outbox tick failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  // Keep reference so tree-shaking / unused doesn't drop SDK availability
  void sdk;

  await tick();
  setInterval(() => {
    void tick();
  }, 5_000);
}

runWorker().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
