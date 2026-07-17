import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators';
import { ApiKeyGuard } from './api-key.guard';

/**
 * Accepts either JWT (admin) or API key (developer).
 */
@Injectable()
export class JwtOrApiKeyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly apiKeyGuard: ApiKeyGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string; 'x-api-key'?: string };
    }>();

    const hasApiKey =
      Boolean(request.headers['x-api-key']) ||
      (request.headers.authorization?.startsWith('Bearer cp_') ?? false);

    if (hasApiKey) {
      return this.apiKeyGuard.canActivate(context);
    }

    const jwtGuard = new (AuthGuard('jwt'))();
    try {
      const result = await jwtGuard.canActivate(context);
      return result as boolean;
    } catch {
      throw new UnauthorizedException('Authentication required');
    }
  }
}
