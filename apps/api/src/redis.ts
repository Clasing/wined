import Redis from "ioredis";
import { env } from "./env.js";

let _redis: Redis | undefined;

export function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis(env.REDIS_URL, { lazyConnect: false, maxRetriesPerRequest: 3 });
  }
  return _redis;
}
