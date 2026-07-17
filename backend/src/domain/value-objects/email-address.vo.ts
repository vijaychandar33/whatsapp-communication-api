import { ValidationError } from '../errors';

/**
 * Email address value object.
 */
export class EmailAddress {
  private readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  static create(input: string): EmailAddress {
    const normalized = input.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      throw new ValidationError(`Invalid email address: ${input}`, {
        field: 'email',
      });
    }
    return new EmailAddress(normalized);
  }

  static tryCreate(input: string): EmailAddress | null {
    try {
      return EmailAddress.create(input);
    } catch {
      return null;
    }
  }

  toString(): string {
    return this.value;
  }

  equals(other: EmailAddress): boolean {
    return this.value === other.value;
  }
}
