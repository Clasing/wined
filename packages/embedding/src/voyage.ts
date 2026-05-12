import type { EmbeddingProvider } from './provider.js';

interface VoyageResponse {
  data: { embedding: number[] }[];
}

export class VoyageEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'voyage';
  readonly dimensions = 1024;
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model = 'voyage-multilingual-2') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async embed(
    texts: string[],
    inputType: 'query' | 'document' = 'document',
  ): Promise<number[][]> {
    const res = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: texts,
        model: this.model,
        input_type: inputType,
      }),
    });
    if (!res.ok) {
      throw new Error(`Voyage error ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as VoyageResponse;
    return data.data.map((d) => d.embedding);
  }
}
