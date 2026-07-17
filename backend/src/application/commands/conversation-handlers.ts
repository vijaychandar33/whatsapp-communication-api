import { Injectable } from '@nestjs/common';
import { ConversationStatus } from '@prisma/client';
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

    return this.prisma.conversation.update({
      where: { id: cmd.id },
      data: {
        ...(cmd.status !== undefined ? { status: cmd.status } : {}),
        ...(cmd.assignedToUserId !== undefined
          ? { assignedToUserId: cmd.assignedToUserId }
          : {}),
        ...(cmd.isPinned !== undefined ? { isPinned: cmd.isPinned } : {}),
      },
      include: {
        contact: {
          include: { tags: { include: { tag: true } } },
        },
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

@Injectable()
export class MarkConversationReadHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(organizationId: string, id: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!conversation) throw new NotFoundError('Conversation', id);

    return this.prisma.conversation.update({
      where: { id },
      data: { unreadCount: 0 },
      select: {
        id: true,
        unreadCount: true,
        status: true,
      },
    });
  }
}
