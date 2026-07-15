import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireAdmin, unauthorized } from "@/lib/auth";
import { db, ensureDbReady } from "@/lib/db";
import { batches, files, redemptionCodes } from "@/lib/db/schema";
import { buildObjectKey, isR2Configured, putObjectBuffer } from "@/lib/r2";
import { formatCode, generateId, generateRedemptionCode, nowMs } from "@/lib/utils";
export const dynamic = "force-dynamic";

export const runtime = "nodejs";

export async function POST(request: Request) {
  await ensureDbReady();
  const session = await requireAdmin();
  if (!session) return unauthorized();

  if (!(await isR2Configured())) {
    return NextResponse.json({ error: "R2 is not configured" }, { status: 500 });
  }

  const maxSize = Number(process.env.MAX_FILE_SIZE_BYTES || 500 * 1024 * 1024);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const batchName = String(form.get("batchName") || "").trim();
  const batchNote = String(form.get("batchNote") || "").trim();
  if (!batchName) {
    return NextResponse.json({ error: "Batch name is required" }, { status: 400 });
  }
  if (batchName.length > 80) {
    return NextResponse.json({ error: "Batch name is too long" }, { status: 400 });
  }

  const entries = form.getAll("files");
  if (!entries.length) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }
  if (entries.length > 200) {
    return NextResponse.json({ error: "Too many files in one request (max 200)" }, { status: 400 });
  }

  const now = nowMs();
  const batchId = generateId(18);

  await db.insert(batches).values({
    id: batchId,
    name: batchName,
    note: batchNote || null,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });

  const results: Array<{
    fileId: string;
    originalName: string;
    size: number;
    status: string;
    code: string;
    error?: string;
  }> = [];

  for (const entry of entries) {
    if (!(entry instanceof File)) {
      results.push({
        fileId: "",
        originalName: "unknown",
        size: 0,
        status: "upload_failed",
        code: "",
        error: "Invalid file entry",
      });
      continue;
    }

    const originalName = entry.name || "unnamed.bin";
    const contentType = entry.type || "application/octet-stream";
    const size = entry.size;

    if (size > maxSize) {
      results.push({
        fileId: "",
        originalName,
        size,
        status: "upload_failed",
        code: "",
        error: `File exceeds size limit (${Math.round(maxSize / 1024 / 1024)}MB)`,
      });
      continue;
    }

    const fileId = generateId(18);
    const r2Key = buildObjectKey(fileId, originalName);
    const code = generateRedemptionCode();
    const codeNormalized = code.replace(/-/g, "");

    try {
      await db.insert(files).values({
        id: fileId,
        batchId,
        originalName,
        contentType,
        size,
        r2Key,
        status: "uploading",
        note: null,
        createdAt: now,
        updatedAt: now,
      });

      await db.insert(redemptionCodes).values({
        id: generateId(18),
        code: codeNormalized,
        fileId,
        batchId,
        status: "unused",
        maxUses: 1,
        usedCount: 0,
        expiresAt: null,
        boundUser: null,
        note: null,
        createdAt: now,
        usedAt: null,
      });

      const buffer = Buffer.from(await entry.arrayBuffer());
      await putObjectBuffer({
        key: r2Key,
        body: buffer,
        contentType,
      });

      await db
        .update(files)
        .set({
          status: "ready",
          size: buffer.length,
          updatedAt: nowMs(),
        })
        .where(eq(files.id, fileId));

      results.push({
        fileId,
        originalName,
        size: buffer.length,
        status: "ready",
        code: formatCode(codeNormalized),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";
      try {
        await db
          .update(files)
          .set({ status: "upload_failed", updatedAt: nowMs() })
          .where(eq(files.id, fileId));
      } catch {
        // ignore cleanup failure
      }

      results.push({
        fileId,
        originalName,
        size,
        status: "upload_failed",
        code: formatCode(codeNormalized),
        error: message,
      });
    }
  }

  await db
    .update(batches)
    .set({ updatedAt: nowMs() })
    .where(eq(batches.id, batchId));

  const successCodes = results
    .filter((item) => item.status === "ready" && item.code)
    .map((item) => item.code);

  return NextResponse.json({
    batch: {
      id: batchId,
      name: batchName,
      note: batchNote || null,
      createdAt: now,
    },
    successCount: successCodes.length,
    failCount: results.length - successCodes.length,
    codes: successCodes,
    results,
  });
}
