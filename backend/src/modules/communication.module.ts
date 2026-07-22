import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CommunicationSdk } from '../application/communication-sdk/communication.sdk';
import {
  BROADCAST_QUEUE,
  MESSAGE_QUEUE,
} from '../infrastructure/queue/message-queue.service';
import {
  CreateOrganizationHandler,
  CreateUserHandler,
  CreateRoleHandler,
  CreateApiKeyHandler,
} from '../application/commands/create-handlers';
import {
  CreateAccountHandler,
  UpdateAccountHandler,
  DeleteAccountHandler,
  ConnectAccountHandler,
  DisconnectAccountHandler,
  GetAccountStatusHandler,
} from '../application/commands/account-handlers';
import {
  CreateContactHandler,
  UpdateContactHandler,
  DeleteContactHandler,
} from '../application/commands/contact-handlers';
import {
  MarkConversationReadHandler,
  PatchConversationHandler,
} from '../application/commands/conversation-handlers';
import { TagsService } from '../application/commands/tags.service';
import { ContactListsService } from '../application/commands/contact-lists.service';
import {
  RefreshTemplateStatusHandler,
  SyncTemplatesHandler,
  DeleteTemplateHandler,
} from '../application/commands/template-handlers';
import {
  UploadMediaHandler,
  DeleteMediaHandler,
} from '../application/commands/media-handlers';
import { UpdateSettingsHandler } from '../application/commands/settings-handlers';
import { ProcessWebhookHandler } from '../application/commands/webhook-handlers';
import {
  ListOrganizationsHandler,
  GetOrganizationHandler,
  ListUsersHandler,
  GetUserHandler,
  ListRolesHandler,
  ListApiKeysHandler,
  ListMessagesHandler,
  GetMessageHandler,
} from '../application/queries/list-handlers';
import {
  ListAccountsHandler,
  GetAccountHandler,
  ListContactsHandler,
  GetContactHandler,
  ListConversationsHandler,
  GetConversationHandler,
  ListTemplatesHandler,
  ListMediaHandler,
  GetMediaHandler,
  GetSettingsHandler,
  ListAuditLogsHandler,
  GetDashboardHandler,
  GetAnalyticsHandler,
} from '../application/queries/resource-handlers';
import {
  OrganizationsController,
  UsersController,
  RolesController,
  ApiKeysController,
  InvitationsController,
} from '../presentation/admin/v1/admin-crud.controller';
import { AccountsController } from '../presentation/admin/v1/accounts.controller';
import { AdminContactsController } from '../presentation/admin/v1/contacts.controller';
import { ContactListsController } from '../presentation/admin/v1/contact-lists.controller';
import { ConversationsController } from '../presentation/admin/v1/conversations.controller';
import {
  ContactTagsNotesController,
  TagsController,
} from '../presentation/admin/v1/tags.controller';
import { TemplatesController } from '../presentation/admin/v1/templates.controller';
import { AdminMediaController } from '../presentation/admin/v1/media.controller';
import { AdminMessagesController } from '../presentation/admin/v1/messages.controller';
import {
  DashboardController,
  AnalyticsController,
  AuditController,
  SettingsController,
} from '../presentation/admin/v1/dashboard.controller';
import { HealthController } from '../presentation/admin/v1/health.controller';
import { MessagesController } from '../presentation/api/v1/messages.controller';
import { WhatsAppWebhookController } from '../presentation/api/v1/webhooks.controller';
import { ApiContactsController } from '../presentation/api/v1/contacts.controller';
import { ApiMediaController } from '../presentation/api/v1/media.controller';
import { RealtimeGateway } from '../presentation/realtime/realtime.gateway';
import { ApiKeyGuard } from '../presentation/guards/api-key.guard';
import { JwtOrApiKeyGuard } from '../presentation/guards/jwt-or-api-key.guard';
import { TenantScopeGuard } from '../presentation/guards/tenant-scope.guard';
import { RolesGuard } from '../presentation/guards/roles.guard';
import { OptionalJwtAuthGuard } from '../presentation/guards/optional-jwt-auth.guard';
import { MembersService } from '../application/commands/members.service';
import { CampaignsService } from '../application/commands/campaigns.service';
import { CampaignsController } from '../presentation/admin/v1/campaigns.controller';
import { AiService } from '../application/ai/ai.service';
import { LlmClient } from '../application/ai/llm.client';
import { AiController } from '../presentation/admin/v1/ai.controller';
import { SendMessageProcessor } from '../infrastructure/queue/send-message.processor';
import { BroadcastDeliveryProcessor } from '../infrastructure/queue/broadcast-delivery.processor';
import { AuthModule } from './auth.module';

const hasRedis = Boolean(process.env.REDIS_URL);
const queueProcessors = hasRedis
  ? [SendMessageProcessor, BroadcastDeliveryProcessor]
  : [];
const queueImports = hasRedis
  ? [
      BullModule.registerQueue(
        { name: MESSAGE_QUEUE },
        { name: BROADCAST_QUEUE },
      ),
    ]
  : [];

@Module({
  imports: [AuthModule, ...queueImports],
  controllers: [
    OrganizationsController,
    UsersController,
    RolesController,
    ApiKeysController,
    InvitationsController,
    AccountsController,
    AdminContactsController,
    ContactListsController,
    ConversationsController,
    TagsController,
    ContactTagsNotesController,
    TemplatesController,
    AdminMediaController,
    AdminMessagesController,
    CampaignsController,
    AiController,
    DashboardController,
    AnalyticsController,
    AuditController,
    SettingsController,
    HealthController,
    MessagesController,
    WhatsAppWebhookController,
    ApiContactsController,
    ApiMediaController,
  ],
  providers: [
    CommunicationSdk,
    CampaignsService,
    AiService,
    LlmClient,
    CreateOrganizationHandler,
    CreateUserHandler,
    CreateRoleHandler,
    CreateApiKeyHandler,
    CreateAccountHandler,
    UpdateAccountHandler,
    DeleteAccountHandler,
    ConnectAccountHandler,
    DisconnectAccountHandler,
    GetAccountStatusHandler,
    CreateContactHandler,
    UpdateContactHandler,
    DeleteContactHandler,
    PatchConversationHandler,
    MarkConversationReadHandler,
    TagsService,
    ContactListsService,
    SyncTemplatesHandler,
    RefreshTemplateStatusHandler,
    DeleteTemplateHandler,
    UploadMediaHandler,
    DeleteMediaHandler,
    UpdateSettingsHandler,
    ProcessWebhookHandler,
    ListOrganizationsHandler,
    GetOrganizationHandler,
    ListUsersHandler,
    GetUserHandler,
    ListRolesHandler,
    ListApiKeysHandler,
    ListMessagesHandler,
    GetMessageHandler,
    ListAccountsHandler,
    GetAccountHandler,
    ListContactsHandler,
    GetContactHandler,
    ListConversationsHandler,
    GetConversationHandler,
    ListTemplatesHandler,
    ListMediaHandler,
    GetMediaHandler,
    GetSettingsHandler,
    ListAuditLogsHandler,
    GetDashboardHandler,
    GetAnalyticsHandler,
    ApiKeyGuard,
    JwtOrApiKeyGuard,
    TenantScopeGuard,
    RolesGuard,
    OptionalJwtAuthGuard,
    MembersService,
    RealtimeGateway,
    ...queueProcessors,
  ],
  exports: [CommunicationSdk, CampaignsService, AiService],
})
export class CommunicationModule {}
