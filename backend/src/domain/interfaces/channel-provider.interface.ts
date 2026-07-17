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

export type ParsedWebhookKind = 'inbound_message' | 'status_update' | 'unknown';

export interface ParsedWebhookInbound {
  kind: 'inbound_message';
  providerMessageId: string;
  from: string;
  timestamp?: string;
  messageType: string;
  body?: string;
  content: Record<string, unknown>;
  contactName?: string;
  raw: Record<string, unknown>;
}

export interface ParsedWebhookStatus {
  kind: 'status_update';
  providerMessageId: string;
  status: string;
  timestamp?: string;
  errorCode?: string;
  errorMessage?: string;
  raw: Record<string, unknown>;
}

export interface ParsedWebhookUnknown {
  kind: 'unknown';
  raw: Record<string, unknown>;
}

export type ParsedWebhookEvent =
  | ParsedWebhookInbound
  | ParsedWebhookStatus
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
