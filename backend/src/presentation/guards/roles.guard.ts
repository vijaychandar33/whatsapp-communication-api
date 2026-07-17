import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../infrastructure/persistence/prisma/prisma.service';
import {
  WorkspaceCapability,
  WorkspaceRole,
  hasCapability,
  hasMinRole,
} from '../../domain/auth/workspace-roles';

export const MIN_ROLE_KEY = 'minRole';
export const CAPABILITY_KEY = 'capability';

export const RequireMinRole = (role: WorkspaceRole) =>
  SetMetadata(MIN_ROLE_KEY, role);

export const RequireCapability = (capability: WorkspaceCapability) =>
  SetMetadata(CAPABILITY_KEY, capability);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const capability = this.reflector.getAllAndOverride<
      WorkspaceCapability | undefined
    >(CAPABILITY_KEY, [context.getHandler(), context.getClass()]);
    const minRole = this.reflector.getAllAndOverride<WorkspaceRole | undefined>(
      MIN_ROLE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!capability && !minRole) return true;

    const request = context.switchToHttp().getRequest<{
      user?: { userId?: string; sub?: string; roles?: string[] };
    }>();
    const userId = request.user?.userId ?? request.user?.sub;
    if (!userId) throw new ForbiddenException('Not authenticated');

    let roleNames = request.user?.roles;
    if (!roleNames?.length) {
      const rows = await this.prisma.userRole.findMany({
        where: { userId },
        include: { role: true },
      });
      roleNames = rows.map((r) => r.role.name);
      if (request.user) request.user.roles = roleNames;
    }

    if (capability) {
      if (!hasCapability(roleNames, capability)) {
        throw new ForbiddenException(`Requires ${capability} capability`);
      }
      return true;
    }

    if (minRole && !hasMinRole(roleNames, minRole)) {
      throw new ForbiddenException(`Requires ${minRole} role or higher`);
    }
    return true;
  }
}
