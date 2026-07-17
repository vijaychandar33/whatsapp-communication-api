import { createHmac, timingSafeEqual } from 'crypto';
import axios, { AxiosInstance } from 'axios';
import { Injectable, Logger } from '@nestjs/common';
import { ChannelCode, MessageType } from '../../../domain/enums';
import {
  CapabilityNotSupported,
  ProviderUnavailable,
} from '../../../domain/errors';
import {
  ChannelAccountContext,
  ChannelProvider,
  CreateProviderTemplateParams,
  CreatedProviderTemplate,
  MarkReadParams,
  ParsedWebhookEvent,
  ProviderSendResult,
  ProviderUploadResult,
  SendMediaParams,
  SendTemplateParams,
  SendTextParams,
  SyncedTemplate,
  UploadMediaParams,
} from '../../../domain/interfaces/channel-provider.interface';
import {
  ProviderCapabilities,
  WHATSAPP_CAPABILITIES,
} from '../../../domain/interfaces/provider-capabilities.interface';
import { AppConfigurationService } from '../../config/configuration.service';

@Injectable()
export class WhatsAppChannelProvider implements ChannelProvider {
  readonly channelCode = ChannelCode.WHATSAPP;
  private readonly logger = new Logger(WhatsAppChannelProvider.name);
  private readonly http: AxiosInstance;
  private readonly apiVersion: string;

  constructor(config: AppConfigurationService) {
    this.apiVersion = config.get().metaGraphApiVersion;
    this.http = axios.create({
      baseURL: `https://graph.facebook.com/${this.apiVersion}`,
      timeout: 30_000,
    });
  }

  getCapabilities(): ProviderCapabilities {
    return WHATSAPP_CAPABILITIES;
  }

  async sendText(
    ctx: ChannelAccountContext,
    params: SendTextParams,
  ): Promise<ProviderSendResult> {
    const phoneNumberId = ctx.phoneNumberId ?? ctx.externalAccountId;
    try {
      const { data } = await this.http.post<Record<string, unknown>>(
        `/${phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: params.to.replace(/^\+/, ''),
          type: 'text',
          text: {
            preview_url: params.previewUrl ?? false,
            body: params.body,
          },
        },
        {
          headers: { Authorization: `Bearer ${ctx.accessToken}` },
        },
      );
      return this.mapSendResult(data);
    } catch (err) {
      throw this.mapProviderError(err);
    }
  }

  async sendMedia(
    ctx: ChannelAccountContext,
    params: SendMediaParams,
  ): Promise<ProviderSendResult> {
    const caps = this.getCapabilities();
    if (!caps.supportsMedia) {
      throw new CapabilityNotSupported('media', this.channelCode);
    }

    const typeMap: Partial<Record<MessageType, string>> = {
      [MessageType.IMAGE]: 'image',
      [MessageType.AUDIO]: 'audio',
      [MessageType.VIDEO]: 'video',
      [MessageType.DOCUMENT]: 'document',
      [MessageType.STICKER]: 'sticker',
    };
    const mediaType = typeMap[params.mediaType];
    if (!mediaType) {
      throw new CapabilityNotSupported(
        `mediaType:${params.mediaType}`,
        this.channelCode,
      );
    }

    const mediaPayload: Record<string, unknown> = params.mediaId
      ? { id: params.mediaId }
      : { link: params.mediaUrl };
    if (params.caption && mediaType !== 'audio' && mediaType !== 'sticker') {
      mediaPayload.caption = params.caption;
    }
    if (params.fileName && mediaType === 'document') {
      mediaPayload.filename = params.fileName;
    }

    const phoneNumberId = ctx.phoneNumberId ?? ctx.externalAccountId;
    try {
      const { data } = await this.http.post<Record<string, unknown>>(
        `/${phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: params.to.replace(/^\+/, ''),
          type: mediaType,
          [mediaType]: mediaPayload,
        },
        {
          headers: { Authorization: `Bearer ${ctx.accessToken}` },
        },
      );
      return this.mapSendResult(data);
    } catch (err) {
      throw this.mapProviderError(err);
    }
  }

  async sendTemplate(
    ctx: ChannelAccountContext,
    params: SendTemplateParams,
  ): Promise<ProviderSendResult> {
    const phoneNumberId = ctx.phoneNumberId ?? ctx.externalAccountId;
    try {
      const { data } = await this.http.post<Record<string, unknown>>(
        `/${phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: params.to.replace(/^\+/, ''),
          type: 'template',
          template: {
            name: params.templateName,
            language: { code: params.language },
            components: params.components ?? [],
          },
        },
        {
          headers: { Authorization: `Bearer ${ctx.accessToken}` },
        },
      );
      return this.mapSendResult(data);
    } catch (err) {
      throw this.mapProviderError(err);
    }
  }

  async markRead(
    ctx: ChannelAccountContext,
    params: MarkReadParams,
  ): Promise<void> {
    const phoneNumberId = ctx.phoneNumberId ?? ctx.externalAccountId;
    try {
      await this.http.post(
        `/${phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: params.providerMessageId,
        },
        {
          headers: { Authorization: `Bearer ${ctx.accessToken}` },
        },
      );
    } catch (err) {
      throw this.mapProviderError(err);
    }
  }

