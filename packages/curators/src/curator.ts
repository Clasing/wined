import { eq } from 'drizzle-orm';
import { curatorRuns, createDb } from '@wined/db';
import type { AgentDef } from '@wined/agents';

export type CuratorTrigger = 'cron' | 'manual' | 'event';

export type CuratorRunArgs = {
  trigger: CuratorTrigger;
  orgId?: string;
  payload?: Record<string, unknown>;
};

export type CuratorRunError = { message: string; stack?: string };

export type CuratorRunResult = {
  runId: string;
  status: 'completed' | 'failed';
  itemsProcessed: number;
  errors: CuratorRunError[];
  startedAt: Date;
  endedAt: Date;
};

export interface CuratorImpl {
  agent: AgentDef;
  run(
    args: CuratorRunArgs,
  ): Promise<{ itemsProcessed: number; errors: CuratorRunError[] }>;
}

export async function runCurator(
  impl: CuratorImpl,
  args: CuratorRunArgs,
  dbUrl: string,
): Promise<CuratorRunResult> {
  const db = createDb(dbUrl);
  const startedAt = new Date();

  const [run] = await db
    .insert(curatorRuns)
    .values({
      curatorName: impl.agent.name,
      trigger: args.trigger,
      organizationId: args.orgId ?? null,
      status: 'running',
      startedAt,
      stats: { itemsProcessed: 0, errors: [] },
    })
    .returning();

  if (!run) {
    throw new Error('failed to insert curator_runs row');
  }

  try {
    const { itemsProcessed, errors } = await impl.run(args);
    const endedAt = new Date();
    const status: CuratorRunResult['status'] =
      errors.length === 0 ? 'completed' : 'failed';

    await db
      .update(curatorRuns)
      .set({
        status,
        finishedAt: endedAt,
        stats: { itemsProcessed, errors },
      })
      .where(eq(curatorRuns.id, run.id));

    return {
      runId: run.id,
      status,
      itemsProcessed,
      errors,
      startedAt,
      endedAt,
    };
  } catch (err) {
    const endedAt = new Date();
    const e = err as Error;
    const errors: CuratorRunError[] = [
      e.stack !== undefined
        ? { message: e.message, stack: e.stack }
        : { message: e.message },
    ];

    await db
      .update(curatorRuns)
      .set({
        status: 'failed',
        finishedAt: endedAt,
        stats: { itemsProcessed: 0, errors },
      })
      .where(eq(curatorRuns.id, run.id));

    return {
      runId: run.id,
      status: 'failed',
      itemsProcessed: 0,
      errors,
      startedAt,
      endedAt,
    };
  }
}
