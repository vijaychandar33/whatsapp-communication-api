import { Module } from '@nestjs/common';
import { CommunicationSdk } from '../application/communication-sdk/communication.sdk';
import {
  CreateOrganizationHandler,
  CreateUserHandler,
  CreateRoleHandler,
  CreateApiKeyHandler,
} from '../application/commands/create-handlers';
import {
  CreateAccountHandler,
  UpdateAccountHandler,
  ConnectAccountHandler,
  DisconnectAccountHandler,
  GetAccountStatusHandler,
} from '../application/commands/account-handlers';
import {
  CreateContactHandler,
  UpdateContactHandler,
  DeleteContactHandler,
} from '../application/commands/contact-handlers';
import { PatchConversationHandler } from '../application/commands/conversation-handlers';
import {
  CreateTemplateHandler,
  SyncTemplatesHandler,
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
} from '../presentation/admin/v1/admin-crud.controller';
import { AccountsController } from '../presentation/admin/v1/accounts.controller';
import { AdminContactsController } from '../presentation/admin/v1/contacts.controller';
import { ConversationsController } from '../presentation/admin/v1/conversations.controller';
import { TemplatesController } from '../presentation/admin/v1/templates.controller';
import { AdminMediaController } from '../presentation/admin/v1/media.controller';
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
import { AuthModule } from './auth.module';

@Module({
  imports: [AuthModule],
  controllers: [
    OrganizationsController,
    UsersController,
    RolesController,
    ApiKeysController,
    AccountsController,
    AdminContactsController,
    ConversationsController,
    TemplatesController,
    AdminMediaController,
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
    CreateOrganizationHandler,
    CreateUserHandler,
    CreateRoleHandler,
    CreateApiKeyHandler,
    CreateAccountHandler,
    UpdateAccountHandler,
    ConnectAccountHandler,
    DisconnectAccountHandler,
    GetAccountStatusHandler,
    CreateContactHandler,
    UpdateContactHandler,
    DeleteContactHandler,
    PatchConversationHandler,
    CreateTemplateHandler,
    SyncTemplatesHandler,
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
    RealtimeGateway,
  ],
  exports: [CommunicationSdk],
})
export class CommunicationModule {}
