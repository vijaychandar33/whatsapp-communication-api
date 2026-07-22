import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as XLSX from 'xlsx';
import {
  NotFoundError,
  ValidationError,
} from '../../domain/errors';
import { PhoneNumber } from '../../domain/value-objects/phone-number.vo';
import { PrismaService } from '../../infrastructure/persistence/prisma/prisma.service';
import { UuidIdentifierService } from '../../infrastructure/identifier/uuid-identifier.service';

export type ImportContactRow = {
  phoneNumber?: string;
  displayName?: string;
  email?: string;
  company?: string;
};

@Injectable()
export class ContactListsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identifiers: UuidIdentifierService,
  ) {}

  list(organizationId: string) {
    return this.prisma.contactList.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { name: 'asc' },
      include: { _count: { select: { members: true } } },
    });
  }

  async get(organizationId: string, id: string) {
    const list = await this.prisma.contactList.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: { _count: { select: { members: true } } },
    });
    if (!list) throw new NotFoundError('ContactList', id);
    return list;
  }

  async create(
    organizationId: string,
    name: string,
    description?: string,
  ) {
    const trimmed = name.trim();
    if (!trimmed) throw new ValidationError('List name required');

    const existing = await this.prisma.contactList.findFirst({
      where: { organizationId, name: trimmed, deletedAt: null },
    });
    if (existing) {
      throw new ValidationError(`A list named "${trimmed}" already exists`, {
        field: 'name',
      });
    }

    return this.prisma.contactList.create({
      data: {
        id: this.identifiers.generate(),
        organizationId,
        name: trimmed,
        description: description?.trim() || null,
      },
      include: { _count: { select: { members: true } } },
    });
  }

  async update(
    organizationId: string,
    id: string,
    input: { name?: string; description?: string | null },
  ) {
    await this.requireList(organizationId, id);
    const data: Prisma.ContactListUpdateInput = {};
    if (input.name !== undefined) {
      const trimmed = input.name.trim();
      if (!trimmed) throw new ValidationError('List name required');
      data.name = trimmed;
    }
    if (input.description !== undefined) {
      data.description = input.description?.trim() || null;
    }
    return this.prisma.contactList.update({
      where: { id },
      data,
      include: { _count: { select: { members: true } } },
    });
  }

  async remove(organizationId: string, id: string) {
    await this.requireList(organizationId, id);
    await this.prisma.contactList.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { id };
  }

  async addMember(organizationId: string, listId: string, contactId: string) {
    await this.requireList(organizationId, listId);
    await this.requireContact(organizationId, contactId);
    await this.prisma.contactListMember.upsert({
      where: { listId_contactId: { listId, contactId } },
      create: {
        id: this.identifiers.generate(),
        listId,
        contactId,
      },
      update: {},
    });
    return this.get(organizationId, listId);
  }

  async removeMember(
    organizationId: string,
    listId: string,
    contactId: string,
  ) {
    await this.requireList(organizationId, listId);
    await this.prisma.contactListMember.deleteMany({
      where: { listId, contactId },
    });
    return this.get(organizationId, listId);
  }

  /**
   * Parse CSV or Excel and upsert contacts into the list.
   * Expected columns (case-insensitive): phone / phoneNumber / mobile,
   * name / displayName, email, company.
   */
  async importFile(
    organizationId: string,
    listId: string,
    file: Express.Multer.File,
  ) {
    await this.requireList(organizationId, listId);
    if (!file?.buffer?.length) {
      throw new ValidationError('Upload a CSV or Excel file');
    }

    const rows = this.parseImportFile(file);
    if (rows.length === 0) {
      throw new ValidationError('No contact rows found in file');
    }

    let created = 0;
    let updated = 0;
    let addedToList = 0;
    let skipped = 0;
    const errors: Array<{ row: number; message: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // header + 1-based
      try {
        if (!row.phoneNumber?.trim()) {
          skipped += 1;
          errors.push({ row: rowNum, message: 'Missing phone number' });
          continue;
        }

        const phone = PhoneNumber.create(row.phoneNumber).toString();
        const email = row.email?.trim() || undefined;
        const displayName = row.displayName?.trim() || undefined;
        const company = row.company?.trim() || undefined;

        let contact = await this.prisma.contact.findUnique({
          where: {
            organizationId_phoneNumber: { organizationId, phoneNumber: phone },
          },
        });

        if (contact?.deletedAt) {
          contact = await this.prisma.contact.update({
            where: { id: contact.id },
            data: {
              deletedAt: null,
              displayName: displayName ?? contact.displayName,
              email: email ?? contact.email,
              company: company ?? contact.company,
            },
          });
          updated += 1;
        } else if (!contact) {
          contact = await this.prisma.contact.create({
            data: {
              id: this.identifiers.generate(),
              organizationId,
              phoneNumber: phone,
              displayName,
              email,
              company,
            },
          });
          created += 1;
        } else {
          const patch: Prisma.ContactUpdateInput = {};
          if (displayName && !contact.displayName) patch.displayName = displayName;
          if (email && !contact.email) patch.email = email;
          if (company && !contact.company) patch.company = company;
          if (Object.keys(patch).length > 0) {
            contact = await this.prisma.contact.update({
              where: { id: contact.id },
              data: patch,
            });
            updated += 1;
          }
        }

        const existingMember = await this.prisma.contactListMember.findUnique({
          where: {
            listId_contactId: { listId, contactId: contact.id },
          },
        });
        if (!existingMember) {
          await this.prisma.contactListMember.create({
            data: {
              id: this.identifiers.generate(),
              listId,
              contactId: contact.id,
            },
          });
          addedToList += 1;
        }
      } catch (err) {
        skipped += 1;
        errors.push({
          row: rowNum,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return {
      list: await this.get(organizationId, listId),
      summary: {
        totalRows: rows.length,
        created,
        updated,
        addedToList,
        skipped,
        errors: errors.slice(0, 25),
      },
    };
  }

  private parseImportFile(file: Express.Multer.File): ImportContactRow[] {
    const name = (file.originalname || '').toLowerCase();
    const isCsv =
      name.endsWith('.csv') ||
      file.mimetype === 'text/csv' ||
      file.mimetype === 'application/csv';

    if (isCsv) {
      return this.parseCsv(file.buffer.toString('utf8'));
    }

    // Excel (.xlsx / .xls) via SheetJS
    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return [];
    const sheet = workbook.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: '',
      raw: false,
    });
    return json.map((row) => this.mapImportRow(row));
  }

  private parseCsv(text: string): ImportContactRow[] {
    const lines = text
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .filter((l) => l.trim().length > 0);
    if (lines.length < 2) return [];

    const headers = this.splitCsvLine(lines[0]).map((h) =>
      h.trim().toLowerCase(),
    );
    const rows: ImportContactRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = this.splitCsvLine(lines[i]);
      const obj: Record<string, unknown> = {};
      headers.forEach((h, idx) => {
        obj[h] = cols[idx] ?? '';
      });
      rows.push(this.mapImportRow(obj));
    }
    return rows;
  }

  private splitCsvLine(line: string): string[] {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (ch === ',' && !inQuotes) {
        out.push(cur);
        cur = '';
        continue;
      }
      cur += ch;
    }
    out.push(cur);
    return out;
  }

  private mapImportRow(row: Record<string, unknown>): ImportContactRow {
    const normalized: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) {
      normalized[k.trim().toLowerCase().replace(/[\s_-]+/g, '')] = String(
        v ?? '',
      ).trim();
    }
    const pick = (...keys: string[]) => {
      for (const key of keys) {
        const v = normalized[key];
        if (v) return v;
      }
      return undefined;
    };
    return {
      phoneNumber: pick(
        'phone',
        'phonenumber',
        'mobile',
        'whatsapp',
        'waid',
        'number',
      ),
      displayName: pick('name', 'displayname', 'fullname', 'contactname'),
      email: pick('email', 'emailaddress', 'mail'),
      company: pick('company', 'organization', 'org'),
    };
  }

  private async requireList(organizationId: string, id: string) {
    const list = await this.prisma.contactList.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!list) throw new NotFoundError('ContactList', id);
    return list;
  }

  private async requireContact(organizationId: string, id: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!contact) throw new NotFoundError('Contact', id);
    return contact;
  }
}
