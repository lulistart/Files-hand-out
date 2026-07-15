import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

type AppSchema = typeof schema;
type AppDb = LibSQLDatabase<AppSchema>;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS batches (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY NOT NULL,
  batch_id TEXT,
  original_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  r2_key TEXT NOT NULL UNIQUE,
  sha256 TEXT,
  status TEXT NOT NULL DEFAULT 'uploading',
  note TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS redemption_codes (
  id TEXT PRIMARY KEY NOT NULL,
  code TEXT NOT NULL UNIQUE,
  file_id TEXT NOT NULL,
  batch_id TEXT,
  status TEXT NOT NULL DEFAULT 'unused',
  max_uses INTEGER NOT NULL DEFAULT 1,
  used_count INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER,
  bound_user TEXT,
  note TEXT,
  created_at INTEGER NOT NULL,
  used_at INTEGER
);

CREATE TABLE IF NOT EXISTS download_events (
  id TEXT PRIMARY KEY NOT NULL,
  code_id TEXT,
  file_id TEXT,
  batch_id TEXT,
  code TEXT,
  ip TEXT,
  user_agent TEXT,
  result TEXT NOT NULL,
  message TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
  id TEXT PRIMARY KEY NOT NULL,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_batches_name ON batches(name);
CREATE INDEX IF NOT EXISTS idx_batches_created_at ON batches(created_at);
CREATE INDEX IF NOT EXISTS idx_files_batch_id ON files(batch_id);
CREATE INDEX IF NOT EXISTS idx_codes_file_id ON redemption_codes(file_id);
CREATE INDEX IF NOT EXISTS idx_codes_batch_id ON redemption_codes(batch_id);
CREATE INDEX IF NOT EXISTS idx_codes_status ON redemption_codes(status);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON download_events(created_at);
`;

type DbBoot = {
  client: Client;
  db: AppDb;
  mode: "local" | "libsql";
  schemaReady: boolean;
  schemaPromise: Promise<void> | null;
};

const globalForDb = globalThis as unknown as {
  __distributeDbBoot?: DbBoot;
};

function defaultLocalDbPath() {
  return path.join(process.cwd(), "data", "distribute.db");
}

function isBuildPhase() {
  return (
    process.env.DISTRIBUTE_BUILD_SKIP_DB === "1" ||
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.npm_lifecycle_event === "build"
  );
}

function resolveDatabaseUrl() {
  const fromEnv = (process.env.DATABASE_URL || "").trim();

  // next build collects page data in parallel workers; never share one sqlite file there.
  if (isBuildPhase()) {
    return `file:/tmp/distribute-build-${process.pid}-${process.env.NEXT_PRIVATE_WORKER_INDEX || "0"}.db`;
  }

  if (fromEnv) return fromEnv;
  return `file:${defaultLocalDbPath()}`;
}

function isRemoteLibsql(url: string) {
  return /^(libsql|https|http):\/\//i.test(url);
}

function toFileUrl(dbPath: string) {
  const normalized = path.resolve(dbPath).replace(/\\/g, "/");
  return normalized.startsWith("/") ? `file://${normalized}` : `file:///${normalized}`;
}

function resolveLocalDbPath(url: string) {
  if (url.startsWith("file:")) {
    const raw = url.slice("file:".length);
    if (raw.startsWith("///")) {
      const body = raw.slice(2);
      if (/^\/[A-Za-z]:\//.test(body)) return body.slice(1);
      return body;
    }
    return raw;
  }
  return url || defaultLocalDbPath();
}

async function ensureSchema(client: Client) {
  const statements = SCHEMA_SQL
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await client.execute(statement);
  }

  const alterCandidates = [
    "ALTER TABLE files ADD COLUMN batch_id TEXT",
    "ALTER TABLE redemption_codes ADD COLUMN batch_id TEXT",
    "ALTER TABLE download_events ADD COLUMN batch_id TEXT",
  ];
  for (const sql of alterCandidates) {
    try {
      await client.execute(sql);
    } catch {
      // column already exists
    }
  }
}

function createClientFromEnv(): { client: Client; mode: "local" | "libsql" } {
  const url = resolveDatabaseUrl();

  if (isRemoteLibsql(url)) {
    const authToken = process.env.DATABASE_AUTH_TOKEN || "";
    if (!authToken && !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(url)) {
      console.warn("[db] remote DATABASE_URL has no DATABASE_AUTH_TOKEN");
    }
    return {
      mode: "libsql",
      client: createClient({
        url,
        authToken: authToken || undefined,
      }),
    };
  }

  const dbPath = resolveLocalDbPath(url);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  return {
    mode: "local",
    client: createClient({
      url: toFileUrl(dbPath),
    }),
  };
}

function getBoot(): DbBoot {
  if (!globalForDb.__distributeDbBoot) {
    const created = createClientFromEnv();
    globalForDb.__distributeDbBoot = {
      client: created.client,
      mode: created.mode,
      db: drizzle(created.client, { schema }),
      schemaReady: false,
      schemaPromise: null,
    };
  }
  return globalForDb.__distributeDbBoot;
}

async function ensureSchemaOnce() {
  const boot = getBoot();
  if (boot.schemaReady) return;

  // Skip schema writes during image build to avoid SQLITE_BUSY across workers.
  if (isBuildPhase()) {
    boot.schemaReady = true;
    return;
  }

  if (!boot.schemaPromise) {
    boot.schemaPromise = ensureSchema(boot.client)
      .then(() => {
        boot.schemaReady = true;
      })
      .catch((error) => {
        boot.schemaPromise = null;
        throw error;
      });
  }

  await boot.schemaPromise;
}

export function getDbMode() {
  return getBoot().mode;
}

// Lazy proxy so importing this module during next build does not open SQLite immediately.
export const db = new Proxy({} as AppDb, {
  get(_target, property, receiver) {
    const real = getBoot().db as unknown as object;
    const value = Reflect.get(real, property, receiver);
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(real) : value;
  },
});

export async function ensureDbReady() {
  await ensureSchemaOnce();
  return db;
}

export async function initDatabase() {
  return ensureDbReady();
}
