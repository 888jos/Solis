import { defineSchema } from "convex/server";
import { analyticsTables } from "./schema/analytics";
import { coreTables } from "./schema/core";
import { expenseTables } from "./schema/expenses";
import { growthTables } from "./schema/growth";
import { productTables } from "./schema/product";
import { revenueTables } from "./schema/revenue";
import { subscriptionTables } from "./schema/subscriptions";

// Each domain owns its own file under convex/schema/. Edit only your domain's file.
export default defineSchema({
  ...coreTables,
  ...revenueTables,
  ...subscriptionTables,
  ...expenseTables,
  ...growthTables,
  ...productTables,
  ...analyticsTables,
});
