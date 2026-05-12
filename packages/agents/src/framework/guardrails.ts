import type { LLMGateway } from '@wined/llm-gateway';

export type GuardrailIntent =
  | 'medical'
  | 'legal_personal'
  | 'financial'
  | 'comparative_subjective'
  | 'safe';

export type GuardrailResult = {
  intent: GuardrailIntent;
  shouldBlock: boolean;
  redirectMessage?: string;
};

const REDIRECT_ES: Record<Exclude<GuardrailIntent, 'safe'>, string> = {
  medical:
    'No puedo dar consejo médico. Para preguntas de salud relacionadas con el vino o el alcohol, consulta a un profesional sanitario o a tu médico de cabecera.',
  legal_personal:
    'No puedo asesorar legalmente a título personal. Para tus circunstancias específicas, consulta a un abogado especializado en derecho del vino o consumo.',
  financial:
    'No puedo dar consejo financiero o de inversión. Si buscas invertir en vino, consulta a un asesor financiero registrado.',
  comparative_subjective:
    'No puedo emitir opiniones comparativas subjetivas entre productores o marcas. Puedo comparar parámetros objetivos (química, normativa, perfil organoléptico documentado) si me lo pides.',
};

const REDIRECT_EN: Record<Exclude<GuardrailIntent, 'safe'>, string> = {
  medical:
    'I cannot give medical advice. For health-related questions about wine or alcohol, consult a healthcare professional.',
  legal_personal:
    'I cannot provide personal legal advice. For your specific situation, consult a lawyer specialized in wine or consumer law.',
  financial:
    'I cannot give financial or investment advice. If you are considering wine investment, consult a licensed financial advisor.',
  comparative_subjective:
    'I cannot make subjective comparative judgments between producers or brands. I can compare objective parameters (chemistry, regulation, documented organoleptic profile) if you ask.',
};

const CLASSIFIER_PROMPT = `You are a fast intent classifier for a wine B2B assistant.
Classify the user message into exactly ONE of:
- medical: asking medical/health advice (e.g. "can I drink wine while pregnant", "wine and my medication")
- legal_personal: asking for legal advice for their personal situation (e.g. "can I sue my supplier", "is this contract valid")
- financial: asking for investment/financial advice (e.g. "should I invest in Burgundy 2018", "is this winery a good purchase")
- comparative_subjective: asking for subjective opinion comparing brands/producers (e.g. "is Vega Sicilia better than Pingus", "which producer is best")
- safe: anything else — wine knowledge, sommelier work, enology, regulation, cellar operations, etc.

Respond with a single JSON object: {"intent": "<value>"}. Nothing else.`;

export async function classifyIntent(
  gateway: LLMGateway,
  message: string,
  tenantId: string,
): Promise<GuardrailResult> {
  const result = await gateway.generate({
    model: 'claude-haiku-4',
    system: CLASSIFIER_PROMPT,
    messages: [{ role: 'user', content: message }],
    tenantId,
    agentName: 'guardrail-classifier',
    technical: false,
    maxTokens: 50,
    temperature: 0,
  });

  let intent: GuardrailIntent = 'safe';
  try {
    const parsed: unknown = JSON.parse(result.content.trim());
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'intent' in parsed &&
      typeof (parsed as { intent: unknown }).intent === 'string'
    ) {
      const v = (parsed as { intent: string }).intent.toLowerCase();
      if (
        v === 'medical' ||
        v === 'legal_personal' ||
        v === 'financial' ||
        v === 'comparative_subjective'
      ) {
        intent = v;
      }
    }
  } catch {
    intent = 'safe';
  }

  if (intent === 'safe') return { intent, shouldBlock: false };
  return { intent, shouldBlock: true, redirectMessage: REDIRECT_ES[intent] };
}

export function redirectMessageFor(
  intent: GuardrailIntent,
  lang: 'es' | 'en',
): string | null {
  if (intent === 'safe') return null;
  return lang === 'en' ? REDIRECT_EN[intent] : REDIRECT_ES[intent];
}
