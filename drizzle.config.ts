import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL || "file:./data/distribute.db";

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: url.startsWith("file:") ? url.replace(/^file:/, "") : url,
  },
});
