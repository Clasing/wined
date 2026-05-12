import { Worker } from "bullmq";
import IORedis from "ioredis";
import JSZip from "jszip";
import { sql } from "drizzle-orm";
import { eq, and } from "drizzle-orm";
import {
  createDb,
  gdprExportJobs,
  userMemory,
  messageFeedback,
  conversations,
  documents,
} from "@wined/db";
import { createStorage } from "@wined/ingestion";
import { env } from "../env.js";

type ExportJob = {
  exportJobId: string;
  orgId: string;
  userId: string;
  scope: "user" | "workspace" | "organization";
};

export function startGdprExportWorker(): Worker<ExportJob> {
  const connection = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
  });

  return new Worker<ExportJob>(
    "gdpr.export",
    async (job) => {
      const { exportJobId, orgId, userId, scope } = job.data;
      const db = createDb(env.DATABASE_URL);
      const storage = createStorage();

      try {
        await db
          .update(gdprExportJobs)
          .set({ status: "running" })
          .where(eq(gdprExportJobs.id, exportJobId));

        const zip = new JSZip();

        // user_memory.json — the requesting user's memory in this org.
        const memories = await db
          .select()
          .from(userMemory)
          .where(
            and(
              eq(userMemory.userId, userId),
              eq(userMemory.organizationId, orgId),
            ),
          );
        zip.file("user_memory.json", JSON.stringify(memories, null, 2));

        // feedback.json — the requesting user's feedback in this org.
        const feedbacks = await db
          .select()
          .from(messageFeedback)
          .where(
            and(
              eq(messageFeedback.userId, userId),
              eq(messageFeedback.organizationId, orgId),
            ),
          );
        zip.file("feedback.json", JSON.stringify(feedbacks, null, 2));

        // conversations.json — user-owned for user scope, all org for wider scopes.
        const convs =
          scope === "user"
            ? await db
                .select()
                .from(conversations)
                .where(
                  and(
                    eq(conversations.userId, userId),
                    eq(conversations.organizationId, orgId),
                  ),
                )
            : await db
                .select()
                .from(conversations)
                .where(eq(conversations.organizationId, orgId));
        zip.file("conversations.json", JSON.stringify(convs, null, 2));

        // messages.json — joined via conversations; raw SQL keeps it cheap.
        const msgsResult =
          scope === "user"
            ? await db.execute(sql`
                SELECT m.*
                FROM messages m
                JOIN conversations c ON c.id = m.conversation_id
                WHERE c.organization_id = ${orgId}::uuid
                  AND c.user_id = ${userId}::uuid
              `)
            : await db.execute(sql`
                SELECT m.*
                FROM messages m
                JOIN conversations c ON c.id = m.conversation_id
                WHERE c.organization_id = ${orgId}::uuid
              `);
        const msgRows =
          (msgsResult as unknown as { rows?: unknown[] }).rows ?? [];
        zip.file("messages.json", JSON.stringify(msgRows, null, 2));

        // documents.json — only at org scope; metadata only (no payloads).
        if (scope === "organization") {
          const docs = await db
            .select()
            .from(documents)
            .where(eq(documents.organizationId, orgId));
          zip.file("documents.json", JSON.stringify(docs, null, 2));
        }

        zip.file(
          "README.md",
          [
            "# GDPR export",
            "",
            `Generated: ${new Date().toISOString()}`,
            `Scope: ${scope}`,
            `Org: ${orgId}`,
            `User: ${userId}`,
            "",
            `Contains: user_memory.json, feedback.json, conversations.json, messages.json${
              scope === "organization" ? ", documents.json" : ""
            }.`,
            "",
          ].join("\n"),
        );

        const buffer = await zip.generateAsync({ type: "nodebuffer" });

        const key = `gdpr/${orgId}/${exportJobId}.zip`;
        await storage.put(key, buffer, "application/zip");
        const ttlSec = 7 * 86400;
        const url = await storage.signGet(key, ttlSec);

        await db
          .update(gdprExportJobs)
          .set({
            status: "ready",
            zipUrl: url,
            expiresAt: new Date(Date.now() + ttlSec * 1000),
          })
          .where(eq(gdprExportJobs.id, exportJobId));

        return { ok: true, key };
      } catch (err) {
        await db
          .update(gdprExportJobs)
          .set({ status: "failed" })
          .where(eq(gdprExportJobs.id, exportJobId));
        // eslint-disable-next-line no-console
        console.error("[gdpr-export-worker] failed", exportJobId, err);
        throw err;
      }
    },
    { connection },
  );
}
