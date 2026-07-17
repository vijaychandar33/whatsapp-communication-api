import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiKeyStatus } from '@prisma/client';
import { PrismaService } from '../../infrastructure/persistence/prisma/prisma.service';
import { AesSecretService } from '../../infrastructure/secrets/secret.service';
import { SystemClock } from '../../infrastructure/clock/system-clock';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: AesSecretService,
    private readonly clock: SystemClock,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<
      Request & {
        organizationId?: string;
        user?: {
          organizationId: string;
          apiKeyId: string;
        };
      }
    >();

    const header =
      (request.headers['x-api-key'] as string | undefined) ??
      this.extractBearer(request.headers.authorization);

    if (!header) {
      throw new UnauthorizedException('API key required');
    }

    const prefix = header.slice(0, 8);
    const candidates = await this.prisma.apiKey.findMany({
      where: {
        keyPrefix: prefix,
        status: ApiKeyStatus.ACTIVE,
      },
    });

    const match = candidates.find((k) =>
      this.secrets.compareHash(header, k.keyHash),
    );

    if (!match) {
      throw new UnauthorizedException('Invalid API key');
    }

    if (match.expiresAt && match.expiresAt < this.clock.now()) {
      throw new UnauthorizedException('API key expired');
    }

    await this.prisma.apiKey.update({
      where: { id: match.id },
      data: { lastUsedAt: this.clock.now() },
    });

    request.organizationId = match.organizationId;
    request.user = {
      organizationId: match.organizationId,
      apiKeyId: match.id,
    };

    return true;
  }

  private extractBearer(authorization?: string): string | undefined {
    if (!authorization?.startsWith('Bearer ')) return undefined;
    const token = authorization.slice(7);
    // API keys are prefixed with cp_ — JWTs are not
    return token.startsWith('cp_') ? token : undefined;
  }
}
