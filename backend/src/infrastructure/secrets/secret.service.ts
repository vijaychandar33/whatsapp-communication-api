import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { Injectable } from '@nestjs/common';
import { SecretService } from '../../domain/interfaces/secret-service.interface';
import { AppConfigurationService } from '../config/configuration.service';

@Injectable()
export class AesSecretService implements SecretService {
  private readonly key: Buffer;

  constructor(config: AppConfigurationService) {
    this.key = Buffer.from(config.get().encryptionKey, 'hex');
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString('base64');
  }

  decrypt(ciphertext: string): string {
    const buf = Buffer.from(ciphertext, 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString(
      'utf8',
    );
  }

  hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  compareHash(value: string, hash: string): boolean {
    return this.hash(value) === hash;
  }
}
