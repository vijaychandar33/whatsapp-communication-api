import { ValidationError } from '../errors';

/**
 * E.164 phone number value object.
 */
export class PhoneNumber {
  private readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  static create(input: string): PhoneNumber {
    const normalized = input.replace(/[\s\-()]/g, '');
    if (!/^\+[1-9]\d{6,14}$/.test(normalized)) {
      throw new ValidationError(`Invalid phone number: ${input}`, {
        field: 'phoneNumber',
      });
    }
    return new PhoneNumber(normalized);
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
