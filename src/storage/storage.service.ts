import {
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface StoredObject {
  sizeBytes: number;
  mimeType?: string;
}

const DOWNLOAD_URL_TTL_SECONDS = 300;

/**
 * DigitalOcean Spaces (S3-compatible). Uploads pass through the API
 * (browser → API → Spaces) so the shared bucket needs no CORS rules; the
 * bucket stays private and reads are only ever granted through short-lived
 * signed URLs.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client | null = null;
  private readonly bucket: string | undefined;
  /** Top-level folder for everything this API stores (shared bucket). */
  readonly rootPrefix: string;

  constructor(configService: ConfigService) {
    const { region, endpoint, key, secret, bucket } = {
      region: configService.get<string>('storage.region'),
      endpoint: configService.get<string>('storage.endpoint'),
      key: configService.get<string>('storage.key'),
      secret: configService.get<string>('storage.secret'),
      bucket: configService.get<string>('storage.bucket'),
    };
    this.rootPrefix = (
      configService.get<string>('storage.rootPrefix') ?? 'Gridlearnia'
    ).replace(/^\/+|\/+$/g, '');

    if (endpoint && key && secret && bucket) {
      this.client = new S3Client({
        region,
        endpoint,
        credentials: { accessKeyId: key, secretAccessKey: secret },
        // DO Spaces supports virtual-hosted style; path style also works
        forcePathStyle: false,
      });
      this.bucket = bucket;
    } else {
      this.logger.warn(
        'DO Spaces is not configured (DO_SPACES_* env) — document uploads are disabled',
      );
    }
  }

  get isConfigured(): boolean {
    return this.client !== null;
  }

  /**
   * Server-side upload: the API receives the file and pushes it to storage
   * itself, so the browser never needs bucket CORS. No ACL — the shared
   * bucket is private and reads only ever happen via presigned GETs.
   */
  async putObject(
    key: string,
    body: Buffer,
    mimeType: string,
  ): Promise<void> {
    const client = this.requireClient();
    await client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: mimeType,
      }),
    );
  }

  /** Short-lived signed GET for reviewers. */
  async presignDownload(key: string, fileName?: string) {
    const client = this.requireClient();
    const url = await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ...(fileName
          ? {
              ResponseContentDisposition: `attachment; filename="${fileName.replace(/[^\w.\- ]/g, '_')}"`,
            }
          : {}),
      }),
      { expiresIn: DOWNLOAD_URL_TTL_SECONDS },
    );
    return { url, expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS };
  }

  /** Returns object metadata, or null if the key doesn't exist. */
  async statObject(key: string): Promise<StoredObject | null> {
    const client = this.requireClient();
    try {
      const head = await client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return {
        sizeBytes: head.ContentLength ?? 0,
        mimeType: head.ContentType,
      };
    } catch {
      return null;
    }
  }

  private requireClient(): S3Client {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'File storage is not configured on this environment',
      );
    }
    return this.client;
  }
}
