export interface IdentifierService {
  generate(): string;
}

export const IDENTIFIER_SERVICE = Symbol('IDENTIFIER_SERVICE');
