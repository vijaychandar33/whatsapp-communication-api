import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { NotFoundError, ValidationError } from '../../domain/errors';
import { PhoneNumber } from '../../domain/value-objects/phone-number.vo';
import { EmailAddress } from '../../domain/value-objects/email-address.vo';
import { PrismaService } from '../../infrastructure/persistence/prisma/prisma.service';
import { UuidIdentifierService } from '../../infrastructure/identifier/uuid-identifier.service';

export interface CreateContactCommand {
  organizationId: string;
  phoneNumber?: string;
  email?: string;
  displayName?: string;
  company?: string;
  avatarUrl?: string;
  externalId?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateContactCommand {
  id: string;
  organizationId: string;
  phoneNumber?: string;
  email?: string;
  displayName?: string;
  company?: string;
  avatarUrl?: string;
  externalId?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class CreateContactHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identifiers: UuidIdentifierService,
  ) {}

  async execute(cmd: CreateContactCommand) {
    if (!cmd.phoneNumber && !cmd.email) {
      throw new ValidationError('phoneNumber or email is required');
    }

    const phoneNumber = cmd.phoneNumber
      ? PhoneNumber.create(cmd.phoneNumber).toString()
      : undefined;
    const email = cmd.email
      ? EmailAddress.create(cmd.email).toString()
      : undefined;

    if (phoneNumber) {
      const existing = await this.prisma.contact.findUnique({
        where: {
          organizationId_phoneNumber: {
            organizationId: cmd.organizationId,
            phoneNumber,
          },
        },
      });

      if (existing) {
        if (existing.deletedAt) {
          return this.prisma.contact.update({
            where: { id: existing.id },
            data: {
              deletedAt: null,
              displayName: cmd.displayName?.trim() || existing.displayName,
              email: email ?? existing.email,
              company: cmd.company?.trim() || existing.company,
              avatarUrl: cmd.avatarUrl ?? existing.avatarUrl,
              externalId: cmd.externalId ?? existing.externalId,
              metadata:
                cmd.metadata !== undefined
                  ? (cmd.metadata as Prisma.InputJsonValue)
                  : undefined,
            },
          });
        }

        const patch: Prisma.ContactUpdateInput = {};
        if (cmd.displayName?.trim() && !existing.displayName) {
          patch.displayName = cmd.displayName.trim();
        }
        if (email && !existing.email) patch.email = email;
        if (cmd.company?.trim() && !existing.company) {
          patch.company = cmd.company.trim();
        }
        if (cmd.avatarUrl && !existing.avatarUrl) patch.avatarUrl = cmd.avatarUrl;
        if (cmd.externalId && !existing.externalId) {
          patch.externalId = cmd.externalId;
        }
        if (cmd.metadata !== undefined) {
          patch.metadata = cmd.metadata as Prisma.InputJsonValue;
        }

        if (Object.keys(patch).length > 0) {
          return this.prisma.contact.update({
            where: { id: existing.id },
            data: patch,
          });
        }

        return existing;
      }
    }

    return this.prisma.contact.create({
      data: {
        id: this.identifiers.generate(),
        organizationId: cmd.organizationId,
        phoneNumber,
        email,
        displayName: cmd.displayName?.trim() || null,
        company: cmd.company?.trim() || null,
        avatarUrl: cmd.avatarUrl,
        externalId: cmd.externalId,
        metadata: (cmd.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  }
}

@Injectable()
export class UpdateContactHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(cmd: UpdateContactCommand) {
    const contact = await this.prisma.contact.findFirst({
      where: {
        id: cmd.id,
        organizationId: cmd.organizationId,
        deletedAt: null,
      },
    });
    if (!contact) throw new NotFoundError('Contact', cmd.id);

    const phoneNumber =
      cmd.phoneNumber !== undefined
        ? PhoneNumber.create(cmd.phoneNumber).toString()
        : undefined;
    const email =
      cmd.email !== undefined
        ? EmailAddress.create(cmd.email).toString()
        : undefined;

    return this.prisma.contact.update({
      where: { id: cmd.id },
      data: {
        phoneNumber,
        email,
        displayName:
          cmd.displayName !== undefined
            ? cmd.displayName.trim() || null
            : undefined,
        company:
          cmd.company !== undefined ? cmd.company.trim() || null : undefined,
        avatarUrl: cmd.avatarUrl,
        externalId: cmd.externalId,
        metadata:
          cmd.metadata !== undefined
            ? (cmd.metadata as Prisma.InputJsonValue)
            : undefined,
      },
    });
  }
}

@Injectable()
export class DeleteContactHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(organizationId: string, id: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!contact) throw new NotFoundError('Contact', id);

    return this.prisma.contact.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
