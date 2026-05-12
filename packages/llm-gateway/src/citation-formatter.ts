import type { LLMGateway } from './index.js';

export type CitationLanguage = 'es' | 'en';

const TRANSLATION_CACHE = new Map<string, string>();

/**
 * If the original citation language ≠ outputLanguage, returns
 *   "<original>" — traducción: "<translation>"
 * Otherwise returns the original unchanged.
 */
export async function formatBilingualCitation(
  gateway: LLMGateway,
  opts: {
    originalText: string;
    originalLanguage: CitationLanguage | string;
    outputLanguage: CitationLanguage;
    tenantId: string;
  },
): Promise<string> {
  if (opts.originalLanguage === opts.outputLanguage) return opts.originalText;

  // Cache by text + targetLang (in-memory; for prod use Redis)
  const cacheKey = `${opts.outputLanguage}::${opts.originalText}`;
  const cached = TRANSLATION_CACHE.get(cacheKey);
  if (cached) return cached;

  const targetLabel = opts.outputLanguage === 'en' ? 'translation' : 'traducción';

  // Quick translation via Haiku
  try {
    const result = await gateway.generate({
      model: 'claude-haiku-4',
      system: `You are a precise translator for wine regulation/scientific citations. Translate the given sentence to ${opts.outputLanguage}. Preserve technical terms (chemistry, regulation refs). Output ONLY the translation, no preamble.`,
      messages: [{ role: 'user', content: opts.originalText }],
      tenantId: opts.tenantId,
      agentName: 'citation-translator',
      technical: false,
      maxTokens: 500,
      temperature: 0,
    });

    const translation = result.content.trim();
    const formatted = `"${opts.originalText}" — ${targetLabel}: "${translation}"`;
    TRANSLATION_CACHE.set(cacheKey, formatted);
    return formatted;
  } catch (err) {
    console.error('[citation-formatter] translation failed', err);
    return opts.originalText;
  }
}

/**
 * Detects language of a citation snippet (heuristic).
 */
export function detectCitationLanguage(text: string): CitationLanguage {
  const sample = text.slice(0, 500).toLowerCase();
  const esHits = (sample.match(/\b(el|la|los|las|de|que|para|con|por|una?|según|artículo)\b/g) ?? []).length;
  const enHits = (sample.match(/\b(the|of|and|to|in|that|for|with|a|an|whereas|article)\b/g) ?? []).length;
  return esHits >= enHits ? 'es' : 'en';
}
