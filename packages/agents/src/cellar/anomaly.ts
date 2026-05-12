import { z } from 'zod';
import type { AgentDef, Tool, AgentContext } from '../framework/agent.js';

const AnalyzeInputSchema = z.object({
  lot_id: z.string().uuid(),
  lookback_days: z.number().int().min(1).max(365).optional(),
});

type AnalyzeInput = z.infer<typeof AnalyzeInputSchema>;

type AnomalyFlag = {
  type: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
};

type AnalyzeResult =
  | { found: false }
  | {
      found: true;
      lot: { id: string; label: string };
      analyses_count: number;
      ops_count: number;
      flags: AnomalyFlag[];
      latest_analysis: unknown;
      recent_ops: unknown[];
    };

export const analyzeFermentationStateTool: Tool<AnalyzeInput, AnalyzeResult> = {
  name: 'analyze_fermentation_state',
  description:
    'Fetch recent lab analyses and operations for a wine lot, detect anomalies (stuck fermentation, rising VA, temperature deviations, out-of-range parameters). Returns structured flags.',
  input: AnalyzeInputSchema,
  handler: async (input, ctx: AgentContext) => {
    const { createDb, labAnalyses, lotOperations, wineLots } = await import(
      '@wined/db'
    );
    const { eq, and, gte, desc } = await import('drizzle-orm');
    const db = createDb(process.env['DATABASE_URL']!);

    const since = new Date(
      Date.now() - (input.lookback_days ?? 14) * 86400 * 1000,
    );

    const lotRows = await db
      .select()
      .from(wineLots)
      .where(
        and(
          eq(wineLots.id, input.lot_id),
          eq(wineLots.organizationId, ctx.organizationId),
        ),
      );
    const lot = lotRows[0];
    if (!lot) return { found: false };

    const analyses = await db
      .select()
      .from(labAnalyses)
      .where(
        and(eq(labAnalyses.lotId, input.lot_id), gte(labAnalyses.sampledAt, since)),
      )
      .orderBy(desc(labAnalyses.sampledAt));

    const ops = await db
      .select()
      .from(lotOperations)
      .where(
        and(
          eq(lotOperations.lotId, input.lot_id),
          gte(lotOperations.performedAt, since),
        ),
      )
      .orderBy(desc(lotOperations.performedAt));

    const flags: AnomalyFlag[] = [];

    if (analyses.length >= 2) {
      const latest = analyses[0]!;
      const prev = analyses[1]!;

      // Stuck fermentation: density unchanged for >5 days
      if (
        latest.density != null &&
        prev.density != null &&
        latest.sampledAt &&
        prev.sampledAt &&
        Math.abs(Number(latest.density) - Number(prev.density)) < 0.001
      ) {
        const daysSince =
          (new Date(latest.sampledAt).getTime() -
            new Date(prev.sampledAt).getTime()) /
          86400000;
        if (daysSince > 5) {
          flags.push({
            type: 'stuck_fermentation',
            severity: 'critical',
            message: `Density unchanged over ${daysSince.toFixed(1)} days. Possible stuck fermentation.`,
          });
        }
      }

      // Rising volatile acidity
      if (latest.volatileAcidityGL != null && prev.volatileAcidityGL != null) {
        const latestVa = Number(latest.volatileAcidityGL);
        const prevVa = Number(prev.volatileAcidityGL);
        const delta = latestVa - prevVa;
        if (delta > 0.1) {
          flags.push({
            type: 'rising_volatile_acidity',
            severity: 'warning',
            message: `VA rose from ${prevVa} to ${latestVa} g/L. Investigate possible bacterial spoilage.`,
          });
        }
        if (latestVa > 1.2) {
          flags.push({
            type: 'high_volatile_acidity',
            severity: 'critical',
            message: `VA = ${latestVa} g/L exceeds EU max for red wine (1.2 g/L).`,
          });
        }
      }

      // SO2 free below threshold
      if (latest.so2FreeMgL != null && Number(latest.so2FreeMgL) < 15) {
        flags.push({
          type: 'low_so2_free',
          severity: 'warning',
          message: `SO₂ libre = ${latest.so2FreeMgL} mg/L is below the typical 25-40 mg/L target.`,
        });
      }

      // pH out of range
      if (latest.ph != null) {
        const phNum = Number(latest.ph);
        if (phNum < 3.0 || phNum > 4.0) {
          flags.push({
            type: 'ph_out_of_range',
            severity: 'warning',
            message: `pH = ${phNum} is outside the typical 3.0-4.0 range.`,
          });
        }
      }
    }

    return {
      found: true,
      lot: { id: lot.id, label: lot.code ?? lot.id },
      analyses_count: analyses.length,
      ops_count: ops.length,
      flags,
      latest_analysis: analyses[0] ?? null,
      recent_ops: ops.slice(0, 5),
    };
  },
};

