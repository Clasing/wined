import type { AgentDef } from './agent.js';

const registry = new Map<string, AgentDef>();

export function registerAgent(def: AgentDef): void {
  registry.set(def.name, def);
}

export function getAgent(name: string): AgentDef | undefined {
  return registry.get(name);
}

export function listAgentsByPod(pod: AgentDef['pod']): AgentDef[] {
  return Array.from(registry.values()).filter((a) => a.pod === pod);
}

export function allAgents(): AgentDef[] {
  return Array.from(registry.values());
}
