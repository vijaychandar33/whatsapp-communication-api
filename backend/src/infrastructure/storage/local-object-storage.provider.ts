import { createWriteStream, existsSync, mkdirSync, unlinkSync } from 'fs';
import { readFile } from 'fs/promises';
import { dirname, join } from 'path';
import { Injectable } from '@nestjs/common';
import {
  ObjectStorage,
  ObjectStoragePutParams,
  ObjectStoragePutResult,
} from '../../domain/interfaces/object-storage.interface';
import { AppConfigurationService } from '../config/configuration.service';

@Injectable()
export class LocalObjectStorageProvider implements ObjectStorage {
  private readonly root: string;

  constructor(config: AppConfigurationService) {
    this.root = config.get().storagePath;
    if (!existsSync(this.root)) {
      mkdirSync(this.root, { recursive: true });
    }
  }

  async put(params: ObjectStoragePutParams): Promise<ObjectStoragePutResult> {
    const fullPath = join(this.root, params.key);
    mkdirSync(dirname(fullPath), { recursive: true });
    await new Promise<void>((resolve, reject) => {
      const stream = createWriteStream(fullPath);
      stream.on('finish', () => resolve());
      stream.on('error', reject);
      stream.end(params.data);
    });
    return {
      key: params.key,
      url: this.getPublicUrl(params.key),
      sizeBytes: params.data.length,
    };
  }

  async get(key: string): Promise<Buffer> {
    return readFile(join(this.root, key));
  }

  async delete(key: string): Promise<void> {
    const fullPath = join(this.root, key);
    if (existsSync(fullPath)) {
      unlinkSync(fullPath);
    }
  }

  async exists(key: string): Promise<boolean> {
    return existsSync(join(this.root, key));
  }

  getPublicUrl(key: string): string {
    return `file://${join(this.root, key)}`;
  }
}
