import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { organizations, type DbTx } from "@wined/db";
import { getAuth } from "@wined/auth";
import { audit } from "../lib/audit.js";

export const signupVerticalRoute = new Hono();

const Schema = z.object({
  product: z.enum(["sommelier", "cellar", "distributor", "both"]),
});

type Product = z.infer<typeof Schema>["product"];

const redirectMap: Record<Product, string> = {
  sommelier: "/sommelier",
  cellar: "/cellar",
  distributor: "/distributor",
  both: "/sommelier",
};

signupVerticalRoute.post("/select-vertical", async (c) => {
  const auth = getAuth(c);
  if (auth.role !== "admin") {
    return c.json({ error: "forbidden" }, 403);
  }

  const parsed = Schema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(
      { error: "invalid_body", issues: parsed.error.issues },
      400,
    );
  }

  const db = c.get("db") as DbTx;
  await db
    .update(organizations)
    .set({ product: parsed.data.product })
    .where(eq(organizations.id, auth.orgId));

  await audit(c, "org.product.selected", "organization", auth.orgId, {
    product: parsed.data.product,
  });

  return c.json({
    ok: true,
    product: parsed.data.product,
    redirectTo: redirectMap[parsed.data.product],
  });
});
