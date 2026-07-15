import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { downloadEvents, files, redemptionCodes } from "@/lib/db/schema";
import { createDownloadUrl, isR2Configured } from "@/lib/r2";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { formatCode, generateId, getClientIp, normalizeCode, nowMs } from "@/lib/utils";

export const runtime = "nodejs";

const bodySchema = z.object({
  code: z.string().min(4).max(64),
});

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const ua = request.headers.get("user-agent") || "";
  const limited = rateLimit(`redeem:${ip}`, 20, 60_000);
  if (!limited.ok) return tooManyRequests(limited.resetAt);

  if (!(await isR2Configured())) {
    return NextResponse.json({ error: "存储未配置，暂时无法兑换" }, { status: 500 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "兑换码格式错误" }, { status: 400 });
  }

  const codeNormalized = normalizeCode(parsed.data.code);
  const now = nowMs();

  const logEvent = async (payload: {
    codeId?: string | null;
    fileId?: string | null;
    result: string;
    message?: string;
  }) => {
    await db.insert(downloadEvents).values({
      id: generateId(18),
      codeId: payload.codeId || null,
      fileId: payload.fileId || null,
      code: codeNormalized,
      ip,
      userAgent: ua,
      result: payload.result,
      message: payload.message || null,
      createdAt: now,
    });
  };

  const codeRows = await db
    .select()
    .from(redemptionCodes)
    .where(eq(redemptionCodes.code, codeNormalized));
  const codeRow = codeRows[0];

  if (!codeRow) {
    await logEvent({ result: "invalid", message: "兑换码不存在" });
    return NextResponse.json({ error: "兑换码无效" }, { status: 404 });
  }

  if (codeRow.status === "revoked") {
    await logEvent({ codeId: codeRow.id, fileId: codeRow.fileId, result: "revoked" });
    return NextResponse.json({ error: "兑换码已作废" }, { status: 400 });
  }

  if (codeRow.expiresAt && codeRow.expiresAt < now) {
    await db.update(redemptionCodes).set({ status: "expired" }).where(eq(redemptionCodes.id, codeRow.id));
    await logEvent({ codeId: codeRow.id, fileId: codeRow.fileId, result: "expired" });
    return NextResponse.json({ error: "兑换码已过期" }, { status: 400 });
  }

  if (codeRow.usedCount >= codeRow.maxUses || codeRow.status === "used") {
    await logEvent({ codeId: codeRow.id, fileId: codeRow.fileId, result: "exhausted" });
    return NextResponse.json({ error: "兑换码已使用" }, { status: 400 });
  }

  const fileRows = await db.select().from(files).where(and(eq(files.id, codeRow.fileId)));
  const file = fileRows[0];
  if (!file || file.status !== "ready") {
    await logEvent({
      codeId: codeRow.id,
      fileId: codeRow.fileId,
      result: "file_unavailable",
      message: "文件不可用",
    });
    return NextResponse.json({ error: "对应文件不可用" }, { status: 400 });
  }

  const ttl = Number(process.env.DOWNLOAD_URL_TTL_SECONDS || 600);
  const downloadUrl = await createDownloadUrl({
    key: file.r2Key,
    filename: file.originalName,
    contentType: file.contentType,
    expiresIn: ttl,
  });

  const nextUsedCount = codeRow.usedCount + 1;
  const nextStatus = nextUsedCount >= codeRow.maxUses ? "used" : "unused";

  await db
    .update(redemptionCodes)
    .set({
      usedCount: nextUsedCount,
      status: nextStatus,
      usedAt: now,
    })
    .where(eq(redemptionCodes.id, codeRow.id));

  await logEvent({ codeId: codeRow.id, fileId: file.id, result: "success" });

  return NextResponse.json({
    fileName: file.originalName,
    size: file.size,
    contentType: file.contentType,
    downloadUrl,
    expiresIn: ttl,
    expiresAt: now + ttl * 1000,
    code: formatCode(codeRow.code),
  });
}