  async uploadMedia(
    ctx: ChannelAccountContext,
    params: UploadMediaParams,
  ): Promise<ProviderUploadResult> {
    const phoneNumberId = ctx.phoneNumberId ?? ctx.externalAccountId;
    try {
      const form = new FormData();
      form.append('messaging_product', 'whatsapp');
      form.append('type', params.mimeType);
      form.append(
        'file',
        new Blob([new Uint8Array(params.data)], { type: params.mimeType }),
        params.fileName ?? 'file',
      );

      const { data } = await this.http.post<{ id: string }>(
        `/${phoneNumberId}/media`,
        form,
        {
          headers: { Authorization: `Bearer ${ctx.accessToken}` },
        },
      );

      return {
        providerMediaId: data.id,
        rawPayload: data as unknown as Record<string, unknown>,
      };
    } catch (err) {
      throw this.mapProviderError(err);
    }
  }

  parseWebhook(payload: Record<string, unknown>): ParsedWebhookEvent[] {
    const events: ParsedWebhookEvent[] = [];
    const entries =
      (payload.entry as Array<Record<string, unknown>> | undefined) ?? [];

    for (const entry of entries) {
      const changes =
        (entry.changes as Array<Record<string, unknown>> | undefined) ?? [];
      for (const change of changes) {
        const value = change.value as Record<string, unknown> | undefined;
        if (!value) continue;

        const contactName = (
          value.contacts as Array<{ profile?: { name?: string } }> | undefined
        )?.[0]?.profile?.name;

        const statuses =
          (value.statuses as Array<Record<string, unknown>> | undefined) ?? [];
        for (const status of statuses) {
          const errors = status.errors as
            | Array<{ code?: number; title?: string; message?: string }>
            | undefined;
          events.push({
            kind: 'status_update',
            providerMessageId: String(status.id ?? ''),
            status: String(status.status ?? ''),
            timestamp: status.timestamp
              ? String(status.timestamp)
              : undefined,
            errorCode: errors?.[0]?.code ? String(errors[0].code) : undefined,
            errorMessage: errors?.[0]?.message ?? errors?.[0]?.title,
            raw: status,
          });
        }

        const messages =
          (value.messages as Array<Record<string, unknown>> | undefined) ?? [];
        for (const msg of messages) {
          const type = String(msg.type ?? 'text');
          const textBody =
            (msg.text as { body?: string } | undefined)?.body ??
            (msg.button as { text?: string } | undefined)?.text ??
            (msg.interactive as { button_reply?: { title?: string } } | undefined)
              ?.button_reply?.title;

          events.push({
            kind: 'inbound_message',
            providerMessageId: String(msg.id ?? ''),
            from: String(msg.from ?? ''),
            timestamp: msg.timestamp ? String(msg.timestamp) : undefined,
            messageType: type,
            body: textBody,
            content: msg,
            contactName,
            raw: value,
          });
        }

        if (!statuses.length && !messages.length) {
          events.push({ kind: 'unknown', raw: value });
        }
      }
    }

    return events;
  }

