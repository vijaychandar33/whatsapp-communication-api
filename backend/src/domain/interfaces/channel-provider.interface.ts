import { ChannelCode, MessageType } from '../enums';
import { ProviderCapabilities } from './provider-capabilities.interface';

export interface SendTextParams {
  to: string;
  body: string;
  previewUrl?: boolean;
}

export interface SendMediaParams {
  to: string;
  mediaType: MessageType;
  mediaUrl?: string;
  mediaId?: string;
  caption?: string;
  fileName?: string;
}

export interface SendTemplateParams {
  to: string;
  templateName: string;
  language: string;
  components?: unknown[];
}

export interface MarkReadParams {
  providerMessageId: string;
}

export interface UploadMediaParams {
  data: Buffer;
  mimeType: string;
  fileName?: string;
}

export interface ProviderSendResult {
  providerMessageId: string;
  rawPayload: Record<string, unknown>;
  /** Meta BSUID from send response contacts[].user_id when present */
  recipientUserId?: string;
  recipientParentUserId?: string;
}

export interface ProviderUploadResult {
  providerMediaId: string;
  rawPayload: Record<string, unknown>;
}

export interface ChannelAccountContext {
  accountId: string;
  organizationId: string;
  externalAccountId: string;
  accessToken: string;
  phoneNumberId?: string;
  businessAccountId?: string;
  metadata?: Record<string, unknown>;
}

export type ParsedWebhookKind =
  | 'inbound_message'
  | 'status_update'
  | 'user_id_change'
  | 'unknown';

export interface ParsedWebhookInbound {
  kind: 'inbound_message';
  providerMessageId: string;
  /** Phone when present; may be empty for username adopters */
  from: string;
  /** Meta BSUID (`from_user_id` / contacts[].user_id) */
  fromUserId?: string;
  /** Meta parent BSUID when enrolled */
  fromParentUserId?: string;
  timestamp?: string;
  messageType: string;
  body?: string;
  content: Record<string, unknown>;
  contactName?: string;
  username?: string;
  raw: Record<string, unknown>;
}

export interface ParsedWebhookStatus {
  kind: 'status_update';
  providerMessageId: string;
  status: string;
  timestamp?: string;
  errorCode?: string;
  errorMessage?: string;
  /** Meta BSUID (`recipient_user_id` / contacts[].user_id) */
  recipientUserId?: string;
  recipientParentUserId?: string;
  contactName?: string;
  username?: string;
  /** Phone from contacts[].wa_id when present */
  recipientPhone?: string;
  raw: Record<string, unknown>;
}

/** System message when a WhatsApp user changes phone → new BSUID */
export interface ParsedWebhookUserIdChange {
  kind: 'user_id_change';
  providerMessageId: string;
  /** Old phone / from field when present */
  from?: string;
  /** New BSUID from system.user_id */
  newUserId?: string;
  newParentUserId?: string;
  /** New phone from system.wa_id when present */
  newPhone?: string;
  raw: Record<string, unknown>;
}

export interface ParsedWebhookUnknown {
  kind: 'unknown';
  raw: Record<string, unknown>;
}

export type ParsedWebhookEvent =
  | ParsedWebhookInbound
  | ParsedWebhookStatus
  | ParsedWebhookUserIdChange
  | ParsedWebhookUnknown;

export interface SyncedTemplate {
  providerTemplateId: string;
  name: string;
  language: string;
  category: string;
  status: string;
  body: string;
  components?: unknown;
}

export interface CreateProviderTemplateParams {
  name: string;
  language: string;
  category: string;
  body: string;
  components?: unknown[];
}

export interface CreatedProviderTemplate {
  providerTemplateId: string;
  name: string;
  language: string;
  category: string;
  status: string;
}

export interface ChannelProvider {
  readonly channelCode: ChannelCode;
  getCapabilities(): ProviderCapabilities;
  sendText(
    ctx: ChannelAccountContext,
    params: SendTextParams,
  ): Promise<ProviderSendResult>;
  sendMedia(
    ctx: ChannelAccountContext,
    params: SendMediaParams,
  ): Promise<ProviderSendResult>;
  sendTemplate(
    ctx: ChannelAccountContext,
    params: SendTemplateParams,
  ): Promise<ProviderSendResult>;
  markRead(
    ctx: ChannelAccountContext,
    params: MarkReadParams,
  ): Promise<void>;
  uploadMedia(
    ctx: ChannelAccountContext,
    params: UploadMediaParams,
  ): Promise<ProviderUploadResult>;
  parseWebhook(payload: Record<string, unknown>): ParsedWebhookEvent[];
  verifyWebhookSignature(
    rawBody: Buffer | string,
    signatureHeader: string,
    appSecret: string,
  ): boolean;
  syncTemplates(ctx: ChannelAccountContext): Promise<SyncedTemplate[]>;
  createTemplate(
    ctx: ChannelAccountContext,
    params: CreateProviderTemplateParams,
  ): Promise<CreatedProviderTemplate>;
  getTemplate(
    ctx: ChannelAccountContext,
    params: {
      providerTemplateId?: string | null;
      name: string;
      language: string;
    },
  ): Promise<SyncedTemplate | null>;
}
