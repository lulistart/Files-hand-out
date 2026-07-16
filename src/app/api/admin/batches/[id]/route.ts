import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { requireAdmin, unauthorized } from "@/lib/auth";
import { db, ensureDbReady } from "@/lib/db";
import { batches, downloadEvents, files, redemptionCodes } from "@/lib/db/schema";
import { deleteObject, isR2Configured } from "@/lib/r2";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  await ensureDbReady();
  const session = await requireAdmin();
  if (!session) return unauthorized();

  const { id } = await params;
  const batchRows = await db.select().from(batches).where(eq(batches.id, id));
  const batch = batchRows[0];
  if (!batch) {
    return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  }

  const fileRows = await db.select().from(files).where(eq(files.batchId, id));
  const fileIds = fileRows.map((item) => item.id);

  let r2Deleted = 0;
  let r2Failed = 0;
  if (await isR2Configured()) {
    for (const file of fileRows) {
      if (!file.r2Key) continue;
      try {
        await deleteObject(file.r2Key);
        r2Deleted += 1;
      } catch {
        // keep going even if object already missing or R2 temporarily fails
        r2Failed += 1;
      }
    }
  }

  if (fileIds.length > 0) {
    await db.delete(redemptionCodes).where(inArray(redemptionCodes.fileId, fileIds));
    await db.delete(downloadEvents).where(inArray(downloadEvents.fileId, fileIds));
    await db.delete(files).where(inArray(files.id, fileIds));
  }

  // Clean leftover rows still tagged by batch id (e.g. events without fileId).
  await db.delete(redemptionCodes).where(eq(redemptionCodes.batchId, id));
  await db.delete(downloadEvents).where(eq(downloadEvents.batchId, id));
  await db.delete(files).where(eq(files.batchId, id));
  await db.delete(batches).where(eq(batches.id, id));

  return NextResponse.json({
    ok: true,
    batch: {
      id: batch.id,
      name: batch.name,
    },
    deletedFiles: fileRows.length,
    r2Deleted,
    r2Failed,
  });
}