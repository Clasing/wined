import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { setCookie, getCookie, deleteCookie } from 'hono/cookie';
import { eq, and, sql, lt } from 'drizzle-orm';
import { organizations, users, memberships, refreshTokens } from '@wined/db';
import {
  hashPassword,
  verifyPassword,
  signAccessToken,
  ACCESS_TTL_SEC_EXPORT,
  REFRESH_TTL_SEC_EXPORT,
} from '@wined/auth';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { getDb } from '../db.js';
import { env } from '../env.js';

export const authRoute = new Hono();

type DbRole = 'owner' | 'admin' | 'member' | 'viewer' | 'external';
const ROLE_MAP: Record<DbRole, 'admin' | 'editor' | 'viewer'> = {
  owner: 'admin',
  admin: 'admin',
  member: 'editor',
  viewer: 'viewer',
  external: 'viewer',
};

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '')
      .slice(0, 60) || 'org'
  );
}

const ProductEnum = z.enum(['sommelier', 'cellar', 'distributor', 'both']);

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(1),
  organizationName: z.string().min(1),
  product: ProductEnum.default('sommelier'),
  locale: z.enum(['es', 'en']).default('es'),
});

authRoute.post('/register', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400);
  }
  const { email, password, fullName, organizationName, product, locale } = parsed.data;

  const db = getDb();

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`LOWER(${users.email}) = LOWER(${email})`)
    .limit(1);
  if (existing[0]) {
    return c.json({ error: 'email_already_registered' }, 409);
  }

  const passwordHash = await hashPassword(password);
  const slug = `${slugify(organizationName)}-${randomBytes(3).toString('hex')}`;

  let userId = '';
  let orgId = '';
  await db.transaction(async (tx) => {
    const insertedUser = await tx
      .insert(users)
      .values({
        email,
        fullName,
        passwordHash,
        preferredLanguage: locale,
        isActive: true,
      })
      .returning({ id: users.id });
    const u = insertedUser[0];
    if (!u) throw new Error('user_insert_failed');

    const insertedOrg = await tx
      .insert(organizations)
      .values({
        name: organizationName,
        slug,
        product,
        locale,
        outputLanguage: locale,
      })
      .returning({ id: organizations.id });
    const o = insertedOrg[0];
    if (!o) throw new Error('org_insert_failed');

    await tx.insert(memberships).values({
      organizationId: o.id,
      userId: u.id,
      role: 'owner',
    });

    userId = u.id;
    orgId = o.id;
  });

  return await issueTokensAndReply(c, {
    userId,
    orgId,
    email,
    role: 'admin',
    product,
    status: 201,
  });
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  organizationId: z.string().uuid().optional(),
});

authRoute.post('/login', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400);
  }
  const { email, password, organizationId } = parsed.data;
  const db = getDb();

  const userRow = await db
    .select()
    .from(users)
    .where(sql`LOWER(${users.email}) = LOWER(${email})`)
    .limit(1);
  const user = userRow[0];
  if (!user || !user.passwordHash || !user.isActive) {
    return c.json({ error: 'invalid_credentials' }, 401);
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    return c.json({ error: 'invalid_credentials' }, 401);
  }

  let orgId = organizationId ?? '';
  if (!orgId) {
    const memRow = await db
      .select({ orgId: memberships.organizationId })
      .from(memberships)
      .where(eq(memberships.userId, user.id))
      .limit(1);
    const m = memRow[0];
    if (!m) {
      return c.json({ error: 'no_organization' }, 403);
    }
    orgId = m.orgId;
  }

  const memRow = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.userId, user.id), eq(memberships.organizationId, orgId)))
    .limit(1);
  const mem = memRow[0];
  if (!mem) {
    return c.json({ error: 'not_member_of_org' }, 403);
  }

  const orgRow = await db
    .select({ product: organizations.product })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  const org = orgRow[0];
  if (!org) {
    return c.json({ error: 'org_not_found' }, 403);
  }

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

  const role = ROLE_MAP[mem.role as DbRole] ?? 'viewer';
  return await issueTokensAndReply(c, {
    userId: user.id,
    orgId,
    email: user.email,
    role,
    product: org.product as 'sommelier' | 'cellar' | 'distributor' | 'both',
  });
});

