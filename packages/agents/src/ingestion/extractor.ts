import { z } from 'zod';
import type { LLMGateway } from '@wined/llm-gateway';

/**
 * Zod schemas for each ingestion document type extracted by the Sonnet
 * extractor agent. Schemas are strict — extra fields in model output are
 * silently dropped by `.parse`, but required/typed fields are enforced.
 */

export const WineListItemSchema = z.object({
  producer: z.string(),
  name: z.string(),
  vintage: z.number().int().nullable(),
  region: z.string().nullable(),
  denomination: z.string().nullable(),
  type: z.enum(['red', 'white', 'rose', 'sparkling', 'fortified', 'sweet', 'other']),
  price_eur: z.number().nullable(),
  stock: z.number().int().nullable(),
});

export const WineListSchema = z.object({
  list_name: z.string(),
  valid_from: z.string().nullable(),
  items: z.array(WineListItemSchema),
});

/**
 * Lab analyses schema — includes every relevant parameter and an
 * out_of_range_flags array (cross-check fix ING-04) so the extractor can
 * surface DO/EU regulation deviations directly during ingestion.
 */
export const LabReportSchema = z.object({
  sample_date: z.string(), // ISO date
  wine_lot_ref: z.string().nullable(),
  alcohol_pct_vol: z.number().nullable(),
  ph: z.number().nullable(),
  total_acidity_g_l: z.number().nullable(),
  volatile_acidity_g_l: z.number().nullable(), // AV — added by cross-check
  so2_free_mg_l: z.number().nullable(),
  so2_total_mg_l: z.number().nullable(),
  residual_sugar_g_l: z.number().nullable(),
  malolactic_done: z.boolean().nullable(),
  units: z.record(z.string()).optional(), // per-parameter unit hints
  out_of_range_flags: z.array(
    z.object({
      parameter: z.string(),
      value: z.number(),
      expected_min: z.number().nullable(),
      expected_max: z.number().nullable(),
      severity: z.enum(['info', 'warning', 'critical']),
    }),
  ),
  notes: z.string().nullable(),
});

export const TechnicalSheetSchema = z.object({
  wine_name: z.string(),
  producer: z.string(),
  vintage: z.number().int().nullable(),
  denomination: z.string().nullable(),
  grape_varieties: z.array(z.string()),
  alcohol_pct_vol: z.number().nullable(),
  aging: z.string().nullable(),
  tasting_notes: z.string().nullable(),
});

export const MenuSchema = z.object({
  menu_name: z.string(),
  season: z.string().nullable(),
  dishes: z.array(
    z.object({
      name: z.string(),
      description: z.string().nullable(),
      course: z.string().nullable(),
      ingredients: z.array(z.string()).optional(),
      allergens: z.array(z.string()).optional(),
    }),
  ),
});

export const RegulationArticleSchema = z.object({
  reg_code: z.string(), // e.g. "REG-UE-2019-934"
  article_ref: z.string(), // e.g. "Anexo I Parte B"
  jurisdiction: z.enum(['EU', 'ES', 'OIV', 'DO']),
  effective_date: z.string().nullable(),
  title: z.string(),
  content: z.string(),
  supersedes_ref: z.string().nullable(),
  topics: z.array(z.string()),
});

export const DocTypeExtractorMap = {
  wine_list: WineListSchema,
  lab_report: LabReportSchema,
  technical_sheet: TechnicalSheetSchema,
  menu: MenuSchema,
  regulation: RegulationArticleSchema,
} as const;

export type DocType = keyof typeof DocTypeExtractorMap;

export type ExtractedShape<T extends DocType> = z.infer<(typeof DocTypeExtractorMap)[T]>;

/**
 * Build the system prompt for a given doc_type. Kept exported so tests and
 * Langfuse traces can render the exact prompt used.
 */
export function buildExtractorSystemPrompt(docType: DocType): string {
  return [
    'Eres un agente extractor especializado del sistema Wined.',
    `Tipo de documento: ${docType}.`,
    'Extrae los campos en JSON estricto según el schema indicado.',
    'Si un campo no aparece en el documento, usa null (no inventes).',
    'Si detectas parámetros fuera de rango DO/normativa UE, llénalos en out_of_range_flags con severidad apropiada.',
    'Responde EXCLUSIVAMENTE con un objeto JSON válido, sin texto adicional.',
  ].join('\n');
}

export type RunExtractorOptions<T extends DocType> = {
  docType: T;
  documentText: string;
  tenantId: string;
  messageId?: string;
};

/**
 * Invoke the LLM gateway with a Sonnet extractor configured for the given
 * doc_type, then parse and validate the response against the matching Zod
 * schema. The function does not perform any network/LLM call itself — it
 * delegates to the injected gateway, keeping it trivially testable with a
 * stub gateway.
 */
export async function runExtractor<T extends DocType>(
  gateway: LLMGateway,
  opts: RunExtractorOptions<T>,
): Promise<ExtractedShape<T>> {
  const schema = DocTypeExtractorMap[opts.docType];

  const truncated = opts.documentText.slice(0, 50_000);
  const result = await gateway.generate({
    model: 'claude-sonnet-4',
    system: buildExtractorSystemPrompt(opts.docType),
    messages: [
      {
        role: 'user',
        content: `Documento a extraer:\n\n${truncated}\n\nDevuelve JSON.`,
      },
    ],
    tenantId: opts.tenantId,
    agentName: `ingestion-extractor-${opts.docType}`,
    technical: false, // ingestion extraction is not gated by citation policy
    maxTokens: 4096,
    temperature: 0.1,
  });

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(result.content);
  } catch {
    // Some models wrap JSON in ```json fences — try to recover one block.
    const match = result.content.match(/```json\n([\s\S]+?)\n```/);
    const block = match?.[1];
    if (block === undefined) {
      throw new Error('Extractor response is not valid JSON');
    }
    parsedJson = JSON.parse(block);
  }

  return schema.parse(parsedJson) as ExtractedShape<T>;
}
