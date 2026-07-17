import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../decorators';
import { PrismaService } from '../../../infrastructure/persistence/prisma/prisma.service';
import { AppConfigurationService } from '../../../infrastructure/config/configuration.service';
import { AppCacheService } from '../../../infrastructure/cache/cache.service';

@ApiTags('Health')
@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigurationService,
    private readonly cache: AppCacheService,
  ) {}

  @Public()
  @Get('admin/v1/health')
  async adminHealth() {
    return this.check();
  }

  @Public()
  @Get('api/v1/health')
  async apiHealth() {
    return this.check();
  }

  private async check() {
    let database: 'up' | 'down' = 'down';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      database = 'up';
    } catch {
      database = 'down';
    }

    const cacheKey = 'health:ping';
    await this.cache.set(cacheKey, 'ok', 10);
    const cacheOk = (await this.cache.get<string>(cacheKey)) === 'ok';

    return {
      data: {
        status: database === 'up' ? 'ok' : 'degraded',
        database,
        cache: cacheOk ? 'up' : 'down',
        redisConfigured: this.config.redisEnabled,
        uptime: process.uptime(),
      },
      message: 'Health check',
    };
  }
}
