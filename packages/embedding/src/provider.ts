export interface EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  embed(texts: string[], inputType?: 'query' | 'document'): Promise<number[][]>;
}
