import { Hono } from "hono";
import { z } from "zod";
import { commercialSheets, horecaClients, type DbTx } from "@wined/db";
import { getAuth } from "@wined/auth";
import { and, desc, eq, ilike } from "drizzle-orm";
import { audit } from "../lib/audit.js";

export const horecaRoute = new Hono();

const CreateSchema = z.object({
  name: z.string().min(1),
  segment: z.string().optional(),
  city: z.string().optional(),
  contactName: z.string().optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  notes: z.string().optional(),
  piiConsent: z.boolean().optional(),
});

const UpdateSchema = CreateSchema.partial();

type HorecaInsert = typeof horecaClients.$inferInsert;

horecaRoute.post("/", async (c) => {
  const auth = getAuth(c);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  }

  // Consent gate when PII is provided.
  if (
    (parsed.data.contactEmail || parsed.data.contactPhone) &&
    !parsed.data.piiConsent
  ) {
    return c.json({ error: "pii_consent_required" }, 400);
  }

  const db = c.get("db") as DbTx;

  const values: HorecaInsert = {
    organizationId: auth.orgId,
    name: parsed.data.name,
  };
  if (parsed.data.segment !== undefined) values.segment = parsed.data.segment;
  if (parsed.data.city !== undefined) values.city = parsed.data.city;
  if (parsed.data.contactEmail !== undefined)
    values.contactEmail = parsed.data.contactEmail;
  if (parsed.data.contactPhone !== undefined)
    values.contactPhone = parsed.data.contactPhone;
  if (parsed.data.notes !== undefined) values.notes = parsed.data.notes;

  const inserted = await db.insert(horecaClients).values(values).returning();
  const row = inserted[0];
  if (!row) return c.json({ error: "insert_failed" }, 500);

  await audit(
    c,
    "distributor.horeca_client.create",
    "horeca_client",
    row.id,
    { name: parsed.data.name },
  );
  return c.json(row, 201);
});

horecaRoute.get("/", async (c) => {
  const auth = getAuth(c);
  const db = c.get("db") as DbTx;

  const limitRaw = Number(c.req.query("limit") ?? 100);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 100;
  const q = c.req.query("q");

  const conditions = [eq(horecaClients.organizationId, auth.orgId)];
  if (q) conditions.push(ilike(horecaClients.name, `%${q}%`));

  const rows = await db
    .select()
    .from(horecaClients)
    .where(and(...conditions))
    .orderBy(desc(horecaClients.createdAt))
    .limit(limit);

  return c.json({ rows });
});

horecaRoute.get("/:id", async (c) => {
  const auth = getAuth(c);
  const id = c.req.param("id");
  const db = c.get("db") as DbTx;

  const found = await db
    .select()
    .from(horecaClients)
    .where(
      and(eq(horecaClients.id, id), eq(horecaClients.organizationId, auth.orgId)),
    );
  const client = found[0];
  if (!client) return c.json({ error: "not_found" }, 404);

  const sheets = await db
    .select()
    .from(commercialSheets)
    .where(
      and(
        eq(commercialSheets.horecaClientId, id),
        eq(commercialSheets.organizationId, auth.orgId),
      ),
    )
    .orderBy(desc(commercialSheets.createdAt))
    .limit(20);

  return c.json({ client, recentSheets: sheets });
});

horecaRoute.patch("/:id", async (c) => {
  const auth = getAuth(c);
  const id = c.req.param("id");

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  }

  const db = c.get("db") as DbTx;
  const values: Partial<HorecaInsert> = {};
  if (parsed.data.name !== undefined) values.name = parsed.data.name;
  if (parsed.data.segment !== undefined) values.segment = parsed.data.segment;
  if (parsed.data.city !== undefined) values.city = parsed.data.city;
  if (parsed.data.contactEmail !== undefined)
    values.contactEmail = parsed.data.contactEmail;
  if (parsed.data.contactPhone !== undefined)
    values.contactPhone = parsed.data.contactPhone;
  if (parsed.data.notes !== undefined) values.notes = parsed.data.notes;

  if (Object.keys(values).length === 0) {
    return c.json({ error: "no_fields_to_update" }, 400);
  }

  const updated = await db
    .update(horecaClients)
    .set(values)
    .where(
      and(eq(horecaClients.id, id), eq(horecaClients.organizationId, auth.orgId)),
    )
    .returning();
  const row = updated[0];
  if (!row) return c.json({ error: "not_found" }, 404);

  await audit(c, "distributor.horeca_client.update", "horeca_client", id);
  return c.json(row);
});

horecaRoute.delete("/:id", async (c) => {
  const auth = getAuth(c);
  const id = c.req.param("id");
  const db = c.get("db") as DbTx;

  const deleted = await db
    .delete(horecaClients)
    .where(
      and(eq(horecaClients.id, id), eq(horecaClients.organizationId, auth.orgId)),
    )
    .returning();
  if (deleted.length === 0) return c.json({ error: "not_found" }, 404);

  await audit(c, "distributor.horeca_client.delete", "horeca_client", id);
  return c.body(null, 204);
});
