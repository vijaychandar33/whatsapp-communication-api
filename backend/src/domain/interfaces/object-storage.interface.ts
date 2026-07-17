export interface ObjectStoragePutParams {
  key: string;
  data: Buffer;
  mimeType: string;
  metadata?: Record<string, string>;
}

export interface ObjectStoragePutResult {
  key: string;
  url: string;
  sizeBytes: number;
}

export interface ObjectStorage {
  put(params: ObjectStoragePutParams): Promise<ObjectStoragePutResult>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  getPublicUrl(key: string): string;
}

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');
