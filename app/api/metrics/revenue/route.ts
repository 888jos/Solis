import { and, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { dailyAppMetrics, manualExpenses } from "@/db/schema";
import { getOrCreateLocalSession } from "@/server/backend/auth";
import { fail, ok } from "@/server/backend/http";
import { convertAmountToUsd, getHistoricalExchangeRates, normalizeCurrency } from "@/server/backend/currency";

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
    const metricRows = await db
      .select({
        currency: dailyAppMetrics.currency,
        date: dailyAppMetrics.date,
        grossRevenue: dailyAppMetrics.grossRevenue,
        proceeds: dailyAppMetrics.proceeds,
        downloads: dailyAppMetrics.installs,
        paidUnits: dailyAppMetrics.paidUnits,
        trials: dailyAppMetrics.trials,
        cancellations: dailyAppMetrics.cancellations,
        refunds: dailyAppMetrics.refunds,
        mrr: dailyAppMetrics.mrr,
      })
      .from(dailyAppMetrics)
      .where(and(...metricConditions));

    const expenseRows = await db
      .select({
        amount: manualExpenses.amount,
        currency: manualExpenses.currency,
        date: manualExpenses.spentAt,
      })
      .from(manualExpenses)
      .where(and(...expenseConditions));

    const needsRates = [...metricRows, ...expenseRows].some((row) => normalizeCurrency(row.currency) !== "USD");
    const exchangeRates = needsRates ? await getHistoricalExchangeRates() : new Map<string, Map<string, number>>();
    const toUsd = (amount: number, currency: string, date: string) => {
      const converted = convertAmountToUsd(Number(amount) || 0, currency, date, exchangeRates);
      if (converted === null) throw new Error(`Could not convert ${currency} to USD for ${date}.`);
      return converted;
    };
    const metrics = metricRows.reduce((total, row) => ({
      grossRevenue: total.grossRevenue + toUsd(row.grossRevenue, row.currency, row.date),
      proceeds: total.proceeds + toUsd(row.proceeds, row.currency, row.date),
      downloads: total.downloads + Number(row.downloads || 0),
      paidUnits: total.paidUnits + Number(row.paidUnits || 0),
      trials: total.trials + Number(row.trials || 0),
      cancellations: total.cancellations + Number(row.cancellations || 0),
      refunds: total.refunds + toUsd(row.refunds, row.currency, row.date),
      mrr: total.mrr + toUsd(row.mrr, row.currency, row.date),
    }), { grossRevenue: 0, proceeds: 0, downloads: 0, paidUnits: 0, trials: 0, cancellations: 0, refunds: 0, mrr: 0 });
    const grossRevenue = metrics.grossRevenue;
    const proceeds = metrics.proceeds;
    const downloads = metrics.downloads;
    const expensesTotal = expenseRows.reduce((sum, row) => sum + toUsd(row.amount, row.currency, row.date), 0);
    const arpu = downloads > 0 ? grossRevenue / downloads : 0;

    return ok({
      totals: {
        grossRevenue,
        proceeds,
        downloads,
        paidUnits: metrics.paidUnits,
        trials: metrics.trials,
        cancellations: metrics.cancellations,
        refunds: metrics.refunds,
        mrr: metrics.mrr,
        arpu,
        expenses: expensesTotal,
        profit: proceeds - expensesTotal,
      },
    });
  } catch (error) {
    return fail(503, "revenue_metrics_failed", error instanceof Error ? error.message : "Revenue metrics could not be loaded.");
  }
}
