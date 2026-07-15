import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { appSettings } from "@/lib/db/schema";
import { nowMs } from "@/lib/utils";

export type StoredSettings = {
  adminUsername: string;
  adminPasswordHash: string;
  r2AccountId: string;
  r2AccessKeyId: string;
  r2SecretAccessKey: string;
  r2Bucket: string;
  r2PublicBaseUrl: string;
  downloadUrlTtlSeconds: number;
};

const DEFAULTS: StoredSettings = {
  adminUsername: "",
  adminPasswordHash: "",
  r2AccountId: "",
  r2AccessKeyId: "",
  r2SecretAccessKey: "",
  r2Bucket: "",
  r2PublicBaseUrl: "",
  downloadUrlTtlSeconds: 0,
};

type Cache = {
  value: StoredSettings;
  loadedAt: number;
};

const globalForSettings = globalThis as unknown as {
  __distributeSettingsCache?: Cache;
};

const CACHE_TTL_MS = 2_000;

function parseSettings(raw: string | null | undefined): StoredSettings {
  if (!raw) return { ...DEFAULTS };
  try {
    const parsed = JSON.parse(raw) as Partial<StoredSettings>;
    return {
      adminUsername: typeof parsed.adminUsername === "string" ? parsed.adminUsername : "",
      adminPasswordHash:
        typeof parsed.adminPasswordHash === "string" ? parsed.adminPasswordHash : "",
      r2AccountId: typeof parsed.r2AccountId === "string" ? parsed.r2AccountId : "",
      r2AccessKeyId: typeof parsed.r2AccessKeyId === "string" ? parsed.r2AccessKeyId : "",
      r2SecretAccessKey:
        typeof parsed.r2SecretAccessKey === "string" ? parsed.r2SecretAccessKey : "",
      r2Bucket: typeof parsed.r2Bucket === "string" ? parsed.r2Bucket : "",
      r2PublicBaseUrl: typeof parsed.r2PublicBaseUrl === "string" ? parsed.r2PublicBaseUrl : "",
      downloadUrlTtlSeconds:
        typeof parsed.downloadUrlTtlSeconds === "number" &&
        Number.isFinite(parsed.downloadUrlTtlSeconds)
          ? parsed.downloadUrlTtlSeconds
          : 0,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function invalidateSettingsCache() {
  globalForSettings.__distributeSettingsCache = undefined;
}

export async function getStoredSettings(force = false): Promise<StoredSettings> {
  const cache = globalForSettings.__distributeSettingsCache;
  if (!force && cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) {
    return cache.value;
  }

  const rows = await db.select().from(appSettings).where(eq(appSettings.id, "default"));
  const value = parseSettings(rows[0]?.data);
  globalForSettings.__distributeSettingsCache = {
    value,
    loadedAt: Date.now(),
  };
  return value;
}

export async function saveStoredSettings(next: StoredSettings) {
  const now = nowMs();
  const payload = JSON.stringify(next);
  const rows = await db.select().from(appSettings).where(eq(appSettings.id, "default"));

  if (rows[0]) {
    await db
      .update(appSettings)
      .set({
        data: payload,
        updatedAt: now,
      })
      .where(eq(appSettings.id, "default"));
  } else {
    await db.insert(appSettings).values({
      id: "default",
      data: payload,
      updatedAt: now,
    });
  }

  invalidateSettingsCache();
  return next;
}

export function maskSecret(value: string) {
  if (!value) return "";
  if (value.length <= 8) return "********";
  return `${value.slice(0, 4)}********${value.slice(-4)}`;
}
