import { z } from 'zod';
import type { AgentContext, AgentDef, Tool } from '../framework/agent.js';

const GetGuestSchema = z.object({
  name_or_id: z.string().min(1),
});

export type GetGuestInput = z.infer<typeof GetGuestSchema>;

export type GetGuestResult = {
  found: boolean;
  guest?: {
    id: string;
    displayName: string;
    preferences: unknown;
    aversions: unknown;
    allergies: unknown;
    piiConsent: boolean;
  };
  recentOrders?: Array<{
    id: string;
    listItemId: string | null;
    orderedAt: Date;
    liked: boolean | null;
    notes: string | null;
  }>;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const getGuestTool: Tool<GetGuestInput, GetGuestResult> = {
  name: 'get_guest',
  description:
    'Retrieve a restaurant guest by id or partial name match. Returns guest profile + last 5 orders.',
  input: GetGuestSchema,
  handler: async (input, ctx: AgentContext) => {
    const { createDb, restaurantGuests, guestOrders } = await import('@wined/db');
    const { and, desc, eq, ilike } = await import('drizzle-orm');

    const databaseUrl = process.env['DATABASE_URL'];
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is not set');
    }
    const db = createDb(databaseUrl);

    const whereExpr = UUID_RE.test(input.name_or_id)
      ? and(
          eq(restaurantGuests.id, input.name_or_id),
          eq(restaurantGuests.organizationId, ctx.organizationId),
        )
      : and(
          ilike(restaurantGuests.displayName, `%${input.name_or_id}%`),
          eq(restaurantGuests.organizationId, ctx.organizationId),
        );

    const rows = await db
      .select({
        id: restaurantGuests.id,
        displayName: restaurantGuests.displayName,
        preferences: restaurantGuests.preferences,
        aversions: restaurantGuests.aversions,
        allergies: restaurantGuests.allergies,
        piiConsent: restaurantGuests.piiConsent,
      })
      .from(restaurantGuests)
      .where(whereExpr)
      .limit(1);

    const guest = rows[0];
    if (!guest) {
      return { found: false };
    }

    const orders = await db
      .select({
        id: guestOrders.id,
        listItemId: guestOrders.listItemId,
        orderedAt: guestOrders.orderedAt,
        liked: guestOrders.liked,
        notes: guestOrders.notes,
      })
      .from(guestOrders)
      .where(eq(guestOrders.guestId, guest.id))
      .orderBy(desc(guestOrders.orderedAt))
      .limit(5);

    return { found: true, guest, recentOrders: orders };
  },
};

const UpsertPrefSchema = z.object({
  guest_id: z.string().uuid(),
  preferences: z.record(z.unknown()).optional(),
  aversions: z.array(z.string()).optional(),
  allergies: z.array(z.string()).optional(),
});

export type UpsertGuestPrefInput = z.infer<typeof UpsertPrefSchema>;

export type UpsertGuestPrefResult = {
  ok: boolean;
  guestId?: string;
};

export const upsertGuestPrefTool: Tool<UpsertGuestPrefInput, UpsertGuestPrefResult> = {
  name: 'upsert_guest_pref',
  description:
    'Update preferences, aversions, or allergies of a guest. Only provided fields are touched.',
  input: UpsertPrefSchema,
  handler: async (input, ctx: AgentContext) => {
    const { createDb, restaurantGuests } = await import('@wined/db');
    const { and, eq } = await import('drizzle-orm');

    const databaseUrl = process.env['DATABASE_URL'];
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is not set');
    }
    const db = createDb(databaseUrl);

    const update: Record<string, unknown> = {};
    if (input.preferences !== undefined) update['preferences'] = input.preferences;
    if (input.aversions !== undefined) update['aversions'] = input.aversions;
    if (input.allergies !== undefined) update['allergies'] = input.allergies;

    if (Object.keys(update).length === 0) {
      return { ok: false };
    }

    const rows = await db
      .update(restaurantGuests)
      .set(update)
      .where(
        and(
          eq(restaurantGuests.id, input.guest_id),
          eq(restaurantGuests.organizationId, ctx.organizationId),
        ),
      )
      .returning({ id: restaurantGuests.id });

    const row = rows[0];
    return row ? { ok: true, guestId: row.id } : { ok: false };
  },
};

export const guestMemoryAgent: AgentDef = {
  name: 'guest-memory',
  pod: 'sommelier',
  model: 'sonnet',
  technical: false,
  systemPrompt: `You are Wined's Guest Memory agent.

JOB: help the sumiller recall what a returning restaurant guest prefers and what they ordered before.

RULES:
- ALWAYS invoke get_guest first to retrieve the actual record. Never invent guest data.
- If the guest is not found, say so and offer to create them.
- Privacy: do NOT echo email/phone (they are hashed). Mention preferences, aversions and allergies only.
- Output language: {{outputLanguage}}.
- If serviceMode=true, respond in <40 words.

TOOLS: get_guest, upsert_guest_pref.`,
  tools: [getGuestTool as Tool, upsertGuestPrefTool as Tool],
  ragCorpus: { tenant: true, docTypes: ['wine_list', 'menu'] },
};
