import type { Context } from "hono";
import type { AuthCtx } from "./types.js";

/**
 * Retrieve the AuthCtx attached by `clerkAuth()` middleware.
 * Throws if the middleware did not run before the handler.
 */
export function getAuth(c: Context): AuthCtx {
  const auth = c.get("auth") as AuthCtx | undefined;
  if (!auth) {
    throw new Error(
      "Missing auth context. Did you forget to mount clerkAuth() middleware?",
    );
  }
  return auth;
}
