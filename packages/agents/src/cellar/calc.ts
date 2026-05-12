import { z } from 'zod';
import type { Tool } from '../framework/agent.js';

// ============================================================
// 1. SO₂ activo dose (Reg UE 2019/934 Anexo I Parte B)
// ============================================================
const So2InputSchema = z.object({
  so2_free_target_mg_l: z.number().min(0).max(100).describe('Target free SO₂ in mg/L'),
  ph: z.number().min(2.5).max(4.5),
  alcohol_pct: z.number().min(8).max(20),
  volume_l: z.number().min(1).optional(),
});

export type So2ActiveDoseInput = z.infer<typeof So2InputSchema>;

export type So2ActiveDoseResult = {
  dose_g_hl: number;
  salt: string;
  so2_active_at_ph: number;
  target_free_so2_mg_l: number;
  total_dose_g: number | null;
  citation: string;
  notes: string[];
};

export const so2ActiveDoseTool: Tool<So2ActiveDoseInput, So2ActiveDoseResult> = {
  name: 'so2_active_dose',
  description:
    'Compute K2S2O5 (metabisulfito potásico) dose needed to reach target SO₂ free at given pH. Returns dose in g/hL and citation to OIV §2.1.18 / Reg UE 2019/934.',
  input: So2InputSchema,
  handler: async (input) => {
    // SO₂ active = SO₂ free × 1 / (1 + 10^(pH - 1.81))
    const so2ActivePctAtPh = 1 / (1 + Math.pow(10, input.ph - 1.81));
    const so2Active = input.so2_free_target_mg_l * so2ActivePctAtPh;

    // Dose K2S2O5 g/hL = (mg/L × 100) / 570  (K2S2O5 is 57% SO₂ by weight)
    const doseGhL = (input.so2_free_target_mg_l * 100) / 570;

    return {
      dose_g_hl: Number(doseGhL.toFixed(2)),
      salt: 'K2S2O5',
      so2_active_at_ph: Number(so2Active.toFixed(2)),
      target_free_so2_mg_l: input.so2_free_target_mg_l,
      total_dose_g:
        input.volume_l !== undefined
          ? Number(((doseGhL * input.volume_l) / 100).toFixed(2))
          : null,
      citation: '[reg:REG-UE-2019-934-Anexo-I-Parte-B]',
      notes: [
        'EU limit for dry red wine: 150 mg/L total SO₂.',
        'EU limit for dry white wine: 200 mg/L total SO₂.',
        'OIV recommends 0.6-0.8 mg/L molecular SO₂ as effective antimicrobial.',
      ],
    };
  },
};

// ============================================================
// 2. Acidity adjustment (tartaric / malic / lactic acid)
// ============================================================
const AcidityInputSchema = z.object({
  current_at_g_l: z
    .number()
    .min(0)
    .max(20)
    .describe('Current total acidity in g/L tartaric eq.'),
  target_at_g_l: z.number().min(0).max(20),
  volume_l: z.number().min(1),
  acid: z.enum(['tartaric', 'malic', 'lactic']),
});

export type AcidityAdjustmentInput = z.infer<typeof AcidityInputSchema>;

export type AcidityAdjustmentResult =
  | {
      dose_g: number;
      message: string;
      citation: string;
    }
  | {
      acid: 'tartaric' | 'malic' | 'lactic';
      dose_g_per_l: number;
      total_dose_g: number;
      delta_at_g_l: number;
      citation: string;
      notes: string[];
    };

export const acidityAdjustmentTool: Tool<AcidityAdjustmentInput, AcidityAdjustmentResult> = {
  name: 'acidity_adjustment',
  description:
    'Compute acid addition (tartaric/malic/lactic) to reach a target total acidity. Returns dose in g and citation to Reg UE 2019/934 Anexo I-D.',
  input: AcidityInputSchema,
  handler: async (input) => {
    const delta = input.target_at_g_l - input.current_at_g_l;
    if (delta <= 0) {
      return {
        dose_g: 0,
        message: 'Current acidity already meets or exceeds target.',
        citation: '[reg:REG-UE-2019-934-Anexo-I-D]',
      };
    }

    // Equivalence factors to tartaric acid
    const factors: Record<'tartaric' | 'malic' | 'lactic', number> = {
      tartaric: 1.0,
      malic: 1.119,
      lactic: 0.6,
    };
    const doseGPerL = delta / factors[input.acid];
    const totalG = doseGPerL * input.volume_l;

    return {
      acid: input.acid,
      dose_g_per_l: Number(doseGPerL.toFixed(3)),
      total_dose_g: Number(totalG.toFixed(2)),
      delta_at_g_l: Number(delta.toFixed(2)),
      citation: '[reg:REG-UE-2019-934-Anexo-I-D]',
      notes: [
        'EU max acidification: 1.5 g/L tartaric (zones B-C).',
        'EU max acidification: 2.5 g/L tartaric (zones C-III) per harvest.',
        'Always perform a bench trial before scaling.',
      ],
    };
  },
};

// ============================================================
// 3. Clarifier dose (bentonite / gelatin / casein)
// ============================================================
const ClarifierInputSchema = z.object({
  clarifier: z.enum(['bentonite', 'gelatin', 'casein']),
  test_result_g_hl: z
    .number()
    .min(0)
    .max(200)
    .describe('Bench trial recommended dose in g/hL'),
  volume_l: z.number().min(1),
  safety_margin_pct: z.number().min(0).max(50).optional(),
});

