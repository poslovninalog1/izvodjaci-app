import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { CONFIG } from "../config.js";

export class StorageService {
  private client: S3Client;
  private bucket: string;

  constructor() {
    this.bucket = CONFIG.s3.bucket;
    this.client = new S3Client({
      region: CONFIG.s3.region,
      endpoint: CONFIG.s3.endpoint || undefined,
      forcePathStyle: CONFIG.s3.forcePathStyle,
      credentials: {
        accessKeyId: CONFIG.s3.accessKey,
        secretAccessKey: CONFIG.s3.secretKey,
      },
    });
  }

  async upload(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async download(key: string): Promise<Buffer> {
    const resp = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const stream = resp.Body;
    if (!stream) throw new Error(`Empty body for key: ${key}`);

    // Collect stream into buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of stream as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return true;
    } catch {
      return false;
    }
  }
}
