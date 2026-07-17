export interface PluginContext {
  organizationId: string;
  metadata?: Record<string, unknown>;
}

export interface Plugin {
  readonly name: string;
  readonly version: string;
  onInstall?(ctx: PluginContext): Promise<void>;
  onUninstall?(ctx: PluginContext): Promise<void>;
  onMessageReceived?(
    ctx: PluginContext,
    payload: Record<string, unknown>,
  ): Promise<void>;
  onMessageSent?(
    ctx: PluginContext,
    payload: Record<string, unknown>,
  ): Promise<void>;
}

export const PLUGIN_REGISTRY = Symbol('PLUGIN_REGISTRY');
