import { Injectable } from '@nestjs/common';
import { PrismaService } from '../persistence/prisma/prisma.service';

@Injectable()
export class FeatureFlagService {
  constructor(private readonly prisma: PrismaService) {}

  async isEnabled(
    key: string,
    organizationId?: string,
    defaultValue = false,
  ): Promise<boolean> {
    if (organizationId) {
      const orgFlag = await this.prisma.featureFlag.findUnique({
        where: {
          organizationId_key: { organizationId, key },
        },
      });
      if (orgFlag) return orgFlag.enabled;
    }

    const global = await this.prisma.featureFlag.findFirst({
      where: { key, organizationId: null },
    });
    return global?.enabled ?? defaultValue;
  }
}
