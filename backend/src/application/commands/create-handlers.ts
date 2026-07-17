import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EmailAddress } from '../../domain/value-objects/email-address.vo';
import { NotFoundError, ValidationError } from '../../domain/errors';
import { PrismaService } from '../../infrastructure/persistence/prisma/prisma.service';
import { UuidIdentifierService } from '../../infrastructure/identifier/uuid-identifier.service';

export interface CreateOrganizationCommand {
  name: string;
  slug: string;
  type?: 'CUSTOMER' | 'PARTNER';
  metadata?: Record<string, unknown>;
}

@Injectable()
export class CreateOrganizationHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identifiers: UuidIdentifierService,
  ) {}

  async execute(cmd: CreateOrganizationCommand) {
    const existing = await this.prisma.organization.findUnique({
      where: { slug: cmd.slug },
    });
    if (existing) {
      throw new ValidationError(`Organization slug already exists: ${cmd.slug}`);
    }

    const id = this.identifiers.generate();
    return this.prisma.organization.create({
      data: {
        id,
        name: cmd.name,
        slug: cmd.slug,
        type: cmd.type ?? 'CUSTOMER',
        metadata: (cmd.metadata ?? {}) as Prisma.InputJsonValue,
        settings: {
          create: {
            id: this.identifiers.generate(),
          },
        },
      },
    });
  }
}

export interface CreateUserCommand {
  organizationId: string;
  email: string;
  passwordHash: string;
  firstName?: string;
  lastName?: string;
  roleIds?: string[];
}

@Injectable()
export class CreateUserHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identifiers: UuidIdentifierService,
  ) {}

  async execute(cmd: CreateUserCommand) {
    const email = EmailAddress.create(cmd.email).toString();
    const org = await this.prisma.organization.findFirst({
      where: { id: cmd.organizationId, deletedAt: null },
    });
    if (!org) throw new NotFoundError('Organization', cmd.organizationId);

    const id = this.identifiers.generate();
    return this.prisma.user.create({
      data: {
        id,
        organizationId: cmd.organizationId,
        email,
        passwordHash: cmd.passwordHash,
        firstName: cmd.firstName,
        lastName: cmd.lastName,
        roles: cmd.roleIds?.length
          ? {
              create: cmd.roleIds.map((roleId) => ({ roleId })),
            }
          : undefined,
        preferences: {
          create: { id: this.identifiers.generate() },
        },
      },
      include: { roles: { include: { role: true } } },
    });
  }
}

export interface CreateRoleCommand {
  organizationId?: string;
  name: string;
  description?: string;
  permissionIds?: string[];
  isSystem?: boolean;
}

@Injectable()
export class CreateRoleHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identifiers: UuidIdentifierService,
  ) {}

  async execute(cmd: CreateRoleCommand) {
    const id = this.identifiers.generate();
    return this.prisma.role.create({
      data: {
        id,
        organizationId: cmd.organizationId,
        name: cmd.name,
        description: cmd.description,
        isSystem: cmd.isSystem ?? false,
        permissions: cmd.permissionIds?.length
          ? {
              create: cmd.permissionIds.map((permissionId) => ({
                permissionId,
              })),
            }
          : undefined,
      },
      include: { permissions: { include: { permission: true } } },
    });
  }
}

export interface CreateApiKeyCommand {
  organizationId: string;
  name: string;
  keyPrefix: string;
  keyHash: string;
  scopes?: string[];
  expiresAt?: Date;
}

@Injectable()
export class CreateApiKeyHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identifiers: UuidIdentifierService,
  ) {}

  async execute(cmd: CreateApiKeyCommand) {
    const id = this.identifiers.generate();
    return this.prisma.apiKey.create({
      data: {
        id,
        organizationId: cmd.organizationId,
        name: cmd.name,
        keyPrefix: cmd.keyPrefix,
        keyHash: cmd.keyHash,
        scopes: cmd.scopes ?? [],
        expiresAt: cmd.expiresAt,
      },
    });
  }
}
