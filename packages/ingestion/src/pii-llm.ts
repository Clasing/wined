import { scanPii, type PiiScanResult } from "./pii-detector.js";

/**
 * Pase combinado: regex + LLM (placeholder hasta Step 28).
 * Por ahora devuelve solo lo que el regex detecta.
 *
 * Cuando los agents pod estén montados, este stub llamará a
 * `@wined/llm-gateway` con un Sonnet sobre los primeros 2k chars
 * para detectar candidatos a nombres propios (name_candidate).
 */
export async function deepPiiScan(text: string): Promise<PiiScanResult> {
  return scanPii(text);
}
