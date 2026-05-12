import { clerkAuth as baseClerkAuth } from "@wined/auth";
import { getDb } from "../db.js";

/**
 * Pre-bound Clerk auth middleware that injects the API's shared DbClient.
 * Usage: `app.use('*', clerkAuth())`.
 */
export function clerkAuth() {
  return baseClerkAuth({ db: getDb() });
}
