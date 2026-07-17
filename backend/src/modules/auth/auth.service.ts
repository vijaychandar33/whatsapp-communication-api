import { createHash, randomBytes } from 'crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AppConfigurationService } from '../../infrastructure/config/configuration.service';
import { PrismaService } from '../../infrastructure/persistence/prisma/prisma.service';
import { UuidIdentifierService } from '../../infrastructure/identifier/uuid-identifier.service';
import { SystemClock } from '../../infrastructure/clock/system-clock';
import { AesSecretService } from '../../infrastructure/secrets/secret.service';

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

  async login(email: string, password: string) {
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

    return this.issueTokens(user);
  }

  async refresh(refreshToken: string) {
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

    if (!stored) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: this.clock.now() },
    });

    return this.issueTokens(stored.user);
  }

  async me(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        status: true,
        organizationId: true,
        organization: {
          select: { id: true, name: true, slug: true, type: true },
        },
        roles: { include: { role: true } },
        preferences: true,
      },
    });
    if (!user) throw new UnauthorizedException();
    return user;
  }

  async createApiKeyPlain(
    organizationId: string,
    name: string,
    scopes: string[] = [],
  ): Promise<{ apiKey: { id: string; name: string; keyPrefix: string }; plainKey: string }> {
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
      },
    });
    return {
      apiKey: {
        id: record.id,
        name: record.name,
        keyPrefix: record.keyPrefix,
      },
      plainKey,
    };
  }

  private async issueTokens(user: {
    id: string;
    email: string;
    organizationId: string;
    roles: Array<{ role: { name: string } }>;
    organization: { id: string; name: string; slug: string };
  }) {
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
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: 900,
      user: {
        id: user.id,
        email: user.email,
        organizationId: user.organizationId,
        organization: user.organization,
        roles: user.roles.map((r) => r.role.name),
      },
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
