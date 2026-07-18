import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Logger,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ChannelCode } from '@prisma/client';
import { Request, Response } from 'express';
import { Public } from '../../decorators';
import { PrismaService } from '../../../infrastructure/persistence/prisma/prisma.service';
import { NotFoundError, ValidationError } from '../../../domain/errors';
import { ProcessWebhookHandler } from '../../../application/commands/webhook-handlers';

@ApiTags('Webhooks')
@Controller('api/v1/webhooks/whatsapp')
export class WhatsAppWebhookController {
  private readonly logger = new Logger(WhatsAppWebhookController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly webhookHandler: ProcessWebhookHandler,
  ) {}

  /** Permanent org callback — works with zero or many WhatsApp accounts. */
  @Public()
  @Get('org/:organizationId')
  async verifyOrg(
    @Param('organizationId') organizationId: string,
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') verifyToken: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ): Promise<void> {
    const ok = await this.webhookHandler.verifyOrganizationToken(
      organizationId,
      mode,
      verifyToken,
    );
    if (!ok) {
      throw new ValidationError('Webhook verification failed');
    }
    res.status(200).send(challenge);
  }

  @Public()
  @Post('org/:organizationId')
  @HttpCode(200)
  async receiveOrg(
    @Param('organizationId') organizationId: string,
    @Body() payload: Record<string, unknown>,
    @Headers('x-hub-signature-256') signature?: string,
    @Req() req?: Request & { rawBody?: Buffer },
  ) {
    const stored = await this.webhookHandler.storeOrganizationEvent({
      organizationId,
      payload,
      signatureHeader: signature,
      rawBody: req?.rawBody,
    });

    if (stored.signatureValid === false) {
      this.logger.warn(
        `Invalid webhook signature for organization ${organizationId}`,
      );
      return { data: { received: true, processed: false }, message: 'OK' };
    }

    if (!stored.account) {
      this.logger.warn(
        `Webhook for org ${organizationId} could not be routed to an account`,
      );
      return { data: { received: true, processed: false }, message: 'OK' };
    }

    setImmediate(() => {
      void this.webhookHandler.processStoredEvent(
        stored.eventId,
        stored.account!,
        payload,
      );
    });

    return { data: { received: true }, message: 'OK' };
  }

  /** @deprecated Prefer /org/:organizationId — kept for existing Meta configs. */
  @Public()
  @Get(':accountId')
  async verify(
    @Param('accountId') accountId: string,
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') verifyToken: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ): Promise<void> {
    if (accountId === 'org') {
      throw new NotFoundError('CommunicationAccount', accountId);
    }

    const account = await this.prisma.communicationAccount.findFirst({
      where: {
        id: accountId,
        deletedAt: null,
        channelCode: ChannelCode.WHATSAPP,
      },
    });
    if (!account) {
      throw new NotFoundError('CommunicationAccount', accountId);
    }

    if (
      mode === 'subscribe' &&
      account.webhookVerifyToken &&
      verifyToken === account.webhookVerifyToken
    ) {
      res.status(200).send(challenge);
      return;
    }

    // Fall through to org-level token for the account's organization
    const ok = await this.webhookHandler.verifyOrganizationToken(
      account.organizationId,
      mode,
      verifyToken,
    );
    if (!ok) {
      throw new ValidationError('Webhook verification failed');
    }
    res.status(200).send(challenge);
  }

  /** @deprecated Prefer /org/:organizationId */
  @Public()
  @Post(':accountId')
  @HttpCode(200)
  async receive(
    @Param('accountId') accountId: string,
    @Body() payload: Record<string, unknown>,
    @Headers('x-hub-signature-256') signature?: string,
    @Req() req?: Request & { rawBody?: Buffer },
  ) {
    if (accountId === 'org') {
      throw new NotFoundError('CommunicationAccount', accountId);
    }

    const stored = await this.webhookHandler.storeEvent({
      accountId,
      payload,
      signatureHeader: signature,
      rawBody: req?.rawBody,
    });

    if (stored.signatureValid === false) {
      this.logger.warn(`Invalid webhook signature for account ${accountId}`);
      return { data: { received: true, processed: false }, message: 'OK' };
    }

    setImmediate(() => {
      void this.webhookHandler.processStoredEvent(
        stored.eventId,
        stored.account,
        payload,
      );
    });

    return { data: { received: true }, message: 'OK' };
  }
}
