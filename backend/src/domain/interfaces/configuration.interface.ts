export interface AppConfiguration {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  jwtRefreshSecret: string;
  encryptionKey: string;
  redisUrl: string | null;
  corsOrigins: string[];
  metaGraphApiVersion: string;
  storagePath: string;
  isProduction: boolean;
}

export interface ConfigurationService {
  get(): AppConfiguration;
  get redisEnabled(): boolean;
}

export const CONFIGURATION_SERVICE = Symbol('CONFIGURATION_SERVICE');
