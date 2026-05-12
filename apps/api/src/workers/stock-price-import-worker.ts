import { and, eq } from "drizzle-orm";
import {
  createDb,
  withTenant,
  distributorCatalogItems,
  documents,
} from "@wined/db";
import {
  makeWorker,
  parserForMime,
  createStorage,
} from "@wined/ingestion";
import { env } from "../env.js";

export type StockPriceImportJob = {
  documentId: string;
  orgId: string;
  catalogId: string;
  skuColumn?: string;
  stockColumn?: string;
  priceColumn?: string;
};

type StockPriceImportResult =
  | {
      ok: true;
      updated: number;
      notFound: number;
      totalRows: number;
    }
  | { ok: false; error: string };

export function startStockPriceImportWorker() {
  return makeWorker<StockPriceImportJob>(
    "distributor.stock_price_import",
    async ({ data }): Promise<StockPriceImportResult> => {
      const db = createDb(env.DATABASE_URL);
      const storage = createStorage();

      // 1. Fetch document scoped to org
      const docs = await db
        .select()
        .from(documents)
        .where(
          and(
            eq(documents.id, data.documentId),
            eq(documents.organizationId, data.orgId),
          ),
        );
      const doc = docs[0];
      if (!doc) return { ok: false, error: "document not found" };

      // 2. Download + parse
      const { body } = await storage.get(doc.storageUrl);
      const parser = parserForMime(doc.mimeType);
      const parsed = await parser.parse(Buffer.from(body));

      // 3. Extract rows from first table block
      const tableBlock = parsed.blocks.find((b) => b.type === "table");
      if (!tableBlock) return { ok: false, error: "no table data found" };

      let rows: Array<Record<string, unknown>>;
      try {
        rows = JSON.parse(tableBlock.text) as Array<Record<string, unknown>>;
      } catch {
        return { ok: false, error: "could not parse table rows" };
      }
      if (!Array.isArray(rows)) {
        return { ok: false, error: "table block is not an array" };
      }

      const skuCol = data.skuColumn ?? "sku";
      const stockCol = data.stockColumn ?? "stock";
      const priceCol = data.priceColumn ?? "pvp";

      let updated = 0;
      let notFound = 0;

      // 4. Per-row diff merge inside tenant-scoped tx
      await withTenant(db, data.orgId, async (tx) => {
        for (const row of rows) {
          const rawSku = row[skuCol];
          const sku =
            rawSku != null ? String(rawSku).trim() : "";
          if (!sku) continue;

          const update: {
            stock?: number;
            pvpEur?: string;
          } = {};

          const rawStock = row[stockCol];
          if (rawStock !== undefined && rawStock !== null && rawStock !== "") {
            const parsedStock = parseInt(
              String(rawStock).replace(/[^0-9-]/g, ""),
              10,
            );
            update.stock = Number.isNaN(parsedStock) ? 0 : parsedStock;
          }

          const rawPrice = row[priceCol];
          if (rawPrice !== undefined && rawPrice !== null && rawPrice !== "") {
            const cleaned = String(rawPrice)
              .replace(",", ".")
              .replace(/[^0-9.]/g, "");
            if (cleaned.length > 0) update.pvpEur = cleaned;
          }

          if (Object.keys(update).length === 0) continue;

          const result = await tx
            .update(distributorCatalogItems)
            .set(update)
            .where(
              and(
                eq(distributorCatalogItems.organizationId, data.orgId),
                eq(distributorCatalogItems.catalogId, data.catalogId),
                eq(distributorCatalogItems.sku, sku),
              ),
            )
            .returning({ id: distributorCatalogItems.id });

          if (result.length > 0) updated++;
          else notFound++;
        }
      });

      return {
        ok: true,
        updated,
        notFound,
        totalRows: rows.length,
      };
    },
  );
}
