import { Injectable, Logger } from '@nestjs/common';
import {
  ChannelCode,
  MessageDirection,
  MessageStatus,
  MessageType,
  Prisma,
} from '@prisma/client';
import { MessageQueuedEvent, MessageSentEvent } from '../../domain/events';
import { ChannelAccountContext } from '../../domain/interfaces/channel-provider.interface';
import { MessageType as DomainMessageType } from '../../domain/enums';
import { NotFoundError, ProviderUnavailable } from '../../domain/errors';
import { PhoneNumber } from '../../domain/value-objects/phone-number.vo';
import { PrismaService } from '../../infrastructure/persistence/prisma/prisma.service';
import { ChannelProviderRegistry } from '../../infrastructure/providers/channel-provider.registry';
import { AesSecretService } from '../../infrastructure/secrets/secret.service';
import { OutboxService } from '../../infrastructure/outbox/outbox.service';
import { MessageQueueService } from '../../infrastructure/queue/message-queue.service';
import { UuidIdentifierService } from '../../infrastructure/identifier/uuid-identifier.service';
import { SystemClock } from '../../infrastructure/clock/system-clock';

export interface SendMessageInput {
  organizationId: string;
  communicationAccountId: string;
  to: string;
  body?: string;
  messageType?: MessageType;
  content?: Record<string, unknown>;
  mediaUrl?: string;
  mediaId?: string;
  caption?: string;
  templateName?: string;
  templateLanguage?: string;
  templateComponents?: unknown[];
  contactId?: string;
  conversationId?: string;
  idempotencyKey?: string;
}

export interface SendMessageResult {
  messageId: string;
  status: MessageStatus;
  conversationId: string;
}

@Injectable()
export class CommunicationSdk {
  private readonly logger = new Logger(CommunicationSdk.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ChannelProviderRegistry,
    private readonly secrets: AesSecretService,
    private readonly outbox: OutboxService,
    private readonly queue: MessageQueueService,
    private readonly identifiers: UuidIdentifierService,
    private readonly clock: SystemClock,
  ) {}

  async sendText(
    organizationId: string,
    communicationAccountId: string,
    to: string,
    body: string,
    idempotencyKey?: string,
  ): Promise<SendMessageResult> {
    return this.send({
      organizationId,
      communicationAccountId,
      to,
      body,
      messageType: MessageType.TEXT,
      idempotencyKey,
    });
  }

  async send(input: SendMessageInput): Promise<SendMessageResult> {
    const account = await this.prisma.communicationAccount.findFirst({
      where: {
        id: input.communicationAccountId,
        organizationId: input.organizationId,
        deletedAt: null,
      },
    });
    if (!account) {
      throw new NotFoundError('CommunicationAccount', input.communicationAccountId);
    }

    const contact = await this.resolveContact(
      input.organizationId,
      input.to,
      input.contactId,
    );

    const conversation = await this.resolveConversation(
      input.organizationId,
      contact.id,
      account.id,
      account.channelCode,
      input.conversationId,
    );

    const messageId = this.identifiers.generate();
    const messageType = input.messageType ?? MessageType.TEXT;
    const toE164 = contact.phoneNumber || PhoneNumber.create(input.to).toString();

    await this.prisma.$transaction(async (tx) => {
      await tx.message.create({
        data: {
          id: messageId,
          organizationId: input.organizationId,
          conversationId: conversation.id,
          contactId: contact.id,
          communicationAccountId: account.id,
          channelCode: account.channelCode,
          direction: MessageDirection.OUTBOUND,
          messageType,
          status: MessageStatus.QUEUED,
          body: input.body,
          content: (input.content ?? {
            to: toE164,
            mediaUrl: input.mediaUrl,
            mediaId: input.mediaId,
            caption: input.caption,
            templateName: input.templateName,
            templateLanguage: input.templateLanguage,
            templateComponents: input.templateComponents,
          }) as Prisma.InputJsonValue,
          idempotencyKey: input.idempotencyKey,
        },
      });

      await tx.messageStatusHistory.create({
        data: {
          id: this.identifiers.generate(),
          messageId,
          status: MessageStatus.QUEUED,
        },
      });

      const preview =
        (input.body || '').trim().slice(0, 500) ||
        (input.templateName
          ? `[template:${input.templateName}]`
          : messageType
            ? `[${messageType}]`
            : null);
      await tx.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: this.clock.now(),
          lastMessageText: preview,
        },
      });

