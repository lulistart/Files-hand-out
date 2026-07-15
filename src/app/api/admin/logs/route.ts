import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { requireAdmin, unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";
import { downloadEvents } from "@/lib/db/schema";

export async function GET() {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  const items = await db
    .select()
    .from(downloadEvents)
    .orderBy(desc(downloadEvents.createdAt))
    .limit(200);

  return NextResponse.json({ items });
}
