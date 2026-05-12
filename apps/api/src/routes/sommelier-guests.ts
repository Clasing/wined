import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { guestOrders, restaurantGuests, type DbTx } from "@wined/db";
import { getAuth } from "@wined/auth";
import { audit } from "../lib/audit.js";

export const guestsRoute = new Hono();

const CreateGuestSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  preferences: z.record(z.unknown()).optional(),
  aversions: z.array(z.string()).optional(),
  allergies: z.array(z.string()).optional(),
  piiConsent: z.boolean(),
});

async function sha256(value: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(value).digest("hex");
}

guestsRoute.post("/", async (c) => {
  const auth = getAuth(c);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = CreateGuestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  }
  const data = parsed.data;

  if (!data.piiConsent && (data.email || data.phone)) {
    return c.json({ error: "pii_consent_required" }, 400);
  }

  const db = c.get("db") as DbTx;
  const emailHash = data.email ? await sha256(data.email) : null;

  const inserted = await db
    .insert(restaurantGuests)
    .values({
      organizationId: auth.orgId,
      workspaceId: data.workspaceId ?? null,
      displayName: data.name,
      emailHash,
      piiConsent: data.piiConsent,
      consentAt: data.piiConsent ? new Date() : null,
      consentUserId: data.piiConsent ? auth.userId : null,
      preferences: data.preferences ?? {},
      aversions: data.aversions ?? [],
      allergies: data.allergies ?? [],
    })
    .returning();
  const row = inserted[0];
  if (!row) {
    return c.json({ error: "insert_failed" }, 500);
  }

  await audit(c, "sommelier.guest.create", "restaurant_guest", row.id, {
    piiConsent: data.piiConsent,
  });
  return c.json(row, 201);
});

guestsRoute.get("/", async (c) => {
  const auth = getAuth(c);
  const db = c.get("db") as DbTx;
  const workspaceId = c.req.query("workspaceId");

  const baseCond = eq(restaurantGuests.organizationId, auth.orgId);
  const where =
    workspaceId !== undefined
      ? and(baseCond, eq(restaurantGuests.workspaceId, workspaceId))
      : baseCond;

  const rows = await db
    .select()
    .from(restaurantGuests)
    .where(where)
    .orderBy(desc(restaurantGuests.createdAt))
    .limit(200);

  return c.json({ rows });
});

guestsRoute.get("/:id", async (c) => {
  const auth = getAuth(c);
  const id = c.req.param("id");
  const db = c.get("db") as DbTx;

  const guests = await db
    .select()
    .from(restaurantGuests)
    .where(
      and(
        eq(restaurantGuests.id, id),
        eq(restaurantGuests.organizationId, auth.orgId),
      ),
    );
  const guest = guests[0];
  if (!guest) {
    return c.json({ error: "not_found" }, 404);
  }

  const orders = await db
    .select()
    .from(guestOrders)
    .where(eq(guestOrders.guestId, id))
    .orderBy(desc(guestOrders.orderedAt))
    .limit(20);

  return c.json({ guest, recentOrders: orders });
});

const UpdateGuestSchema = z.object({
  name: z.string().min(1).optional(),
  preferences: z.record(z.unknown()).optional(),
  aversions: z.array(z.string()).optional(),
  allergies: z.array(z.string()).optional(),
});

guestsRoute.patch("/:id", async (c) => {
  const auth = getAuth(c);
  const id = c.req.param("id");

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = UpdateGuestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  }
  const data = parsed.data;

  const db = c.get("db") as DbTx;
  const update: Record<string, unknown> = {};
  if (data.name !== undefined) update["displayName"] = data.name;
  if (data.preferences !== undefined) update["preferences"] = data.preferences;
  if (data.aversions !== undefined) update["aversions"] = data.aversions;
  if (data.allergies !== undefined) update["allergies"] = data.allergies;

  if (Object.keys(update).length === 0) {
    return c.json({ error: "empty_update" }, 400);
  }

  const updated = await db
    .update(restaurantGuests)
    .set(update)
    .where(
      and(
        eq(restaurantGuests.id, id),
        eq(restaurantGuests.organizationId, auth.orgId),
      ),
    )
    .returning();
  const row = updated[0];
  if (!row) {
    return c.json({ error: "not_found" }, 404);
  }

  await audit(c, "sommelier.guest.update", "restaurant_guest", id);
  return c.json(row);
});

const CreateOrderSchema = z.object({
  guestId: z.string().uuid(),
  listItemId: z.string().uuid().optional(),
  orderedAt: z.string().datetime().optional(),
  liked: z.boolean().optional(),
  notes: z.string().optional(),
});

guestsRoute.post("/orders", async (c) => {
  const auth = getAuth(c);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = CreateOrderSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  }
  const data = parsed.data;

  const db = c.get("db") as DbTx;

  // Verify guest belongs to org
  const guests = await db
    .select({ id: restaurantGuests.id })
    .from(restaurantGuests)
    .where(
      and(
        eq(restaurantGuests.id, data.guestId),
        eq(restaurantGuests.organizationId, auth.orgId),
      ),
    );
  if (!guests[0]) {
    return c.json({ error: "guest_not_found" }, 404);
  }

  const inserted = await db
    .insert(guestOrders)
    .values({
      organizationId: auth.orgId,
      guestId: data.guestId,
      listItemId: data.listItemId ?? null,
      orderedAt: data.orderedAt ? new Date(data.orderedAt) : new Date(),
      liked: data.liked ?? null,
      notes: data.notes ?? null,
    })
    .returning();
  const row = inserted[0];
  if (!row) {
    return c.json({ error: "insert_failed" }, 500);
  }

  await audit(c, "sommelier.guest_order.create", "guest_order", row.id);
  return c.json(row, 201);
});
