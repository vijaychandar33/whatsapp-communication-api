export interface Clock {
  now(): Date;
  nowIso(): string;
  nowMs(): number;
}

export const CLOCK = Symbol('CLOCK');
