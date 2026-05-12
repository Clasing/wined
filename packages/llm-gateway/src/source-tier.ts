// Tier 1 = regulación aplicable (Reg UE, OIV, BOE, pliegos DO)
// Tier 2 = consenso técnico (estándares OIV no vinculantes, ISO, AENOR)
// Tier 3 = literatura técnica (libros, papers peer-reviewed)
// Tier 4 = KB privada del tenant
// Tier 5 = otros (web, scraping general)
export type SourceTier = 1 | 2 | 3 | 4 | 5;

export const TIER_WEIGHTS: Record<SourceTier, number> = {
  1: 1.0,
  2: 0.85,
  3: 0.7,
  4: 0.8, // KB privada del cliente: alta prioridad pero no por encima de regulación
  5: 0.4,
};

export type RetrievalChunk = {
  id: string;
  documentId: string;
  content: string;
  similarity: number; // cosine [0..1]
  sourceTier: SourceTier;
  metadata?: Record<string, unknown>;
};

export type RerankOptions = {
  privatePreference?: 'private_first' | 'global_first'; // default: private_first
};

export function rerankBySourceTier(
  chunks: RetrievalChunk[],
  opts: RerankOptions = {},
): RetrievalChunk[] {
  const pref = opts.privatePreference ?? 'private_first';
  return [...chunks]
    .map((c) => {
      let score = c.similarity * TIER_WEIGHTS[c.sourceTier];
      if (pref === 'private_first' && c.sourceTier === 4) score *= 1.1;
      if (pref === 'global_first' && c.sourceTier === 1) score *= 1.1;
      return { chunk: c, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((s) => s.chunk);
}
