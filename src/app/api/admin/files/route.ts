import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { requireAdmin, unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";
import { files, redemptionCodes } from "@/lib/db/schema";
import { formatCode } from "@/lib/utils";

export async function GET() {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  const fileRows = await db.select().from(files).orderBy(desc(files.createdAt));
  const codeRows = await db.select().from(redemptionCodes);
  const codeMap = new Map(codeRows.map((item) => [item.fileId, item]));

  const items = fileRows.map((file) => {
    const code = codeMap.get(file.id);
    return {
      id: file.id,
      originalName: file.originalName,
      contentType: file.contentType,
      size: file.size,
      status: file.status,
      note: file.note,
      r2Key: file.r2Key,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
      code: code
        ? {
            id: code.id,
            code: formatCode(code.code),
            status: code.status,
            maxUses: code.maxUses,
            usedCount: code.usedCount,
            expiresAt: code.expiresAt,
            boundUser: code.boundUser,
            usedAt: code.usedAt,
          }
        : null,
    };
  });

  return NextResponse.json({ items });
}
