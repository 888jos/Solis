import { and, eq, gte, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { dailyAppMetrics, manualExpenses } from "@/db/schema";
import { getOrCreateLocalSession } from "@/server/backend/auth";
import { fail, ok } from "@/server/backend/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const session = await getOrCreateLocalSession();
    const workspaceId = searchParams.get("workspaceId") || session.workspaceId;
    const appId = searchParams.get("appId");
    const start = searchParams.get("start");
    const end = searchParams.get("end");

    const metricConditions = [
      eq(dailyAppMetrics.workspaceId, workspaceId),
      appId ? eq(dailyAppMetrics.appId, appId) : undefined,
      start ? gte(dailyAppMetrics.date, start) : undefined,
      end ? lte(dailyAppMetrics.date, end) : undefined,
    ].filter(Boolean);
    const expenseConditions = [
      eq(manualExpenses.workspaceId, workspaceId),
      appId ? eq(manualExpenses.appId, appId) : undefined,
      start ? gte(manualExpenses.spentAt, start) : undefined,
      end ? lte(manualExpenses.spentAt, end) : undefined,
    ].filter(Boolean);

    const db = await getDb();
    const [metrics] = await db
      .select({
        grossRevenue: sql<number>`coalesce(sum(${dailyAppMetrics.grossRevenue}), 0)`,
        proceeds: sql<number>`coalesce(sum(${dailyAppMetrics.proceeds}), 0)`,
        downloads: sql<number>`coalesce(sum(${dailyAppMetrics.installs}), 0)`,
        paidUnits: sql<number>`coalesce(sum(${dailyAppMetrics.paidUnits}), 0)`,
        trials: sql<number>`coalesce(sum(${dailyAppMetrics.trials}), 0)`,
        cancellations: sql<number>`coalesce(sum(${dailyAppMetrics.cancellations}), 0)`,
        refunds: sql<number>`coalesce(sum(${dailyAppMetrics.refunds}), 0)`,
        mrr: sql<number>`coalesce(sum(${dailyAppMetrics.mrr}), 0)`,
      })
      .from(dailyAppMetrics)
      .where(and(...metricConditions));

    const [expenses] = await db
      .select({
        total: sql<number>`coalesce(sum(${manualExpenses.amount}), 0)`,
      })
      .from(manualExpenses)
      .where(and(...expenseConditions));

    const grossRevenue = Number(metrics?.grossRevenue ?? 0);
    const proceeds = Number(metrics?.proceeds ?? 0);
    const downloads = Number(metrics?.downloads ?? 0);
    const expensesTotal = Number(expenses?.total ?? 0);
    const arpu = downloads > 0 ? grossRevenue / downloads : 0;

    return ok({
      totals: {
        grossRevenue,
        proceeds,
        downloads,
        paidUnits: Number(metrics?.paidUnits ?? 0),
        trials: Number(metrics?.trials ?? 0),
        cancellations: Number(metrics?.cancellations ?? 0),
        refunds: Number(metrics?.refunds ?? 0),
        mrr: Number(metrics?.mrr ?? 0),
        arpu,
        expenses: expensesTotal,
        profit: proceeds - expensesTotal,
      },
    });
  } catch (error) {
    return fail(503, "revenue_metrics_failed", error instanceof Error ? error.message : "Revenue metrics could not be loaded.");
  }
}
