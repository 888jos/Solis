/* eslint-disable @typescript-eslint/no-explicit-any */
import { getTableColumns, getTableName } from "drizzle-orm";
import { SQLiteAsyncDialect } from "drizzle-orm/sqlite-core/dialect";
import { ConvexHttpClient } from "convex/browser";
import { internal } from "../convex/_generated/api.js";
import * as schema from "./schema";

type Filter = { field: string; op: string; value: unknown };
type Order = { field: string; direction: "asc" | "desc" };
const dialect = new SQLiteAsyncDialect();
const schemaTables = Object.fromEntries(Object.entries(schema).map(([, table]) => [getTableName(table), table]));

function camelCase(value: string) {
  return value.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function tableName(table: object) {
  return getTableName(table);
}

function fieldName(name: string, sqlField: string) {
  const table = schemaTables[name] as any;
  const columns = table ? getTableColumns(table) as Record<string, any> : {};
  return Object.keys(columns).find((key) => columns[key].name === sqlField) ?? camelCase(sqlField);
}

function toConvexTime(name: string, sqlField: string, value: unknown) {
  const property = fieldName(name, sqlField);
  const column = (getTableColumns(schemaTables[name] as any) as Record<string, any>)[property];
  if (column?.config?.mode === "timestamp" && typeof value === "number") return value * 1000;
  return value;
}

function fromConvexTime(name: string, row: Record<string, any>) {
  const columns = getTableColumns(schemaTables[name] as any) as Record<string, any>;
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key,
    columns[key]?.config?.mode === "timestamp" && typeof value === "number" ? new Date(value) : value,
  ]));
}

function toConvexValue(value: unknown): unknown {
  if (value instanceof Date) return value.getTime();
  if (Array.isArray(value)) return value.map(toConvexValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, toConvexValue(item)]));
  }
  return value;
}

