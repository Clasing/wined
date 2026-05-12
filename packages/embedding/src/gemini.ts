import type { EmbeddingProvider } from './provider.js';

const DEFAULT_MODEL = 'text-embedding-004';
const DEFAULT_DIMENSIONS = 1024;
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta';

export class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'gemini';
  readonly dimensions: number;
  private model: string;

  constructor(
    private apiKey: string,
    opts: { model?: string; dimensions?: number } = {},
  ) {
    this.dimensions = opts.dimensions ?? DEFAULT_DIMENSIONS;
    this.model = opts.model ?? DEFAULT_MODEL;
  }

  async embed(texts: string[], inputType: 'query' | 'document' = 'document'): Promise<number[][]> {
    // Gemini API: one request per text. Batch in parallel with a simple worker pool.
    const POOL = 6;
    const results: number[][] = new Array(texts.length);
    const queue: Array<{ t: string; i: number }> = texts.map((t, i) => ({ t, i }));
    const apiKey = this.apiKey;
    const model = this.model;
    const dimensions = this.dimensions;

    async function worker(): Promise<void> {
      while (queue.length) {
        const item = queue.shift();
        if (!item) break;
        const taskType = inputType === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT';
        const res = await fetch(`${ENDPOINT}/models/${model}:embedContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: `models/${model}`,
            content: { parts: [{ text: item.t }] },
            taskType,
            outputDimensionality: dimensions,
          }),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new Error(`Gemini embed ${res.status}: ${body.slice(0, 200)}`);
        }
        const data = (await res.json()) as { embedding: { values: number[] } };
        results[item.i] = data.embedding.values;
      }
    }

    const workers = Array.from({ length: Math.min(POOL, texts.length) }, () => worker());
    await Promise.all(workers);
    return results;
  }
}
