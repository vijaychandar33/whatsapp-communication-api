import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { OUTBOX_PROCESSED_EVENT } from '../../infrastructure/outbox/outbox.service';
import {
  MessageReceivedEvent,
  MessageSentEvent,
  MessageStatusUpdatedEvent,
} from '../../domain/events';
import { AppConfigurationService } from '../../infrastructure/config/configuration.service';

@WebSocketGateway({
  namespace: '/ws',
  cors: { origin: true, credentials: true },
})
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfigurationService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token =
        (client.handshake.query.token as string | undefined) ??
        (client.handshake.auth?.token as string | undefined);

      if (!token) {
        client.disconnect(true);
        return;
      }

      const payload = await this.jwt.verifyAsync<{
        sub: string;
        organizationId: string;
      }>(token, {
        secret: this.config.get().jwtSecret,
      });

      const organizationId = payload.organizationId;
      if (!organizationId) {
        client.disconnect(true);
        return;
      }

      client.data.userId = payload.sub;
      client.data.organizationId = organizationId;
      await client.join(`org:${organizationId}`);
      this.logger.debug(
        `WS connected user=${payload.sub} org=${organizationId}`,
      );
    } catch (err) {
      this.logger.warn(
        `WS auth failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`WS disconnected ${client.id}`);
  }

  @SubscribeMessage('join.conversation')
  async joinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId?: string },
  ) {
    const conversationId = body?.conversationId;
    if (!conversationId || !client.data.organizationId) {
      return { ok: false };
    }
    await client.join(`conversation:${conversationId}`);
    return { ok: true, room: `conversation:${conversationId}` };
  }

  @SubscribeMessage('leave.conversation')
  async leaveConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId?: string },
  ) {
    const conversationId = body?.conversationId;
    if (!conversationId) return { ok: false };
    await client.leave(`conversation:${conversationId}`);
    return { ok: true };
  }

  @OnEvent(OUTBOX_PROCESSED_EVENT)
  handleOutbox(event: {
    organizationId: string | null;
    eventType: string;
    aggregateId: string;
    payload: unknown;
  }): void {
    if (!this.server || !event.organizationId) return;

    const payload = (event.payload ?? {}) as Record<string, unknown>;
    const conversationId =
      typeof payload.conversationId === 'string'
        ? payload.conversationId
        : undefined;

    const realtimeTypes = new Set([
      MessageReceivedEvent.TYPE,
      MessageSentEvent.TYPE,
      MessageStatusUpdatedEvent.TYPE,
    ]);
    if (!realtimeTypes.has(event.eventType)) return;

    const message = {
      type: event.eventType,
      organizationId: event.organizationId,
      aggregateId: event.aggregateId,
      payload,
      at: new Date().toISOString(),
    };

    this.server
      .to(`org:${event.organizationId}`)
      .emit(event.eventType, message);

    if (conversationId) {
      this.server
        .to(`conversation:${conversationId}`)
        .emit(event.eventType, message);
    }
  }

  emitToOrg(organizationId: string, event: string, data: unknown): void {
    this.server?.to(`org:${organizationId}`).emit(event, data);
  }

  emitToConversation(
    conversationId: string,
    event: string,
    data: unknown,
  ): void {
    this.server?.to(`conversation:${conversationId}`).emit(event, data);
  }
}
