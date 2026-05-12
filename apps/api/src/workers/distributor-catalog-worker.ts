import { and, eq } from "drizzle-orm";
import {
  createDb,
  withTenant,
  distributorCatalogs,
  distributorCatalogItems,
  documents,
} from "@wined/db";
import {
  makeWorker,
  parserForMime,
  createStorage,
} from "@wined/ingestion";
import { env } from "../env.js";

export type DistributorCatalogJob = {
  documentId: string;
  orgId: string;
  catalogName: string;
  columnMap?: Record<string, string>;
};

type CatalogResult =
  | { ok: true; catalogId: string; itemsImported: number }
  | { ok: false; error: string };

export function startDistributorCatalogWorker() {
  return makeWorker<DistributorCatalogJob>(
    "distributor.catalog",
    async ({ data }): Promise<CatalogResult> => {
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

      // 4. Create catalog + insert items in tenant-scoped tx
      let catalogId = "";
      await withTenant(db, data.orgId, async (tx) => {
        const inserted = await tx
          .insert(distributorCatalogs)
          .values({
            organizationId: data.orgId,
            name: data.catalogName,
            sourceDocId: doc.id,
          })
          .returning();
        const cat = inserted[0];
        if (!cat) throw new Error("failed to insert catalog");
        catalogId = cat.id;

        const map = data.columnMap ?? {};
        const items = rows.map((r) => {
          const get = (k: string): unknown => r[k];
          const pick = (key: string, ...fallbacks: string[]): unknown => {
            const mapped = map[key];
            if (mapped !== undefined && get(mapped) !== undefined)
              return get(mapped);
            for (const f of fallbacks) {
              const v = get(f);
              if (v !== undefined && v !== "") return v;
            }
            return undefined;
          };

          const producer = pick("producer", "producer", "productor");
          const name = pick("name", "name", "nombre", "referencia");
          const vintage = pick("vintage", "vintage", "añada", "cosecha");
          const doAppellation = pick("do", "do", "do_appellation");
          const pvp = pick("pvp", "pvp", "precio_pvp", "pvp_eur");

          return {
            organizationId: data.orgId,
            catalogId: cat.id,
            producer: producer != null ? String(producer) : null,
            displayName: name != null ? String(name) : "Sin nombre",
            vintage: parseVintage(vintage),
            doAppellation: doAppellation != null ? String(doAppellation) : null,
            pvpEur: parseDecimal(pvp),
            meta: r,
          };
        });

        const BATCH = 500;
        for (let i = 0; i < items.length; i += BATCH) {
          const slice = items.slice(i, i + BATCH);
          if (slice.length > 0) {
            await tx.insert(distributorCatalogItems).values(slice);
          }
        }
      });

      return { ok: true, catalogId, itemsImported: rows.length };
    },
  );
}

function parseVintage(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = parseInt(String(v), 10);
  return Number.isNaN(n) ? null : n;
}

function parseDecimal(v: unknown): string | null {
  if (v == null || v === "") return null;
  const s = String(v).replace(",", ".").replace(/[^0-9.]/g, "");
  return s.length > 0 ? s : null;
}
