import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import {
  messageFeedback,
  messages,
  corpusConflicts,
  type DbTx,
} from "@wined/db";
import { getAuth } from "@wined/auth";
import { track, ANALYTICS_EVENTS } from "@wined/analytics";
import { audit } from "../lib/audit.js";

export const feedbackRoute = new Hono();

const FeedbackSchema = z.object({
  rating: z.union([z.literal(1), z.literal(-1)]),
  reason: z.string().optional(),
  comment: z.string().optional(),
});

// POST /v1/messages/:id/feedback — submit thumbs up/down for an assistant message
feedbackRoute.post("/messages/:id/feedback", async (c) => {
  const auth = getAuth(c);
  const messageId = c.req.param("id");

  const body = await c.req.json().catch(() => ({}));
  const parsed = FeedbackSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_body", issues: parsed.error.issues },
      400,
    );
  }

  const db = c.get("db") as DbTx;

  const [row] = await db
    .insert(messageFeedback)
    .values({
      messageId,
      userId: auth.userId,
      organizationId: auth.orgId,
      rating: parsed.data.rating,
      reason: parsed.data.reason ?? null,
      comment: parsed.data.comment ?? null,
    })
    .returning();

  await audit(c, "feedback.create", "message", messageId, {
    rating: parsed.data.rating,
    reason: parsed.data.reason,
  });

  await track({
    event: ANALYTICS_EVENTS.FEEDBACK_GIVEN,
    orgId: auth.orgId,
    userId: auth.userId,
    properties: {
      message_id: messageId,
      rating: parsed.data.rating,
      reason: parsed.data.reason ?? null,
    },
  });

  // Hallucination loop: when user reports a hallucination on a 👎,
  // create a corpus_conflicts entry for admin review.
  if (parsed.data.rating === -1 && parsed.data.reason === "hallucination") {
    const [msg] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);

    if (msg) {
      const rawContent =
        typeof msg.content === "string"
          ? msg.content
          : JSON.stringify(msg.content ?? "");
      const snippet = rawContent.slice(0, 500);
      const userComment = parsed.data.comment ?? "";
      const resolutionText =
        `User reported hallucination. Message content: ${snippet}. ` +
        `Reason: ${parsed.data.reason}` +
        (userComment ? `. Comment: ${userComment.slice(0, 500)}` : "");

      await db.insert(corpusConflicts).values({
        detectedBy: "user_feedback",
        sourceAId: messageId,
        sourceBId: null,
        topic: "hallucination_reported",
        resolution: resolutionText,
        resolutionTier: "regulation",
        status: "open",
      });
    }

    await track({
      event: "hallucination.reported",
      orgId: auth.orgId,
      userId: auth.userId,
      properties: {
        message_id: messageId,
        reason: parsed.data.reason,
      },
    });
  }

  return c.json(row, 201);
});

// GET /v1/admin/feedback/stats — aggregate stats (admin)
feedbackRoute.get("/admin/feedback/stats", async (c) => {
  const auth = getAuth(c);
  if (auth.role !== "admin") return c.json({ error: "forbidden" }, 403);

  const db = c.get("db") as DbTx;
  const daysRaw = Number(c.req.query("days") ?? 30);
  const days = Number.isFinite(daysRaw) && daysRaw > 0 ? daysRaw : 30;
  const since = new Date(Date.now() - days * 86400 * 1000);

  const stats = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE rating = 1) AS thumbs_up,
      COUNT(*) FILTER (WHERE rating = -1) AS thumbs_down,
      COUNT(*) AS total,
      ROUND(100.0 * COUNT(*) FILTER (WHERE rating = 1) / NULLIF(COUNT(*), 0), 1) AS approval_rate_pct
    FROM message_feedback
    WHERE organization_id = ${auth.orgId}::uuid AND created_at >= ${since}
  `);

  const recentNegatives = await db
    .select()
    .from(messageFeedback)
    .where(
      and(
        eq(messageFeedback.organizationId, auth.orgId),
        eq(messageFeedback.rating, -1),
        gte(messageFeedback.createdAt, since),
      ),
    )
    .orderBy(desc(messageFeedback.createdAt))
    .limit(50);

  const rows = (stats as unknown as { rows?: unknown[] }).rows ?? [];
  return c.json({
    period_days: days,
    stats:
      rows[0] ?? {
        thumbs_up: 0,
        thumbs_down: 0,
        total: 0,
        approval_rate_pct: null,
      },
    recent_negatives: recentNegatives,
  });
});

// GET /v1/admin/feedback — paginated list (admin)
feedbackRoute.get("/admin/feedback", async (c) => {
  const auth = getAuth(c);
  if (auth.role !== "admin") return c.json({ error: "forbidden" }, 403);

  const db = c.get("db") as DbTx;
  const limitRaw = Number(c.req.query("limit") ?? 100);
  const limit = Math.min(
    Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 100,
    500,
  );
  const ratingFilter = c.req.query("rating");

  const conditions = [eq(messageFeedback.organizationId, auth.orgId)];
  if (ratingFilter === "1") conditions.push(eq(messageFeedback.rating, 1));
  if (ratingFilter === "-1") conditions.push(eq(messageFeedback.rating, -1));

  const rows = await db
    .select()
    .from(messageFeedback)
    .where(and(...conditions))
    .orderBy(desc(messageFeedback.createdAt))
    .limit(limit);

  return c.json({ rows });
});
