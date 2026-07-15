import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const batches = sqliteTable("batches", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  note: text("note"),
  status: text("status").notNull().default("active"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const files = sqliteTable("files", {
  id: text("id").primaryKey(),
  batchId: text("batch_id").references(() => batches.id, { onDelete: "set null" }),
  originalName: text("original_name").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull().default(0),
  r2Key: text("r2_key").notNull().unique(),
  sha256: text("sha256"),
  status: text("status").notNull().default("uploading"),
  note: text("note"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const redemptionCodes = sqliteTable("redemption_codes", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  fileId: text("file_id")
    .notNull()
    .references(() => files.id, { onDelete: "cascade" }),
  batchId: text("batch_id").references(() => batches.id, { onDelete: "set null" }),
  status: text("status").notNull().default("unused"),
  maxUses: integer("max_uses").notNull().default(1),
  usedCount: integer("used_count").notNull().default(0),
  expiresAt: integer("expires_at"),
  boundUser: text("bound_user"),
  note: text("note"),
  createdAt: integer("created_at").notNull(),
  usedAt: integer("used_at"),
});

export const downloadEvents = sqliteTable("download_events", {
  id: text("id").primaryKey(),
  codeId: text("code_id"),
  fileId: text("file_id"),
  batchId: text("batch_id"),
  code: text("code"),
  ip: text("ip"),
  userAgent: text("user_agent"),
  result: text("result").notNull(),
  message: text("message"),
  createdAt: integer("created_at").notNull(),
});

export const appSettings = sqliteTable("app_settings", {
  id: text("id").primaryKey(),
  data: text("data").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export type BatchRow = typeof batches.$inferSelect;
export type FileRow = typeof files.$inferSelect;
export type RedemptionCodeRow = typeof redemptionCodes.$inferSelect;
export type DownloadEventRow = typeof downloadEvents.$inferSelect;
export type AppSettingsRow = typeof appSettings.$inferSelect;
