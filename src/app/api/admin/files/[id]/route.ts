import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireAdmin, unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";
import { files, redemptionCodes } from "@/lib/db/schema";
import { deleteObject, isR2Configured } from "@/lib/r2";
import { nowMs } from "@/lib/utils";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  const { id } = await params;
  const rows = await db.select().from(files).where(eq(files.id, id));
  const file = rows[0];
  if (!file) {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  }

  if (await isR2Configured()) {
    try {
      await deleteObject(file.r2Key);
    } catch {
      // keep going even if object already missing
    }
  }

  await db.delete(redemptionCodes).where(eq(redemptionCodes.fileId, id));
  await db.delete(files).where(eq(files.id, id));

  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request, { params }: Params) {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  const { id } = await params;
  let body: { note?: string; status?: string; boundUser?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const rows = await db.select().from(files).where(eq(files.id, id));
  if (!rows[0]) {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  }

  const now = nowMs();
  if (typeof body.note === "string" || body.status) {
    await db
      .update(files)
      .set({
        note: typeof body.note === "string" ? body.note : rows[0].note,
        status: body.status || rows[0].status,
        updatedAt: now,
      })
      .where(eq(files.id, id));
  }

  if (typeof body.boundUser === "string" || typeof body.note === "string") {
    await db
      .update(redemptionCodes)
      .set({
        boundUser: typeof body.boundUser === "string" ? body.boundUser : undefined,
        note: typeof body.note === "string" ? body.note : undefined,
      })
      .where(eq(redemptionCodes.fileId, id));
  }

  return NextResponse.json({ ok: true });
}
