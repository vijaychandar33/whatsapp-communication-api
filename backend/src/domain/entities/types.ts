import {
  ChannelCode,
  ConversationStatus,
  MessageDirection,
  MessageStatus,
  MessageType,
  OrganizationStatus,
  OrganizationType,
  UserStatus,
} from '../enums';

export interface OrganizationEntity {
  id: string;
  name: string;
  slug: string;
  type: OrganizationType;
  status: OrganizationStatus;
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
}

export interface UserEntity {
  id: string;
  organizationId: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContactEntity {
  id: string;
  organizationId: string;
  phoneNumber?: string | null;
  email?: string | null;
  displayName?: string | null;
  externalId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ConversationEntity {
  id: string;
  organizationId: string;
  contactId: string;
  communicationAccountId: string;
  channelCode: ChannelCode;
  status: ConversationStatus;
  lastMessageAt?: Date | null;
}

export interface MessageEntity {
  id: string;
  organizationId: string;
  conversationId: string;
  contactId: string;
  communicationAccountId: string;
  channelCode: ChannelCode;
  direction: MessageDirection;
  messageType: MessageType;
  status: MessageStatus;
  body?: string | null;
  content?: Record<string, unknown> | null;
  providerMessageId?: string | null;
  rawProviderPayload?: Record<string, unknown> | null;
  idempotencyKey?: string | null;
  createdAt: Date;
  updatedAt: Date;
}
