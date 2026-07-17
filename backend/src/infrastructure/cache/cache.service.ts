import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { CacheService } from '../../domain/interfaces/cache-service.interface';
import { AppConfigurationService } from '../config/configuration.service';

interface MemoryEntry {
  value: string;
  expiresAt?: number;
}

@Injectable()
export class AppCacheService implements CacheService, OnModuleDestroy {
  private readonly logger = new Logger(AppCacheService.name);
  private readonly memory = new Map<string, MemoryEntry>();
  private redis: Redis | null = null;

  constructor(config: AppConfigurationService) {
    const redisUrl = config.get().redisUrl;
    if (redisUrl) {
      try {
        this.redis = new Redis(redisUrl, {
          maxRetriesPerRequest: 1,
          lazyConnect: true,
          enableOfflineQueue: false,
        });
        this.redis.connect().catch((err: Error) => {
          this.logger.warn(
            `Redis unavailable, using in-memory cache: ${err.message}`,
          );
          void this.redis?.quit();
          this.redis = null;
        });
      } catch (err) {
        this.logger.warn(
          `Redis init failed, using in-memory cache: ${(err as Error).message}`,
        );
        this.redis = null;
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (this.redis) {
      try {
        const raw = await this.redis.get(key);
        return raw ? (JSON.parse(raw) as T) : null;
      } catch {
        // fall through to memory
      }
    }
    const entry = this.memory.get(key);
    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      this.memory.delete(key);
      return null;
    }
    return JSON.parse(entry.value) as T;
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (this.redis) {
      try {
        if (ttlSeconds) {
          await this.redis.set(key, serialized, 'EX', ttlSeconds);
        } else {
          await this.redis.set(key, serialized);
        }
        return;
      } catch {
        // fall through
      }
    }
    this.memory.set(key, {
      value: serialized,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
    });
  }

  async del(key: string): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.del(key);
      } catch {
        // ignore
      }
    }
    this.memory.delete(key);
  }

  async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== null;
  }
}
