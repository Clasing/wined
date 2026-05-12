import { Queue, Worker, type JobsOptions, type Processor } from 'bullmq';
import Redis from 'ioredis';

let connection: Redis | null = null;
function getConnection(): Redis {
  if (!connection) {
    const url = process.env['REDIS_URL'];
    if (!url) throw new Error('REDIS_URL env var required');
    connection = new Redis(url, { maxRetriesPerRequest: null });
  }
  return connection;
}

export type IngestionClassifyJob = {
  documentId: string;
  orgId: string;
  storageKey: string;
  fileName: string;
  mimeType: string;
};

export type IngestionEmbedJob = {
  documentId: string;
  orgId: string;
  chunks: { content: string; metadata?: Record<string, unknown> }[];
};

export type CuratorJob = {
  curatorName: 'regulation' | 'do' | 'book' | 'catalog' | 'reviewer';
  trigger: 'cron' | 'manual' | 'event';
  orgId?: string;
  payload?: Record<string, unknown>;
};

export type CitationValidatorJob = {
  messageId: string;
  citations: string[];
};

export const ingestionClassifyQueue = new Queue<IngestionClassifyJob>('ingestion.classify', { connection: getConnection() });
export const ingestionEmbedQueue = new Queue<IngestionEmbedJob>('ingestion.embed', { connection: getConnection() });
export const curatorQueue = new Queue<CuratorJob>('curator', { connection: getConnection() });
export const citationValidatorQueue = new Queue<CitationValidatorJob>('citation-validator', { connection: getConnection() });

export function makeWorker<T>(name: string, handler: (job: { data: T; id?: string }) => Promise<unknown>): Worker<T> {
  const processor: Processor<T> = async (job) => handler({ data: job.data, ...(job.id !== undefined ? { id: job.id } : {}) });
  return new Worker<T>(name, processor, { connection: getConnection() });
}

export const defaultJobOpts: JobsOptions = {
  removeOnComplete: { age: 24 * 3600, count: 1000 },
  removeOnFail: { age: 7 * 24 * 3600 },
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000 },
};
