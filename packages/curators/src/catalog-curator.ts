import { z } from 'zod';
import type { AgentDef } from '@wined/agents';
import { createDb, wineCatalogGlobal } from '@wined/db';
import { createEmbeddingProvider } from '@wined/embedding';
import { eq, and } from 'drizzle-orm';
import type { CuratorImpl, CuratorRunArgs, CuratorRunError } from './curator.js';

const VivinoRecordSchema = z.object({
  name: z.string(),
  producer: z.string().optional(),
  vintage: z.union([z.number(), z.string()]).nullable().optional(),
  region: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  grape_varieties: z.array(z.string()).optional(),
  wine_type: z.string().optional(),
  rating_average: z.number().nullable().optional(),
  price_estimate_eur: z.number().nullable().optional(),
  url: z.string().nullable().optional(),
});

type VivinoRecord = z.infer<typeof VivinoRecordSchema>;

export const catalogCuratorAgent: AgentDef = {
  name: 'catalog-curator',
  pod: 'curator',
  model: 'sonnet',
  technical: false,
  systemPrompt: `You are the Catalog Curator.
JOB: take a JSON dump from Vivino/Wine-Searcher (scraped via Apify) and normalize wines into
the wine_catalog_global table. Deduplicate by (producer + name + vintage) using fuzzy matching.
Normalize: variety names to canonical Spanish + English forms, DOs to ISO codes when applicable.
Skip records with missing producer AND missing name.`,
  tools: [],
};

export type CatalogCuratorPayload = {
  records?: VivinoRecord[];
  apifyDatasetId?: string;
};

export const catalogCurator: CuratorImpl = {
  agent: catalogCuratorAgent,

  async run(args: CuratorRunArgs) {
    const payload = (args.payload ?? {}) as CatalogCuratorPayload;
    const dbUrl = process.env['DATABASE_URL'];
    if (!dbUrl) {
      return {
        itemsProcessed: 0,
        errors: [{ message: 'DATABASE_URL not set' }],
      };
    }
    const db = createDb(dbUrl);
    const embedder = createEmbeddingProvider();

    let records: VivinoRecord[] = [];
    if (payload.records) {
      records = payload.records;
    } else if (payload.apifyDatasetId) {
      try {
        records = await fetchApifyDataset(payload.apifyDatasetId);
      } catch (err) {
        return {
          itemsProcessed: 0,
          errors: [{ message: (err as Error).message }],
        };
      }
    } else {
      return {
        itemsProcessed: 0,
        errors: [
          {
            message:
              'catalog-curator requires payload.records or payload.apifyDatasetId',
          },
        ],
      };
    }

    const errors: CuratorRunError[] = [];
    let itemsProcessed = 0;

    // Validate and dedupe in-memory
    const seen = new Set<string>();
    const valid: VivinoRecord[] = [];
    for (const raw of records) {
      const parsed = VivinoRecordSchema.safeParse(raw);
      if (!parsed.success) {
        errors.push({ message: `Invalid record: ${parsed.error.message}` });
        continue;
      }
      const r = parsed.data;
      if (!r.producer && !r.name) continue;
      const key = `${(r.producer ?? '').toLowerCase()}|${r.name.toLowerCase()}|${r.vintage ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      valid.push(r);
    }

    const BATCH = 96;
    for (let i = 0; i < valid.length; i += BATCH) {
      const slice = valid.slice(i, i + BATCH);
      const texts = slice.map(
        (r) =>
          `${r.producer ?? ''} ${r.name} ${r.vintage ?? ''} ${r.region ?? ''}`,
      );
      const embeddings = await embedder.embed(texts, 'document');

      for (let j = 0; j < slice.length; j++) {
        const r = slice[j]!;
        const emb = embeddings[j]!;

        try {
          const existing = await db
            .select()
            .from(wineCatalogGlobal)
            .where(
              and(
                eq(wineCatalogGlobal.name, r.name),
                eq(wineCatalogGlobal.producer, r.producer ?? ''),
              ),
            );
          if (existing.length > 0) continue;

          const vintageNum =
            typeof r.vintage === 'number'
              ? r.vintage
              : r.vintage
                ? parseInt(r.vintage, 10)
                : null;

          await db.insert(wineCatalogGlobal).values({
            name: r.name,
            producer: r.producer ?? null,
            vintage: vintageNum,
            region: r.region ?? null,
            country: r.country ?? null,
            grapeVarieties: r.grape_varieties ?? [],
            wineType: r.wine_type ?? null,
            embedding: emb,
            source: 'vivino',
            meta: {
              rating_average: r.rating_average ?? null,
              price_estimate_eur: r.price_estimate_eur ?? null,
              url: r.url ?? null,
            },
          });
          itemsProcessed++;
        } catch (err) {
          errors.push({
            message: `Insert ${r.name}: ${(err as Error).message}`,
          });
        }
      }
    }

    return { itemsProcessed, errors };
  },
};

async function fetchApifyDataset(
  datasetId: string,
): Promise<VivinoRecord[]> {
  const token = process.env['APIFY_API_TOKEN'];
  if (!token) throw new Error('APIFY_API_TOKEN not set');
  const res = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}&format=json`,
  );
  if (!res.ok) throw new Error(`Apify fetch failed: ${res.status}`);
  return (await res.json()) as VivinoRecord[];
}
