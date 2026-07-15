import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { requireAdmin, unauthorized } from "@/lib/auth";
import { db, ensureDbReady } from "@/lib/db";
import { downloadEvents } from "@/lib/db/schema";
export const dynamic = "force-dynamic";

export async function GET() {
  await ensureDbReady();
  const session = await requireAdmin();
  if (!session) return unauthorized();

  const items = await db
    .select()
    .from(downloadEvents)
    .orderBy(desc(downloadEvents.createdAt))
    .limit(200);

  return NextResponse.json({ items });
}
