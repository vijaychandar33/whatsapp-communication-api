export class DomainError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    statusCode = 400,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class ContactAlreadyExists extends DomainError {
  constructor(identifier: string) {
    super(
      `Contact already exists: ${identifier}`,
      'CONTACT_ALREADY_EXISTS',
      409,
      { identifier },
    );
  }
}

export class ConversationNotFound extends DomainError {
  constructor(conversationId: string) {
    super(
      `Conversation not found: ${conversationId}`,
      'CONVERSATION_NOT_FOUND',
      404,
      { conversationId },
    );
  }
}

export class MessageAlreadySent extends DomainError {
  constructor(messageId: string) {
    super(
      `Message already sent: ${messageId}`,
      'MESSAGE_ALREADY_SENT',
      409,
      { messageId },
    );
  }
}

export class ProviderUnavailable extends DomainError {
  constructor(channel: string, reason?: string) {
    super(
      reason
        ? `Provider unavailable for ${channel}: ${reason}`
        : `Provider unavailable for ${channel}`,
      'PROVIDER_UNAVAILABLE',
      503,
      { channel, reason },
    );
  }
}

export class PermissionDenied extends DomainError {
  constructor(action?: string) {
    super(
      action ? `Permission denied: ${action}` : 'Permission denied',
      'PERMISSION_DENIED',
      403,
      { action },
    );
  }
}

export class CapabilityNotSupported extends DomainError {
  constructor(capability: string, channel?: string) {
    super(
      `Capability not supported: ${capability}${channel ? ` on ${channel}` : ''}`,
      'CAPABILITY_NOT_SUPPORTED',
      422,
      { capability, channel },
    );
  }
}

export class IdempotencyKeyConflict extends DomainError {
  constructor(key: string) {
    super(
      `Idempotency key conflict: ${key}`,
      'IDEMPOTENCY_KEY_CONFLICT',
      409,
      { key },
    );
  }
}

export class NotFoundError extends DomainError {
  constructor(resource: string, id?: string) {
    super(
      id ? `${resource} not found: ${id}` : `${resource} not found`,
      'NOT_FOUND',
      404,
      { resource, id },
    );
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, details);
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message = 'Unauthorized') {
    super(message, 'UNAUTHORIZED', 401);
  }
}
