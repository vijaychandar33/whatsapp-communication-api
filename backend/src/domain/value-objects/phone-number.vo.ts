import { ValidationError } from '../errors';

/**
 * E.164 phone number value object.
 * Normalizes common India local inputs (10-digit mobile → +91…).
 */
export class PhoneNumber {
  private readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  static create(input: string): PhoneNumber {
    const normalized = PhoneNumber.normalize(input);
    if (!/^\+[1-9]\d{6,14}$/.test(normalized)) {
      throw new ValidationError(
        `Invalid phone number: ${input}. Use E.164 (e.g. +918754519567)`,
        { field: 'phoneNumber' },
      );
    }
    return new PhoneNumber(normalized);
  }

  /**
   * Strip formatting and coerce bare local numbers into E.164.
   * - `00…` → `+…`
   * - 10-digit Indian mobile (6–9…) → `+91…`
   * - 12-digit starting with `91` → `+91…`
   * - otherwise digits without `+` are rejected (no blind `+` prefix)
   */
  static normalize(input: string): string {
    let s = (input || '').trim().replace(/[\s\-().]/g, '');
    if (!s) {
      throw new ValidationError('Phone number is required', {
        field: 'phoneNumber',
      });
    }

    if (s.startsWith('00')) {
      s = `+${s.slice(2)}`;
    }

    if (s.startsWith('+')) {
      return `+${s.slice(1).replace(/\D/g, '')}`;
    }

    const digits = s.replace(/\D/g, '');
    if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) {
      return `+91${digits}`;
    }
    if (digits.length === 12 && digits.startsWith('91')) {
      return `+${digits}`;
    }
    if (digits.length === 11 && digits.startsWith('0') && /^0[6-9]\d{9}$/.test(digits)) {
      return `+91${digits.slice(1)}`;
    }

    throw new ValidationError(
      `Invalid phone number: ${input}. Use E.164 (e.g. +918754519567)`,
      { field: 'phoneNumber' },
    );
  }

  static tryCreate(input: string): PhoneNumber | null {
    try {
      return PhoneNumber.create(input);
    } catch {
      return null;
    }
  }

  toString(): string {
    return this.value;
  }

  equals(other: PhoneNumber): boolean {
    return this.value === other.value;
  }
}
