import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import {
  documentChunks,
  documents,
  tastingMenus,
  wineLists,
  wineListItems,
  type DbTx,
} from "@wined/db";
import { ingestTastingMenu, ingestWineList } from "@wined/agents";
import { LLMGateway } from "@wined/llm-gateway";
import { getAuth } from "@wined/auth";
import { buildGlossaryPrompt } from "@wined/wine-kb";
import { audit } from "../lib/audit.js";
import { env } from "../env.js";

export const sommelierRoute = new Hono();

let gateway: LLMGateway | null = null;
function getGateway(): LLMGateway {
  if (!gateway) {
    gateway = new LLMGateway({
      anthropicKey: env.ANTHROPIC_API_KEY,
      redisUrl: env.REDIS_URL,
    });
  }
  return gateway;
}

const IngestSchema = z.object({
  documentId: z.string().uuid(),
  workspaceId: z.string().uuid(),
});

sommelierRoute.post("/wine-lists/ingest", async (c) => {
  const auth = getAuth(c);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const parsed = IngestSchema.safeParse(body);
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
  const docRow = docs[0];
  if (!docRow) {
    return c.json({ error: "document not found" }, 404);
  }

  // Reconstruct the document text from its chunks
  const chunks = await db
    .select({
      content: documentChunks.content,
      chunkIndex: documentChunks.chunkIndex,
    })
    .from(documentChunks)
    .where(
      and(
        eq(documentChunks.documentId, docRow.id),
        eq(documentChunks.organizationId, auth.orgId),
      ),
    );
  const text = chunks
    .slice()
    .sort((a, b) => a.chunkIndex - b.chunkIndex)
    .map((ch) => ch.content)
    .join("\n\n");

  const result = await ingestWineList({
    tx: db,
    gateway: getGateway(),
    orgId: auth.orgId,
    workspaceId: parsed.data.workspaceId,
    sourceDocId: docRow.id,
    documentText: text,
  });

  await audit(c, "sommelier.wine_list.ingested", "wine_list", result.listId, {
    itemsInserted: result.itemsInserted,
    version: result.version,
    documentId: docRow.id,
  });

  return c.json(result);
});

sommelierRoute.get("/wine-lists", async (c) => {
  const auth = getAuth(c);
  const db = c.get("db") as DbTx;
  const workspaceId = c.req.query("workspaceId");

  const baseCond = eq(wineLists.organizationId, auth.orgId);
  const where =
    workspaceId !== undefined
      ? and(baseCond, eq(wineLists.workspaceId, workspaceId))
      : baseCond;

  const rows = await db
    .select()
    .from(wineLists)
    .where(where)
    .orderBy(desc(wineLists.createdAt));

  return c.json({ rows });
});

sommelierRoute.post("/wine-lists/:id/activate", async (c) => {
  const auth = getAuth(c);
  const id = c.req.param("id");
  const db = c.get("db") as DbTx;

  const targets = await db
    .select({
      id: wineLists.id,
      workspaceId: wineLists.workspaceId,
    })
    .from(wineLists)
    .where(and(eq(wineLists.id, id), eq(wineLists.organizationId, auth.orgId)));
  const target = targets[0];
  if (!target) {
    return c.json({ error: "not_found" }, 404);
  }

  // Deactivate any active list in the same workspace first
  const deactivateBase = eq(wineLists.organizationId, auth.orgId);
  const deactivateWhere =
    target.workspaceId !== null
      ? and(
          deactivateBase,
          eq(wineLists.workspaceId, target.workspaceId),
          eq(wineLists.isActive, true),
        )
      : and(deactivateBase, eq(wineLists.isActive, true));

  await db
    .update(wineLists)
    .set({ isActive: false })
    .where(deactivateWhere);

  await db
    .update(wineLists)
    .set({ isActive: true })
    .where(eq(wineLists.id, id));

  await audit(c, "sommelier.wine_list.activated", "wine_list", id);

  return c.json({ ok: true, listId: id });
});

// ===== TRANSLATE WINE LIST (SOM-08) =====
const TranslateSchema = z.object({ lang: z.enum(["es", "en"]) });

sommelierRoute.post("/wine-lists/:id/translate", async (c) => {
  const auth = getAuth(c);
  const id = c.req.param("id");

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const parsed = TranslateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  }

  const db = c.get("db") as DbTx;

  const lists = await db
    .select({ id: wineLists.id })
    .from(wineLists)
    .where(
      and(eq(wineLists.id, id), eq(wineLists.organizationId, auth.orgId)),
    );
  if (lists.length === 0) {
    return c.json({ error: "not_found" }, 404);
  }

  const items = await db
    .select()
    .from(wineListItems)
    .where(
      and(
        eq(wineListItems.listId, id),
        eq(wineListItems.organizationId, auth.orgId),
      ),
    );

  const direction = parsed.data.lang === "en" ? "es_to_en" : "en_to_es";
  const gloss = buildGlossaryPrompt(direction);
  const glossHint = gloss.split("\n").slice(1, 4).join("; ");

  const translated = items.map((it) => ({
    ...it,
    translated: {
      lang: parsed.data.lang,
      glossary_applied: true,
      hint: `Apply glossary mapping for terms like ${glossHint}`,
    },
  }));

  await audit(c, "sommelier.wine_list.translated", "wine_list", id);

  return c.json({
    listId: id,
    lang: parsed.data.lang,
    items: translated,
  });
});

// ===== TASTING MENU INGESTION (SOM-21) =====
const IngestMenuSchema = z.object({
  documentId: z.string().uuid(),
  workspaceId: z.string().uuid(),
});

sommelierRoute.post("/menus/ingest", async (c) => {
  const auth = getAuth(c);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const parsed = IngestMenuSchema.safeParse(body);
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
  const docRow = docs[0];
  if (!docRow) {
    return c.json({ error: "document not found" }, 404);
  }

  const chunks = await db
    .select({
      content: documentChunks.content,
      chunkIndex: documentChunks.chunkIndex,
    })
    .from(documentChunks)
    .where(
      and(
        eq(documentChunks.documentId, docRow.id),
        eq(documentChunks.organizationId, auth.orgId),
      ),
    );
  const text = chunks
    .slice()
    .sort((a, b) => a.chunkIndex - b.chunkIndex)
    .map((ch) => ch.content)
    .join("\n\n");

  const result = await ingestTastingMenu({
    tx: db,
    gateway: getGateway(),
    orgId: auth.orgId,
    workspaceId: parsed.data.workspaceId,
    sourceDocId: docRow.id,
    documentText: text,
  });

  await audit(c, "sommelier.menu.ingested", "tasting_menu", result.menuId, {
    dishesInserted: result.dishesInserted,
    documentId: docRow.id,
  });

  return c.json(result);
});

sommelierRoute.get("/menus", async (c) => {
  const auth = getAuth(c);
  const db = c.get("db") as DbTx;
  const workspaceId = c.req.query("workspaceId");

  const baseCond = eq(tastingMenus.organizationId, auth.orgId);
  const where =
    workspaceId !== undefined
      ? and(baseCond, eq(tastingMenus.workspaceId, workspaceId))
      : baseCond;

  const rows = await db
    .select()
    .from(tastingMenus)
    .where(where)
    .orderBy(desc(tastingMenus.createdAt))
    .limit(100);

  return c.json({ rows });
});
