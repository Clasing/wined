import type { MiddlewareHandler } from "hono";
import { getAuth } from "@wined/auth";
import { getRedis } from "../redis.js";

const TTL_SEC = 86_400; // 24h

/**
 * Sets `c.var.disclaimer_needed = true` the first time a user hits a
 * protected route in a 24h window, then marks the flag as seen in Redis.
 * Routes/handlers can check this flag to surface the legal disclaimer.
 */
export const disclaimer: MiddlewareHandler = async (c, next) => {
  const auth = getAuth(c);
  const redis = getRedis();
  const key = `disc:${auth.orgId}:${auth.userId}`;
  const seen = await redis.get(key);
  c.set("disclaimer_needed", !seen);
  if (!seen) {
    await redis.setex(key, TTL_SEC, "1");
  }
  await next();
};
