import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { logOperationalError } from "@/lib/ops/log";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await getDb().run(sql`select 1`);
    return Response.json(
      { status: "ok", database: "ok" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logOperationalError("health.database", error);
    return Response.json(
      { status: "degraded", database: "unavailable" },
      {
        status: 503,
        headers: { "Cache-Control": "no-store", "Retry-After": "30" },
      },
    );
  }
}
