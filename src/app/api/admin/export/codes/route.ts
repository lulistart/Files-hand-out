import { desc, eq } from "drizzle-orm";
import { requireAdmin, unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";
import { files, redemptionCodes } from "@/lib/db/schema";
import { csvEscape, formatCode, formatDateTime } from "@/lib/utils";

export async function GET() {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  const fileRows = await db.select().from(files).orderBy(desc(files.createdAt));
  const codeRows = await db.select().from(redemptionCodes);
  const codeMap = new Map(codeRows.map((item) => [item.fileId, item]));

  const lines = [
    ["file_id", "original_name", "size", "status", "code", "code_status", "used_count", "bound_user", "note", "created_at"].join(","),
  ];

  for (const file of fileRows) {
    const code = codeMap.get(file.id);
    lines.push(
      [
        csvEscape(file.id),
        csvEscape(file.originalName),
        csvEscape(file.size),
        csvEscape(file.status),
        csvEscape(code ? formatCode(code.code) : ""),
        csvEscape(code?.status || ""),
        csvEscape(code?.usedCount ?? 0),
        csvEscape(code?.boundUser || ""),
        csvEscape(file.note || ""),
        csvEscape(formatDateTime(file.createdAt)),
      ].join(","),
    );
  }

  const csv = `\uFEFF${lines.join("\n")}`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="codes-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
