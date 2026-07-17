import { Injectable } from '@nestjs/common';
import { NotFoundError } from '../../domain/errors';
import { PrismaService } from '../../infrastructure/persistence/prisma/prisma.service';
import {
  buildPaginatedMeta,
  PaginationDto,
} from '../../presentation/dto/pagination.dto';

@Injectable()
export class ListOrganizationsHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(pagination: PaginationDto) {
    const where = { deletedAt: null };
    const [items, total] = await Promise.all([
      this.prisma.organization.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.organization.count({ where }),
    ]);
    return {
      data: items,
      meta: buildPaginatedMeta(
        pagination.page ?? 1,
        pagination.limit ?? 20,
        total,
      ),
    };
  }
}

@Injectable()
export class GetOrganizationHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(id: string) {
    const org = await this.prisma.organization.findFirst({
      where: { id, deletedAt: null },
      include: { settings: true },
    });
    if (!org) throw new NotFoundError('Organization', id);
    return org;
  }
}

@Injectable()
export class ListUsersHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(organizationId: string | undefined, pagination: PaginationDto) {
    const where = {
      deletedAt: null,
      ...(organizationId ? { organizationId } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          organizationId: true,
          email: true,
          firstName: true,
          lastName: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          roles: { include: { role: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      data: items,
      meta: buildPaginatedMeta(
        pagination.page ?? 1,
        pagination.limit ?? 20,
        total,
      ),
    };
  }
}

@Injectable()
export class GetUserHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        organizationId: true,
        email: true,
        firstName: true,
        lastName: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        roles: { include: { role: true } },
        preferences: true,
      },
    });
    if (!user) throw new NotFoundError('User', id);
    return user;
  }
}

@Injectable()
export class ListRolesHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(organizationId?: string) {
    return this.prisma.role.findMany({
      where: {
        deletedAt: null,
        OR: [
          { organizationId: null },
          ...(organizationId ? [{ organizationId }] : []),
        ],
      },
      include: { permissions: { include: { permission: true } } },
      orderBy: { name: 'asc' },
    });
  }
}

@Injectable()
export class ListApiKeysHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(organizationId: string, pagination: PaginationDto) {
    const where = { organizationId };
    const [items, total] = await Promise.all([
      this.prisma.apiKey.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          organizationId: true,
          name: true,
          keyPrefix: true,
          status: true,
          scopes: true,
          lastUsedAt: true,
          expiresAt: true,
          createdAt: true,
        },
      }),
      this.prisma.apiKey.count({ where }),
    ]);
    return {
      data: items,
      meta: buildPaginatedMeta(
        pagination.page ?? 1,
        pagination.limit ?? 20,
        total,
      ),
    };
  }
}

@Injectable()
export class ListMessagesHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(organizationId: string, pagination: PaginationDto) {
    const where = { organizationId };
    const [items, total] = await Promise.all([
      this.prisma.message.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.message.count({ where }),
    ]);
    return {
      data: items,
      meta: buildPaginatedMeta(
        pagination.page ?? 1,
        pagination.limit ?? 20,
        total,
      ),
    };
  }
}

@Injectable()
export class GetMessageHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(organizationId: string, id: string) {
    const message = await this.prisma.message.findFirst({
      where: { id, organizationId },
      include: { statusHistory: { orderBy: { createdAt: 'asc' } } },
    });
    if (!message) throw new NotFoundError('Message', id);
    return message;
  }
}
