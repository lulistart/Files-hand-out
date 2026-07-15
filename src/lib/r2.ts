import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getStoredSettings } from "@/lib/settings";

export type R2RuntimeConfig = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
  downloadUrlTtlSeconds: number;
  source: "db" | "env" | "mixed" | "none";
};

async function resolveR2Config(): Promise<R2RuntimeConfig> {
  const settings = await getStoredSettings();
  const accountId = settings.r2AccountId || process.env.R2_ACCOUNT_ID || "";
  const accessKeyId = settings.r2AccessKeyId || process.env.R2_ACCESS_KEY_ID || "";
  const secretAccessKey = settings.r2SecretAccessKey || process.env.R2_SECRET_ACCESS_KEY || "";
  const bucket = settings.r2Bucket || process.env.R2_BUCKET || "";
  const publicBaseUrl = settings.r2PublicBaseUrl || process.env.R2_PUBLIC_BASE_URL || "";
  const downloadUrlTtlSeconds =
    settings.downloadUrlTtlSeconds || Number(process.env.DOWNLOAD_URL_TTL_SECONDS || 600);

  const fromDb = Boolean(
    settings.r2AccountId ||
      settings.r2AccessKeyId ||
      settings.r2SecretAccessKey ||
      settings.r2Bucket,
  );
  const fromEnv = Boolean(
    process.env.R2_ACCOUNT_ID ||
      process.env.R2_ACCESS_KEY_ID ||
      process.env.R2_SECRET_ACCESS_KEY ||
      process.env.R2_BUCKET,
  );

  let source: R2RuntimeConfig["source"] = "none";
  if (fromDb && fromEnv) source = "mixed";
  else if (fromDb) source = "db";
  else if (fromEnv) source = "env";

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    publicBaseUrl,
    downloadUrlTtlSeconds,
    source,
  };
}

async function requireR2Config() {
  const config = await resolveR2Config();
  if (!config.accountId || !config.accessKeyId || !config.secretAccessKey || !config.bucket) {
    throw new Error("R2 未配置完整，请到后台设置填写 Account ID / Access Key / Secret / Bucket");
  }
  return config;
}

function getClient(config: R2RuntimeConfig) {
  return new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

export function buildObjectKey(fileId: string, originalName: string) {
  const safeName = originalName.replace(/[\\/:*?"<>|]/g, "_").slice(0, 180);
  const date = new Date().toISOString().slice(0, 10);
  return `files/${date}/${fileId}/${safeName}`;
}

export async function createDownloadUrl(params: {
  key: string;
  filename: string;
  contentType?: string;
  expiresIn?: number;
}) {
  const config = await requireR2Config();
  const client = getClient(config);
  const command = new GetObjectCommand({
    Bucket: config.bucket,
    Key: params.key,
    ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(params.filename)}`,
    ResponseContentType: params.contentType,
  });

  return getSignedUrl(client, command, {
    expiresIn: params.expiresIn ?? config.downloadUrlTtlSeconds,
  });
}

export async function deleteObject(key: string) {
  const config = await requireR2Config();
  const client = getClient(config);
  await client.send(
    new DeleteObjectCommand({
      Bucket: config.bucket,
      Key: key,
    }),
  );
}

export async function putObjectBuffer(params: {
  key: string;
  body: Buffer;
  contentType: string;
}) {
  const config = await requireR2Config();
  const client = getClient(config);
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
    }),
  );
}

export async function isR2Configured() {
  const config = await resolveR2Config();
  return Boolean(config.accountId && config.accessKeyId && config.secretAccessKey && config.bucket);
}

export async function getR2Status() {
  const config = await resolveR2Config();
  return {
    configured: Boolean(
      config.accountId && config.accessKeyId && config.secretAccessKey && config.bucket,
    ),
    source: config.source,
    accountId: config.accountId,
    accessKeyId: config.accessKeyId,
    bucket: config.bucket,
    publicBaseUrl: config.publicBaseUrl,
    downloadUrlTtlSeconds: config.downloadUrlTtlSeconds,
    hasSecret: Boolean(config.secretAccessKey),
  };
}
