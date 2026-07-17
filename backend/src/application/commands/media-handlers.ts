import { Injectable } from '@nestjs/common';
import { ChannelCode } from '@prisma/client';
import axios from 'axios';
import { NotFoundError, ValidationError } from '../../domain/errors';
import { PrismaService } from '../../infrastructure/persistence/prisma/prisma.service';
import { UuidIdentifierService } from '../../infrastructure/identifier/uuid-identifier.service';
import { LocalObjectStorageProvider } from '../../infrastructure/storage/local-object-storage.provider';
import { CommunicationSdk } from '../communication-sdk/communication.sdk';

export interface UploadMediaCommand {
  organizationId: string;
  data?: Buffer;
  url?: string;
  mimeType?: string;
  fileName?: string;
  communicationAccountId?: string;
  uploadToProvider?: boolean;
}

@Injectable()
export class UploadMediaHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identifiers: UuidIdentifierService,
    private readonly storage: LocalObjectStorageProvider,
    private readonly sdk: CommunicationSdk,
  ) {}

  async execute(cmd: UploadMediaCommand) {
    let buffer = cmd.data;
    let mimeType = cmd.mimeType ?? 'application/octet-stream';
    let fileName = cmd.fileName;

    if (!buffer && cmd.url) {
      const response = await axios.get<ArrayBuffer>(cmd.url, {
        responseType: 'arraybuffer',
        timeout: 60_000,
      });
      buffer = Buffer.from(response.data);
      const contentType = response.headers['content-type'];
      if (typeof contentType === 'string') {
        mimeType = contentType.split(';')[0]?.trim() || mimeType;
      }
      if (!fileName) {
        try {
          fileName = new URL(cmd.url).pathname.split('/').pop() || 'file';
        } catch {
          fileName = 'file';
        }
      }
    }

    if (!buffer?.length) {
      throw new ValidationError('Provide multipart file or url');
    }

    const id = this.identifiers.generate();
    const key = `${cmd.organizationId}/${id}/${fileName ?? 'file'}`;
    const stored = await this.storage.put({
      key,
      data: buffer,
      mimeType,
    });

    let providerMediaId: string | undefined;
    let channelCode: ChannelCode | undefined;
    let communicationAccountId = cmd.communicationAccountId;

    if (cmd.uploadToProvider && communicationAccountId) {
      const uploaded = await this.sdk.uploadMedia(
        cmd.organizationId,
        communicationAccountId,
        buffer,
        mimeType,
        fileName,
      );
      providerMediaId = uploaded.providerMediaId;
      const account = await this.prisma.communicationAccount.findFirst({
        where: { id: communicationAccountId, organizationId: cmd.organizationId },
      });
      channelCode = account?.channelCode;
    } else if (communicationAccountId) {
      const account = await this.prisma.communicationAccount.findFirst({
        where: { id: communicationAccountId, organizationId: cmd.organizationId },
      });
      channelCode = account?.channelCode;
    }

    return this.prisma.media.create({
      data: {
        id,
        organizationId: cmd.organizationId,
        communicationAccountId,
        channelCode,
        mimeType,
        fileName,
        sizeBytes: stored.sizeBytes,
        storageKey: stored.key,
        storageUrl: stored.url,
        providerMediaId,
      },
    });
  }
}

@Injectable()
export class DeleteMediaHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: LocalObjectStorageProvider,
  ) {}

  async execute(organizationId: string, id: string) {
    const media = await this.prisma.media.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!media) throw new NotFoundError('Media', id);

    await this.storage.delete(media.storageKey).catch(() => undefined);

    return this.prisma.media.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
