import { NextResponse } from "next/server";
import { z } from "zod";
import {
  clearAdminSessionCookie,
  createAdminSession,
  setAdminSessionCookie,
  verifyAdminPassword,
} from "@/lib/auth";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/utils";
export const dynamic = "force-dynamic";

const loginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(128),
});

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const limited = rateLimit(`admin-login:${ip}`, 10, 60_000);
  if (!limited.ok) return tooManyRequests(limited.resetAt);

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "用户名或密码格式错误" }, { status: 400 });
  }

  const ok = await verifyAdminPassword(parsed.data.username, parsed.data.password);
  if (!ok) {
    return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });
  }

  const { token, ttl } = await createAdminSession();
  const response = NextResponse.json({ ok: true });
  await setAdminSessionCookie(response, token, ttl);
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  clearAdminSessionCookie(response);
  return response;
}
