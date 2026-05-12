import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

export type DbSchema = typeof schema;

/**
 * Drizzle client bound to the full Wined schema. Apps should create
 * exactly one instance and pass it around.
 */
export type DbClient = ReturnType<typeof createDb>;

/**
 * Transaction-scoped Drizzle handle. `withTenant` passes one of these
 * to the callback so callers cannot accidentally escape the tenant TX.
 */
export type DbTx = Parameters<Parameters<DbClient["transaction"]>[0]>[0];

export function createDb(connectionString: string) {
  const sql = postgres(connectionString, { max: 10 });
  return drizzle(sql, { schema });
}

export * from "./schema/index.js";
export { withTenant } from "./rls.js";
