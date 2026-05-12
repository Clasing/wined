import type { MiddlewareHandler } from 'hono';
import { and, eq } from 'drizzle-orm';
import { memberships, organizations, type DbClient } from '@wined/db';
import { verifyAccessToken } from './jwt.js';
import type {
  AuthCtx,
  AuthKbPreference,
  AuthOutputLanguage,
  AuthProduct,
  AuthRole,
} from './types.js';

type DbRole = 'owner' | 'admin' | 'member' | 'viewer' | 'external';

const ROLE_MAP: Record<DbRole, AuthRole> = {
  owner: 'admin',
  admin: 'admin',
  member: 'editor',
  viewer: 'viewer',
  external: 'viewer',
};

function resolveLanguage(
  acceptLanguage: string | undefined,
  cookieLang: string | undefined,
): AuthOutputLanguage {
  if (cookieLang === 'en' || cookieLang === 'es') return cookieLang;
  const first = acceptLanguage?.split(',')[0]?.split('-')[0]?.toLowerCase();
  if (first === 'en') return 'en';
  return 'es';
}

function parseCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  const parts = header.split(';').map((p) => p.trim());
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx) === name) {
      return decodeURIComponent(part.slice(idx + 1));
    }
  }
  return undefined;
}

export type JwtAuthOptions = {
  db: DbClient;
  secret: string;
};

/**
 * Hono middleware that:
 *  - validates `Authorization: Bearer <jwt>` using HS256
 *  - re-checks org existence and membership on every request
 *  - resolves output language (cookie > Accept-Language > "es")
 *  - exposes `AuthCtx` via `c.set("auth", ...)`
 */
export function jwtAuth(options: JwtAuthOptions): MiddlewareHandler {
  const { db, secret } = options;
  return async (c, next) => {
    const authHeader = c.req.header('Authorization') ?? c.req.header('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: 'missing_bearer_token' }, 401);
    }
    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
      return c.json({ error: 'missing_bearer_token' }, 401);
    }

    let claims;
    try {
      claims = await verifyAccessToken(token, secret);
    } catch {
      return c.json({ error: 'invalid_token' }, 401);
    }

    if (
      typeof claims.sub !== 'string' ||
      typeof claims.org !== 'string' ||
      typeof claims.email !== 'string'
    ) {
      return c.json({ error: 'invalid_token_claims' }, 401);
    }

    const orgRow = await db
      .select({
        id: organizations.id,
        product: organizations.product,
        kbPreference: organizations.kbPreference,
      })
      .from(organizations)
      .where(eq(organizations.id, claims.org))
      .limit(1);
    const org = orgRow[0];
    if (!org) {
      return c.json({ error: 'organization_not_found' }, 403);
    }

    const memRow = await db
      .select({ role: memberships.role })
      .from(memberships)
      .where(and(eq(memberships.organizationId, claims.org), eq(memberships.userId, claims.sub)))
      .limit(1);
    const mem = memRow[0];
    if (!mem) {
      return c.json({ error: 'membership_revoked' }, 403);
    }

    const outputLanguage = resolveLanguage(
      c.req.header('Accept-Language'),
      parseCookie(c.req.header('Cookie'), 'wined_lang'),
    );

    const ctx: AuthCtx = {
      orgId: org.id,
      userId: claims.sub,
      email: claims.email,
      role: ROLE_MAP[mem.role as DbRole] ?? 'viewer',
      product: org.product as AuthProduct,
      outputLanguage,
      kbPreference: (org.kbPreference ?? 'private_first') as AuthKbPreference,
    };

    c.set('auth', ctx);
    await next();
    return;
  };
}
