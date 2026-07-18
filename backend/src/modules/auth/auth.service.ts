import { createHash, randomBytes } from 'crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AppConfigurationService } from '../../infrastructure/config/configuration.service';
import { PrismaService } from '../../infrastructure/persistence/prisma/prisma.service';
import { UuidIdentifierService } from '../../infrastructure/identifier/uuid-identifier.service';
import { SystemClock } from '../../infrastructure/clock/system-clock';
import { AesSecretService } from '../../infrastructure/secrets/secret.service';
import { NotFoundError, ValidationError } from '../../domain/errors';
import { ensureWorkspaceRoles } from '../../application/commands/ensure-workspace-roles';
import { highestRole } from '../../domain/auth/workspace-roles';

export const API_KEY_SCOPES = [
  'messages:send',
  'messages:read',
  'contacts:read',
  'contacts:write',
  'conversations:read',
  'webhooks:manage',
  'broadcasts:send',
] as const;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: AppConfigurationService,
    private readonly identifiers: UuidIdentifierService,
    private readonly clock: SystemClock,
    private readonly secrets: AesSecretService,
  ) {}

  async register(input: {
    email: string;
    password: string;
    organizationName: string;
    organizationSlug?: string;
    firstName?: string;
    lastName?: string;
  }) {
    const email = input.email.toLowerCase().trim();
    const slug = this.slugify(
      input.organizationSlug?.trim() || input.organizationName,
    );

    if (slug.length < 2) {
      throw new ValidationError('Organization slug is too short');
    }

    const existingEmail = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
    });
    if (existingEmail) {
      throw new ConflictException('Email is already registered');
    }

    const existingSlug = await this.prisma.organization.findUnique({
      where: { slug },
    });
    if (existingSlug) {
      throw new ConflictException('Organization slug is already taken');
    }

    const passwordHash = await bcrypt.hash(input.password, 12);

    const user = await this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          id: this.identifiers.generate(),
          name: input.organizationName.trim(),
          slug,
          type: 'CUSTOMER',
          status: 'ACTIVE',
          settings: {
            create: { id: this.identifiers.generate() },
          },
        },
      });

      const roles = await ensureWorkspaceRoles(
        tx,
        org.id,
        () => this.identifiers.generate(),
      );

      return tx.user.create({
        data: {
          id: this.identifiers.generate(),
          organizationId: org.id,
          email,
          passwordHash,
          firstName: input.firstName?.trim() || null,
          lastName: input.lastName?.trim() || null,
          status: 'ACTIVE',
          roles: { create: [{ roleId: roles.owner }] },
          preferences: { create: { id: this.identifiers.generate() } },
        },
        include: {
          roles: { include: { role: true } },
          organization: true,
        },
      });
    });

    return this.issueTokens(user);
  }

  async login(
    email: string,
    password: string,
    meta?: { userAgent?: string; ipAddress?: string },
  ) {
    const user = await this.prisma.user.findFirst({
      where: {
        email: email.toLowerCase(),
        deletedAt: null,
        status: 'ACTIVE',
      },
      include: {
        roles: { include: { role: true } },
        organization: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: this.clock.now() },
    });

    return this.issueTokens(user, meta);
  }

  async refresh(
    refreshToken: string,
    meta?: { userAgent?: string; ipAddress?: string },
  ) {
    const hash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findFirst({
      where: {
        tokenHash: hash,
        revokedAt: null,
        expiresAt: { gt: this.clock.now() },
      },
      include: {
        user: {
          include: {
            roles: { include: { role: true } },
            organization: true,
          },
        },
      },
    });

    if (!stored || stored.user.deletedAt) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: this.clock.now() },
    });

    return this.issueTokens(stored.user, meta);
  }

  async me(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        status: true,
        organizationId: true,
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
            type: true,
            status: true,
            createdAt: true,
          },
        },
        roles: { include: { role: true } },
        preferences: true,
      },
    });
    if (!user) throw new UnauthorizedException();
    const roleNames = user.roles.map((r) => r.role.name);
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: user.avatarUrl,
      status: user.status,
      organizationId: user.organizationId,
      organization: user.organization,
      preferences: user.preferences,
      roles: roleNames,
      workspaceRole: highestRole(roleNames),
    };
  }

  async updateMe(
    userId: string,
    input: { firstName?: string; lastName?: string; avatarUrl?: string | null },
  ) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.firstName !== undefined
          ? { firstName: input.firstName.trim() || null }
          : {}),
        ...(input.lastName !== undefined
          ? { lastName: input.lastName.trim() || null }
          : {}),
        ...(input.avatarUrl !== undefined
          ? { avatarUrl: input.avatarUrl || null }
          : {}),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        organizationId: true,
      },
    });
    return user;
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });
    if (!user) throw new UnauthorizedException();

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      throw new ForbiddenException('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: this.clock.now() },
    });

    return { ok: true };
  }

  async listSessions(userId: string) {
    return this.prisma.refreshToken.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: this.clock.now() },
      },
      select: {
        id: true,
        createdAt: true,
        expiresAt: true,
        userAgent: true,
        ipAddress: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeSession(userId: string, sessionId: string) {
    const session = await this.prisma.refreshToken.findFirst({
      where: { id: sessionId, userId },
    });
    if (!session) throw new NotFoundError('Session', sessionId);
    await this.prisma.refreshToken.update({
      where: { id: sessionId },
      data: { revokedAt: this.clock.now() },
    });
    return { id: sessionId };
  }

  async revokeAllSessions(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: this.clock.now() },
    });
    return { ok: true };
  }

  async logout(refreshToken: string) {
    const hash = this.hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hash, revokedAt: null },
      data: { revokedAt: this.clock.now() },
    });
    return { ok: true };
  }

  async getPreferences(userId: string) {
    let prefs = await this.prisma.userPreferences.findUnique({
      where: { userId },
    });
    if (!prefs) {
      prefs = await this.prisma.userPreferences.create({
        data: {
          id: this.identifiers.generate(),
          userId,
        },
      });
    }
    return prefs;
  }

  async updatePreferences(
    userId: string,
    input: { theme?: string; locale?: string; settings?: Record<string, unknown> },
  ) {
    await this.getPreferences(userId);
    return this.prisma.userPreferences.update({
      where: { userId },
      data: {
        ...(input.theme !== undefined ? { theme: input.theme } : {}),
        ...(input.locale !== undefined ? { locale: input.locale } : {}),
        ...(input.settings !== undefined
          ? { settings: input.settings as object }
          : {}),
      },
    });
  }

  async createApiKeyPlain(
    organizationId: string,
    name: string,
    scopes: string[] = [],
    expiresInDays?: number,
  ): Promise<{
    apiKey: {
      id: string;
      name: string;
      keyPrefix: string;
      scopes: string[];
      expiresAt: Date | null;
      status: string;
    };
    plainKey: string;
  }> {
    const invalid = scopes.filter(
      (s) => !(API_KEY_SCOPES as readonly string[]).includes(s),
    );
    if (invalid.length) {
      throw new ValidationError(`Invalid scopes: ${invalid.join(', ')}`);
    }

    let expiresAt: Date | null = null;
    if (expiresInDays != null) {
      if (expiresInDays < 1 || expiresInDays > 365) {
        throw new ValidationError('expiresInDays must be between 1 and 365');
      }
      expiresAt = new Date(
        this.clock.nowMs() + expiresInDays * 24 * 60 * 60 * 1000,
      );
    }

    const plainKey = `cp_${randomBytes(24).toString('hex')}`;
    const keyPrefix = plainKey.slice(0, 8);
    const keyHash = this.secrets.hash(plainKey);
    const record = await this.prisma.apiKey.create({
      data: {
        id: this.identifiers.generate(),
        organizationId,
        name,
        keyPrefix,
        keyHash,
        scopes,
        expiresAt,
      },
    });
    return {
      apiKey: {
        id: record.id,
        name: record.name,
        keyPrefix: record.keyPrefix,
        scopes: record.scopes,
        expiresAt: record.expiresAt,
        status: record.status,
      },
      plainKey,
    };
  }

  async revokeApiKey(organizationId: string, id: string) {
    const key = await this.prisma.apiKey.findFirst({
      where: { id, organizationId },
    });
    if (!key) throw new NotFoundError('ApiKey', id);
    return this.prisma.apiKey.update({
      where: { id },
      data: {
        status: 'REVOKED',
        revokedAt: this.clock.now(),
      },
      select: {
        id: true,
        name: true,
        status: true,
        revokedAt: true,
      },
    });
  }

  hashTokenPublic(token: string): string {
    return this.hashToken(token);
  }

  /** Public wrapper for invite redeem / member flows. */
  async issueSessionForUser(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null, status: 'ACTIVE' },
      include: {
        roles: { include: { role: true } },
        organization: true,
      },
    });
    if (!user) throw new UnauthorizedException();
    return this.issueTokens(user);
  }

  private async issueTokens(
    user: {
      id: string;
      email: string;
      organizationId: string;
      roles: Array<{ role: { name: string } }>;
      organization: { id: string; name: string; slug: string; type?: string };
    },
    meta?: { userAgent?: string; ipAddress?: string },
  ) {
    await ensureWorkspaceRoles(this.prisma, user.organizationId, () =>
      this.identifiers.generate(),
    );
    const fresh = await this.prisma.user.findFirst({
      where: { id: user.id, deletedAt: null, status: 'ACTIVE' },
      include: {
        roles: { include: { role: true } },
        organization: true,
      },
    });
    if (!fresh) throw new UnauthorizedException();
    user = fresh;

    const payload = {
      sub: user.id,
      email: user.email,
      organizationId: user.organizationId,
      type: 'access' as const,
    };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get().jwtSecret,
      expiresIn: '15m',
    });

    const refreshToken = randomBytes(48).toString('hex');
    await this.prisma.refreshToken.create({
      data: {
        id: this.identifiers.generate(),
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(this.clock.nowMs() + 30 * 24 * 60 * 60 * 1000),
        userAgent: meta?.userAgent?.slice(0, 512) || null,
        ipAddress: meta?.ipAddress?.slice(0, 64) || null,
      },
    });

    const roleNames = user.roles.map((r) => r.role.name);

    return {
      accessToken,
      refreshToken,
      expiresIn: 900,
      user: {
        id: user.id,
        email: user.email,
        organizationId: user.organizationId,
        organization: user.organization,
        roles: roleNames,
        workspaceRole: highestRole(roleNames),
      },
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private slugify(value: string): string {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64);
  }
}
