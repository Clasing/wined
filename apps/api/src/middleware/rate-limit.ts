import type { MiddlewareHandler } from "hono";
import { getAuth } from "@wined/auth";
import { getRedis } from "../redis.js";

const RATE_LIMIT = 60; // requests per window
const WINDOW_SEC = 60;

/**
 * Per-tenant fixed-window rate limiter backed by Redis INCR/EXPIRE.
 * Returns 429 with `Retry-After` when the org exceeds the limit.
 */
export const rateLimit: MiddlewareHandler = async (c, next) => {
  const auth = getAuth(c);
  const redis = getRedis();
  const key = `rl:${auth.orgId}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, WINDOW_SEC);
  }
  if (count > RATE_LIMIT) {
    c.header("Retry-After", String(WINDOW_SEC));
    return c.json({ error: "rate_limited" }, 429);
  }
  await next();
  return;
};