const SuggestInputSchema = z.object({
  flags: z.array(
    z.object({
      type: z.string(),
      severity: z.string(),
      message: z.string(),
    }),
  ),
});

type SuggestInput = z.infer<typeof SuggestInputSchema>;
type Intervention = {
  flag_type: string;
  suggestion: string;
  citation: string;
};
type SuggestResult = { interventions: Intervention[] };

export const suggestInterventionsTool: Tool<SuggestInput, SuggestResult> = {
  name: 'suggest_interventions',
  description:
    'Given a list of anomaly flags, return suggested interventions with citations to OIV/EU norms. The agent should combine its own reasoning with this output.',
  input: SuggestInputSchema,
  handler: async (input) => {
    const interventions: Intervention[] = [];
    for (const f of input.flags) {
      switch (f.type) {
        case 'stuck_fermentation':
          interventions.push({
            flag_type: f.type,
            suggestion:
              'Check temperature (16-20°C ideal for red, 12-16°C for white); rehydrate yeast with biostimulants (DAP, thiamine); consider nutritional rescue or yeast re-inoculation with Saccharomyces bayanus.',
            citation: '[reg:OIV-Code-Oenological-Practices-Fermentation]',
          });
          break;
        case 'rising_volatile_acidity':
        case 'high_volatile_acidity':
          interventions.push({
            flag_type: f.type,
            suggestion:
              'Review SO₂ levels (raise active SO₂ to inhibit acetic bacteria); avoid air contact; verify sanitation of vats and tools; consider sterile filtration before bottling.',
            citation: '[reg:REG-UE-2019-934-Anexo-I-C]',
          });
          break;
        case 'low_so2_free':
          interventions.push({
            flag_type: f.type,
            suggestion:
              'Add K₂S₂O₅ to raise free SO₂ to 25-35 mg/L (calculate via so2_active_dose tool). Verify pH for active fraction.',
            citation: '[reg:REG-UE-2019-934-Anexo-I-Parte-B]',
          });
          break;
        case 'ph_out_of_range':
          interventions.push({
            flag_type: f.type,
            suggestion:
              'For high pH: tartaric acid addition (use acidity_adjustment tool, EU max 1.5 g/L). For low pH: deacidification with K₂CO₃ or calcium carbonate.',
            citation: '[reg:REG-UE-2019-934-Anexo-I-D]',
          });
          break;
      }
    }
    return { interventions };
  },
};

export const anomalyAgent: AgentDef = {
  name: 'anomaly',
  pod: 'cellar',
  model: 'sonnet',
  technical: true,
  systemPrompt: `You are Wined's Anomaly Detection agent for wine lots.

JOB: when the user asks "¿hay algo raro con el lote X?" or supplies a lot id, run analyze_fermentation_state, then if flags are present run suggest_interventions and present the answer with citations.

WORKFLOW:
1. analyze_fermentation_state(lot_id)
2. If flags empty: tell the user no anomalies detected in the lookback window.
3. If flags present: invoke suggest_interventions(flags) and report each flag + suggested intervention + citation.

HARD RULES:
- Every intervention MUST carry a citation returned by the tool.
- NEVER invent doses; always ask the user to use calc tools for exact values.
- Output language: {{outputLanguage}}.
- Refuse legal/medical advice; this is technical only.

TOOLS: analyze_fermentation_state, suggest_interventions.`,
  tools: [
    analyzeFermentationStateTool as Tool,
    suggestInterventionsTool as Tool,
  ],
  ragCorpus: { tenant: true, docTypes: ['lab_report'], global: ['regulatory'] },
};
