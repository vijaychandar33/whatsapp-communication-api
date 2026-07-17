import { Injectable, Logger } from '@nestjs/common';
import {
  ChannelCode,
  MessageDirection,
  MessageStatus,
  MessageType,
  Prisma,
} from '@prisma/client';
import {
  ConversationOpenedEvent,
  MessageReceivedEvent,
  MessageStatusUpdatedEvent,
} from '../../domain/events';
import { NotFoundError } from '../../domain/errors';
import { PhoneNumber } from '../../domain/value-objects/phone-number.vo';
import { PrismaService } from '../../infrastructure/persistence/prisma/prisma.service';
import { UuidIdentifierService } from '../../infrastructure/identifier/uuid-identifier.service';
import { SystemClock } from '../../infrastructure/clock/system-clock';
import { OutboxService } from '../../infrastructure/outbox/outbox.service';
import { ChannelProviderRegistry } from '../../infrastructure/providers/channel-provider.registry';
import { AesSecretService } from '../../infrastructure/secrets/secret.service';

export interface ProcessWebhookCommand {
  accountId: string;
  payload: Record<string, unknown>;
  signatureHeader?: string;
  rawBody?: Buffer | string;
}

@Injectable()
export class ProcessWebhookHandler {
  private readonly logger = new Logger(ProcessWebhookHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly identifiers: UuidIdentifierService,
    private readonly clock: SystemClock,
    private readonly outbox: OutboxService,
    private readonly registry: ChannelProviderRegistry,
    private readonly secrets: AesSecretService,
  ) {}

  /**
   * Persist webhook event immediately. Returns event id for async processing.
   * Throws ValidationError-like string code when signature invalid.
   */
  async storeEvent(cmd: ProcessWebhookCommand): Promise<{
    eventId: string;
    account: {
      id: string;
      organizationId: string;
      channelCode: ChannelCode;
      credentialsEnc: string | null;
    };
    signatureValid: boolean | null;
  }> {
    const account = await this.prisma.communicationAccount.findFirst({
      where: {
        id: cmd.accountId,
        deletedAt: null,
        channelCode: ChannelCode.WHATSAPP,
      },
    });
    if (!account) {
      throw new NotFoundError('CommunicationAccount', cmd.accountId);
    }

    let signatureValid: boolean | null = null;
    if (cmd.signatureHeader && account.credentialsEnc) {
      const credentials = JSON.parse(
        this.secrets.decrypt(account.credentialsEnc),
      ) as { webhookSecret?: string };
      if (credentials.webhookSecret) {
        const provider = this.registry.get(account.channelCode);
        const raw =
          cmd.rawBody ??
          Buffer.from(JSON.stringify(cmd.payload), 'utf8');
        signatureValid = provider.verifyWebhookSignature(
          raw,
          cmd.signatureHeader,
          credentials.webhookSecret,
        );
      }
    }

    const eventId = this.identifiers.generate();
    await this.prisma.webhookEvent.create({
      data: {
        id: eventId,
        organizationId: account.organizationId,
        communicationAccountId: account.id,
        channelCode: ChannelCode.WHATSAPP,
        eventType: 'whatsapp.webhook',
        payload: cmd.payload as Prisma.InputJsonValue,
        errorMessage:
          signatureValid === false ? 'Invalid webhook signature' : undefined,
      },
    });

    return {
      eventId,
      account: {
        id: account.id,
        organizationId: account.organizationId,
        channelCode: account.channelCode,
        credentialsEnc: account.credentialsEnc,
      },
      signatureValid,
    };
  }

