import type { AgentContext } from "./agent.js";

/**
 * Load active user memory entries for the current user/org and format them as
 * a markdown section suitable for injection into an agent system prompt.
 *
 * Returns an empty string when no active memory exists, so callers can safely
 * concatenate without producing trailing whitespace.
 */
export async function loadActiveUserMemory(
  ctx: Pick<AgentContext, "organizationId" | "userId">,
  limit = 20,
): Promise<string> {
  const dbUrl = process.env["DATABASE_URL"];
  if (!dbUrl) return "";

  const { createDb, userMemory } = await import("@wined/db");
  const { and, desc, eq } = await import("drizzle-orm");

  const db = createDb(dbUrl);
  const rows = await db
    .select({ kind: userMemory.kind, content: userMemory.content })
    .from(userMemory)
    .where(
      and(
        eq(userMemory.userId, ctx.userId),
        eq(userMemory.organizationId, ctx.organizationId),
        eq(userMemory.isActive, true),
      ),
    )
    .orderBy(desc(userMemory.createdAt))
    .limit(limit);

  if (rows.length === 0) return "";

  return [
    "## User memory (active, persisted across sessions)",
    ...rows.map((r) => `- [${r.kind}] ${r.content}`),
  ].join("\n");
}

/**
 * Append a memory section to a system prompt. Safe with empty input.
 */
export function injectUserMemory(
  systemPrompt: string,
  memorySection: string,
): string {
  if (!memorySection) return systemPrompt;
  return `${systemPrompt}\n\n${memorySection}`;
}