function filtersFrom(condition: unknown, baseTable: string): Filter[] {
  if (!condition) return [];
  const { sql, params } = dialect.sqlToQuery(condition as any);
  if (/\bor\b/i.test(sql)) throw new Error("The Convex SQLite-compatibility adapter does not support OR expressions yet.");
  const filters: Filter[] = [];
  const pattern = /"(?:[^"]+)"\."([^"]+)"\s*(is not null|is null|>=|<=|!=|=|>|<)(?:\s*(\?|null))?/gi;
  let parameter = 0;
  for (const match of sql.matchAll(pattern)) {
    const [, sqlField, operator, right] = match;
    const rawValue = right?.toLowerCase() === "null" || !right ? null : params[parameter++];
    filters.push({
      field: fieldName(baseTable, sqlField),
      op: operator.toLowerCase(),
      value: rawValue === null ? null : toConvexTime(baseTable, sqlField, rawValue),
    });
  }
  if (parameter !== params.length || !filters.length) {
    throw new Error(`Unsupported SQLite query condition: ${sql}`);
  }
  return filters;
}

function orderFrom(orderBy: unknown, baseTable: string): Order[] {
  if (!orderBy) return [];
  const values = Array.isArray(orderBy) ? orderBy : [orderBy];
  return values.map((entry) => {
    const sql = dialect.sqlToQuery(entry as any).sql;
    const match = sql.match(/"(?:[^"]+)"\."([^"]+)"\s+(asc|desc)/i);
    if (!match) throw new Error(`Unsupported SQLite ordering: ${sql}`);
    return { field: fieldName(baseTable, match[1]), direction: match[2].toLowerCase() as "asc" | "desc" };
  });
}

function joinFrom(joinTable: object, condition: unknown) {
  const sql = dialect.sqlToQuery(condition as any).sql;
  const match = sql.match(/"([^"]+)"\."([^"]+)"\s*=\s*"([^"]+)"\."([^"]+)"/);
  if (!match) throw new Error(`Unsupported SQLite join: ${sql}`);
  return {
    name: tableName(joinTable),
    baseField: fieldName(match[1] === tableName(joinTable) ? match[3] : tableName(joinTable), match[1] === tableName(joinTable) ? match[4] : match[2]),
    joinField: fieldName(tableName(joinTable), match[1] === tableName(joinTable) ? match[2] : match[4]),
  };
}

function isTable(value: unknown): value is object {
  if (!value || typeof value !== "object") return false;
  try { return typeof getTableName(value) === "string"; } catch { return false; }
}

function isColumn(value: unknown): value is { name: string; table: object } {
  return Boolean(value && typeof value === "object" && "name" in value && "table" in value && isTable((value as any).table));
}

function projectRow(selection: Record<string, any>, source: Record<string, any>, baseName: string, joined?: { name: string; row: Record<string, any> | null }) {
  return Object.fromEntries(Object.entries(selection).map(([alias, expression]) => {
    if (isTable(expression)) {
      const name = tableName(expression);
      return [alias, name === baseName ? source : joined && name === joined.name ? joined.row : null];
    }
    if (isColumn(expression)) {
      const name = tableName(expression.table);
      const row = name === baseName ? source : joined && name === joined.name ? joined.row : undefined;
      return [alias, row?.[fieldName(name, expression.name)]];
    }
    return [alias, expression];
  }));
}

class ConvexCompatibilityDb {
  private readonly client: ConvexHttpClient;

  constructor(client: ConvexHttpClient) {
    this.client = client;
  }

  select(selection?: Record<string, any>) {
    return {
      from: (base: object) => {
        const baseName = tableName(base);
        let where: unknown;
        let orderBy: unknown;
        let limit: number | undefined;
        let join: ReturnType<typeof joinFrom> | undefined;
        const query = {
          where(condition: unknown) { where = condition; return query; },
          orderBy(...order: unknown[]) { orderBy = order; return query; },
          limit(count: number) { limit = count; return query; },
          leftJoin(joinTable: object, condition: unknown) { join = joinFrom(joinTable, condition); return query; },
          then(resolve: (value: any) => unknown, reject?: (reason: unknown) => unknown) {
            return execute().then(resolve, reject);
          },
        };
        const execute = async () => {
          const ordering = orderFrom(orderBy, baseName);
          const baseRows = await this.client.query(internal.store.select, {
            tableName: baseName,
            where: filtersFrom(where, baseName).map((filter) => ({ ...filter, value: toConvexValue(filter.value) })),
            orderBy: ordering[0],
            limit: join ? undefined : limit,
          });
          let joinedRows: Record<string, any>[] = [];
          if (join) joinedRows = await this.client.query(internal.store.select, { tableName: join.name });
          let result = (baseRows as Record<string, any>[]).map((row) => fromConvexTime(baseName, row));
          if (join) {
            const rows = joinedRows.map((row) => fromConvexTime(join!.name, row));
            result = result.map((row) => {
              const joinedRow = rows.find((candidate) => {
                let left = row[join!.baseField];
                let right = candidate[join!.joinField];
                if (left instanceof Date) left = left.getTime();
                if (right instanceof Date) right = right.getTime();
                return left === right;
              }) ?? null;
              return selection ? projectRow(selection, row, baseName, { name: join!.name, row: joinedRow }) : { [baseName]: row, [join!.name]: joinedRow };
            });
          } else if (selection) {
            result = result.map((row) => projectRow(selection, row, baseName));
          }
          for (const item of ordering.slice(1)) {
            result.sort((a, b) => {
              const left = a[item.field];
              const right = b[item.field];
              const order = left < right ? -1 : left > right ? 1 : 0;
              return item.direction === "desc" ? -order : order;
            });
          }
          return limit === undefined ? result : result.slice(0, limit);
        };
        return query;
      },
    };
  }

  insert(table: object) {
    return {
      values: async (rows: Record<string, any> | Record<string, any>[]) => {
        const values = Array.isArray(rows) ? rows : [rows];
        for (const row of values) await this.client.mutation(internal.store.insert, { tableName: tableName(table), row: toConvexValue(row) });
        return values;
      },
    };
  }

  update(table: object) {
    return {
      set: (values: Record<string, any>) => ({
        where: async (condition: unknown) => await this.client.mutation(internal.store.update, {
          tableName: tableName(table),
          where: filtersFrom(condition, tableName(table)).map((filter) => ({ ...filter, value: toConvexValue(filter.value) })),
          values: toConvexValue(values),
        }),
      }),
    };
  }

  delete(table: object) {
    return {
      where: async (condition: unknown) => await this.client.mutation(internal.store.remove, {
        tableName: tableName(table),
        where: filtersFrom(condition, tableName(table)).map((filter) => ({ ...filter, value: toConvexValue(filter.value) })),
      }),
    };
  }
}

export function createConvexDb(client: ConvexHttpClient): any {
  return new ConvexCompatibilityDb(client);
}

export async function getDb(): Promise<any> {
  const { env } = await import("cloudflare:workers");
  const runtimeEnv = env as unknown as Record<string, string | undefined>;
  const url = runtimeEnv.CONVEX_URL || import.meta.env.VITE_CONVEX_URL;
  const adminKey = runtimeEnv.CONVEX_DEPLOY_KEY;
  if (!url || !adminKey) throw new Error("Convex server credentials are not configured.");
  const client = new ConvexHttpClient(url);
  client.setAdminAuth(adminKey);
  return createConvexDb(client);
}