  verifyWebhookSignature(
    rawBody: Buffer | string,
    signatureHeader: string,
    appSecret: string,
  ): boolean {
    if (!signatureHeader || !appSecret) return false;
    const expected = signatureHeader.startsWith('sha256=')
      ? signatureHeader.slice(7)
      : signatureHeader;
    const body =
      typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody;
    const digest = createHmac('sha256', appSecret).update(body).digest('hex');
    try {
      const a = Buffer.from(digest, 'utf8');
      const b = Buffer.from(expected, 'utf8');
      return a.length === b.length && timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  async syncTemplates(ctx: ChannelAccountContext): Promise<SyncedTemplate[]> {
    const wabaId = this.requireWabaId(ctx);

    try {
      const { data } = await this.http.get<{
        data?: Array<Record<string, unknown>>;
      }>(`/${wabaId}/message_templates`, {
        headers: { Authorization: `Bearer ${ctx.accessToken}` },
        params: { limit: 100 },
      });

      return (data.data ?? []).map((t) => this.mapSyncedTemplate(t));
    } catch (err) {
      throw this.mapProviderError(err);
    }
  }

  async createTemplate(
    ctx: ChannelAccountContext,
    params: CreateProviderTemplateParams,
  ): Promise<CreatedProviderTemplate> {
    const wabaId = this.requireWabaId(ctx);
    const components =
      params.components && params.components.length > 0
        ? params.components
        : [this.buildBodyComponent(params.body)];

    try {
      const { data } = await this.http.post<{
        id?: string;
        status?: string;
        category?: string;
      }>(
        `/${wabaId}/message_templates`,
        {
          name: params.name,
          language: params.language,
          category: params.category,
          allow_category_change: true,
          components,
        },
        {
          headers: { Authorization: `Bearer ${ctx.accessToken}` },
        },
      );

      const providerTemplateId = String(data.id ?? '');
      if (!providerTemplateId) {
        throw new ProviderUnavailable(
          this.channelCode,
          'Meta did not return a template id',
        );
      }

      return {
        providerTemplateId,
        name: params.name,
        language: params.language,
        category: String(data.category ?? params.category),
        status: String(data.status ?? 'PENDING'),
      };
    } catch (err) {
      throw this.mapProviderError(err);
    }
  }

  async getTemplate(
    ctx: ChannelAccountContext,
    params: {
      providerTemplateId?: string | null;
      name: string;
      language: string;
    },
  ): Promise<SyncedTemplate | null> {
    const wabaId = this.requireWabaId(ctx);

    try {
      if (params.providerTemplateId) {
        const { data } = await this.http.get<Record<string, unknown>>(
          `/${params.providerTemplateId}`,
          {
            headers: { Authorization: `Bearer ${ctx.accessToken}` },
            params: {
              fields:
                'id,name,language,status,category,components,rejected_reason',
            },
          },
        );
        return this.mapSyncedTemplate(data);
      }

      const { data } = await this.http.get<{
        data?: Array<Record<string, unknown>>;
      }>(`/${wabaId}/message_templates`, {
        headers: { Authorization: `Bearer ${ctx.accessToken}` },
        params: {
          name: params.name,
          language: params.language,
          fields: 'id,name,language,status,category,components',
          limit: 10,
        },
      });

      const match = (data.data ?? []).find(
        (t) =>
          String(t.name ?? '') === params.name &&
          String(t.language ?? '') === params.language,
      );
      return match ? this.mapSyncedTemplate(match) : null;
    } catch (err) {
      throw this.mapProviderError(err);
    }
  }

  private requireWabaId(ctx: ChannelAccountContext): string {
    const wabaId = ctx.businessAccountId ?? ctx.externalAccountId;
    if (!wabaId) {
      throw new ProviderUnavailable(
        this.channelCode,
        'Business account id required for template operations',
      );
    }
    return wabaId;
  }

  private mapSyncedTemplate(t: Record<string, unknown>): SyncedTemplate {
    const components = (t.components as unknown[]) ?? [];
    const bodyComp = components.find(
      (c) =>
        typeof c === 'object' &&
        c !== null &&
        (c as { type?: string }).type === 'BODY',
    ) as { text?: string } | undefined;

    return {
      providerTemplateId: String(t.id ?? ''),
      name: String(t.name ?? ''),
      language: String(t.language ?? 'en'),
      category: String(t.category ?? 'UTILITY'),
      status: String(t.status ?? 'PENDING'),
      body: bodyComp?.text ?? '',
      components,
    };
  }

  private buildBodyComponent(body: string): Record<string, unknown> {
    const component: Record<string, unknown> = {
      type: 'BODY',
      text: body,
    };

    const positional = [
      ...body.matchAll(/\{\{(\d+)\}\}/g),
    ].map((m) => Number(m[1]));
    if (positional.length > 0) {
      const max = Math.max(...positional);
      component.example = {
        body_text: [
          Array.from({ length: max }, (_, i) => `example_${i + 1}`),
        ],
      };
      return component;
    }

    const named = [
      ...body.matchAll(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g),
    ].map((m) => m[1]);
    if (named.length > 0) {
      component.example = {
        body_text_named_params: named.map((param_name) => ({
          param_name,
          example: `example_${param_name}`,
        })),
      };
    }

    return component;
  }

  private mapSendResult(data: Record<string, unknown>): ProviderSendResult {
    const messages = data.messages as Array<{ id: string }> | undefined;
    const providerMessageId = messages?.[0]?.id;
    if (!providerMessageId) {
      throw new ProviderUnavailable(
        this.channelCode,
        'Missing provider message id in response',
      );
    }
    return { providerMessageId, rawPayload: data };
  }

  private mapProviderError(err: unknown): Error {
    if (axios.isAxiosError(err)) {
      const detail =
        (err.response?.data as { error?: { message?: string } } | undefined)
          ?.error?.message ?? err.message;
      this.logger.error(`WhatsApp API error: ${detail}`);
      return new ProviderUnavailable(this.channelCode, detail);
    }
    return err instanceof Error
      ? err
      : new ProviderUnavailable(this.channelCode, String(err));
  }
}
