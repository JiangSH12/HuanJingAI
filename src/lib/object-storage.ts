import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

interface MinioUploadOptions {
  key: string;
  body: Buffer;
  contentType: string;
}

function parseBoolean(value: string | undefined, fallback = false): boolean {
  if (value == null) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

function getMinioConfig() {
  const endpoint = process.env.MINIO_ENDPOINT;
  const bucket = process.env.MINIO_BUCKET || 'media';
  const accessKeyId = process.env.MINIO_ACCESS_KEY;
  const secretAccessKey = process.env.MINIO_SECRET_KEY;
  const region = process.env.MINIO_REGION || 'us-east-1';
  const publicBaseUrl = process.env.MINIO_PUBLIC_BASE_URL || undefined;
  const useSsl = parseBoolean(process.env.MINIO_USE_SSL, false);
  const publicRead = parseBoolean(process.env.MINIO_PUBLIC_READ, Boolean(publicBaseUrl));
  const signedUrlExpiresIn = Number(process.env.MINIO_SIGNED_URL_EXPIRES_IN || 60 * 60 * 24 * 30);

  if (!endpoint) {
    throw new Error('MINIO_ENDPOINT is not set');
  }
  if (!accessKeyId || !secretAccessKey) {
    throw new Error('MINIO_ACCESS_KEY or MINIO_SECRET_KEY is not set');
  }

  const normalizedEndpoint = /^https?:\/\//i.test(endpoint)
    ? endpoint
    : `${useSsl ? 'https' : 'http'}://${endpoint}`;

  return {
    endpoint: normalizeBaseUrl(normalizedEndpoint),
    bucket,
    accessKeyId,
    secretAccessKey,
    region,
    publicBaseUrl,
    publicRead,
    signedUrlExpiresIn: Number.isFinite(signedUrlExpiresIn) ? signedUrlExpiresIn : 60 * 60 * 24 * 30,
  };
}

function createMinioClient() {
  const config = getMinioConfig();

  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

export function buildMinioObjectKey(prefix: string, ext: string): string {
  return `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
}

async function buildMinioObjectUrl(client: S3Client, key: string): Promise<string> {
  const config = getMinioConfig();

  if (config.publicRead) {
    const baseUrl = config.publicBaseUrl || `${config.endpoint}/${config.bucket}`;
    return `${normalizeBaseUrl(baseUrl)}/${key}`;
  }

  return getSignedUrl(client, new GetObjectCommand({
    Bucket: config.bucket,
    Key: key,
  }), {
    expiresIn: config.signedUrlExpiresIn,
  });
}

export async function uploadBufferToMinio(options: MinioUploadOptions): Promise<string> {
  const config = getMinioConfig();
  const client = createMinioClient();

  await client.send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: options.key,
    Body: options.body,
    ContentType: options.contentType,
  }));

  return buildMinioObjectUrl(client, options.key);
}

export async function uploadDataUrlToMinio(dataUrl: string, prefix: string, fallbackExt: string): Promise<string | null> {
  const match = dataUrl.match(/^data:((?:image|video)\/[^;]+);base64,(.+)$/);
  if (!match) return null;

  const [, mimeType, base64Data] = match;
  const ext = mimeType.split('/')[1] || fallbackExt;
  const body = Buffer.from(base64Data, 'base64');
  const key = buildMinioObjectKey(prefix, ext);

  return uploadBufferToMinio({
    key,
    body,
    contentType: mimeType,
  });
}
