import { authTables } from "@convex-dev/auth/server";
import { defineSchema } from "convex/server";
import { analyticsTables } from "./schema/analytics";
import { contentTables } from "./schema/content";
import { coreTables } from "./schema/core";
import { expenseTables } from "./schema/expenses";
import { growthTables } from "./schema/growth";
import { paidTables } from "./schema/paid";
import { pilotTables } from "./schema/pilot";
import { productTables } from "./schema/product";
import { projectTables } from "./schema/projects";
import { revenueTables } from "./schema/revenue";
import { subscriptionTables } from "./schema/subscriptions";

// Each domain owns its own file under convex/schema/. Edit only your domain's file.
export default defineSchema({
  ...authTables,
  ...coreTables,
  ...revenueTables,
  ...subscriptionTables,
  ...expenseTables,
  ...growthTables,
  ...productTables,
  ...analyticsTables,
  ...contentTables,
  ...projectTables,
  ...pilotTables,
  ...paidTables,
});
