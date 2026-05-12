import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface ObjectStorage {
  put(key: string, body: Buffer | Uint8Array, contentType?: string): Promise<{ key: string; uri: string }>;
  get(key: string): Promise<{ body: Uint8Array; contentType?: string }>;
  delete(key: string): Promise<void>;
  signPut(key: string, ttlSec?: number, contentType?: string): Promise<string>;
  signGet(key: string, ttlSec?: number): Promise<string>;
}

export class S3CompatibleStorage implements ObjectStorage {
  private client: S3Client;

  constructor(
    private bucket: string,
    opts: { endpoint?: string; region?: string; accessKey: string; secretKey: string; forcePathStyle?: boolean },
  ) {
    this.client = new S3Client({
      ...(opts.endpoint !== undefined ? { endpoint: opts.endpoint } : {}),
      region: opts.region ?? 'us-east-1',
      credentials: { accessKeyId: opts.accessKey, secretAccessKey: opts.secretKey },
      forcePathStyle: opts.forcePathStyle ?? true,
    });
  }

  async put(key: string, body: Buffer | Uint8Array, contentType?: string): Promise<{ key: string; uri: string }> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }));
    return { key, uri: `s3://${this.bucket}/${key}` };
  }

  async get(key: string): Promise<{ body: Uint8Array; contentType?: string }> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!res.Body) {
      throw new Error(`Object not found: ${key}`);
    }
    const body = await res.Body.transformToByteArray();
    return res.ContentType !== undefined ? { body, contentType: res.ContentType } : { body };
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async signPut(key: string, ttlSec = 600, contentType?: string): Promise<string> {
    const cmd = new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType });
    return getSignedUrl(this.client, cmd, { expiresIn: ttlSec });
  }

  async signGet(key: string, ttlSec = 600): Promise<string> {
    const cmd = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, cmd, { expiresIn: ttlSec });
  }
}

export function createStorage(): ObjectStorage {
  const bucket = process.env['OBJECT_STORE_BUCKET'];
  const accessKey = process.env['S3_ACCESS_KEY'];
  const secretKey = process.env['S3_SECRET_KEY'];
  if (!bucket) throw new Error('OBJECT_STORE_BUCKET env var required');
  if (!accessKey) throw new Error('S3_ACCESS_KEY env var required');
  if (!secretKey) throw new Error('S3_SECRET_KEY env var required');

  const endpoint = process.env['S3_ENDPOINT'];
  const region = process.env['S3_REGION'];
  return new S3CompatibleStorage(bucket, {
    ...(endpoint !== undefined ? { endpoint } : {}),
    ...(region !== undefined ? { region } : {}),
    accessKey,
    secretKey,
    forcePathStyle: true,
  });
}
