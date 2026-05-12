import { createDb } from "@wined/db";
import { sql } from "drizzle-orm";
import { track, ANALYTICS_EVENTS } from "@wined/analytics";
import { env } from "../env.js";

export type OnboardingReminderResult = {
  scanned: number;
  remindersSent: number;
  errors: number;
};

type OrgRow = {
  id: string;
  name: string;
  product: string;
  onboarding_started_at: Date | string;
};

type AdminRow = {
  id: string;
  email: string;
  name: string | null;
};

/**
 * Find orgs whose onboarding started >3 days ago and is not completed.
 * For each, fetch admin user(s) and send reminder email. Throttled per-org
 * via `organizations.last_reminder_at` (re-send after 7d).
 */
export async function runOnboardingReminderCron(): Promise<OnboardingReminderResult> {
  const db = createDb(env.DATABASE_URL);
  const threshold = new Date(Date.now() - 3 * 86400 * 1000);

  const candidates = await db.execute(sql`
    SELECT o.id, o.name, o.product, o.onboarding_started_at
    FROM organizations o
    WHERE o.onboarding_started_at IS NOT NULL
      AND o.onboarding_completed_at IS NULL
      AND o.onboarding_started_at < ${threshold}
      AND (
        o.last_reminder_at IS NULL
        OR o.last_reminder_at < NOW() - INTERVAL '7 days'
      )
    LIMIT 500
  `);

  const rows = ((candidates as unknown as { rows?: OrgRow[] }).rows ??
    (candidates as unknown as OrgRow[])) as OrgRow[];

  let scanned = 0;
  let remindersSent = 0;
  let errors = 0;

  for (const org of rows) {
    scanned++;
    try {
      const adminsResult = await db.execute(sql`
        SELECT u.id, u.email, u.full_name AS name
        FROM users u
        JOIN memberships m ON m.user_id = u.id
        WHERE m.organization_id = ${org.id}::uuid AND m.role IN ('owner', 'admin')
        LIMIT 5
      `);
      const admins = ((adminsResult as unknown as { rows?: AdminRow[] }).rows ??
        (adminsResult as unknown as AdminRow[])) as AdminRow[];

      for (const admin of admins) {
        const startedAt =
          org.onboarding_started_at instanceof Date
            ? org.onboarding_started_at
            : new Date(org.onboarding_started_at);
        await sendReminderEmail({
          email: admin.email,
          name: admin.name,
          orgName: org.name,
          product: org.product,
          startedAt,
        });
        remindersSent++;

        await track({
          event: ANALYTICS_EVENTS.ONBOARDING_ABANDONED,
          orgId: org.id,
          userId: admin.id,
          properties: {
            reminder_sent_at: new Date().toISOString(),
            days_since_start: Math.floor(
              (Date.now() - startedAt.getTime()) / 86400000,
            ),
          },
        });
      }

      await db.execute(
        sql`UPDATE organizations SET last_reminder_at = NOW() WHERE id = ${org.id}::uuid`,
      );
    } catch (err) {
      errors++;
      // eslint-disable-next-line no-console
      console.error(
        "[onboarding-reminder] failed",
        org.id,
        (err as Error).message,
      );
    }
  }

  return { scanned, remindersSent, errors };
}

async function sendReminderEmail(opts: {
  email: string;
  name: string | null;
  orgName: string;
  product: string;
  startedAt: Date;
}): Promise<void> {
  const days = Math.floor(
    (Date.now() - opts.startedAt.getTime()) / 86400000,
  );
  const subject = `${opts.name ?? "Hola"}, tu onboarding de Wined sigue pendiente`;
  const text = `Vimos que empezaste a configurar Wined ${opts.product} para ${opts.orgName} hace ${days} días. ¿Necesitas ayuda? Termina en menos de 15 min: https://app.wined.com/onboarding`;

  // Placeholder — fall back to console log if no Resend key configured.
  const key = process.env["RESEND_API_KEY"];
  if (!key) {
    // eslint-disable-next-line no-console
    console.log("[onboarding-reminder] would send to", opts.email, {
      subject,
      body: text,
    });
    return;
  }

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "onboarding@wined.app",
      to: opts.email,
      subject,
      html: `<p>Vimos que empezaste a configurar Wined <strong>${opts.product}</strong> para <strong>${opts.orgName}</strong> hace ${days} días.</p><p>¿Necesitas ayuda? Termina en menos de 15 min: <a href="https://app.wined.com/onboarding">app.wined.com/onboarding</a>.</p>`,
    }),
  });
}

// Allow direct execution: `node dist/workers/onboarding-reminder-cron.js`.
if (import.meta.url === `file://${process.argv[1]}`) {
  runOnboardingReminderCron()
    .then((r) => {
      // eslint-disable-next-line no-console
      console.log("[onboarding-reminder-cron]", r);
      process.exit(0);
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[onboarding-reminder-cron] fatal", err);
      process.exit(1);
    });
}
