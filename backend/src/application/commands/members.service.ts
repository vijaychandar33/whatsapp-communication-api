import { createHash, randomBytes } from 'crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { InvitationRole } from '@prisma/client';
import { PrismaService } from '../../infrastructure/persistence/prisma/prisma.service';
import { UuidIdentifierService } from '../../infrastructure/identifier/uuid-identifier.service';
import { SystemClock } from '../../infrastructure/clock/system-clock';
import { NotFoundError, ValidationError } from '../../domain/errors';
import { ensureWorkspaceRoles } from './ensure-workspace-roles';
import {
  WorkspaceRole,
  hasMinRole,
  highestRole,
  inviteRoleToWorkspace,
} from '../../domain/auth/workspace-roles';
import { AuthService } from '../../modules/auth/auth.service';

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identifiers: UuidIdentifierService,
    private readonly clock: SystemClock,
    private readonly auth: AuthService,
  ) {}

  async listMembers(organizationId: string) {
    const users = await this.prisma.user.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
        roles: { include: { role: true } },
      },
    });
    return users.map((u) => ({
      ...u,
      roleNames: u.roles.map((r) => r.role.name),
      workspaceRole: highestRole(u.roles.map((r) => r.role.name)),
    }));
  }

  async changeRole(
    actorUserId: string,
    targetUserId: string,
    role: Exclude<WorkspaceRole, 'owner'>,
  ) {
    const actor = await this.loadUser(actorUserId);
    const target = await this.loadUser(targetUserId);

    if (actor.organizationId !== target.organizationId) {
      throw new ForbiddenException('Cross-tenant access denied');
    }
    if (!hasMinRole(actor.roleNames, 'admin')) {
      throw new ForbiddenException('Requires admin role or higher');
    }

    const targetRole = highestRole(target.roleNames);
    if (targetRole === 'owner') {
      throw new ForbiddenException('Cannot change the owner role');
    }

    const roles = await ensureWorkspaceRoles(this.prisma, target.organizationId, () =>
      this.identifiers.generate(),
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId: targetUserId } });
      await tx.userRole.create({
        data: { userId: targetUserId, roleId: roles[role] },
      });
    });

    const list = await this.listMembers(target.organizationId);
    return list.find((m) => m.id === targetUserId);
  }

  async removeMember(actorUserId: string, targetUserId: string) {
    const actor = await this.loadUser(actorUserId);
    const target = await this.loadUser(targetUserId);

    if (actor.organizationId !== target.organizationId) {
      throw new ForbiddenException('Cross-tenant access denied');
    }
    if (!hasMinRole(actor.roleNames, 'admin')) {
      throw new ForbiddenException('Requires admin role or higher');
    }
    if (actorUserId === targetUserId) {
      throw new ForbiddenException('Cannot remove yourself');
    }
    if (highestRole(target.roleNames) === 'owner') {
      throw new ForbiddenException('Cannot remove the owner');
    }

    await this.prisma.user.update({
      where: { id: targetUserId },
      data: {
        deletedAt: this.clock.now(),
        status: 'INACTIVE',
      },
    });
    await this.prisma.refreshToken.updateMany({
      where: { userId: targetUserId, revokedAt: null },
      data: { revokedAt: this.clock.now() },
    });

    return { id: targetUserId };
  }

  async transferOwnership(actorUserId: string, newOwnerUserId: string) {
    const actor = await this.loadUser(actorUserId);
    const target = await this.loadUser(newOwnerUserId);

    if (actor.organizationId !== target.organizationId) {
      throw new ForbiddenException('Cross-tenant access denied');
    }
    if (highestRole(actor.roleNames) !== 'owner') {
      throw new ForbiddenException('Only the owner can transfer ownership');
    }
    if (actorUserId === newOwnerUserId) {
      throw new ValidationError('Already the owner');
    }

    const roles = await ensureWorkspaceRoles(this.prisma, actor.organizationId, () =>
      this.identifiers.generate(),
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({
        where: { userId: { in: [actorUserId, newOwnerUserId] } },
      });
      await tx.userRole.create({
        data: { userId: newOwnerUserId, roleId: roles.owner },
      });
      await tx.userRole.create({
        data: { userId: actorUserId, roleId: roles.admin },
      });
    });

    return { organizationId: actor.organizationId, ownerId: newOwnerUserId };
  }

  async renameOrganization(
    actorUserId: string,
    organizationId: string,
    name: string,
  ) {
    const actor = await this.loadUser(actorUserId);
    if (actor.organizationId !== organizationId && actor.orgType !== 'SYSTEM') {
      throw new ForbiddenException('Cross-tenant access denied');
    }
    if (!hasMinRole(actor.roleNames, 'admin') && actor.orgType !== 'SYSTEM') {
      throw new ForbiddenException('Requires admin role or higher');
    }
    return this.prisma.organization.update({
      where: { id: organizationId },
      data: { name: name.trim() },
      select: { id: true, name: true, slug: true, type: true, status: true },
    });
  }

  async listInvitations(organizationId: string) {
    return this.prisma.invitation.findMany({
      where: {
        organizationId,
        revokedAt: null,
        acceptedAt: null,
        expiresAt: { gt: this.clock.now() },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        role: true,
        label: true,
        expiresAt: true,
        createdAt: true,
        createdByUserId: true,
      },
    });
  }

  async createInvitation(
    actorUserId: string,
    input: {
      organizationId: string;
      email?: string;
      role?: InvitationRole;
      label?: string;
      expiresInDays?: number;
    },
  ) {
    const actor = await this.loadUser(actorUserId);
    if (
      actor.organizationId !== input.organizationId &&
      actor.orgType !== 'SYSTEM'
    ) {
      throw new ForbiddenException('Cross-tenant access denied');
    }
    if (!hasMinRole(actor.roleNames, 'admin')) {
      throw new ForbiddenException('Requires admin role or higher');
    }

    const role = input.role ?? InvitationRole.AGENT;
    const days = input.expiresInDays ?? 7;
    if (days < 1 || days > 30) {
      throw new ValidationError('expiresInDays must be between 1 and 30');
    }

    const plainToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(plainToken).digest('hex');

    const invite = await this.prisma.invitation.create({
      data: {
        id: this.identifiers.generate(),
        organizationId: input.organizationId,
        email: input.email?.toLowerCase().trim() || null,
        role,
        label: input.label?.trim() || null,
        tokenHash,
        createdByUserId: actorUserId,
        expiresAt: new Date(this.clock.nowMs() + days * 24 * 60 * 60 * 1000),
      },
      select: {
        id: true,
        email: true,
        role: true,
        label: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    return {
      ...invite,
      token: plainToken,
      invitePath: `/join/${plainToken}`,
    };
  }

  async revokeInvitation(actorUserId: string, invitationId: string) {
    const actor = await this.loadUser(actorUserId);
    if (!hasMinRole(actor.roleNames, 'admin')) {
      throw new ForbiddenException('Requires admin role or higher');
    }
    const invite = await this.prisma.invitation.findFirst({
      where: { id: invitationId },
    });
    if (!invite) throw new NotFoundError('Invitation', invitationId);
    if (
      invite.organizationId !== actor.organizationId &&
      actor.orgType !== 'SYSTEM'
    ) {
      throw new ForbiddenException('Cross-tenant access denied');
    }
    return this.prisma.invitation.update({
      where: { id: invitationId },
      data: { revokedAt: this.clock.now() },
      select: { id: true, revokedAt: true },
    });
  }

  async peekInvitation(token: string) {
    const invite = await this.findValidInvite(token);
    const org = await this.prisma.organization.findFirst({
      where: { id: invite.organizationId, deletedAt: null },
      select: { id: true, name: true, slug: true },
    });
    return {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      label: invite.label,
      expiresAt: invite.expiresAt,
      organization: org,
    };
  }

  async redeemInvitation(input: {
    token: string;
    actorUserId?: string;
    email?: string;
    password?: string;
    firstName?: string;
    lastName?: string;
  }) {
    const invite = await this.findValidInvite(input.token);
    const workspaceRole = inviteRoleToWorkspace(invite.role);
    const roles = await ensureWorkspaceRoles(
      this.prisma,
      invite.organizationId,
      () => this.identifiers.generate(),
    );

    if (input.actorUserId) {
      const existing = await this.prisma.user.findFirst({
        where: { id: input.actorUserId, deletedAt: null },
      });
      if (!existing) throw new NotFoundError('User', input.actorUserId);
      if (existing.organizationId !== invite.organizationId) {
        throw new ConflictException(
          'You already belong to another organization. Sign out and create a new account to join.',
        );
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.userRole.deleteMany({ where: { userId: input.actorUserId! } });
        await tx.userRole.create({
          data: {
            userId: input.actorUserId!,
            roleId: roles[workspaceRole],
          },
        });
        await tx.invitation.update({
          where: { id: invite.id },
          data: {
            acceptedAt: this.clock.now(),
            acceptedByUserId: input.actorUserId!,
          },
        });
      });

      return this.auth.issueSessionForUser(input.actorUserId);
    }

    const email = (input.email || invite.email || '').toLowerCase().trim();
    if (!email) throw new ValidationError('Email is required');
    if (!input.password || input.password.length < 8) {
      throw new ValidationError('Password must be at least 8 characters');
    }

    const existingEmail = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
    });
    if (existingEmail) {
      throw new ConflictException(
        'Email already registered — sign in first, then accept the invite',
      );
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    const created = await this.prisma.user.create({
      data: {
        id: this.identifiers.generate(),
        organizationId: invite.organizationId,
        email,
        passwordHash,
        firstName: input.firstName?.trim() || null,
        lastName: input.lastName?.trim() || null,
        status: 'ACTIVE',
        roles: { create: [{ roleId: roles[workspaceRole] }] },
        preferences: { create: { id: this.identifiers.generate() } },
      },
    });

    await this.prisma.invitation.update({
      where: { id: invite.id },
      data: {
        acceptedAt: this.clock.now(),
        acceptedByUserId: created.id,
      },
    });

    return this.auth.issueSessionForUser(created.id);
  }

  private async findValidInvite(token: string) {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const invite = await this.prisma.invitation.findFirst({
      where: { tokenHash },
    });
    if (!invite || invite.revokedAt || invite.acceptedAt) {
      throw new NotFoundError('Invitation');
    }
    if (invite.expiresAt <= this.clock.now()) {
      throw new ValidationError('Invitation has expired');
    }
    return invite;
  }

  private async loadUser(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: {
        roles: { include: { role: true } },
        organization: { select: { type: true } },
      },
    });
    if (!user) throw new NotFoundError('User', userId);
    return {
      id: user.id,
      organizationId: user.organizationId,
      orgType: user.organization.type,
      roleNames: user.roles.map((r) => r.role.name),
    };
  }
}
