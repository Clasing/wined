import Anthropic from '@anthropic-ai/sdk';
import type {
  MessageCreateParamsNonStreaming,
  MessageParam,
  Tool as AnthropicTool,
} from '@anthropic-ai/sdk/resources/messages.js';
import type { ModelName } from '../types.js';

// Map logical model names (used by the PLAN) to concrete SDK identifiers.
// Update this map when the SDK exposes newer models.
const MODEL_MAP: Record<ModelName, string> = {
  'claude-haiku-4': 'claude-haiku-4-5',
  'claude-sonnet-4': 'claude-sonnet-4-5',
  'claude-opus-4': 'claude-opus-4-5',
};

export function resolveModelId(name: ModelName | string): string {
  return MODEL_MAP[name as ModelName] ?? name;
}

export type AnthropicGenerateOptions = {
  model: ModelName | string;
  system?: string;
  messages: MessageParam[];
  tools?: AnthropicTool[];
  maxTokens?: number;
  temperature?: number;
};

export class AnthropicProvider {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async generate(opts: AnthropicGenerateOptions) {
    const params: MessageCreateParamsNonStreaming = {
      model: resolveModelId(opts.model),
      messages: opts.messages,
      max_tokens: opts.maxTokens ?? 2048,
      temperature: opts.temperature ?? 0.3,
      ...(opts.system !== undefined ? { system: opts.system } : {}),
      ...(opts.tools !== undefined ? { tools: opts.tools } : {}),
    };
    return this.client.messages.create(params);
  }

  stream(opts: AnthropicGenerateOptions) {
    return this.client.messages.stream({
      model: resolveModelId(opts.model),
      messages: opts.messages,
      max_tokens: opts.maxTokens ?? 2048,
      temperature: opts.temperature ?? 0.3,
      ...(opts.system !== undefined ? { system: opts.system } : {}),
      ...(opts.tools !== undefined ? { tools: opts.tools } : {}),
    });
  }
}
