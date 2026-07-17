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
import { ApiHeader, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { CommunicationSdk } from '../../../application/communication-sdk/communication.sdk';
import {
  GetMessageHandler,
  ListMessagesHandler,
} from '../../../application/queries/list-handlers';
import { IdempotencyService } from '../../../infrastructure/idempotency/idempotency.service';
import { ApiKeyGuard } from '../../guards/api-key.guard';
import { CurrentTenant, TenantContext } from '../../decorators';
import { PaginationDto } from '../../dto/pagination.dto';
import { SendMessageDto } from './dto/send-message.dto';

@ApiTags('Developer Messages')
@ApiSecurity('api-key')
@UseGuards(ApiKeyGuard)
@Controller('api/v1/messages')
export class MessagesController {
  constructor(
    private readonly sdk: CommunicationSdk,
    private readonly listMessages: ListMessagesHandler,
    private readonly getMessage: GetMessageHandler,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post()
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  async send(
    @Body() dto: SendMessageDto,
    @CurrentTenant() tenant: TenantContext,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    let recordId: string | undefined;

    if (idempotencyKey) {
      const begin = await this.idempotency.begin({
        organizationId: tenant.organizationId,
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
        organizationId: tenant.organizationId,
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

  @Get()
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Query() pagination: PaginationDto,
  ) {
    return this.listMessages.execute(tenant.organizationId, pagination);
  }

  @Get(':id')
  async get(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return {
      data: await this.getMessage.execute(tenant.organizationId, id),
      message: 'OK',
    };
  }
}