      await this.outbox.write(
        {
          organizationId: input.organizationId,
          aggregateType: 'Message',
          aggregateId: messageId,
          eventType: MessageQueuedEvent.TYPE,
          payload: {
            messageId,
            channelCode: account.channelCode,
          },
        },
        tx,
      );
    });

    const enqueued = await this.queue.enqueueSend({
      messageId,
      organizationId: input.organizationId,
    });

    if (!enqueued) {
      // Inline fallback when Redis/BullMQ unavailable
      await this.processOutboundMessage(messageId);
    }

    return {
      messageId,
      status: MessageStatus.QUEUED,
      conversationId: conversation.id,
    };
  }

  async markRead(
    organizationId: string,
    communicationAccountId: string,
    providerMessageId: string,
  ): Promise<void> {
    const ctx = await this.buildAccountContext(
      organizationId,
      communicationAccountId,
    );
    const provider = this.registry.get(ctx.channelCode);
    await provider.markRead(ctx.providerCtx, { providerMessageId });
  }

  async uploadMedia(
    organizationId: string,
    communicationAccountId: string,
    data: Buffer,
    mimeType: string,
    fileName?: string,
  ): Promise<{ providerMediaId: string }> {
    const ctx = await this.buildAccountContext(
      organizationId,
      communicationAccountId,
    );
    const provider = this.registry.get(ctx.channelCode);
    const result = await provider.uploadMedia(ctx.providerCtx, {
      data,
      mimeType,
      fileName,
    });
    return { providerMediaId: result.providerMediaId };
  }

  async processOutboundMessage(messageId: string): Promise<void> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });
    if (!message) {
      this.logger.warn(`Message ${messageId} not found for processing`);
      return;
    }
    if (message.status !== MessageStatus.QUEUED) {
      return;
    }

    await this.prisma.message.update({
      where: { id: messageId },
      data: { status: MessageStatus.SENDING },
    });

    try {
      const content = (message.content ?? {}) as Record<string, unknown>;
      const to = (content.to as string) ?? '';
      const ctx = await this.buildAccountContext(
        message.organizationId,
        message.communicationAccountId,
      );
      const provider = this.registry.get(message.channelCode);

      let result;
      if (message.messageType === MessageType.TEMPLATE) {
        result = await provider.sendTemplate(ctx.providerCtx, {
          to,
          templateName: content.templateName as string,
          language: (content.templateLanguage as string) ?? 'en',
          components: content.templateComponents as unknown[] | undefined,
        });
      } else if (
        (
          [
            MessageType.IMAGE,
            MessageType.AUDIO,
            MessageType.VIDEO,
            MessageType.DOCUMENT,
            MessageType.STICKER,
          ] as MessageType[]
        ).includes(message.messageType)
      ) {
        result = await provider.sendMedia(ctx.providerCtx, {
          to,
          mediaType: message.messageType as unknown as DomainMessageType,
          mediaUrl: content.mediaUrl as string | undefined,
          mediaId: content.mediaId as string | undefined,
          caption:
            (content.caption as string | undefined) ??
            message.body ??
            undefined,
        });
      } else {
        result = await provider.sendText(ctx.providerCtx, {
          to,
          body: message.body ?? '',
        });
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.message.update({
          where: { id: messageId },
          data: {
            status: MessageStatus.SENT,
            providerMessageId: result.providerMessageId,
            rawProviderPayload: result.rawPayload as Prisma.InputJsonValue,
            sentAt: this.clock.now(),
          },
        });

        await tx.messageStatusHistory.create({
          data: {
            id: this.identifiers.generate(),
            messageId,
            status: MessageStatus.SENT,
          },
        });

        await this.outbox.write(
          {
            organizationId: message.organizationId,
            aggregateType: 'Message',
            aggregateId: messageId,
            eventType: MessageSentEvent.TYPE,
            payload: {
              messageId,
              providerMessageId: result.providerMessageId,
              conversationId: message.conversationId,
              channelCode: message.channelCode,
            },
          },
          tx,
        );
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await this.prisma.message.update({
        where: { id: messageId },
        data: {
          status: MessageStatus.FAILED,
          errorMessage,
        },
      });
      await this.prisma.failedMessage.upsert({
        where: { messageId },
        create: {
          id: this.identifiers.generate(),
          organizationId: message.organizationId,
          messageId,
          errorMessage,
        },
        update: {
          errorMessage,
          retryCount: { increment: 1 },
        },
      });
      await this.outbox.write({
        organizationId: message.organizationId,
        aggregateType: 'Message',
        aggregateId: messageId,
        eventType: 'message.status_updated',
        payload: {
          messageId,
          status: MessageStatus.FAILED,
          conversationId: message.conversationId,
          channelCode: message.channelCode,
        },
      });
      this.logger.error(`Failed to send message ${messageId}: ${errorMessage}`);
    }
  }

  private async resolveContact(
    organizationId: string,
    to: string,
    contactId?: string,
  ) {
    if (contactId) {
      const existing = await this.prisma.contact.findFirst({
        where: { id: contactId, organizationId, deletedAt: null },
      });
      if (!existing) throw new NotFoundError('Contact', contactId);
      return existing;
    }

    const phoneNumber = PhoneNumber.create(to).toString();
    const found = await this.prisma.contact.findUnique({
      where: {
        organizationId_phoneNumber: { organizationId, phoneNumber },
      },
    });
    if (found && !found.deletedAt) return found;
    if (found?.deletedAt) {
      return this.prisma.contact.update({
        where: { id: found.id },
        data: { deletedAt: null },
      });
    }

    return this.prisma.contact.create({
      data: {
        id: this.identifiers.generate(),
        organizationId,
        phoneNumber,
      },
    });
  }

  private async resolveConversation(
    organizationId: string,
    contactId: string,
    communicationAccountId: string,
    channelCode: ChannelCode,
    conversationId?: string,
  ) {
    if (conversationId) {
      const existing = await this.prisma.conversation.findFirst({
        where: { id: conversationId, organizationId, deletedAt: null },
      });
      if (!existing) throw new NotFoundError('Conversation', conversationId);
      return existing;
    }

    const open = await this.prisma.conversation.findFirst({
      where: {
        organizationId,
        contactId,
        communicationAccountId,
        status: 'OPEN',
        deletedAt: null,
      },
      orderBy: { updatedAt: 'desc' },
    });
    if (open) return open;

    return this.prisma.conversation.create({
      data: {
        id: this.identifiers.generate(),
        organizationId,
        contactId,
        communicationAccountId,
        channelCode,
      },
    });
  }

  private async buildAccountContext(
    organizationId: string,
    communicationAccountId: string,
  ): Promise<{
    channelCode: ChannelCode;
    providerCtx: ChannelAccountContext;
  }> {
    const account = await this.prisma.communicationAccount.findFirst({
      where: { id: communicationAccountId, organizationId, deletedAt: null },
    });
    if (!account) {
      throw new NotFoundError('CommunicationAccount', communicationAccountId);
    }
    if (!account.credentialsEnc) {
      throw new ProviderUnavailable(
        account.channelCode,
        'Account credentials not configured',
      );
    }

    const credentials = JSON.parse(
      this.secrets.decrypt(account.credentialsEnc),
    ) as {
      accessToken: string;
      phoneNumberId?: string;
      businessAccountId?: string;
    };
    const metadata = (account.metadata as Record<string, unknown>) ?? {};

    return {
      channelCode: account.channelCode,
      providerCtx: {
        accountId: account.id,
        organizationId,
        externalAccountId: account.externalAccountId ?? account.id,
        accessToken: credentials.accessToken,
        phoneNumberId:
          credentials.phoneNumberId ??
          (metadata.phoneNumberId as string | undefined) ??
          account.externalAccountId ??
          undefined,
        businessAccountId:
          credentials.businessAccountId ??
          (metadata.businessAccountId as string | undefined),
        metadata,
      },
    };
  }
}
