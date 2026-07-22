import { Injectable, Logger } from '@nestjs/common';
import {
  ChannelCode,
  MessageDirection,
  MessageStatus,
  MessageType,
  Prisma,
  BroadcastRecipientStatus,
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
import { BroadcastsService } from './broadcasts.service';
import { AiService } from '../ai/ai.service';

export interface ProcessWebhookCommand {
  accountId: string;
  payload: Record<string, unknown>;
  signatureHeader?: string;
  rawBody?: Buffer | string;
}

export interface ProcessOrganizationWebhookCommand {
  organizationId: string;
  payload: Record<string, unknown>;
  signatureHeader?: string;
  rawBody?: Buffer | string;
}

type AccountRef = {
  id: string;
  organizationId: string;
  channelCode: ChannelCode;
  credentialsEnc: string | null;
  externalAccountId: string | null;
  metadata: unknown;
  webhookVerifyToken: string | null;
  connectionStatus: string;
};

function extractWhatsAppRouteIds(payload: Record<string, unknown>): {
  phoneNumberIds: string[];
  wabaIds: string[];
} {
  const phoneNumberIds = new Set<string>();
  const wabaIds = new Set<string>();
  const entries =
    (payload.entry as Array<Record<string, unknown>> | undefined) ?? [];

  for (const entry of entries) {
    if (entry.id != null) wabaIds.add(String(entry.id));
    const changes =
      (entry.changes as Array<Record<string, unknown>> | undefined) ?? [];
    for (const change of changes) {
      const value = change.value as Record<string, unknown> | undefined;
      const meta = value?.metadata as
        | { phone_number_id?: string | number }
        | undefined;
      if (meta?.phone_number_id != null) {
        phoneNumberIds.add(String(meta.phone_number_id));
      }
    }
  }

  return {
    phoneNumberIds: [...phoneNumberIds],
    wabaIds: [...wabaIds],
  };
}

function accountMatchesRoute(
  account: AccountRef,
  phoneNumberIds: string[],
  wabaIds: string[],
): boolean {
  const meta = (account.metadata as Record<string, unknown>) ?? {};
  const phoneId =
    typeof meta.phoneNumberId === 'string'
      ? meta.phoneNumberId
      : account.externalAccountId;
  const wabaId =
    typeof meta.businessAccountId === 'string'
      ? meta.businessAccountId
      : undefined;

  if (phoneId && phoneNumberIds.includes(phoneId)) return true;
  if (wabaId && wabaIds.includes(wabaId)) return true;
  return false;
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
    private readonly broadcasts: BroadcastsService,
    private readonly ai: AiService,
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

    const signatureValid = this.verifySignature(
      account.channelCode,
      account.credentialsEnc,
      cmd.signatureHeader,
      cmd.rawBody,
      cmd.payload,
    );

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

  async verifyOrganizationToken(
    organizationId: string,
    mode: string,
    verifyToken: string,
  ): Promise<boolean> {
    if (mode !== 'subscribe' || !verifyToken) return false;

    const org = await this.prisma.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
      include: { settings: true },
    });
    if (!org) throw new NotFoundError('Organization', organizationId);

    const nested = (org.settings?.settings as Record<string, unknown>) ?? {};
    const orgToken =
      typeof nested.whatsappWebhookVerifyToken === 'string'
        ? nested.whatsappWebhookVerifyToken
        : null;
    if (orgToken && verifyToken === orgToken) return true;

    const accountMatch = await this.prisma.communicationAccount.findFirst({
      where: {
        organizationId,
        deletedAt: null,
        channelCode: ChannelCode.WHATSAPP,
        webhookVerifyToken: verifyToken,
      },
      select: { id: true },
    });
    return Boolean(accountMatch);
  }

  async storeOrganizationEvent(
    cmd: ProcessOrganizationWebhookCommand,
  ): Promise<{
    eventId: string;
    account: {
      id: string;
      organizationId: string;
      channelCode: ChannelCode;
      credentialsEnc: string | null;
    } | null;
    signatureValid: boolean | null;
  }> {
    const org = await this.prisma.organization.findFirst({
      where: { id: cmd.organizationId, deletedAt: null },
      include: { settings: true },
    });
    if (!org) throw new NotFoundError('Organization', cmd.organizationId);

    const accounts = (await this.prisma.communicationAccount.findMany({
      where: {
        organizationId: cmd.organizationId,
        deletedAt: null,
        channelCode: ChannelCode.WHATSAPP,
      },
    })) as AccountRef[];

    const { phoneNumberIds, wabaIds } = extractWhatsAppRouteIds(cmd.payload);
    const matched =
      accounts.find((a) =>
        accountMatchesRoute(a, phoneNumberIds, wabaIds),
      ) ?? null;

    let signatureValid: boolean | null = null;
    if (cmd.signatureHeader) {
      if (matched) {
        signatureValid = this.verifySignature(
          matched.channelCode,
          matched.credentialsEnc,
          cmd.signatureHeader,
          cmd.rawBody,
          cmd.payload,
        );
      } else {
        // Try any connected account secret, then org-level app secret
        for (const account of accounts) {
          const result = this.verifySignature(
            account.channelCode,
            account.credentialsEnc,
            cmd.signatureHeader,
            cmd.rawBody,
            cmd.payload,
          );
          if (result === true) {
            signatureValid = true;
            break;
          }
          if (result === false) signatureValid = false;
        }
        if (signatureValid !== true) {
          const nested =
            (org.settings?.settings as Record<string, unknown>) ?? {};
          const orgSecret =
            typeof nested.whatsappWebhookAppSecret === 'string'
              ? nested.whatsappWebhookAppSecret
              : null;
          if (orgSecret) {
            const provider = this.registry.get(ChannelCode.WHATSAPP);
            const raw =
              cmd.rawBody ?? Buffer.from(JSON.stringify(cmd.payload), 'utf8');
            signatureValid = provider.verifyWebhookSignature(
              raw,
              cmd.signatureHeader,
              orgSecret,
            );
          }
        }
      }
    }

    const eventId = this.identifiers.generate();
    await this.prisma.webhookEvent.create({
      data: {
        id: eventId,
        organizationId: cmd.organizationId,
        communicationAccountId: matched?.id,
        channelCode: ChannelCode.WHATSAPP,
        eventType: 'whatsapp.webhook',
        payload: cmd.payload as Prisma.InputJsonValue,
        errorMessage:
          signatureValid === false
            ? 'Invalid webhook signature'
            : !matched
              ? 'No matching WhatsApp account for phone_number_id'
              : undefined,
      },
    });

    return {
      eventId,
      account: matched
        ? {
            id: matched.id,
            organizationId: matched.organizationId,
            channelCode: matched.channelCode,
            credentialsEnc: matched.credentialsEnc,
          }
        : null,
      signatureValid,
    };
  }

  /** Persist org-level Meta verify token / app secret for the permanent callback. */
  async syncOrganizationWebhookConfig(
    organizationId: string,
    opts: { verifyToken?: string; appSecret?: string },
  ): Promise<void> {
    if (!opts.verifyToken && !opts.appSecret) return;

    const existing = await this.prisma.organizationSettings.findUnique({
      where: { organizationId },
    });
    const nested = (existing?.settings as Record<string, unknown>) ?? {};
    const next = { ...nested };
    let changed = false;

    if (opts.verifyToken && !nested.whatsappWebhookVerifyToken) {
      next.whatsappWebhookVerifyToken = opts.verifyToken;
      changed = true;
    }
    if (opts.appSecret && !nested.whatsappWebhookAppSecret) {
      next.whatsappWebhookAppSecret = opts.appSecret;
      changed = true;
    }
    if (!changed && existing) return;

    await this.prisma.organizationSettings.upsert({
      where: { organizationId },
      create: {
        id: this.identifiers.generate(),
        organizationId,
        settings: next as Prisma.InputJsonValue,
      },
      update: {
        settings: next as Prisma.InputJsonValue,
      },
    });
  }

  private verifySignature(
    channelCode: ChannelCode,
    credentialsEnc: string | null,
    signatureHeader: string | undefined,
    rawBody: Buffer | string | undefined,
    payload: Record<string, unknown>,
  ): boolean | null {
    if (!signatureHeader || !credentialsEnc) return null;
    try {
      const credentials = JSON.parse(
        this.secrets.decrypt(credentialsEnc),
      ) as { webhookSecret?: string };
      if (!credentials.webhookSecret) return null;
      const provider = this.registry.get(channelCode);
      const raw = rawBody ?? Buffer.from(JSON.stringify(payload), 'utf8');
      return provider.verifyWebhookSignature(
        raw,
        signatureHeader,
        credentials.webhookSecret,
      );
    } catch {
      return null;
    }
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
            providerTimestamp: event.timestamp,
            webhookEventId: eventId,
            raw: event.raw,
            recipientUserId: event.recipientUserId,
            recipientParentUserId: event.recipientParentUserId,
            username: event.username,
          });
        } else if (event.kind === 'inbound_message') {
          await this.ingestInbound(account, event);
        } else if (event.kind === 'user_id_change') {
          await this.applyUserIdChange(account, event);
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
    account: { id: string; organizationId: string; channelCode: ChannelCode },
    providerMessageId: string,
    status: string,
    extra?: {
      errorCode?: string;
      errorMessage?: string;
      providerTimestamp?: string;
      webhookEventId?: string;
      raw?: Record<string, unknown>;
      recipientUserId?: string;
      recipientParentUserId?: string;
      username?: string;
    },
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

    // Persist BSUID from status webhooks (contacts.user_id / recipient_user_id)
    if (extra?.recipientUserId || extra?.recipientParentUserId || extra?.username) {
      await this.upsertContactAccountIdentity({
        organizationId: account.organizationId,
        contactId: message.contactId,
        communicationAccountId: message.communicationAccountId,
        bsuid: extra.recipientUserId,
        parentBsuid: extra.recipientParentUserId,
        username: extra.username,
      }).catch((err) => {
        this.logger.warn(
          `BSUID upsert on status failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }

    const recipientStatus =
      next === MessageStatus.SENT
        ? BroadcastRecipientStatus.SENT
        : next === MessageStatus.DELIVERED
          ? BroadcastRecipientStatus.DELIVERED
          : next === MessageStatus.READ
            ? BroadcastRecipientStatus.READ
            : next === MessageStatus.FAILED
              ? BroadcastRecipientStatus.FAILED
              : null;
    if (recipientStatus) {
      await this.broadcasts
        .applyMessageStatus(message.id, recipientStatus)
        .catch(() => undefined);
    }
  }

  private async applyUserIdChange(
    account: {
      id: string;
      organizationId: string;
      channelCode: ChannelCode;
    },
    event: {
      from?: string;
      newUserId?: string;
      newParentUserId?: string;
      newPhone?: string;
    },
  ): Promise<void> {
    if (!event.newUserId && !event.newParentUserId && !event.newPhone) return;

    let contactId: string | null = null;

    if (event.from) {
      const phone = PhoneNumber.tryCreate(event.from)?.toString();
      if (phone) {
        const byPhone = await this.prisma.contact.findUnique({
          where: {
            organizationId_phoneNumber: {
              organizationId: account.organizationId,
              phoneNumber: phone,
            },
          },
        });
        if (byPhone && !byPhone.deletedAt) contactId = byPhone.id;
      }
    }

    if (!contactId) {
      // Fall back: identity already linked to this account (old BSUID unknown here)
      const openConv = await this.prisma.conversation.findFirst({
        where: {
          organizationId: account.organizationId,
          communicationAccountId: account.id,
          deletedAt: null,
          ...(event.from
            ? {
                contact: {
                  phoneNumber: PhoneNumber.tryCreate(event.from)?.toString(),
                },
              }
            : {}),
        },
        orderBy: { lastMessageAt: 'desc' },
      });
      contactId = openConv?.contactId ?? null;
    }

    if (!contactId) return;

    if (event.newPhone) {
      const phone = PhoneNumber.tryCreate(event.newPhone)?.toString();
      if (phone) {
        await this.prisma.contact
          .update({
            where: { id: contactId },
            data: { phoneNumber: phone },
          })
          .catch((err) => {
            this.logger.warn(
              `Phone update on user_id_change failed: ${err instanceof Error ? err.message : String(err)}`,
            );
          });
      }
    }

    await this.upsertContactAccountIdentity({
      organizationId: account.organizationId,
      contactId,
      communicationAccountId: account.id,
      bsuid: event.newUserId,
      parentBsuid: event.newParentUserId,
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
      fromUserId?: string;
      fromParentUserId?: string;
      messageType: string;
      body?: string;
      content: Record<string, unknown>;
      contactName?: string;
      username?: string;
      raw: Record<string, unknown>;
    },
  ): Promise<void> {
    if (!event.providerMessageId) return;
    if (!event.from && !event.fromUserId) return;

    const dup = await this.prisma.message.findFirst({
      where: {
        organizationId: account.organizationId,
        providerMessageId: event.providerMessageId,
      },
    });
    if (dup) return;

    const phoneNumber = event.from
      ? PhoneNumber.tryCreate(event.from)?.toString()
      : undefined;

    let contact =
      (phoneNumber
        ? await this.prisma.contact.findUnique({
            where: {
              organizationId_phoneNumber: {
                organizationId: account.organizationId,
                phoneNumber,
              },
            },
          })
        : null) ?? null;

    // Resolve by BSUID on this WhatsApp connection when phone is missing/unknown
    if ((!contact || contact.deletedAt) && event.fromUserId) {
      const identity = await this.prisma.contactAccountIdentity.findUnique({
        where: {
          communicationAccountId_bsuid: {
            communicationAccountId: account.id,
            bsuid: event.fromUserId,
          },
        },
        include: { contact: true },
      });
      if (identity?.contact && !identity.contact.deletedAt) {
        contact = identity.contact;
      }
    }

    if (!contact || contact.deletedAt) {
      if (contact?.deletedAt) {
        contact = await this.prisma.contact.update({
          where: { id: contact.id },
          data: {
            deletedAt: null,
            displayName: event.contactName ?? contact.displayName,
            ...(phoneNumber && !contact.phoneNumber
              ? { phoneNumber }
              : {}),
          },
        });
      } else {
        contact = await this.prisma.contact.create({
          data: {
            id: this.identifiers.generate(),
            organizationId: account.organizationId,
            phoneNumber: phoneNumber ?? null,
            displayName: event.contactName,
          },
        });
      }
    } else {
      const patch: Prisma.ContactUpdateInput = {};
      if (event.contactName && !contact.displayName) {
        patch.displayName = event.contactName;
      }
      if (phoneNumber && !contact.phoneNumber) {
        patch.phoneNumber = phoneNumber;
      }
      if (Object.keys(patch).length > 0) {
        contact = await this.prisma.contact.update({
          where: { id: contact.id },
          data: patch,
        });
      }
    }

    await this.upsertContactAccountIdentity({
      organizationId: account.organizationId,
      contactId: contact.id,
      communicationAccountId: account.id,
      bsuid: event.fromUserId,
      parentBsuid: event.fromParentUserId,
      username: event.username,
    });

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

      const preview =
        (event.body || '').trim().slice(0, 500) ||
        (event.messageType ? `[${event.messageType}]` : null);
      await tx.conversation.update({
        where: { id: conversation!.id },
        data: {
          lastMessageAt: this.clock.now(),
          lastCustomerMessageAt: this.clock.now(),
          lastMessageText: preview,
          unreadCount: { increment: 1 },
          ...(conversation!.status === 'CLOSED' ||
          conversation!.status === 'ARCHIVED'
            ? { status: 'OPEN' }
            : {}),
        },
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

    setImmediate(() => {
      void this.ai.tryAutoReply(account.organizationId, conversation!.id);
    });
  }

  /**
   * Upsert Meta BSUID (and related identity fields) for Contact × WhatsApp connection.
   * Empty/missing values are left unchanged — never wipe an existing BSUID with null.
   */
  private async upsertContactAccountIdentity(input: {
    organizationId: string;
    contactId: string;
    communicationAccountId: string;
    bsuid?: string | null;
    parentBsuid?: string | null;
    username?: string | null;
  }): Promise<void> {
    const bsuid = input.bsuid?.trim() || undefined;
    const parentBsuid = input.parentBsuid?.trim() || undefined;
    const username = input.username?.trim() || undefined;
    if (!bsuid && !parentBsuid && !username) return;

    const patch = {
      ...(bsuid ? { bsuid } : {}),
      ...(parentBsuid ? { parentBsuid } : {}),
      ...(username ? { username } : {}),
    };

    const byPair = await this.prisma.contactAccountIdentity.findUnique({
      where: {
        contactId_communicationAccountId: {
          contactId: input.contactId,
          communicationAccountId: input.communicationAccountId,
        },
      },
    });

    const byBsuid = bsuid
      ? await this.prisma.contactAccountIdentity.findUnique({
          where: {
            communicationAccountId_bsuid: {
              communicationAccountId: input.communicationAccountId,
              bsuid,
            },
          },
        })
      : null;

    if (byPair && byBsuid && byPair.id !== byBsuid.id) {
      await this.prisma.$transaction([
        this.prisma.contactAccountIdentity.update({
          where: { id: byPair.id },
          data: patch,
        }),
        this.prisma.contactAccountIdentity.delete({
          where: { id: byBsuid.id },
        }),
      ]);
      return;
    }

    if (byPair) {
      await this.prisma.contactAccountIdentity.update({
        where: { id: byPair.id },
        data: patch,
      });
      return;
    }

    if (byBsuid) {
      await this.prisma.contactAccountIdentity.update({
        where: { id: byBsuid.id },
        data: { contactId: input.contactId, ...patch },
      });
      return;
    }

    await this.prisma.contactAccountIdentity.create({
      data: {
        id: this.identifiers.generate(),
        organizationId: input.organizationId,
        contactId: input.contactId,
        communicationAccountId: input.communicationAccountId,
        bsuid: bsuid ?? null,
        parentBsuid: parentBsuid ?? null,
        username: username ?? null,
      },
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
