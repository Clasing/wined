import Redis from 'ioredis';
import type { EmbeddingProvider } from '@wined/embedding';

export type CacheEntry<T = unknown> = {
  embedding: number[];
  response: T;
};

export class SemanticCache {
  private redis: Redis;
  private threshold: number;
  private ttlSec: number;

  constructor(
    redisUrl: string,
    private embedder: EmbeddingProvider,
    opts: { threshold?: number; ttlSec?: number } = {},
  ) {
    this.redis = new Redis(redisUrl);
    this.threshold = opts.threshold ?? 0.93;
    this.ttlSec = opts.ttlSec ?? 86400;
  }

  async get<T = unknown>(
    tenantId: string,
    agentName: string,
    key: string,
  ): Promise<CacheEntry<T> | null> {
    const [queryEmb] = await this.embedder.embed([key], 'query');
    if (!queryEmb) return null;

    const indexKey = `semcache:idx:${tenantId}:${agentName}`;
    const cachedKeys = await this.redis.lrange(indexKey, 0, 99);

    for (const ck of cachedKeys) {
      const entry = await this.redis.get(ck);
      if (!entry) continue;
      const parsed = JSON.parse(entry) as CacheEntry<T>;
      const sim = cosineSimilarity(queryEmb, parsed.embedding);
      if (sim >= this.threshold) {
        return parsed;
      }
    }
    return null;
  }

  async set<T = unknown>(
    tenantId: string,
    agentName: string,
    key: string,
    response: T,
  ): Promise<void> {
    const [queryEmb] = await this.embedder.embed([key], 'query');
    if (!queryEmb) return;

    const ck = `semcache:entry:${tenantId}:${agentName}:${Date.now()}`;
    const indexKey = `semcache:idx:${tenantId}:${agentName}`;
    const payload: CacheEntry<T> = { embedding: queryEmb, response };
    await this.redis.setex(ck, this.ttlSec, JSON.stringify(payload));
    await this.redis.lpush(indexKey, ck);
    await this.redis.ltrim(indexKey, 0, 99);
    await this.redis.expire(indexKey, this.ttlSec);
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < len; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    na += ai * ai;
    nb += bi * bi;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}
