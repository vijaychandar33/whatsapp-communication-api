import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import { IdempotencyStatus, Prisma } from '@prisma/client';
import { IdempotencyKeyConflict } from '../../domain/errors';
import { PrismaService } from '../persistence/prisma/prisma.service';
import { UuidIdentifierService } from '../identifier/uuid-identifier.service';
import { SystemClock } from '../clock/system-clock';

export interface BeginIdempotencyParams {
  organizationId: string;
  key: string;
  requestBody: unknown;
  ttlSeconds?: number;
}

export interface IdempotencyBeginResult {
  isReplay: boolean;
  recordId: string;
  responseCode?: number | null;
  responseBody?: unknown;
}

@Injectable()
export class IdempotencyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identifiers: UuidIdentifierService,
    private readonly clock: SystemClock,
  ) {}

  hashRequest(body: unknown): string {
    return createHash('sha256')
      .update(JSON.stringify(body ?? {}))
      .digest('hex');
  }

  async begin(params: BeginIdempotencyParams): Promise<IdempotencyBeginResult> {
    const requestHash = this.hashRequest(params.requestBody);
    const existing = await this.prisma.idempotencyRecord.findUnique({
      where: {
        organizationId_key: {
          organizationId: params.organizationId,
          key: params.key,
        },
      },
    });

    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new IdempotencyKeyConflict(params.key);
      }
      if (existing.status === IdempotencyStatus.COMPLETED) {
        return {
          isReplay: true,
          recordId: existing.id,
          responseCode: existing.responseCode,
          responseBody: existing.responseBody,
        };
      }
      if (existing.status === IdempotencyStatus.IN_PROGRESS) {
        throw new IdempotencyKeyConflict(params.key);
      }
    }

    const id = this.identifiers.generate();
    const ttl = params.ttlSeconds ?? 86_400;
    const expiresAt = new Date(this.clock.nowMs() + ttl * 1000);

    try {
      await this.prisma.idempotencyRecord.create({
        data: {
          id,
          organizationId: params.organizationId,
          key: params.key,
          requestHash,
          status: IdempotencyStatus.IN_PROGRESS,
          expiresAt,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new IdempotencyKeyConflict(params.key);
      }
      throw err;
    }

    return { isReplay: false, recordId: id };
  }

  async complete(
    recordId: string,
    responseCode: number,
    responseBody: unknown,
  ): Promise<void> {
    await this.prisma.idempotencyRecord.update({
      where: { id: recordId },
      data: {
        status: IdempotencyStatus.COMPLETED,
        responseCode,
        responseBody: responseBody as Prisma.InputJsonValue,
      },
    });
  }

  async fail(recordId: string): Promise<void> {
    await this.prisma.idempotencyRecord.update({
      where: { id: recordId },
      data: { status: IdempotencyStatus.FAILED },
    });
  }
}
