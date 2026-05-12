import OpenAI from 'openai';
import type { EmbeddingProvider } from './provider.js';

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'openai';
  readonly dimensions: number;
  private client: OpenAI;
  private model: string;

  constructor(
    apiKey: string,
    model = 'text-embedding-3-large',
    dimensions = 1024,
  ) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
    this.dimensions = dimensions;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const res = await this.client.embeddings.create({
      model: this.model,
      input: texts,
      dimensions: this.dimensions,
    });
    return res.data.map((d) => d.embedding);
  }
}
