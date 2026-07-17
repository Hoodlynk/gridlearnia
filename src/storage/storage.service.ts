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

const UPLOAD_URL_TTL_SECONDS = 300;
const DOWNLOAD_URL_TTL_SECONDS = 300;

/**
 * DigitalOcean Spaces (S3-compatible) via presigned URLs — files never
 * pass through the API. The bucket stays private; access is only ever
 * granted through short-lived signed URLs.
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

  /** Presigned PUT the browser uploads directly to. Content-Type is locked into the signature. */
  async presignUpload(key: string, mimeType: string) {
    const client = this.requireClient();
    const url = await getSignedUrl(
      client,
      // No ACL param: signing one would force the client to send an
      // x-amz-acl header. The bucket is private by default.
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: mimeType,
      }),
      { expiresIn: UPLOAD_URL_TTL_SECONDS },
    );
    return { url, expiresInSeconds: UPLOAD_URL_TTL_SECONDS };
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