export type ClarifierDoseInput = z.infer<typeof ClarifierInputSchema>;

export type ClarifierDoseResult = {
  clarifier: 'bentonite' | 'gelatin' | 'casein';
  dose_g_hl: number;
  total_dose_g: number;
  safety_margin_applied_pct: number;
  citation: string;
  notes: string[];
};

export const clarifierDoseTool: Tool<ClarifierDoseInput, ClarifierDoseResult> = {
  name: 'clarifier_dose',
  description:
    'Compute clarifier total dose from bench trial. Adds safety margin. Returns total dose and citation to OIV practices.',
  input: ClarifierInputSchema,
  handler: async (input) => {
    const marginPct = input.safety_margin_pct ?? 10;
    const margin = marginPct / 100;
    const adjustedGhL = input.test_result_g_hl * (1 + margin);
    const totalG = (adjustedGhL * input.volume_l) / 100;

    return {
      clarifier: input.clarifier,
      dose_g_hl: Number(adjustedGhL.toFixed(2)),
      total_dose_g: Number(totalG.toFixed(2)),
      safety_margin_applied_pct: marginPct,
      citation: '[reg:OIV-Code-Oenological-Practices]',
      notes: [
        'Bentonite: typical 30-100 g/hL for protein stability.',
        'Gelatin: typical 5-20 g/hL for tannin reduction.',
        'Casein: typical 10-30 g/hL for oxidation reduction; allergen, must be labelled.',
      ],
    };
  },
};

// ============================================================
// 4. Baumé / Brix / ABV conversion (OIV curve)
// ============================================================
const BaumeBrixInputSchema = z.object({
  kind: z.enum([
    'baume_to_brix',
    'baume_to_abv',
    'brix_to_baume',
    'brix_to_abv',
    'abv_to_brix',
    'abv_to_baume',
  ]),
  input: z.number(),
});

export type BaumeBrixAbvInput = z.infer<typeof BaumeBrixInputSchema>;

export type BaumeBrixAbvResult = {
  input: number;
  kind: BaumeBrixAbvInput['kind'];
  result: number;
  citation: string;
  notes: string[];
};

export const baumeBrixAbvTool: Tool<BaumeBrixAbvInput, BaumeBrixAbvResult> = {
  name: 'baume_brix_abv',
  description:
    'Convert between Baumé, Brix, and probable alcohol (ABV %vol). Uses OIV reference curve.',
  input: BaumeBrixInputSchema,
  handler: async (input) => {
    // 1 Baumé ≈ 1.8 Brix ≈ 1.0 % vol probable alcohol
    let result: number;
    switch (input.kind) {
      case 'baume_to_brix':
        result = input.input * 1.8;
        break;
      case 'baume_to_abv':
        result = input.input * 1.0;
        break;
      case 'brix_to_baume':
        result = input.input / 1.8;
        break;
      case 'brix_to_abv':
        result = input.input * 0.55;
        break;
      case 'abv_to_brix':
        result = input.input / 0.55;
        break;
      case 'abv_to_baume':
        result = input.input * 1.0;
        break;
    }
    return {
      input: input.input,
      kind: input.kind,
      result: Number(result.toFixed(2)),
      citation: '[reg:OIV-MA-AS2-02]',
      notes: [
        'These are approximations; actual ABV after fermentation depends on yeast efficiency and residual sugar.',
      ],
    };
  },
};

// ============================================================
// 5. Chaptalization (sugar addition to reach target ABV)
// ============================================================
const ChaptalizationInputSchema = z.object({
  current_baume: z.number(),
  target_baume: z.number(),
  volume_l: z.number().min(1),
});

export type ChaptalizationInput = z.infer<typeof ChaptalizationInputSchema>;

export type ChaptalizationResult =
  | { sucrose_kg: number; message: string; citation: string }
  | {
      sucrose_kg: number;
      delta_abv_pct: number;
      citation: string;
      notes: string[];
    };

export const chaptalizationTool: Tool<ChaptalizationInput, ChaptalizationResult> = {
  name: 'chaptalization',
  description:
    'Compute sucrose addition to raise probable alcohol. Returns kg sucrose and citation to Reg UE.',
  input: ChaptalizationInputSchema,
  handler: async (input) => {
    const delta = input.target_baume - input.current_baume;
    if (delta <= 0) {
      return {
        sucrose_kg: 0,
        message: 'Already at or above target.',
        citation: '[reg:REG-UE-2019-934-Anexo-I-A]',
      };
    }
    // 17 g/L of sucrose raises 1 % vol approx; 1 Baumé ≈ 1 % vol
    const sucroseKg = (delta * 17 * input.volume_l) / 1000;
    return {
      sucrose_kg: Number(sucroseKg.toFixed(2)),
      delta_abv_pct: delta,
      citation: '[reg:REG-UE-2019-934-Anexo-I-A]',
      notes: [
        'EU chaptalization permitted in zones B and C with limits 1.5-3% vol depending on zone.',
        'In Spain, chaptalization is generally not permitted.',
      ],
    };
  },
};

export const cellarCalcTools: Tool[] = [
  so2ActiveDoseTool as Tool,
  acidityAdjustmentTool as Tool,
  clarifierDoseTool as Tool,
  baumeBrixAbvTool as Tool,
  chaptalizationTool as Tool,
];
