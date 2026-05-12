import type { GenerateOptions, GenerateResult } from './types.js';

const ABSTENTION_MESSAGE_ES =
  'No tengo evidencia suficiente en mi corpus para responder con seguridad. ¿Puedes subir el documento de referencia o reformular tu pregunta?';
const ABSTENTION_MESSAGE_EN =
  'I do not have enough evidence in my corpus to answer with confidence. Could you upload the reference document or rephrase your question?';

export type CitationGateOptions = {
  outputLanguage?: 'es' | 'en';
  minCitations?: number; // default 1
};

/**
 * Verifica que respuestas técnicas (opts.technical === true) lleven al menos N citas.
 * Si no, sustituye la respuesta por una abstención explícita.
 */
export function applyCitationGate(
  opts: GenerateOptions,
  result: GenerateResult,
  gateOpts: CitationGateOptions = {},
): GenerateResult {
  if (!opts.technical) return result;

  const minCitations = gateOpts.minCitations ?? 1;
  if (result.citations.length >= minCitations) return result;

  const lang = gateOpts.outputLanguage ?? 'es';
  const message = lang === 'en' ? ABSTENTION_MESSAGE_EN : ABSTENTION_MESSAGE_ES;

  return {
    ...result,
    content: message,
    abstained: true,
  };
}

/**
 * Detecta si las citas referenciadas en la respuesta existen en los chunks recuperados.
 * Si una cita apunta a un chunkId no presente → "cita rota" → marcamos abstención.
 */
export function validateCitationsExist(
  result: GenerateResult,
  availableChunkIds: Set<string>,
): { valid: boolean; brokenCitations: string[] } {
  const broken = result.citations.filter((id) => !availableChunkIds.has(id));
  return { valid: broken.length === 0, brokenCitations: broken };
}
