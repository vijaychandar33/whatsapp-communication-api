import { Injectable } from '@nestjs/common';
import { ConversationStatus, Prisma } from '@prisma/client';
import { NotFoundError } from '../../domain/errors';
import { PrismaService } from '../../infrastructure/persistence/prisma/prisma.service';

export interface PatchConversationCommand {
  id: string;
  organizationId: string;
  status?: ConversationStatus;
  assignedToUserId?: string | null;
  isPinned?: boolean;
}

@Injectable()
export class PatchConversationHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(cmd: PatchConversationCommand) {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: cmd.id,
        organizationId: cmd.organizationId,
        deletedAt: null,
      },
    });
    if (!conversation) throw new NotFoundError('Conversation', cmd.id);

    const metadata = {
      ...((conversation.metadata as Record<string, unknown>) ?? {}),
    };
    if (cmd.assignedToUserId !== undefined) {
      metadata.assignedToUserId = cmd.assignedToUserId;
    }
    if (cmd.isPinned !== undefined) {
      metadata.isPinned = cmd.isPinned;
    }

    return this.prisma.conversation.update({
      where: { id: cmd.id },
      data: {
        status: cmd.status,
        metadata: metadata as Prisma.InputJsonValue,
      },
      include: {
        contact: true,
        communicationAccount: {
          select: {
            id: true,
            name: true,
            channelCode: true,
            phoneNumber: true,
          },
        },
      },
    });
  }
}
