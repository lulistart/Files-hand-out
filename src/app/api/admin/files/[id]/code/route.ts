import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireAdmin, unauthorized } from "@/lib/auth";
import { db, ensureDbReady } from "@/lib/db";
import { files, redemptionCodes } from "@/lib/db/schema";
import { formatCode, generateId, generateRedemptionCode, nowMs } from "@/lib/utils";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };
type CodeAction = "revoke" | "regenerate" | "set_max_uses" | "reset_uses";

function clampMaxUses(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  const int = Math.floor(n);
  if (int < 1 || int > 9999) return null;
  return int;
}

function resolveStatus(
  current: { status: string; usedCount: number; maxUses: number },
  next: { usedCount: number; maxUses: number },
): string {
  if (current.status === "revoked") return "revoked";
  if (current.status === "expired") return "expired";
  if (next.usedCount >= next.maxUses) return "used";
  return "unused";
}

export async function POST(request: Request, { params }: Params) {
  await ensureDbReady();
  const session = await requireAdmin();
  if (!session) return unauthorized();

  const { id } = await params;
  const fileRows = await db.select().from(files).where(eq(files.id, id));
  if (!fileRows[0]) {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  }

  let action: CodeAction = "regenerate";
  let requestedMaxUses: number | null = null;
  try {
    const body = await request.json();
    const raw = String(body?.action || "regenerate");
    if (raw === "revoke" || raw === "regenerate" || raw === "set_max_uses" || raw === "reset_uses") {
      action = raw;
    }
    if (body?.maxUses !== undefined && body?.maxUses !== null && body?.maxUses !== "") {
      requestedMaxUses = clampMaxUses(body.maxUses);
      if (requestedMaxUses === null) {
        return NextResponse.json({ error: "可用次数须为 1–9999 的整数" }, { status: 400 });
      }
    }
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
    return NextResponse.json({
      ok: true,
      code: formatCode(existing.code),
      status: "revoked",
      maxUses: existing.maxUses,
      usedCount: existing.usedCount,
    });
  }

  if (action === "set_max_uses") {
    if (!existing) {
      return NextResponse.json({ error: "兑换码不存在" }, { status: 404 });
    }
    if (requestedMaxUses === null) {
      return NextResponse.json({ error: "请提供可用次数 maxUses" }, { status: 400 });
    }
    const nextStatus = resolveStatus(existing, {
      usedCount: existing.usedCount,
      maxUses: requestedMaxUses,
    });
    await db
      .update(redemptionCodes)
      .set({
        maxUses: requestedMaxUses,
        status: nextStatus,
      })
      .where(eq(redemptionCodes.id, existing.id));
    return NextResponse.json({
      ok: true,
      code: formatCode(existing.code),
      status: nextStatus,
      maxUses: requestedMaxUses,
      usedCount: existing.usedCount,
    });
  }

  if (action === "reset_uses") {
    if (!existing) {
      return NextResponse.json({ error: "兑换码不存在" }, { status: 404 });
    }
    // Clear usage count; keep same code and maxUses. Revoked/expired stay as-is.
    const status =
      existing.status === "revoked"
        ? "revoked"
        : existing.status === "expired"
          ? "expired"
          : "unused";
    await db
      .update(redemptionCodes)
      .set({
        usedCount: 0,
        usedAt: null,
        status,
      })
      .where(eq(redemptionCodes.id, existing.id));
    return NextResponse.json({
      ok: true,
      code: formatCode(existing.code),
      status,
      maxUses: existing.maxUses,
      usedCount: 0,
    });
  }

  // regenerate
  const nextCode = generateRedemptionCode().replace(/-/g, "");
  const maxUses = requestedMaxUses ?? existing?.maxUses ?? 1;
  if (existing) {
    await db
      .update(redemptionCodes)
      .set({
        code: nextCode,
        status: "unused",
        maxUses,
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
      maxUses,
      usedCount: 0,
      expiresAt: null,
      boundUser: null,
      note: fileRows[0].note,
      createdAt: now,
      usedAt: null,
    });
  }

  return NextResponse.json({
    ok: true,
    code: formatCode(nextCode),
    status: "unused",
    maxUses,
    usedCount: 0,
  });
}