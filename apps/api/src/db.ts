import { createDb, type DbClient } from "@wined/db";
import { env } from "./env.js";

/**
 * Singleton Drizzle client for the API process.
 * Created lazily so importing this module does not open a connection
 * unless the caller actually touches the db.
 */
let _db: DbClient | undefined;

export function getDb(): DbClient {
  if (!_db) {
    _db = createDb(env.DATABASE_URL);
  }
  return _db;
}
