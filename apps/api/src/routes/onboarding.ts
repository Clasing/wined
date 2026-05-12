import { Hono } from "hono";
import { z } from "zod";
import { eq, type SQL } from "drizzle-orm";
import { organizations, type DbTx } from "@wined/db";
import { getAuth } from "@wined/auth";
import { track, ANALYTICS_EVENTS } from "@wined/analytics";
import { audit } from "../lib/audit.js";

export const onboardingRoute = new Hono();

// Sommelier wizard 7 steps (SPEC §7.1)
const SOMMELIER_STEPS = [
  "signup_vertical",
  "business_type",
  "upload_wine_list",
  "review_extraction",
  "config_quick",
  "first_chat",
  "invite_team",
] as const;

// Cellar wizard 7 steps (SPEC §7.2)
const CELLAR_STEPS = [
  "signup_vertical",
  "business_type",
  "do_region",
  "create_demo_lot",
  "upload_doc_optional",
  "first_technical_question",
  "config_calendar",
] as const;

// Distributor wizard 6 steps (SPEC §7.3)
const DISTRIBUTOR_STEPS = [
  "signup_vertical",
  "upload_catalog",
  "map_columns",
  "try_nl_search",
  "gen_demo_sheet",
  "invite_sales_team",
] as const;

const PRODUCT_STEPS = {
  sommelier: SOMMELIER_STEPS,
  cellar: CELLAR_STEPS,
  distributor: DISTRIBUTOR_STEPS,
} as const;

const ProductEnum = z.enum(["sommelier", "cellar", "distributor"]);

const StepEventSchema = z.object({
  product: ProductEnum,
  step: z.string().min(1).max(64),
  data: z.record(z.unknown()).optional(),
});

// GET /v1/onboarding/state
onboardingRoute.get("/state", async (c) => {
  const auth = getAuth(c);
  const db = c.get("db") as DbTx;
  const [org] = await db
    .select({
      onboardingState: organizations.onboardingState,
      onboardingStartedAt: organizations.onboardingStartedAt,
      onboardingCompletedAt: organizations.onboardingCompletedAt,
      product: organizations.product,
    })
    .from(organizations)
    .where(eq(organizations.id, auth.orgId) as SQL)
    .limit(1);

  const product = (org?.product ?? auth.product) as keyof typeof PRODUCT_STEPS;
  const steps = PRODUCT_STEPS[product] ?? SOMMELIER_STEPS;

  return c.json({
    product,
    steps,
    state: org?.onboardingState ?? {},
    startedAt: org?.onboardingStartedAt ?? null,
    completedAt: org?.onboardingCompletedAt ?? null,
  });
});

// POST /v1/onboarding/step
onboardingRoute.post("/step", async (c) => {
  const auth = getAuth(c);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = StepEventSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  }

  // Validate step belongs to product wizard
  const allowed = PRODUCT_STEPS[parsed.data.product] as readonly string[];
  if (!allowed.includes(parsed.data.step)) {
    return c.json({ error: "unknown_step" }, 400);
  }

  const db = c.get("db") as DbTx;
  const [org] = await db
    .select({
      onboardingState: organizations.onboardingState,
      onboardingStartedAt: organizations.onboardingStartedAt,
    })
    .from(organizations)
    .where(eq(organizations.id, auth.orgId) as SQL)
    .limit(1);

  const currentState =
    ((org?.onboardingState as Record<string, unknown>) ?? {}) as Record<
      string,
      unknown
    >;
  const stepKey = `${parsed.data.product}.${parsed.data.step}`;
  currentState[stepKey] = {
    completed_at: new Date().toISOString(),
    data: parsed.data.data ?? {},
  };

  const isFirstStep = !org?.onboardingStartedAt;
  const patch: {
    onboardingState: Record<string, unknown>;
    onboardingStartedAt?: Date;
    updatedAt: Date;
  } = {
    onboardingState: currentState,
    updatedAt: new Date(),
  };
  if (isFirstStep) patch.onboardingStartedAt = new Date();

  await db
    .update(organizations)
    .set(patch)
    .where(eq(organizations.id, auth.orgId) as SQL);

  if (isFirstStep) {
    await track({
      event: ANALYTICS_EVENTS.ONBOARDING_STARTED,
      orgId: auth.orgId,
      userId: auth.userId,
      properties: { product: parsed.data.product },
    });
  }

  await track({
    event: ANALYTICS_EVENTS.ONBOARDING_STEP_COMPLETED,
    orgId: auth.orgId,
    userId: auth.userId,
    properties: {
      product: parsed.data.product,
      step_name: parsed.data.step,
    },
  });
  await audit(c, "onboarding.step_completed", "organization", auth.orgId, {
    step: stepKey,
  });

  return c.json({ ok: true, step: stepKey });
});

// POST /v1/onboarding/complete
onboardingRoute.post("/complete", async (c) => {
  const auth = getAuth(c);
  const db = c.get("db") as DbTx;
  await db
    .update(organizations)
    .set({ onboardingCompletedAt: new Date(), updatedAt: new Date() })
    .where(eq(organizations.id, auth.orgId) as SQL);

  await track({
    event: ANALYTICS_EVENTS.ONBOARDING_COMPLETED,
    orgId: auth.orgId,
    userId: auth.userId,
  });
  await audit(c, "onboarding.completed", "organization", auth.orgId);
  return c.json({ ok: true });
});
