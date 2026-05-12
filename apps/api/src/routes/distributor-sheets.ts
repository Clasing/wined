import { Hono } from "hono";
import { z } from "zod";
import { commercialSheets, type DbTx } from "@wined/db";
import { getAuth } from "@wined/auth";
import {
  renderCommercialSheet,
  type CommercialSheetData,
} from "@wined/pdf-export";
import { createStorage } from "@wined/ingestion";
import { audit } from "../lib/audit.js";

export const distributorSheetsRoute = new Hono();

const InputSchema = z.object({
  catalogItemId: z.string().uuid().optional(),
  globalWineId: z.string().uuid().optional(),
  horecaClientId: z.string().uuid().optional(),
  payload: z.record(z.unknown()),
});

distributorSheetsRoute.post("/", async (c) => {
  const auth = getAuth(c);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const parsed = InputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  }

  const db = c.get("db") as DbTx;
  const storage = createStorage();

  const pdfBuffer = await renderCommercialSheet(
    parsed.data.payload as unknown as CommercialSheetData,
  );

  const key = `tenants/${auth.orgId}/sheets/${Date.now()}.pdf`;
  await storage.put(key, pdfBuffer, "application/pdf");
  const pdfUrl = await storage.signGet(key, 7 * 86400);

  const inserted = await db
    .insert(commercialSheets)
    .values({
      organizationId: auth.orgId,
      catalogItemId: parsed.data.catalogItemId ?? null,
      horecaClientId: parsed.data.horecaClientId ?? null,
      generatedBy: auth.userId,
      content: parsed.data.payload,
      pdfStorageUrl: key,
    })
    .returning();

  const row = inserted[0];
  if (!row) {
    return c.json({ error: "insert_failed" }, 500);
  }

  await audit(c, "distributor.commercial_sheet.create", "commercial_sheet", row.id);

  return c.json({ id: row.id, pdfUrl });
});
