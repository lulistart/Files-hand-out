import { NextResponse } from "next/server";
import { desc, eq, like, or, sql } from "drizzle-orm";
import { requireAdmin, unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";
import { batches, files, redemptionCodes } from "@/lib/db/schema";
import { formatCode } from "@/lib/utils";

export async function GET(request: Request) {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();
  const batchId = (searchParams.get("id") || "").trim();

  if (batchId) {
    const batchRows = await db.select().from(batches).where(eq(batches.id, batchId));
    const batch = batchRows[0];
    if (!batch) {
      return NextResponse.json({ error: "Batch not found" }, { status: 404 });
    }

    const fileRows = await db.select().from(files).where(eq(files.batchId, batchId)).orderBy(desc(files.createdAt));
    const codeRows = await db.select().from(redemptionCodes).where(eq(redemptionCodes.batchId, batchId));
    const codeMap = new Map(codeRows.map((item) => [item.fileId, item]));

    const items = fileRows.map((file) => {
      const code = codeMap.get(file.id);
      return {
        id: file.id,
        originalName: file.originalName,
        size: file.size,
        status: file.status,
        createdAt: file.createdAt,
        code: code
          ? {
              id: code.id,
              code: formatCode(code.code),
              status: code.status,
              usedCount: code.usedCount,
              maxUses: code.maxUses,
              usedAt: code.usedAt,
            }
          : null,
      };
    });

    const readyCodes = items
      .filter((item) => item.status === "ready" && item.code?.code)
      .map((item) => item.code!.code);

    return NextResponse.json({
      batch: {
        id: batch.id,
        name: batch.name,
        note: batch.note,
        status: batch.status,
        createdAt: batch.createdAt,
        updatedAt: batch.updatedAt,
        fileCount: items.length,
        readyCount: items.filter((item) => item.status === "ready").length,
        unusedCount: items.filter((item) => item.code?.status === "unused").length,
        usedCount: items.filter((item) => item.code?.status === "used").length,
        totalSize: items.reduce((sum, item) => sum + (item.size || 0), 0),
      },
      codes: readyCodes,
      items,
    });
  }

  const batchRows = q
    ? await db
        .select()
        .from(batches)
        .where(or(like(batches.name, `%${q}%`), like(batches.note, `%${q}%`)))
        .orderBy(desc(batches.createdAt))
    : await db.select().from(batches).orderBy(desc(batches.createdAt));

  const stats = await db
    .select({
      batchId: files.batchId,
      fileCount: sql<number>`count(*)`,
      totalSize: sql<number>`coalesce(sum(${files.size}), 0)`,
      readyCount: sql<number>`sum(case when ${files.status} = 'ready' then 1 else 0 end)`,
    })
    .from(files)
    .groupBy(files.batchId);

  const codeStats = await db
    .select({
      batchId: redemptionCodes.batchId,
      unusedCount: sql<number>`sum(case when ${redemptionCodes.status} = 'unused' then 1 else 0 end)`,
      usedCount: sql<number>`sum(case when ${redemptionCodes.status} = 'used' then 1 else 0 end)`,
    })
    .from(redemptionCodes)
    .groupBy(redemptionCodes.batchId);

  const fileStatMap = new Map(stats.map((item) => [item.batchId, item]));
  const codeStatMap = new Map(codeStats.map((item) => [item.batchId, item]));

  const items = batchRows.map((batch) => {
    const fileStat = fileStatMap.get(batch.id);
    const codeStat = codeStatMap.get(batch.id);
    return {
      id: batch.id,
      name: batch.name,
      note: batch.note,
      status: batch.status,
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt,
      fileCount: Number(fileStat?.fileCount || 0),
      readyCount: Number(fileStat?.readyCount || 0),
      totalSize: Number(fileStat?.totalSize || 0),
      unusedCount: Number(codeStat?.unusedCount || 0),
      usedCount: Number(codeStat?.usedCount || 0),
    };
  });

  return NextResponse.json({ items });
}
