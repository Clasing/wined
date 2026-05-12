import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { getAuth } from "@wined/auth";
import { LLMGateway, type ModelName } from "@wined/llm-gateway";
import {
  anomalyAgent,
  catalogNlAgent,
  classifyIntent,
  compareVintagesAgent,
  complianceAgent,
  enologyAgent,
  guestMemoryAgent,
  injectUserMemory,
  inventoryAgent,
  loadActiveUserMemory,
  pairingAgent,
  pairingAgentServiceMode,
  redirectMessageFor,
} from "@wined/agents";
import type { AgentDef } from "@wined/agents";
import { track, ANALYTICS_EVENTS } from "@wined/analytics";
import { env } from "../env.js";
import {
  checkDisclaimer,
  disclaimerMessage,
} from "../middleware/disclaimer-helper.js";

export const chatRoute = new Hono();

const ChatSchema = z.object({
  message: z.string().min(1),
  conversationId: z.string().uuid().optional(),
  workspaceId: z.string().uuid().optional(),
  agent: z
    .enum([
      "pairing",
      "catalog-nl",
      "guest-memory",
      "enology",
      "compliance",
      "anomaly",
      "inventory",
      "compare-vintages",
    ])
    .default("pairing"),
  serviceMode: z.boolean().optional(),
});

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

const AGENT_MAP: Record<
  | "pairing"
  | "catalog-nl"
  | "guest-memory"
  | "enology"
  | "compliance"
  | "anomaly"
  | "inventory"
  | "compare-vintages",
  AgentDef
> = {
  pairing: pairingAgent,
  "catalog-nl": catalogNlAgent,
  "guest-memory": guestMemoryAgent,
  enology: enologyAgent,
  compliance: complianceAgent,
  anomaly: anomalyAgent,
  inventory: inventoryAgent,
  "compare-vintages": compareVintagesAgent,
};

function resolveModel(model: AgentDef["model"]): ModelName {
  if (model === "sonnet") return "claude-sonnet-4";
  if (model === "opus") return "claude-opus-4";
  return "claude-haiku-4";
}

chatRoute.post("/", async (c) => {
  const auth = getAuth(c);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = ChatSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  }
  const {
    message,
    agent: agentName,
    conversationId,
    serviceMode,
  } = parsed.data;

  // Guardrails (Step 78): block medical/legal/financial/comparative-subjective intents
  const guardrail = await classifyIntent(getGateway(), message, auth.orgId);
  if (guardrail.shouldBlock) {
    const lang: "es" | "en" = auth.outputLanguage === "en" ? "en" : "es";
    const redirect = redirectMessageFor(guardrail.intent, lang) ?? "";
    await track({
      event: ANALYTICS_EVENTS.CHAT_GUARDRAIL_BLOCKED,
      orgId: auth.orgId,
      userId: auth.userId,
      properties: { agent: agentName, intent: guardrail.intent },
    });
    return streamSSE(c, async (stream) => {
      await stream.writeSSE({ data: redirect });
      await stream.writeSSE({
        event: "meta",
        data: JSON.stringify({ done: true, guardrail: guardrail.intent }),
      });
    });
  }

  const disclaimer = await checkDisclaimer({
    dbUrl: env.DATABASE_URL,
    ...(conversationId !== undefined ? { conversationId } : {}),
  });
  const disclaimerLang: "es" | "en" =
    auth.outputLanguage === "en" ? "en" : "es";

  const def =
    serviceMode === true && agentName === "pairing"
      ? pairingAgentServiceMode
      : AGENT_MAP[agentName];

  // Persist service_mode on the conversation when requested
  if (conversationId && serviceMode !== undefined) {
    try {
      const { createDb, conversations } = await import("@wined/db");
      const { eq } = await import("drizzle-orm");
      const db = createDb(env.DATABASE_URL);
      await db
        .update(conversations)
        .set({ serviceMode })
        .where(eq(conversations.id, conversationId));
    } catch {
      // best-effort; never block chat on persistence failure
    }
  }

  const baseSystemPrompt = def.systemPrompt.replace(
    "{{outputLanguage}}",
    auth.outputLanguage,
  );

  const memorySection = await loadActiveUserMemory({
    organizationId: auth.orgId,
    userId: auth.userId,
  });
  const systemPrompt = injectUserMemory(baseSystemPrompt, memorySection);

  return streamSSE(c, async (stream) => {
    if (disclaimer.show) {
      await stream.writeSSE({
        event: "disclaimer",
        data: disclaimerMessage(disclaimerLang),
      });
      await disclaimer.mark();
    }

    await track({
      event: ANALYTICS_EVENTS.CHAT_MESSAGE_SENT,
      orgId: auth.orgId,
      userId: auth.userId,
      properties: {
        agent: agentName,
        model: def.model,
        technical: def.technical ?? false,
      },
    });

    const result = await getGateway().generate({
      model: resolveModel(def.model),
      system: systemPrompt,
      messages: [{ role: "user", content: message }],
      tenantId: auth.orgId,
      agentName: def.name,
      ...(def.technical !== undefined ? { technical: def.technical } : {}),
      maxTokens: def.maxTokens ?? 1024,
      temperature: def.temperature ?? 0.3,
      semanticCacheKey: `${def.name}:${message}`,
    });

    // Chunked emit (mock streaming until provider streaming is wired).
    const chunks = result.content.match(/.{1,80}/gs) ?? [result.content];
    for (const chunk of chunks) {
      await stream.writeSSE({ data: chunk });
    }
    await stream.writeSSE({
      event: "meta",
      data: JSON.stringify({
        done: true,
        citations: result.citations,
        cacheHit: result.cacheHit,
        abstained: result.abstained ?? false,
      }),
    });

    const abstained = result.abstained ?? false;
    await track({
      event: abstained
        ? ANALYTICS_EVENTS.CHAT_ABSTAINED
        : ANALYTICS_EVENTS.CHAT_MESSAGE_RECEIVED,
      orgId: auth.orgId,
      userId: auth.userId,
      properties: {
        agent: agentName,
        model: def.model,
        cache_hit: result.cacheHit ?? false,
        citations_count: Array.isArray(result.citations)
          ? result.citations.length
          : 0,
      },
    });
    if (result.cacheHit) {
      await track({
        event: ANALYTICS_EVENTS.CHAT_CACHE_HIT,
        orgId: auth.orgId,
        userId: auth.userId,
        properties: { agent: agentName },
      });
    }

    // Step 62 (CEL-23): persist agent_invocation for technical agents so the
    // "show your work" panel can surface chunks, tools, latency and trace id.
    if (def.technical) {
      try {
        const { createDb, agentInvocations } = await import("@wined/db");
        const db = createDb(env.DATABASE_URL);
        const citations = Array.isArray(result.citations) ? result.citations : [];
        await db.insert(agentInvocations).values({
          organizationId: auth.orgId,
          conversationId: conversationId ?? null,
          messageId: null,
          agentName: def.name,
          toolName: null,
          input: { message },
          output: {
            model: def.model,
            tokensIn: result.tokensIn,
            tokensOut: result.tokensOut,
            cacheHit: result.cacheHit,
            abstained: result.abstained ?? false,
          },
          status: abstained ? "abstained" : "ok",
          latencyMs: result.latencyMs,
          retrievedChunks: citations.map((id) => ({ id, status: "used" })),
          langfuseTraceId: result.traceId ?? null,
        });
      } catch (err) {
        console.error("[chat] agent_invocation insert failed", err);
      }
    }
  });
});
