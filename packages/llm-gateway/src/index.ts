import type {
  ContentBlock,
  MessageParam,
  Tool as AnthropicTool,
} from '@anthropic-ai/sdk/resources/messages.js';
import { createEmbeddingProvider } from '@wined/embedding';
import type { Langfuse } from 'langfuse';
import { SemanticCache } from './cache/semantic-cache.js';
import { applyCitationGate } from './citation-gate.js';
import { createLangfuse } from './langfuse.js';
import { AnthropicProvider } from './providers/anthropic.js';
import type { GenerateOptions, GenerateResult } from './types.js';

export class LLMGateway {
  private anthropic: AnthropicProvider;
  private cache: SemanticCache;
  private langfuse: Langfuse = createLangfuse();

  constructor(opts: { anthropicKey: string; redisUrl: string }) {
    this.anthropic = new AnthropicProvider(opts.anthropicKey);
    const embedder = createEmbeddingProvider();
    this.cache = new SemanticCache(opts.redisUrl, embedder);
  }

  async generate(opts: GenerateOptions): Promise<GenerateResult> {
    const start = Date.now();

    // 1. Semantic cache lookup
    if (opts.semanticCacheKey) {
      const cached = await this.cache.get<GenerateResult>(
        opts.tenantId,
        opts.agentName,
        opts.semanticCacheKey,
      );
      if (cached) {
        return {
          ...cached.response,
          cacheHit: true,
          latencyMs: Date.now() - start,
        };
      }
    }

    // 2. Langfuse trace
    const trace = this.langfuse.trace({
      name: opts.agentName,
      userId: opts.tenantId,
      ...(opts.metadata !== undefined ? { metadata: opts.metadata } : {}),
    });
    const generation = trace.generation({
      name: opts.agentName,
      model: opts.model,
      input: opts.messages,
    });

    // 3. Call Anthropic
    const res = await this.anthropic.generate({
      model: opts.model,
      messages: opts.messages as unknown as MessageParam[],
      ...(opts.system !== undefined ? { system: opts.system } : {}),
      ...(opts.tools !== undefined
        ? { tools: opts.tools as unknown as AnthropicTool[] }
        : {}),
      ...(opts.maxTokens !== undefined ? { maxTokens: opts.maxTokens } : {}),
      ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
    });

    // 4. Parse response
    const blocks = res.content as ContentBlock[];
    const content = blocks
      .filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    const toolCalls = blocks
      .filter(
        (b): b is Extract<ContentBlock, { type: 'tool_use' }> => b.type === 'tool_use',
      )
      .map((b) => ({ name: b.name, input: b.input }));

    const result: GenerateResult = {
      content,
      toolCalls,
      citations: extractCitations(content),
      tokensIn: res.usage.input_tokens,
      tokensOut: res.usage.output_tokens,
      latencyMs: Date.now() - start,
      cacheHit: false,
      traceId: trace.id,
      model: opts.model,
    };

    generation.end({
      output: content,
      usage: { input: result.tokensIn, output: result.tokensOut },
    });

    // 5. Citation gate (Step 21): abstain when technical answer lacks citations
    const outputLanguage = (opts.metadata as { outputLanguage?: 'es' | 'en' } | undefined)
      ?.outputLanguage;
    const gated = applyCitationGate(opts, result, {
      ...(outputLanguage !== undefined ? { outputLanguage } : {}),
      minCitations: 1,
    });

    // 6. Cache write — never cache abstained responses
    if (opts.semanticCacheKey && !gated.abstained) {
      await this.cache.set(opts.tenantId, opts.agentName, opts.semanticCacheKey, gated);
    }

    return gated;
  }
}

function extractCitations(text: string): string[] {
  // Citation format: [doc:<id>] or [chunk:<id>]
  const matches = text.matchAll(/\[(?:doc|chunk):([a-f0-9-]+)\]/g);
  return Array.from(matches, (m) => m[1]).filter((x): x is string => x !== undefined);
}

export * from './types.js';
export * from './citation-gate.js';
export * from './source-tier.js';
export * from './citation-formatter.js';
export { AnthropicProvider, resolveModelId } from './providers/anthropic.js';
export { SemanticCache } from './cache/semantic-cache.js';
