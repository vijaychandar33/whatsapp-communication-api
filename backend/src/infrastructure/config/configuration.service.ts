import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AppConfiguration,
  ConfigurationService as IConfigurationService,
} from '../../domain/interfaces/configuration.interface';

@Injectable()
export class AppConfigurationService implements IConfigurationService {
  constructor(private readonly config: ConfigService) {}

  get(): AppConfiguration {
    const encryptionKey = this.require('ENCRYPTION_KEY');
    if (encryptionKey.length !== 64) {
      throw new Error(
        'ENCRYPTION_KEY must be a 64-char hex string (32 bytes)',
      );
    }

    return {
      nodeEnv: this.config.get<string>('NODE_ENV', 'development'),
      port: Number(this.config.get<string>('PORT', '3000')),
      databaseUrl: this.require('DATABASE_URL'),
      jwtSecret: this.require('JWT_SECRET'),
      jwtRefreshSecret: this.require('JWT_REFRESH_SECRET'),
      encryptionKey,
      redisUrl: this.config.get<string>('REDIS_URL') || null,
      corsOrigins: (this.config.get<string>('CORS_ORIGINS') ?? '')
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
      metaGraphApiVersion: this.config.get<string>(
        'META_GRAPH_API_VERSION',
        'v21.0',
      ),
      storagePath: this.config.get<string>('STORAGE_PATH', './storage'),
      isProduction:
        this.config.get<string>('NODE_ENV', 'development') === 'production',
    };
  }

  get redisEnabled(): boolean {
    return Boolean(this.config.get<string>('REDIS_URL'));
  }

  private require(key: string): string {
    const value = this.config.get<string>(key);
    if (!value) {
      throw new Error(`Missing required configuration: ${key}`);
    }
    return value;
  }
}
