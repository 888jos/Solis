import { fail } from "@/server/backend/http";

export const dynamic = "force-dynamic";

export async function POST() {
  return fail(410, "global_social_sync_disabled", "Queued global social sync is disabled. Use the explicit Sync controls in Social Tracking.");
}

export async function GET() {
  return Response.json({ error: "Social sync requires an explicit POST action" }, { status: 405, headers: { Allow: "POST" } });
}
