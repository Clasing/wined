// NOTE: PLAN.md §6 references logical model names `claude-haiku-4`/`claude-sonnet-4`/`claude-opus-4`.
// We expose those logical names here; the AnthropicProvider maps them to the concrete SDK
// model identifiers current at the time this package was written (May 2026):
//   claude-haiku-4   -> claude-haiku-4-5
//   claude-sonnet-4  -> claude-sonnet-4-5
//   claude-opus-4    -> claude-opus-4-5
// If the underlying SDK is upgraded and exposes newer model IDs, only the mapping in
// `providers/anthropic.ts` needs to change — callers continue to use the logical names.
export type ModelName = 'claude-haiku-4' | 'claude-sonnet-4' | 'claude-opus-4';

export type Message = {
  role: 'user' | 'assistant' | 'system';
  content:
    | string
    | Array<{ type: 'text' | 'tool_use' | 'tool_result'; [key: string]: unknown }>;
};

export type Tool = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>; // zod-inferred JSON schema
};

export type GenerateOptions = {
  model: ModelName;
  messages: Message[];
  system?: string;
  tools?: Tool[];
  maxTokens?: number;
  temperature?: number;
  tenantId: string;
  agentName: string;
  semanticCacheKey?: string; // if provided, semantic cache is consulted
  technical?: boolean; // if true, citation gate will apply in Step 21
  metadata?: Record<string, unknown>;
};

export type GenerateResult = {
  content: string;
  toolCalls: Array<{ name: string; input: unknown }>;
  citations: string[]; // doc IDs / chunk IDs referenced in content
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  cacheHit: boolean;
  traceId?: string;
  model: ModelName;
  abstained?: boolean; // populated by Step 21 citation gate
};
