export class DomainEvent<T = Record<string, unknown>> {
  readonly eventId: string;
  readonly eventType: string;
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly aggregateType: string;
  readonly payload: T;
  readonly organizationId?: string;

  constructor(params: {
    eventId: string;
    eventType: string;
    aggregateId: string;
    aggregateType: string;
    payload: T;
    organizationId?: string;
    occurredAt?: Date;
  }) {
    this.eventId = params.eventId;
    this.eventType = params.eventType;
    this.aggregateId = params.aggregateId;
    this.aggregateType = params.aggregateType;
    this.payload = params.payload;
    this.organizationId = params.organizationId;
    this.occurredAt = params.occurredAt ?? new Date();
  }
}

export class MessageQueuedEvent extends DomainEvent<{
  messageId: string;
  channelCode: string;
}> {
  static TYPE = 'message.queued';
}

export class MessageSentEvent extends DomainEvent<{
  messageId: string;
  providerMessageId: string;
  conversationId?: string;
  channelCode?: string;
}> {
  static TYPE = 'message.sent';
}

export class MessageReceivedEvent extends DomainEvent<{
  messageId: string;
  conversationId: string;
  channelCode: string;
  contactId: string;
}> {
  static TYPE = 'message.received';
}

export class MessageStatusUpdatedEvent extends DomainEvent<{
  messageId: string;
  status: string;
  conversationId?: string;
  channelCode?: string;
}> {
  static TYPE = 'message.status_updated';
}

export class ConversationOpenedEvent extends DomainEvent<{
  conversationId: string;
  channelCode: string;
}> {
  static TYPE = 'conversation.opened';
}
