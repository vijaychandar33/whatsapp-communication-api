import { Injectable } from '@nestjs/common';
import {
  AccountConnectionStatus,
  ChannelCode,
  Prisma,
} from '@prisma/client';
import { NotFoundError, ValidationError } from '../../domain/errors';
import { PrismaService } from '../../infrastructure/persistence/prisma/prisma.service';
import { UuidIdentifierService } from '../../infrastructure/identifier/uuid-identifier.service';
import { AesSecretService } from '../../infrastructure/secrets/secret.service';

export interface CreateAccountCommand {
  organizationId: string;
  channelCode: ChannelCode;
  name: string;
  phoneNumber?: string;
  externalAccountId?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateAccountCommand {
  id: string;
  name?: string;
  phoneNumber?: string;
  externalAccountId?: string;
  metadata?: Record<string, unknown>;
}

export interface ConnectAccountCommand {
  id: string;
  accessToken: string;
  phoneNumberId?: string;
  businessAccountId?: string;
  verifyToken?: string;
  webhookSecret?: string;
}

@Injectable()
export class CreateAccountHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identifiers: UuidIdentifierService,
  ) {}

  async execute(cmd: CreateAccountCommand) {
    const org = await this.prisma.organization.findFirst({
      where: { id: cmd.organizationId, deletedAt: null },
    });
    if (!org) throw new NotFoundError('Organization', cmd.organizationId);

    let channel = await this.prisma.communicationChannel.findUnique({
      where: { code: cmd.channelCode },
    });
    if (!channel) {
      channel = await this.prisma.communicationChannel.create({
        data: {
          id: this.identifiers.generate(),
          code: cmd.channelCode,
          name: cmd.channelCode,
          isActive: true,
        },
      });
    }

    return this.prisma.communicationAccount.create({
      data: {
        id: this.identifiers.generate(),
        organizationId: cmd.organizationId,
        channelId: channel.id,
        channelCode: cmd.channelCode,
        name: cmd.name,
        phoneNumber: cmd.phoneNumber,
        externalAccountId: cmd.externalAccountId,
        metadata: (cmd.metadata ?? {}) as Prisma.InputJsonValue,
        connectionStatus: AccountConnectionStatus.PENDING,
      },
    });
  }
}

@Injectable()
export class UpdateAccountHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(cmd: UpdateAccountCommand) {
    const account = await this.prisma.communicationAccount.findFirst({
      where: { id: cmd.id, deletedAt: null },
    });
    if (!account) throw new NotFoundError('CommunicationAccount', cmd.id);

    return this.prisma.communicationAccount.update({
      where: { id: cmd.id },
      data: {
        name: cmd.name,
        phoneNumber: cmd.phoneNumber,
        externalAccountId: cmd.externalAccountId,
        metadata:
          cmd.metadata !== undefined
            ? (cmd.metadata as Prisma.InputJsonValue)
            : undefined,
      },
    });
  }
}

@Injectable()
export class ConnectAccountHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: AesSecretService,
  ) {}

  async execute(cmd: ConnectAccountCommand) {
    const account = await this.prisma.communicationAccount.findFirst({
      where: { id: cmd.id, deletedAt: null },
    });
    if (!account) throw new NotFoundError('CommunicationAccount', cmd.id);
    if (!cmd.accessToken?.trim()) {
      throw new ValidationError('accessToken is required');
    }

    const credentials = {
      accessToken: cmd.accessToken,
      phoneNumberId: cmd.phoneNumberId,
      businessAccountId: cmd.businessAccountId,
      verifyToken: cmd.verifyToken,
      webhookSecret: cmd.webhookSecret,
    };

    return this.prisma.communicationAccount.update({
      where: { id: cmd.id },
      data: {
        credentialsEnc: this.secrets.encrypt(JSON.stringify(credentials)),
        webhookVerifyToken: cmd.verifyToken ?? account.webhookVerifyToken,
        externalAccountId:
          cmd.phoneNumberId ??
          cmd.businessAccountId ??
          account.externalAccountId,
        connectionStatus: AccountConnectionStatus.CONNECTED,
        metadata: {
          ...((account.metadata as Record<string, unknown>) ?? {}),
          businessAccountId: cmd.businessAccountId,
          phoneNumberId: cmd.phoneNumberId,
        } as Prisma.InputJsonValue,
      },
    });
  }
}

@Injectable()
export class DisconnectAccountHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(id: string) {
    const account = await this.prisma.communicationAccount.findFirst({
      where: { id, deletedAt: null },
    });
    if (!account) throw new NotFoundError('CommunicationAccount', id);

    return this.prisma.communicationAccount.update({
      where: { id },
      data: {
        credentialsEnc: null,
        connectionStatus: AccountConnectionStatus.DISCONNECTED,
      },
    });
  }
}

@Injectable()
export class GetAccountStatusHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(id: string) {
    const account = await this.prisma.communicationAccount.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        organizationId: true,
        channelCode: true,
        name: true,
        connectionStatus: true,
        phoneNumber: true,
        externalAccountId: true,
        webhookVerifyToken: true,
        updatedAt: true,
        credentialsEnc: true,
      },
    });
    if (!account) throw new NotFoundError('CommunicationAccount', id);

    const { credentialsEnc, webhookVerifyToken, ...rest } = account;
    return {
      ...rest,
      hasCredentials: Boolean(credentialsEnc),
      hasVerifyToken: Boolean(webhookVerifyToken),
    };
  }
}
