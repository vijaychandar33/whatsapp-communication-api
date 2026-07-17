import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ConversationStatus } from '@prisma/client';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { TenantScopeGuard } from '../../guards/tenant-scope.guard';
import { PaginationDto } from '../../dto/pagination.dto';
import {
  MarkConversationReadHandler,
  PatchConversationHandler,
} from '../../../application/commands/conversation-handlers';
import {
  GetConversationHandler,
  ListConversationsHandler,
} from '../../../application/queries/resource-handlers';
import { PatchConversationDto } from './dto/resources.dto';

@ApiTags('Admin Conversations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantScopeGuard)
@Controller('admin/v1/conversations')
export class ConversationsController {
  constructor(
    private readonly listConversations: ListConversationsHandler,
    private readonly getConversation: GetConversationHandler,
    private readonly patchConversation: PatchConversationHandler,
    private readonly markRead: MarkConversationReadHandler,
  ) {}

  @Get()
  async list(
    @Query() pagination: PaginationDto,
    @Query('organizationId') organizationId: string,
    @Query('status') status?: ConversationStatus,
    @Query('assignedToUserId') assignedToUserId?: string,
    @Query('unreadOnly') unreadOnly?: string,
    @Query('q') q?: string,
  ) {
    return this.listConversations.execute(organizationId, pagination, {
      status,
      assignedToUserId,
      unreadOnly: unreadOnly === 'true' || unreadOnly === '1',
      q,
    });
  }

  @Get(':id')
  async get(
    @Param('id') id: string,
    @Query('organizationId') organizationId: string,
  ) {
    return {
      data: await this.getConversation.execute(organizationId, id),
      message: 'OK',
    };
  }

  @Patch(':id')
  async patch(
    @Param('id') id: string,
    @Query('organizationId') organizationId: string,
    @Body() dto: PatchConversationDto,
  ) {
    return {
      data: await this.patchConversation.execute({
        id,
        organizationId,
        ...dto,
      }),
      message: 'Conversation updated',
    };
  }

  @Post(':id/read')
  async read(
    @Param('id') id: string,
    @Query('organizationId') organizationId: string,
  ) {
    return {
      data: await this.markRead.execute(organizationId, id),
      message: 'Conversation marked read',
    };
  }

  @Post(':id/archive')
  async archive(
    @Param('id') id: string,
    @Query('organizationId') organizationId: string,
  ) {
    return {
      data: await this.patchConversation.execute({
        id,
        organizationId,
        status: ConversationStatus.ARCHIVED,
      }),
      message: 'Conversation archived',
    };
  }

  @Post(':id/assign')
  async assign(
    @Param('id') id: string,
    @Query('organizationId') organizationId: string,
    @Body() body: { assignedToUserId: string | null },
  ) {
    return {
      data: await this.patchConversation.execute({
        id,
        organizationId,
        assignedToUserId: body.assignedToUserId,
      }),
      message: 'Conversation assigned',
    };
  }

  @Post(':id/pin')
  async pin(
    @Param('id') id: string,
    @Query('organizationId') organizationId: string,
    @Body() body: { isPinned?: boolean },
  ) {
    return {
      data: await this.patchConversation.execute({
        id,
        organizationId,
        isPinned: body.isPinned ?? true,
      }),
      message: 'Conversation pin updated',
    };
  }
}
