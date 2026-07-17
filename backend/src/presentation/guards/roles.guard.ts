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
  WorkspaceRole,
  hasMinRole,
} from '../../domain/auth/workspace-roles';

export const MIN_ROLE_KEY = 'minRole';
export const RequireMinRole = (role: WorkspaceRole) =>
  SetMetadata(MIN_ROLE_KEY, role);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const minRole = this.reflector.getAllAndOverride<WorkspaceRole | undefined>(
      MIN_ROLE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!minRole) return true;

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

    if (!hasMinRole(roleNames, minRole)) {
      throw new ForbiddenException(`Requires ${minRole} role or higher`);
    }
    return true;
  }
}
