/**
 * One-shot migration endpoint. Applies every infra/sql/NNNN_*.sql file
 * inside the container in alphabetical order. Idempotent if the SQL files
 * themselves use IF NOT EXISTS / IF EXISTS clauses.
 *
 * Protected by MIGRATE_SECRET header; intentionally OUTSIDE the JWT/tenant
 * middleware chain because at first run there is no user / org yet.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { createDb } from '@wined/db';
import { env } from '../env.js';

export const adminMigrateRoute = new Hono();

const MIGRATIONS_DIR = process.env['MIGRATIONS_DIR'] ?? '/app/infra/sql';

adminMigrateRoute.post('/migrate', async (c) => {
  const provided = c.req.header('x-migrate-secret');
  const expected = process.env['MIGRATE_SECRET'];
  if (!expected) return c.json({ error: 'migrate_secret_not_set' }, 500);
  if (provided !== expected) return c.json({ error: 'forbidden' }, 403);

  let files: string[];
  try {
    files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  } catch (err) {
    return c.json(
      { error: 'no_migrations_dir', dir: MIGRATIONS_DIR, message: (err as Error).message },
      500,
    );
  }

  const db = createDb(env.DATABASE_URL);
  const results: Array<{ file: string; ok: boolean; error?: string; elapsedMs?: number }> = [];

  for (const file of files) {
    const start = Date.now();
    try {
      const content = await readFile(join(MIGRATIONS_DIR, file), 'utf-8');
      // Drizzle's sql.raw is the idiomatic way to run multi-statement SQL.
      await db.execute(sql.raw(content));
      results.push({ file, ok: true, elapsedMs: Date.now() - start });
    } catch (err) {
      const msg = (err as Error).message;
      results.push({ file, ok: false, error: msg.slice(0, 500), elapsedMs: Date.now() - start });
      // Don't break — try every file so the caller sees the full picture.
    }
  }

  const failed = results.filter((r) => !r.ok).length;
  return c.json(
    { migrationsDir: MIGRATIONS_DIR, totalFiles: results.length, failed, results },
    failed > 0 ? 207 : 200,
  );
});

adminMigrateRoute.get('/migrate/status', async (c) => {
  const provided = c.req.header('x-migrate-secret');
  const expected = process.env['MIGRATE_SECRET'];
  if (!expected || provided !== expected) return c.json({ error: 'forbidden' }, 403);

  const db = createDb(env.DATABASE_URL);
  try {
    const r = await db.execute(
      sql.raw(`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;`),
    );
    const rows =
      (r as unknown as { rows?: Array<{ tablename: string }> }).rows ??
      (r as unknown as Array<{ tablename: string }>);
    return c.json({ tableCount: Array.isArray(rows) ? rows.length : 0, tables: rows });
  } catch (err) {
    return c.json({ error: 'db_error', message: (err as Error).message }, 500);
  }
});
