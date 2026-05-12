import { CohereEmbeddingProvider } from './cohere.js';
import { OpenAIEmbeddingProvider } from './openai.js';
import { VoyageEmbeddingProvider } from './voyage.js';
import { GeminiEmbeddingProvider } from './gemini.js';
import type { EmbeddingProvider } from './provider.js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export function createEmbeddingProvider(): EmbeddingProvider {
  const provider = process.env['EMBEDDING_PROVIDER'] ?? 'cohere';
  switch (provider) {
    case 'cohere':
      return new CohereEmbeddingProvider(requireEnv('COHERE_API_KEY'));
    case 'openai':
      return new OpenAIEmbeddingProvider(requireEnv('OPENAI_API_KEY'));
    case 'voyage':
      return new VoyageEmbeddingProvider(requireEnv('VOYAGE_API_KEY'));
    case 'gemini': {
      const opts: { model?: string; dimensions?: number } = {};
      const model = process.env['EMBEDDING_MODEL'];
      if (model) opts.model = model;
      const dims = process.env['EMBEDDING_DIMENSIONS'];
      if (dims) opts.dimensions = parseInt(dims, 10);
      return new GeminiEmbeddingProvider(requireEnv('GEMINI_API_KEY'), opts);
    }
    default:
      throw new Error(`Unknown EMBEDDING_PROVIDER: ${provider}`);
  }
}
