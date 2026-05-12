import type { MiddlewareHandler } from "hono";
import { and, eq } from "drizzle-orm";
import { memberships, organizations, users, type DbClient } from "@wined/db";
import { verifyToken } from "./clerk-server.js";
import type {
  AuthCtx,
  AuthKbPreference,
  AuthOutputLanguage,
  AuthProduct,
  AuthRole,
} from "./types.js";

type DbRole = "owner" | "admin" | "member" | "viewer" | "external";

function mapRole(dbRole: DbRole): AuthRole {
  switch (dbRole) {
    case "owner":
    case "admin":
      return "admin";
    case "member":
      return "editor";
    case "viewer":
    case "external":
    default:
      return "viewer";
  }
}

function resolveLanguage(
  acceptLanguage: string | undefined,
  cookieLang: string | undefined,
  orgDefault: string,
): AuthOutputLanguage {
  const candidates = [cookieLang, acceptLanguage?.split(",")[0]?.split("-")[0], orgDefault];
  for (const c of candidates) {
    if (c === "es" || c === "en") return c;
  }
  return "es";
}

function parseCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  const parts = header.split(";").map((p) => p.trim());
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx);
    if (k === name) return decodeURIComponent(part.slice(idx + 1));
  }
  return undefined;
}

export type ClerkAuthOptions = {
  db: DbClient;
};

/**
 * Hono middleware that:
 *  - validates the `Authorization: Bearer <jwt>` header against Clerk
 *  - resolves internal organization + user rows
 *  - resolves the membership role
 *  - resolves output language (cookie > Accept-Language > org default > "es")
 *  - exposes the resulting `AuthCtx` via `c.set("auth", ...)`
 *
 * Responses:
 *  - 401 if token missing or invalid
 *  - 403 if org unknown or user not a member of the org
 */
export function clerkAuth(options: ClerkAuthOptions): MiddlewareHandler {
  const { db } = options;
  return async (c, next) => {
    const authHeader = c.req.header("Authorization") ?? c.req.header("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json({ error: "missing_bearer_token" }, 401);
    }
    const token = authHeader.slice("Bearer ".length).trim();
    if (!token) {
      return c.json({ error: "missing_bearer_token" }, 401);
    }

    let payload: Awaited<ReturnType<typeof verifyToken>>;
    try {
      payload = await verifyToken(token);
    } catch {
      return c.json({ error: "invalid_token" }, 401);
    }

    const clerkUserId = (payload as { sub?: unknown }).sub;
    const clerkOrgId = (payload as { org_id?: unknown }).org_id;

    if (typeof clerkUserId !== "string" || typeof clerkOrgId !== "string") {
      return c.json({ error: "token_missing_org_or_user" }, 401);
    }

    const orgRow = await db
      .select({
        id: organizations.id,
        product: organizations.product,
        outputLanguage: organizations.outputLanguage,
        kbPreference: organizations.kbPreference,
      })
      .from(organizations)
      .where(eq(organizations.clerkOrgId, clerkOrgId))
      .limit(1);

    const org = orgRow[0];
    if (!org) {
      return c.json({ error: "organization_not_found" }, 403);
    }

    const userRow = await db
      .select({
        userId: users.id,
        role: memberships.role,
      })
      .from(users)
      .innerJoin(memberships, eq(memberships.userId, users.id))
      .where(
        and(eq(users.clerkUserId, clerkUserId), eq(memberships.organizationId, org.id)),
      )
      .limit(1);

    const membership = userRow[0];
    if (!membership) {
      return c.json({ error: "not_a_member" }, 403);
    }

    const outputLanguage = resolveLanguage(
      c.req.header("Accept-Language"),
      parseCookie(c.req.header("Cookie"), "wined_lang"),
      org.outputLanguage,
    );

    const authCtx: AuthCtx = {
      orgId: org.id,
      clerkOrgId,
      userId: membership.userId,
      clerkUserId,
      role: mapRole(membership.role as DbRole),
      product: org.product as AuthProduct,
      outputLanguage,
      kbPreference: org.kbPreference as AuthKbPreference,
    };

    c.set("auth", authCtx);
    await next();
    return;
  };
}
