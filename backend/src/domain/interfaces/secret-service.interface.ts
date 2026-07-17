export interface SecretService {
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): string;
  hash(value: string): string;
  compareHash(value: string, hash: string): boolean;
}

export const SECRET_SERVICE = Symbol('SECRET_SERVICE');
