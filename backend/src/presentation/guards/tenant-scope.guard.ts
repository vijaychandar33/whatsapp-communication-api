import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

export type RequestUser = {
  userId: string;
  sub: string;
  email: string;
  organizationId: string;
  organizationType?: string;
};

/**
 * Binds organizationId on query/body to the JWT tenant.
 * SYSTEM orgs may pass any organizationId; others are locked to their home org.
 * When organizationId is omitted, injects the JWT organizationId.
 */
@Injectable()
export class TenantScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      user?: RequestUser;
      query?: Record<string, unknown>;
      body?: Record<string, unknown>;
      organizationId?: string;
      method?: string;
    }>();

    const user = request.user;
    if (!user?.organizationId) {
      return true;
    }

    const isSystem = user.organizationType === 'SYSTEM';
    const homeOrgId = user.organizationId;

    if (!request.query || typeof request.query !== 'object') {
      request.query = {};
    }

    const queryOrg = request.query.organizationId;
    if (typeof queryOrg === 'string' && queryOrg.length > 0) {
      if (!isSystem && queryOrg !== homeOrgId) {
        throw new ForbiddenException('Cross-tenant access denied');
      }
    } else {
      request.query.organizationId = homeOrgId;
    }

    if (request.body && typeof request.body === 'object' && !Array.isArray(request.body)) {
      const bodyOrg = request.body.organizationId;
      if (typeof bodyOrg === 'string' && bodyOrg.length > 0) {
        if (!isSystem && bodyOrg !== homeOrgId) {
          throw new ForbiddenException('Cross-tenant access denied');
        }
      } else if ('organizationId' in request.body) {
        request.body.organizationId = homeOrgId;
      }
    }

    request.organizationId =
      (typeof request.query.organizationId === 'string'
        ? request.query.organizationId
        : undefined) ||
      (typeof request.body?.organizationId === 'string'
        ? request.body.organizationId
        : undefined) ||
      homeOrgId;

    return true;
  }
}
