import { ChannelCode } from '../enums';
import { MessageType } from '../enums';

export interface ProviderCapabilities {
  channelCode: ChannelCode;
  supportsText: boolean;
  supportsMedia: boolean;
  supportsTemplates: boolean;
  supportsReadReceipts: boolean;
  supportsTypingIndicator: boolean;
  supportedMediaTypes: MessageType[];
  maxTextLength: number;
  maxMediaSizeBytes: number;
}

export const WHATSAPP_CAPABILITIES: ProviderCapabilities = {
  channelCode: ChannelCode.WHATSAPP,
  supportsText: true,
  supportsMedia: true,
  supportsTemplates: true,
  supportsReadReceipts: true,
  supportsTypingIndicator: true,
  supportedMediaTypes: [
    MessageType.IMAGE,
    MessageType.AUDIO,
    MessageType.VIDEO,
    MessageType.DOCUMENT,
    MessageType.STICKER,
  ],
  maxTextLength: 4096,
  maxMediaSizeBytes: 16 * 1024 * 1024,
};
