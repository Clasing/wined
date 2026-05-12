import { Hono } from "hono";
import { z } from "zod";
import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import { conversations, messages, type DbTx } from "@wined/db";
import { getAuth } from "@wined/auth";

export const conversationsRoute = new Hono();

const SearchSchema = z.object({
  q: z.string().min(1),
  limit: z.coerce.number().min(1).max(100).optional(),
  lang: z.enum(["es", "en"]).optional(),
});

// GET /v1/conversations/search?q=...&lang=es&limit=30
// NUC-11: NL2query full-text search over chat history (org-scoped).
conversationsRoute.get("/search", async (c) => {
  const auth = getAuth(c);
  const parsed = SearchSchema.safeParse(
    Object.fromEntries(new URL(c.req.url).searchParams),
  );
  if (!parsed.success) {
    return c.json(
      { error: "invalid_query", issues: parsed.error.issues },
      400,
    );
  }

  const db = c.get("db") as DbTx;
  const limit = parsed.data.limit ?? 30;
  const lang: "es" | "en" =
    parsed.data.lang ??
    (auth.outputLanguage === "en" ? "en" : "es");
  const config = lang === "en" ? "english" : "spanish";
  const configSql = sql.raw(`'${config}'`);

  const result = await db.execute(sql`
    SELECT
      m.id           AS message_id,
      m.conversation_id,
      m.role,
      m.content,
      m.created_at,
      m.citations,
      c.pod          AS pod,
      c.created_at   AS started_at,
      ts_rank(
        to_tsvector(${configSql}, COALESCE(m.content::text, '')),
        plainto_tsquery(${configSql}, ${parsed.data.q})
      ) AS rank
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE c.organization_id = ${auth.orgId}::uuid
      AND to_tsvector(${configSql}, COALESCE(m.content::text, ''))
          @@ plainto_tsquery(${configSql}, ${parsed.data.q})
    ORDER BY rank DESC, m.created_at DESC
    LIMIT ${limit}
  `);

  const rows =
    (result as unknown as { rows?: unknown[] }).rows ??
    (result as unknown as unknown[]);
  return c.json({ query: parsed.data.q, lang, rows });
});

// GET /v1/conversations — list current user's conversations in org
conversationsRoute.get("/", async (c) => {
  const auth = getAuth(c);
  const db = c.get("db") as DbTx;
  const limitRaw = Number(c.req.query("limit") ?? 50);
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(limitRaw, 200)
      : 50;

  const rows = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.organizationId, auth.orgId),
        eq(conversations.userId, auth.userId),
      ) as SQL,
    )
    .orderBy(desc(conversations.createdAt))
    .limit(limit);

  return c.json({ rows });
});

// GET /v1/conversations/:id/messages — messages for a single conversation
conversationsRoute.get("/:id/messages", async (c) => {
  const auth = getAuth(c);
  const id = c.req.param("id");
  const db = c.get("db") as DbTx;

  const [conv] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.id, id),
        eq(conversations.organizationId, auth.orgId),
      ) as SQL,
    )
    .limit(1);

  if (!conv) return c.json({ error: "not_found" }, 404);

  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(asc(messages.createdAt));

  return c.json({ conversation: conv, messages: rows });
});
