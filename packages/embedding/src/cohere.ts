import { CohereClient } from 'cohere-ai';
import type { EmbeddingProvider } from './provider.js';

export class CohereEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'cohere';
  readonly dimensions = 1024;
  private client: CohereClient;
  private model: string;

  constructor(apiKey: string, model = 'embed-multilingual-v3.0') {
    this.client = new CohereClient({ token: apiKey });
    this.model = model;
  }

  async embed(
    texts: string[],
    inputType: 'query' | 'document' = 'document',
  ): Promise<number[][]> {
    const cohereInputType =
      inputType === 'query' ? 'search_query' : 'search_document';
    const res = await this.client.embed({
      texts,
      model: this.model,
      inputType: cohereInputType,
      embeddingTypes: ['float'],
    });
    // cohere-ai may return { embeddings: { float: number[][] } } or { embeddings: number[][] }
    const rawEmbeddings = (res as { embeddings: unknown }).embeddings;
    const floatField = (rawEmbeddings as { float?: number[][] } | null)?.float;
    const emb: number[][] = floatField ?? (rawEmbeddings as number[][]);
    return emb;
  }
}
