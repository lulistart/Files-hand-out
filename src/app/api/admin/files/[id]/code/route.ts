import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireAdmin, unauthorized } from "@/lib/auth";
import { db, ensureDbReady } from "@/lib/db";
import { files, redemptionCodes } from "@/lib/db/schema";
import { formatCode, generateId, generateRedemptionCode, nowMs } from "@/lib/utils";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  await ensureDbReady();
  const session = await requireAdmin();
  if (!session) return unauthorized();

  const { id } = await params;
  const fileRows = await db.select().from(files).where(eq(files.id, id));
  if (!fileRows[0]) {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  }

  let action: "revoke" | "regenerate" = "regenerate";
  try {
    const body = await request.json();
    if (body?.action === "revoke") action = "revoke";
  } catch {
    // default regenerate
  }

  const codeRows = await db.select().from(redemptionCodes).where(eq(redemptionCodes.fileId, id));
  const existing = codeRows[0];
  const now = nowMs();

  if (action === "revoke") {
    if (!existing) {
      return NextResponse.json({ error: "兑换码不存在" }, { status: 404 });
    }
    await db
      .update(redemptionCodes)
      .set({ status: "revoked" })
      .where(eq(redemptionCodes.id, existing.id));
    return NextResponse.json({ ok: true, code: formatCode(existing.code), status: "revoked" });
  }

  const nextCode = generateRedemptionCode().replace(/-/g, "");
  if (existing) {
    await db
      .update(redemptionCodes)
      .set({
        code: nextCode,
        status: "unused",
        usedCount: 0,
        usedAt: null,
        createdAt: now,
      })
      .where(eq(redemptionCodes.id, existing.id));
  } else {
    await db.insert(redemptionCodes).values({
      id: generateId(18),
      code: nextCode,
      fileId: id,
      batchId: fileRows[0].batchId,
      status: "unused",
      maxUses: 1,
      usedCount: 0,
      expiresAt: null,
      boundUser: null,
      note: fileRows[0].note,
      createdAt: now,
      usedAt: null,
    });
  }

  return NextResponse.json({ ok: true, code: formatCode(nextCode), status: "unused" });
}
