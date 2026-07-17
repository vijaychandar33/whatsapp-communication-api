import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const PERMISSIONS_KEY = 'permissions';
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export interface TenantContext {
  organizationId: string;
  userId?: string;
  apiKeyId?: string;
  email?: string;
}

export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContext => {
    const request = ctx.switchToHttp().getRequest<{
      user?: TenantContext & { sub?: string; organizationId?: string };
      organizationId?: string;
    }>();

    if (request.user) {
      return {
        organizationId:
          request.user.organizationId ?? request.organizationId ?? '',
        userId: request.user.userId ?? request.user.sub,
        apiKeyId: request.user.apiKeyId,
        email: request.user.email,
      };
    }

    return {
      organizationId: request.organizationId ?? '',
    };
  },
);

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: unknown }>();
    return request.user;
  },
);
