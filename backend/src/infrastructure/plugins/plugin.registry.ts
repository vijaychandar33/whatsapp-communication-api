import { Injectable } from '@nestjs/common';
import {
  Plugin,
  PluginContext,
} from '../../domain/interfaces/plugin.interface';

@Injectable()
export class PluginRegistry {
  private readonly plugins = new Map<string, Plugin>();

  register(plugin: Plugin): void {
    this.plugins.set(plugin.name, plugin);
  }

  get(name: string): Plugin | undefined {
    return this.plugins.get(name);
  }

  list(): Plugin[] {
    return [...this.plugins.values()];
  }

  async emitMessageReceived(
    ctx: PluginContext,
    payload: Record<string, unknown>,
  ): Promise<void> {
    for (const plugin of this.plugins.values()) {
      await plugin.onMessageReceived?.(ctx, payload);
    }
  }
}
