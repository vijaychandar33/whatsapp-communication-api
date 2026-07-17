import { Injectable } from '@nestjs/common';
import { NotFoundError, ValidationError } from '../../domain/errors';
import { PrismaService } from '../../infrastructure/persistence/prisma/prisma.service';
import { UuidIdentifierService } from '../../infrastructure/identifier/uuid-identifier.service';

@Injectable()
export class TagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identifiers: UuidIdentifierService,
  ) {}

  list(organizationId: string) {
    return this.prisma.tag.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
    });
  }

  async create(organizationId: string, name: string, color?: string) {
    const trimmed = name.trim();
    if (trimmed.length < 1) throw new ValidationError('Tag name required');
    return this.prisma.tag.create({
      data: {
        id: this.identifiers.generate(),
        organizationId,
        name: trimmed,
        color: color || '#64748b',
      },
    });
  }

  async update(
    organizationId: string,
    id: string,
    input: { name?: string; color?: string },
  ) {
    await this.requireTag(organizationId, id);
    return this.prisma.tag.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
      },
    });
  }

  async remove(organizationId: string, id: string) {
    await this.requireTag(organizationId, id);
    await this.prisma.tag.delete({ where: { id } });
    return { id };
  }

  async addToContact(organizationId: string, contactId: string, tagId: string) {
    await this.requireContact(organizationId, contactId);
    await this.requireTag(organizationId, tagId);
    await this.prisma.contactTag.upsert({
      where: { contactId_tagId: { contactId, tagId } },
      create: { contactId, tagId },
      update: {},
    });
    return this.getContactTags(contactId);
  }

  async removeFromContact(
    organizationId: string,
    contactId: string,
    tagId: string,
  ) {
    await this.requireContact(organizationId, contactId);
    await this.prisma.contactTag.deleteMany({
      where: { contactId, tagId },
    });
    return this.getContactTags(contactId);
  }

  async listNotes(organizationId: string, contactId: string) {
    await this.requireContact(organizationId, contactId);
    return this.prisma.contactNote.findMany({
      where: { organizationId, contactId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addNote(
    organizationId: string,
    contactId: string,
    noteText: string,
    authorUserId?: string,
  ) {
    await this.requireContact(organizationId, contactId);
    const text = noteText.trim();
    if (!text) throw new ValidationError('Note text required');
    return this.prisma.contactNote.create({
      data: {
        id: this.identifiers.generate(),
        organizationId,
        contactId,
        authorUserId: authorUserId || null,
        noteText: text,
      },
    });
  }

  async deleteNote(organizationId: string, noteId: string) {
    const note = await this.prisma.contactNote.findFirst({
      where: { id: noteId, organizationId },
    });
    if (!note) throw new NotFoundError('ContactNote', noteId);
    await this.prisma.contactNote.delete({ where: { id: noteId } });
    return { id: noteId };
  }

  private getContactTags(contactId: string) {
    return this.prisma.contactTag.findMany({
      where: { contactId },
      include: { tag: true },
    });
  }

  private async requireTag(organizationId: string, id: string) {
    const tag = await this.prisma.tag.findFirst({
      where: { id, organizationId },
    });
    if (!tag) throw new NotFoundError('Tag', id);
    return tag;
  }

  private async requireContact(organizationId: string, id: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!contact) throw new NotFoundError('Contact', id);
    return contact;
  }
}
