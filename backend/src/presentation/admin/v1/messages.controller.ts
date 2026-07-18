import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { CommunicationSdk } from '../../../application/communication-sdk/communication.sdk';
import {
  GetMessageHandler,
  ListMessagesHandler,
} from '../../../application/queries/list-handlers';
import { IdempotencyService } from '../../../infrastructure/idempotency/idempotency.service';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { TenantScopeGuard } from '../../guards/tenant-scope.guard';
import { ListMessagesQueryDto } from '../../dto/pagination.dto';
import { SendMessageDto } from '../../api/v1/dto/send-message.dto';

@ApiTags('Admin Messages')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantScopeGuard)
@Controller('admin/v1/messages')
export class AdminMessagesController {
  constructor(
    private readonly sdk: CommunicationSdk,
    private readonly listMessages: ListMessagesHandler,
    private readonly getMessage: GetMessageHandler,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Get()
  async list(@Query() query: ListMessagesQueryDto) {
    return this.listMessages.execute(query.organizationId || '', query, {
      conversationId: query.conversationId,
    });
  }

  @Get(':id')
  async get(
    @Param('id') id: string,
    @Query('organizationId') organizationId: string,
  ) {
    return {
      data: await this.getMessage.execute(organizationId, id),
      message: 'OK',
    };
  }

  @Post()
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  async send(
    @Body() dto: SendMessageDto,
    @Query('organizationId') organizationId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const orgId =
      (dto as SendMessageDto & { organizationId?: string }).organizationId ||
      organizationId;

    let recordId: string | undefined;

    if (idempotencyKey) {
      const begin = await this.idempotency.begin({
        organizationId: orgId,
        key: idempotencyKey,
        requestBody: dto,
      });
      if (begin.isReplay) {
        return {
          data: begin.responseBody,
          message: 'Idempotent replay',
          meta: { idempotent: true },
        };
      }
      recordId = begin.recordId;
    }

    try {
      const result = await this.sdk.send({
        organizationId: orgId,
        communicationAccountId: dto.communicationAccountId,
        to: dto.to,
        body: dto.body,
        messageType: dto.messageType,
        content: dto.content,
        mediaUrl: dto.mediaUrl,
        mediaId: dto.mediaId,
        caption: dto.caption,
        templateName: dto.templateName,
        templateLanguage: dto.templateLanguage,
        contactId: dto.contactId,
        conversationId: dto.conversationId,
        idempotencyKey,
      });

      if (recordId) {
        await this.idempotency.complete(recordId, 201, result);
      }

      return { data: result, message: 'Message queued' };
    } catch (err) {
      if (recordId) {
        await this.idempotency.fail(recordId);
      }
      throw err;
    }
  }
}
