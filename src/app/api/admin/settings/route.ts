import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createAdminSession,
  getAdminUsername,
  hashAdminPassword,
  requireAdmin,
  setAdminSessionCookie,
  unauthorized,
  verifyAdminPassword,
} from "@/lib/auth";
import { getR2Status } from "@/lib/r2";
import { getStoredSettings, maskSecret, saveStoredSettings } from "@/lib/settings";
export const dynamic = "force-dynamic";

const settingsSchema = z.object({
  adminUsername: z.string().min(1).max(64).optional(),
  currentPassword: z.string().max(128).optional(),
  newPassword: z.string().min(6).max(128).optional(),
  confirmPassword: z.string().min(6).max(128).optional(),
  r2AccountId: z.string().max(128).optional(),
  r2AccessKeyId: z.string().max(128).optional(),
  r2SecretAccessKey: z.string().max(256).optional(),
  r2Bucket: z.string().max(128).optional(),
  r2PublicBaseUrl: z.string().max(512).optional(),
  downloadUrlTtlSeconds: z.number().int().min(60).max(86400).optional(),
  clearR2Secret: z.boolean().optional(),
});

async function buildSettingsResponse() {
  const stored = await getStoredSettings();
  const username = await getAdminUsername();
  const r2 = await getR2Status();

  return {
    admin: {
      username,
      passwordSource: stored.adminPasswordHash ? "db" : "env",
      hasCustomPassword: Boolean(stored.adminPasswordHash),
    },
    r2: {
      configured: r2.configured,
      source: r2.source,
      accountId: stored.r2AccountId || r2.accountId || "",
      accessKeyId: stored.r2AccessKeyId || r2.accessKeyId || "",
      secretAccessKeyMasked: r2.hasSecret
        ? maskSecret(stored.r2SecretAccessKey || process.env.R2_SECRET_ACCESS_KEY || "")
        : "",
      hasSecret: r2.hasSecret,
      secretSource: stored.r2SecretAccessKey
        ? "db"
        : process.env.R2_SECRET_ACCESS_KEY
          ? "env"
          : "none",
      bucket: stored.r2Bucket || r2.bucket || "",
      publicBaseUrl: stored.r2PublicBaseUrl || r2.publicBaseUrl || "",
      downloadUrlTtlSeconds: r2.downloadUrlTtlSeconds,
    },
  };
}

export async function GET() {
  const session = await requireAdmin();
  if (!session) return unauthorized();
  return NextResponse.json(await buildSettingsResponse());
}

export async function PUT(request: Request) {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const parsed = settingsSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "设置参数格式不正确" }, { status: 400 });
  }

  const body = parsed.data;
  const current = await getStoredSettings();
  const next = { ...current };

  if (typeof body.adminUsername === "string") {
    const username = body.adminUsername.trim();
    if (!username) {
      return NextResponse.json({ error: "管理员用户名不能为空" }, { status: 400 });
    }
    next.adminUsername = username;
  }

  if (body.newPassword) {
    if (!body.currentPassword) {
      return NextResponse.json({ error: "修改密码需要填写当前密码" }, { status: 400 });
    }
    if (body.newPassword !== body.confirmPassword) {
      return NextResponse.json({ error: "两次输入的新密码不一致" }, { status: 400 });
    }

    const username = await getAdminUsername();
    const ok = await verifyAdminPassword(username, body.currentPassword);
    if (!ok) {
      return NextResponse.json({ error: "当前密码不正确" }, { status: 400 });
    }

    next.adminPasswordHash = await hashAdminPassword(body.newPassword);
  }

  if (typeof body.r2AccountId === "string") next.r2AccountId = body.r2AccountId.trim();
  if (typeof body.r2AccessKeyId === "string") next.r2AccessKeyId = body.r2AccessKeyId.trim();
  if (typeof body.r2Bucket === "string") next.r2Bucket = body.r2Bucket.trim();
  if (typeof body.r2PublicBaseUrl === "string") next.r2PublicBaseUrl = body.r2PublicBaseUrl.trim();
  if (typeof body.downloadUrlTtlSeconds === "number") {
    next.downloadUrlTtlSeconds = body.downloadUrlTtlSeconds;
  }

  if (body.clearR2Secret) {
    next.r2SecretAccessKey = "";
  } else if (typeof body.r2SecretAccessKey === "string" && body.r2SecretAccessKey.trim()) {
    next.r2SecretAccessKey = body.r2SecretAccessKey.trim();
  }

  await saveStoredSettings(next);

  const responsePayload = {
    ok: true,
    ...(await buildSettingsResponse()),
  };

  // If password changed, refresh session cookie so the admin stays logged in.
  if (body.newPassword) {
    const { token, ttl } = await createAdminSession();
    const response = NextResponse.json(responsePayload);
    await setAdminSessionCookie(response, token, ttl);
    return response;
  }

  return NextResponse.json(responsePayload);
}
