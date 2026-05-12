import { Hono } from "hono";
import { z } from "zod";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { and, eq } from "drizzle-orm";
import { documents, type DbTx } from "@wined/db";
import { getAuth } from "@wined/auth";
import { audit } from "../lib/audit.js";
import { env } from "../env.js";
import type { DistributorCatalogJob } from "../workers/distributor-catalog-worker.js";
import type { StockPriceImportJob } from "../workers/stock-price-import-worker.js";

export const distributorRoute = new Hono();

let queue: Queue<DistributorCatalogJob> | null = null;
function getQueue(): Queue<DistributorCatalogJob> {
  if (!queue) {
    const connection = new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
    });
    queue = new Queue<DistributorCatalogJob>("distributor.catalog", {
      connection,
    });
  }
  return queue;
}

let stockPriceQueue: Queue<StockPriceImportJob> | null = null;
function getStockPriceQueue(): Queue<StockPriceImportJob> {
  if (!stockPriceQueue) {
    const connection = new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
    });
    stockPriceQueue = new Queue<StockPriceImportJob>(
      "distributor.stock_price_import",
      { connection },
    );
  }
  return stockPriceQueue;
}

const IngestCatalogSchema = z.object({
  documentId: z.string().uuid(),
  catalogName: z.string().min(1),
  columnMap: z.record(z.string()).optional(),
});

distributorRoute.post("/catalog/ingest", async (c) => {
  const auth = getAuth(c);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const parsed = IngestCatalogSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  }

  const db = c.get("db") as DbTx;
  const docs = await db
    .select({ id: documents.id })
    .from(documents)
    .where(
      and(
        eq(documents.id, parsed.data.documentId),
        eq(documents.organizationId, auth.orgId),
      ),
    );
  if (docs.length === 0) {
    return c.json({ error: "document not found" }, 404);
  }

  const jobData: DistributorCatalogJob = {
    documentId: parsed.data.documentId,
    orgId: auth.orgId,
    catalogName: parsed.data.catalogName,
    ...(parsed.data.columnMap ? { columnMap: parsed.data.columnMap } : {}),
  };

  const job = await getQueue().add("catalog", jobData);

  await audit(
    c,
    "distributor.catalog.ingest_queued",
    "document",
    parsed.data.documentId,
    { catalogName: parsed.data.catalogName, jobId: job.id ?? null },
  );

  return c.json({ jobId: job.id, status: "queued" });
});

const StockPriceImportSchema = z.object({
  documentId: z.string().uuid(),
  catalogId: z.string().uuid(),
  skuColumn: z.string().optional(),
  stockColumn: z.string().optional(),
  priceColumn: z.string().optional(),
});

distributorRoute.post("/catalog/stock-price/import", async (c) => {
  const auth = getAuth(c);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const parsed = StockPriceImportSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  }

  const db = c.get("db") as DbTx;
  const docs = await db
    .select({ id: documents.id })
    .from(documents)
    .where(
      and(
        eq(documents.id, parsed.data.documentId),
        eq(documents.organizationId, auth.orgId),
      ),
    );
  if (docs.length === 0) {
    return c.json({ error: "document not found" }, 404);
  }

  const jobData: StockPriceImportJob = {
    documentId: parsed.data.documentId,
    orgId: auth.orgId,
    catalogId: parsed.data.catalogId,
    ...(parsed.data.skuColumn ? { skuColumn: parsed.data.skuColumn } : {}),
    ...(parsed.data.stockColumn
      ? { stockColumn: parsed.data.stockColumn }
      : {}),
    ...(parsed.data.priceColumn
      ? { priceColumn: parsed.data.priceColumn }
      : {}),
  };

  const job = await getStockPriceQueue().add("stock-price", jobData);

  await audit(
    c,
    "distributor.stock_price.import_queued",
    "document",
    parsed.data.documentId,
    { catalogId: parsed.data.catalogId, jobId: job.id ?? null },
  );

  return c.json({ jobId: job.id, status: "queued" });
});

distributorRoute.get("/catalog/stock-price/:jobId/status", async (c) => {
  const jobId = c.req.param("jobId");
  const job = await getStockPriceQueue().getJob(jobId);
  if (!job) return c.json({ error: "not_found" }, 404);
  const state = await job.getState();
  return c.json({
    jobId,
    state,
    progress: job.progress,
    returnvalue: job.returnvalue,
  });
});

distributorRoute.get("/catalog/:jobId/status", async (c) => {
  const jobId = c.req.param("jobId");
  const job = await getQueue().getJob(jobId);
  if (!job) return c.json({ error: "not_found" }, 404);
  const state = await job.getState();
  return c.json({
    jobId,
    state,
    progress: job.progress,
    returnvalue: job.returnvalue,
  });
});
