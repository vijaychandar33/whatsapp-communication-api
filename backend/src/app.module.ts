import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from './modules/prisma.module';
import { InfrastructureModule } from './modules/infrastructure.module';
import { AuthModule } from './modules/auth.module';
import { CommunicationModule } from './modules/communication.module';
import { GlobalExceptionFilter } from './presentation/filters/global-exception.filter';
import { TransformInterceptor } from './presentation/interceptors/transform.interceptor';
import { CorrelationIdInterceptor } from './presentation/interceptors/correlation-id.interceptor';
import { MESSAGE_QUEUE, BROADCAST_QUEUE } from './infrastructure/queue/message-queue.service';

function buildBullImports() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    return [];
  }

  try {
    const url = new URL(redisUrl);
    return [
      BullModule.forRoot({
        connection: {
          host: url.hostname,
          port: Number(url.port || 6379),
          password: url.password || undefined,
          maxRetriesPerRequest: null,
        },
      }),
      BullModule.registerQueue(
        { name: MESSAGE_QUEUE },
        { name: BROADCAST_QUEUE },
      ),
    ];
  } catch {
    return [];
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 120,
      },
    ]),
    EventEmitterModule.forRoot({
      wildcard: false,
      ignoreErrors: false,
    }),
    ...buildBullImports(),
    PrismaModule,
    InfrastructureModule,
    AuthModule,
    CommunicationModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: CorrelationIdInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
