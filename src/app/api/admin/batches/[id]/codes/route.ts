import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireAdmin, unauthorized } from "@/lib/auth";
import { db, ensureDbReady } from "@/lib/db";
import { batches, files, redemptionCodes } from "@/lib/db/schema";
import { csvEscape, formatCode, formatDateTime } from "@/lib/utils";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  await ensureDbReady();
  const session = await requireAdmin();
  if (!session) return unauthorized();

  const { id } = await params;
  const batchRows = await db.select().from(batches).where(eq(batches.id, id));
  const batch = batchRows[0];
  if (!batch) {
    return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const format = (searchParams.get("format") || "json").toLowerCase();

  const fileRows = await db.select().from(files).where(eq(files.batchId, id));
  const codeRows = await db.select().from(redemptionCodes).where(eq(redemptionCodes.batchId, id));
  const fileMap = new Map(fileRows.map((item) => [item.id, item]));

  const lines = codeRows
    .map((code) => {
      const file = fileMap.get(code.fileId);
      return {
        code: formatCode(code.code),
        fileName: file?.originalName || "",
        status: code.status,
        usedCount: code.usedCount,
        maxUses: code.maxUses,
        size: file?.size || 0,
        createdAt: code.createdAt,
      };
    })
    .sort((a, b) => a.fileName.localeCompare(b.fileName, "zh-CN"));

  if (format === "txt") {
    const text = lines.map((item) => item.code).join("\n");
    return new Response(text, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename=\"${batch.name}-codes.txt\"`,
      },
    });
  }

  if (format === "csv") {
    const csvLines = [
      ["batch_name", "file_name", "code", "status", "used_count", "max_uses", "size", "created_at"].join(","),
      ...lines.map((item) =>
        [
          csvEscape(batch.name),
          csvEscape(item.fileName),
          csvEscape(item.code),
          csvEscape(item.status),
          csvEscape(item.usedCount),
          csvEscape(item.maxUses),
          csvEscape(item.size),
          csvEscape(formatDateTime(item.createdAt)),
        ].join(","),
      ),
    ];
    return new Response(`\uFEFF${csvLines.join("\n")}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=\"${batch.name}-codes.csv\"`,
      },
    });
  }

  return NextResponse.json({
    batch: {
      id: batch.id,
      name: batch.name,
    },
    codes: lines.map((item) => item.code),
    items: lines,
  });
}
