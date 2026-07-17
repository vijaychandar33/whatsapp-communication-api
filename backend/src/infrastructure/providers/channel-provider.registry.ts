import { Injectable, OnModuleInit } from '@nestjs/common';
import { ChannelCode } from '../../domain/enums';
import { ProviderUnavailable } from '../../domain/errors';
import { ChannelProvider } from '../../domain/interfaces/channel-provider.interface';
import { WhatsAppChannelProvider } from './whatsapp/whatsapp-channel.provider';

@Injectable()
export class ChannelProviderRegistry implements OnModuleInit {
  private readonly providers = new Map<string, ChannelProvider>();

  constructor(private readonly whatsapp: WhatsAppChannelProvider) {}

  onModuleInit(): void {
    this.register(this.whatsapp);
  }

  register(provider: ChannelProvider): void {
    this.providers.set(provider.channelCode, provider);
  }

  get(channelCode: ChannelCode | string): ChannelProvider {
    const provider = this.providers.get(channelCode);
    if (!provider) {
      throw new ProviderUnavailable(String(channelCode), 'No provider registered');
    }
    return provider;
  }

  has(channelCode: ChannelCode | string): boolean {
    return this.providers.has(channelCode);
  }

  list(): ChannelProvider[] {
    return [...this.providers.values()];
  }
}
