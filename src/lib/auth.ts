import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getStoredSettings } from "@/lib/settings";

const COOKIE_NAME = "distribute_admin_session";
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 7;

function getSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || "dev-secret";
  return new TextEncoder().encode(secret);
}

export async function getAdminUsername() {
  const settings = await getStoredSettings();
  return settings.adminUsername || process.env.ADMIN_USERNAME || "admin";
}

async function getAdminPasswordMaterial() {
  const settings = await getStoredSettings();
  if (settings.adminPasswordHash) {
    return { source: "db" as const, value: settings.adminPasswordHash };
  }
  return {
    source: "env" as const,
    value: process.env.ADMIN_PASSWORD || "admin123",
  };
}

export async function verifyAdminPassword(username: string, password: string) {
  const expectedUser = await getAdminUsername();
  if (username !== expectedUser) return false;

  const material = await getAdminPasswordMaterial();
  const expectedPass = material.value;

  if (expectedPass.startsWith("$2a$") || expectedPass.startsWith("$2b$")) {
    return bcrypt.compare(password, expectedPass);
  }
  return password === expectedPass;
}

export async function hashAdminPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function createAdminSession() {
  const ttl = Number(process.env.ADMIN_SESSION_TTL_SECONDS || DEFAULT_TTL_SECONDS);
  const token = await new SignJWT({ role: "admin", username: await getAdminUsername() })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
    .sign(getSecret());

  return { token, ttl };
}

export async function setAdminSessionCookie(response: NextResponse, token: string, ttl: number) {
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ttl,
  });
}

export function clearAdminSessionCookie(response: NextResponse) {
  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function getAdminSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (payload.role !== "admin") return null;
    return payload;
  } catch {
    return null;
  }
}

export async function requireAdmin() {
  const session = await getAdminSession();
  if (!session) {
    return null;
  }
  return session;
}

export function unauthorized(message = "未登录或登录已过期") {
  return NextResponse.json({ error: message }, { status: 401 });
}
