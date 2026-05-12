import { makeWorker, type CuratorJob } from "@wined/ingestion";
import { runCurator, type CuratorImpl } from "@wined/curators";
import { env } from "../env.js";

export function startCuratorWorker(): ReturnType<
  typeof makeWorker<CuratorJob>
> {
  return makeWorker<CuratorJob>("curator", async ({ data }) => {
    // Lazy import to avoid top-level import of all curator implementations
    // (some are added in later steps — keep this map permissive until then).
    const curators = (await import("@wined/curators")) as unknown as Record<
      string,
      unknown
    >;

    const map: Record<CuratorJob["curatorName"], CuratorImpl | undefined> = {
      regulation: curators["regulationCurator"] as CuratorImpl | undefined,
      catalog: curators["catalogCurator"] as CuratorImpl | undefined,
      book: curators["bookCurator"] as CuratorImpl | undefined,
      do: curators["doCurator"] as CuratorImpl | undefined,
      reviewer: curators["reviewerCurator"] as CuratorImpl | undefined,
    };

    const impl = map[data.curatorName];
    if (!impl) {
      return { error: `unknown curator: ${data.curatorName}` };
    }

    const args: {
      trigger: CuratorJob["trigger"];
      orgId?: string;
      payload?: Record<string, unknown>;
    } = { trigger: data.trigger };
    if (data.orgId !== undefined) args.orgId = data.orgId;
    if (data.payload !== undefined) args.payload = data.payload;

    const result = await runCurator(impl, args, env.DATABASE_URL);
    return result;
  });
}