  async processStoredEvent(
    eventId: string,
    account: {
      id: string;
      organizationId: string;
      channelCode: ChannelCode;
    },
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
      const provider = this.registry.get(account.channelCode);
      const events = provider.parseWebhook(payload);

      for (const event of events) {
        if (event.kind === 'status_update') {
          await this.applyStatusUpdate(account, event.providerMessageId, event.status, {
            errorCode: event.errorCode,
            errorMessage: event.errorMessage,
          });
        } else if (event.kind === 'inbound_message') {
          await this.ingestInbound(account, event);
        }
      }

      await this.prisma.webhookEvent.update({
        where: { id: eventId },
        data: { processedAt: this.clock.now() },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Webhook async processing failed: ${message}`);
      await this.prisma.webhookEvent.update({
        where: { id: eventId },
        data: { errorMessage: message },
      });
    }
  }

  private async applyStatusUpdate(
    account: { organizationId: string; channelCode: ChannelCode },
    providerMessageId: string,
    status: string,
    extra?: { errorCode?: string; errorMessage?: string },
  ): Promise<void> {
    if (!providerMessageId) return;

    const mapped: Record<string, MessageStatus> = {
      sent: MessageStatus.SENT,
      delivered: MessageStatus.DELIVERED,
      read: MessageStatus.READ,
      failed: MessageStatus.FAILED,
    };
    const next = mapped[status.toLowerCase()];
    if (!next) return;

    const message = await this.prisma.message.findFirst({
      where: {
        providerMessageId,
        organizationId: account.organizationId,
      },
    });
    if (!message) return;

    const data: Prisma.MessageUpdateInput = { status: next };
    if (next === MessageStatus.DELIVERED) data.deliveredAt = this.clock.now();
    if (next === MessageStatus.READ) data.readAt = this.clock.now();
    if (next === MessageStatus.FAILED) {
      data.errorCode = extra?.errorCode;
      data.errorMessage = extra?.errorMessage;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.message.update({ where: { id: message.id }, data });
      await tx.messageStatusHistory.create({
        data: {
          id: this.identifiers.generate(),
          messageId: message.id,
          status: next,
          metadata: (extra ?? {}) as Prisma.InputJsonValue,
        },
      });
      await this.outbox.write(
        {
          organizationId: account.organizationId,
          aggregateType: 'Message',
          aggregateId: message.id,
          eventType: MessageStatusUpdatedEvent.TYPE,
          payload: {
            messageId: message.id,
            status: next,
            conversationId: message.conversationId,
            channelCode: account.channelCode,
          },
        },
        tx,
      );
    });
  }

  private async ingestInbound(
    account: {
      id: string;
      organizationId: string;
      channelCode: ChannelCode;
    },
    event: {
      providerMessageId: string;
      from: string;
      messageType: string;
      body?: string;
      content: Record<string, unknown>;
      contactName?: string;
      raw: Record<string, unknown>;
    },
  ): Promise<void> {
    if (!event.providerMessageId || !event.from) return;

    const dup = await this.prisma.message.findFirst({
      where: {
        organizationId: account.organizationId,
        providerMessageId: event.providerMessageId,
      },
    });
    if (dup) return;

    const normalized = event.from.startsWith('+')
      ? event.from
      : `+${event.from}`;
    const phoneNumber =
      PhoneNumber.tryCreate(normalized)?.toString() ?? normalized;

    let contact = await this.prisma.contact.findUnique({
      where: {
        organizationId_phoneNumber: {
          organizationId: account.organizationId,
          phoneNumber,
        },
      },
    });
    if (!contact || contact.deletedAt) {
      if (contact?.deletedAt) {
        contact = await this.prisma.contact.update({
          where: { id: contact.id },
          data: {
            deletedAt: null,
            displayName: event.contactName ?? contact.displayName,
          },
        });
      } else {
        contact = await this.prisma.contact.create({
          data: {
            id: this.identifiers.generate(),
            organizationId: account.organizationId,
            phoneNumber,
            displayName: event.contactName,
          },
        });
      }
    } else if (event.contactName && !contact.displayName) {
      contact = await this.prisma.contact.update({
        where: { id: contact.id },
        data: { displayName: event.contactName },
      });
    }

    let conversation = await this.prisma.conversation.findFirst({
      where: {
        organizationId: account.organizationId,
        contactId: contact.id,
        communicationAccountId: account.id,
        status: 'OPEN',
        deletedAt: null,
      },
    });

    let opened = false;
    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: {
          id: this.identifiers.generate(),
          organizationId: account.organizationId,
          contactId: contact.id,
          communicationAccountId: account.id,
          channelCode: account.channelCode,
        },
      });
      opened = true;
    }

    const messageId = this.identifiers.generate();
    await this.prisma.$transaction(async (tx) => {
      await tx.message.create({
        data: {
          id: messageId,
          organizationId: account.organizationId,
          conversationId: conversation!.id,
          contactId: contact!.id,
          communicationAccountId: account.id,
          channelCode: account.channelCode,
          direction: MessageDirection.INBOUND,
          messageType: this.mapInboundType(event.messageType),
          status: MessageStatus.DELIVERED,
          body: event.body,
          content: event.content as Prisma.InputJsonValue,
          providerMessageId: event.providerMessageId,
          rawProviderPayload: event.raw as Prisma.InputJsonValue,
          deliveredAt: this.clock.now(),
        },
      });

      await tx.messageStatusHistory.create({
        data: {
          id: this.identifiers.generate(),
          messageId,
          status: MessageStatus.DELIVERED,
        },
      });

      await tx.conversation.update({
        where: { id: conversation!.id },
        data: { lastMessageAt: this.clock.now() },
      });

      await this.outbox.write(
        {
          organizationId: account.organizationId,
          aggregateType: 'Message',
          aggregateId: messageId,
          eventType: MessageReceivedEvent.TYPE,
          payload: {
            messageId,
            conversationId: conversation!.id,
            channelCode: account.channelCode,
            contactId: contact!.id,
          },
        },
        tx,
      );

      if (opened) {
        await this.outbox.write(
          {
            organizationId: account.organizationId,
            aggregateType: 'Conversation',
            aggregateId: conversation!.id,
            eventType: ConversationOpenedEvent.TYPE,
            payload: {
              conversationId: conversation!.id,
              channelCode: account.channelCode,
            },
          },
          tx,
        );
      }
    });
  }

  private mapInboundType(type: string): MessageType {
    const map: Record<string, MessageType> = {
      text: MessageType.TEXT,
      image: MessageType.IMAGE,
      audio: MessageType.AUDIO,
      video: MessageType.VIDEO,
      document: MessageType.DOCUMENT,
      sticker: MessageType.STICKER,
      location: MessageType.LOCATION,
      contacts: MessageType.CONTACTS,
      interactive: MessageType.INTERACTIVE,
      reaction: MessageType.REACTION,
      button: MessageType.INTERACTIVE,
    };
    return map[type] ?? MessageType.UNKNOWN;
  }
}