authRoute.post('/refresh', async (c) => {
  const refresh = getCookie(c, 'wined_refresh');
  if (!refresh) {
    return c.json({ error: 'no_refresh' }, 401);
  }
  const db = getDb();
  const tokenHash = sha256Hex(refresh);

  const rows = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, tokenHash))
    .limit(1);
  const row = rows[0];
  if (!row || row.revokedAt || row.expiresAt < new Date()) {
    return c.json({ error: 'invalid_refresh' }, 401);
  }

  // Rotate: revoke current
  await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, row.id));

  const userRow = await db.select().from(users).where(eq(users.id, row.userId)).limit(1);
  const user = userRow[0];
  if (!user || !user.isActive) {
    return c.json({ error: 'user_inactive' }, 401);
  }
  const memRow = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(
      and(eq(memberships.userId, row.userId), eq(memberships.organizationId, row.organizationId)),
    )
    .limit(1);
  const mem = memRow[0];
  if (!mem) {
    return c.json({ error: 'membership_revoked' }, 403);
  }
  const orgRow = await db
    .select({ product: organizations.product })
    .from(organizations)
    .where(eq(organizations.id, row.organizationId))
    .limit(1);
  const org = orgRow[0];
  if (!org) {
    return c.json({ error: 'org_not_found' }, 403);
  }

  const role = ROLE_MAP[mem.role as DbRole] ?? 'viewer';
  return await issueTokensAndReply(c, {
    userId: row.userId,
    orgId: row.organizationId,
    email: user.email,
    role,
    product: org.product as 'sommelier' | 'cellar' | 'distributor' | 'both',
    rotateFamilyId: row.familyId,
  });
});

authRoute.post('/logout', async (c) => {
  const refresh = getCookie(c, 'wined_refresh');
  if (refresh) {
    const tokenHash = sha256Hex(refresh);
    await getDb()
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.tokenHash, tokenHash));
  }
  deleteCookie(c, 'wined_refresh', { path: '/' });
  return c.json({ ok: true });
});

type IssueOpts = {
  userId: string;
  orgId: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
  product: 'sommelier' | 'cellar' | 'distributor' | 'both';
  rotateFamilyId?: string;
  status?: number;
};

async function issueTokensAndReply(c: Context, opts: IssueOpts) {
  const access = await signAccessToken(
    {
      sub: opts.userId,
      org: opts.orgId,
      email: opts.email,
      role: opts.role,
      product: opts.product,
    },
    env.JWT_SECRET,
  );

  const refresh = randomBytes(48).toString('base64url');
  const tokenHash = sha256Hex(refresh);
  const familyId = opts.rotateFamilyId ?? randomUUID();
  const expiresAt = new Date(Date.now() + REFRESH_TTL_SEC_EXPORT * 1000);

  const ipHeader = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
  await getDb()
    .insert(refreshTokens)
    .values({
      userId: opts.userId,
      organizationId: opts.orgId,
      tokenHash,
      familyId,
      expiresAt,
      userAgent: c.req.header('user-agent') ?? null,
      ip: ipHeader ?? null,
    });

  // Best-effort GC: remove this user's expired/revoked tokens (non-blocking).
  void getDb()
    .delete(refreshTokens)
    .where(and(eq(refreshTokens.userId, opts.userId), lt(refreshTokens.expiresAt, new Date())))
    .catch(() => undefined);

  setCookie(c, 'wined_refresh', refresh, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
    maxAge: REFRESH_TTL_SEC_EXPORT,
  });

  const body = {
    access_token: access,
    expires_in: ACCESS_TTL_SEC_EXPORT,
    token_type: 'Bearer' as const,
    user: { id: opts.userId, email: opts.email, role: opts.role },
    org: { id: opts.orgId, product: opts.product },
  };
  // Hono's typings constrain status codes; cast through unknown.
  const status = (opts.status ?? 200) as 200;
  return c.json(body, status);
}
