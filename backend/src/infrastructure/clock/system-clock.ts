import { Injectable } from '@nestjs/common';
import { Clock } from '../../domain/interfaces/clock.interface';

@Injectable()
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }

  nowIso(): string {
    return new Date().toISOString();
  }

  nowMs(): number {
    return Date.now();
  }
}
