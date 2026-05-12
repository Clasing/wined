import type { z } from 'zod';
import type { DocType } from '../ingestion/extractor.js';

export type AgentPod =
  | 'router'
  | 'sommelier'
  | 'cellar'
  | 'distributor'
  | 'ingestion'
  | 'curator';
export type AgentModel = 'haiku' | 'sonnet' | 'opus';

export type RagCorpus = {
  tenant: boolean;
  docTypes?: DocType[];
  global?: ('regulatory' | 'do' | 'catalog')[];
};

export interface AgentContext {
  organizationId: string;
  userId: string;
  workspaceId?: string;
  conversationId: string;
  outputLanguage: 'es' | 'en';
  kbPreference: 'private_first' | 'global_first' | 'show_both';
  serviceMode: boolean;
}

export interface Tool<TIn = unknown, TOut = unknown> {
  name: string;
  description: string;
  input: z.ZodSchema<TIn>;
  handler: (input: TIn, ctx: AgentContext) => Promise<TOut>;
}

export interface AgentDef {
  name: string;
  pod: AgentPod;
  model: AgentModel;
  systemPrompt: string;
  tools: Tool[];
  ragCorpus?: RagCorpus;
  technical: boolean;
  maxTokens?: number;
  temperature?: number;
}
