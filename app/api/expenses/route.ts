import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { manualExpenses } from "@/db/schema";
import { getOrCreateLocalSession } from "@/server/backend/auth";
import { fail, now, ok, readJson } from "@/server/backend/http";
import { ensureWorkspace } from "@/server/backend/workspaces";

type ExpenseBody = {
  amount?: number;
  appId?: string;
  category?: string;
  currency?: string;
  label?: string;
  spentAt?: string;
  workspaceId?: string;
};

const allowedCategories = new Set(["creators", "ads", "software", "other"]);

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const session = await getOrCreateLocalSession();
    const workspaceId = searchParams.get("workspaceId") || session.workspaceId;
    const appId = searchParams.get("appId");

    const db = await getDb();
    const where = appId
      ? and(eq(manualExpenses.workspaceId, workspaceId), eq(manualExpenses.appId, appId))
      : eq(manualExpenses.workspaceId, workspaceId);
    const rows = await db.select().from(manualExpenses).where(where).orderBy(desc(manualExpenses.spentAt));

    return ok({ expenses: rows });
  } catch (error) {
    return fail(503, "expenses_list_failed", error instanceof Error ? error.message : "Expenses could not be loaded.");
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJson<ExpenseBody>(request);
    const session = await getOrCreateLocalSession();
    const workspaceId = body?.workspaceId?.trim() || session.workspaceId;
    const label = body?.label?.trim();
    const category = body?.category?.trim().toLowerCase() || "other";
    const amount = Number(body?.amount);

    if (!label) return fail(400, "expense_label_required", "Expense label is required.");
    if (!Number.isFinite(amount) || amount < 0) return fail(400, "expense_amount_invalid", "Expense amount must be a positive number.");
    if (!allowedCategories.has(category)) return fail(400, "expense_category_invalid", "Category must be creators, ads, software or other.");

    const createdAt = now();
    const row = {
      id: crypto.randomUUID(),
      workspaceId,
      appId: body?.appId?.trim() || null,
      category,
      label,
      amount,
      currency: body?.currency?.trim().toUpperCase() || "USD",
      spentAt: body?.spentAt?.trim() || createdAt.toISOString().slice(0, 10),
      createdAt,
      updatedAt: createdAt,
    };

    const db = await getDb();
    await ensureWorkspace(db, workspaceId);
    await db.insert(manualExpenses).values(row);
    return ok({ expense: row }, { status: 201 });
  } catch (error) {
    return fail(500, "expense_create_failed", error instanceof Error ? error.message : "Expense could not be created.");
  }
}
