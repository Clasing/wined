import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { organizations, type DbTx } from "@wined/db";
import { getAuth } from "@wined/auth";
import { audit } from "../lib/audit.js";

export const orgSettingsRoute = new Hono();

const UpdateSettingsSchema = z.object({
  kbPreference: z
    .enum(["private_first", "global_first", "show_both"])
    .optional(),
});

// GET /v1/org/settings — read current organization settings.
orgSettingsRoute.get("/", async (c) => {
  const auth = getAuth(c);
  const db = c.get("db") as DbTx;

  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      kbPreference: organizations.kbPreference,
    })
    .from(organizations)
    .where(eq(organizations.id, auth.orgId))
    .limit(1);

  const org = rows[0];
  if (!org) return c.json({ error: "not_found" }, 404);
  return c.json(org);
});

// PATCH /v1/org/settings — admin-only update of organization settings.
orgSettingsRoute.patch("/", async (c) => {
  const auth = getAuth(c);
  if (auth.role !== "admin") return c.json({ error: "forbidden" }, 403);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const parsed = UpdateSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_body", issues: parsed.error.issues },
      400,
    );
  }

  const db = c.get("db") as DbTx;
  const values: { kbPreference?: "private_first" | "global_first" | "show_both" } =
    {};
  if (parsed.data.kbPreference) values.kbPreference = parsed.data.kbPreference;

  if (Object.keys(values).length === 0) {
    return c.json({ error: "no_updatable_fields" }, 400);
  }

  const updated = await db
    .update(organizations)
    .set(values)
    .where(eq(organizations.id, auth.orgId))
    .returning({
      id: organizations.id,
      name: organizations.name,
      kbPreference: organizations.kbPreference,
    });

  const row = updated[0];
  if (!row) return c.json({ error: "not_found" }, 404);

  await audit(c, "org.settings.update", "organization", auth.orgId, parsed.data);
  return c.json(row);
});
