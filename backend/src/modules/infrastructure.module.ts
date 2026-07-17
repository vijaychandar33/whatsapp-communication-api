import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import {
  CONFIGURATION_SERVICE,
} from '../domain/interfaces/configuration.interface';
import { SECRET_SERVICE } from '../domain/interfaces/secret-service.interface';
import { CACHE_SERVICE } from '../domain/interfaces/cache-service.interface';
import { CLOCK } from '../domain/interfaces/clock.interface';
import { IDENTIFIER_SERVICE } from '../domain/interfaces/identifier.interface';
import { OBJECT_STORAGE } from '../domain/interfaces/object-storage.interface';
import { AppConfigurationService } from '../infrastructure/config/configuration.service';
import { AesSecretService } from '../infrastructure/secrets/secret.service';
import { AppCacheService } from '../infrastructure/cache/cache.service';
import { SystemClock } from '../infrastructure/clock/system-clock';
import { UuidIdentifierService } from '../infrastructure/identifier/uuid-identifier.service';
import { LocalObjectStorageProvider } from '../infrastructure/storage/local-object-storage.provider';
import { OutboxService } from '../infrastructure/outbox/outbox.service';
import { IdempotencyService } from '../infrastructure/idempotency/idempotency.service';
import { ObservabilityService } from '../infrastructure/observability/observability.service';
import { FeatureFlagService } from '../infrastructure/feature-flags/feature-flag.service';
import { PluginRegistry } from '../infrastructure/plugins/plugin.registry';
import { WhatsAppChannelProvider } from '../infrastructure/providers/whatsapp/whatsapp-channel.provider';
import { ChannelProviderRegistry } from '../infrastructure/providers/channel-provider.registry';
import { MessageQueueService } from '../infrastructure/queue/message-queue.service';
import {
  AnalyticsService,
  AuditService,
} from '../infrastructure/analytics/analytics.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    AppConfigurationService,
    { provide: CONFIGURATION_SERVICE, useExisting: AppConfigurationService },
    AesSecretService,
    { provide: SECRET_SERVICE, useExisting: AesSecretService },
    AppCacheService,
    { provide: CACHE_SERVICE, useExisting: AppCacheService },
    SystemClock,
    { provide: CLOCK, useExisting: SystemClock },
    UuidIdentifierService,
    { provide: IDENTIFIER_SERVICE, useExisting: UuidIdentifierService },
    LocalObjectStorageProvider,
    { provide: OBJECT_STORAGE, useExisting: LocalObjectStorageProvider },
    AnalyticsService,
    AuditService,
    OutboxService,
    IdempotencyService,
    ObservabilityService,
    FeatureFlagService,
    PluginRegistry,
    WhatsAppChannelProvider,
    ChannelProviderRegistry,
    MessageQueueService,
  ],
  exports: [
    AppConfigurationService,
    CONFIGURATION_SERVICE,
    AesSecretService,
    SECRET_SERVICE,
    AppCacheService,
    CACHE_SERVICE,
    SystemClock,
    CLOCK,
    UuidIdentifierService,
    IDENTIFIER_SERVICE,
    LocalObjectStorageProvider,
    OBJECT_STORAGE,
    AnalyticsService,
    AuditService,
    OutboxService,
    IdempotencyService,
    ObservabilityService,
    FeatureFlagService,
    PluginRegistry,
    WhatsAppChannelProvider,
    ChannelProviderRegistry,
    MessageQueueService,
  ],
})
export class InfrastructureModule {}
