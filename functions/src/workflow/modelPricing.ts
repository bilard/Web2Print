// Tarifs des modèles appelables par le CRON, en USD par million de tokens.
//
// ⚠️ DUPLIQUÉ depuis `src/lib/aiModels.ts` : `functions/` est un projet TypeScript
// hermétique (`rootDir: "src"`), il ne peut importer aucun fichier hors de `functions/src`.
// C'est le test de parité `src/lib/aiModelsPricingParity.test.ts` qui rend la copie
// tenable : tout modèle présent des deux côtés DOIT y porter le même tarif, sans quoi le
// même appel coûterait deux prix selon qu'il part du navigateur ou de la tâche planifiée.
//
// ⚠ N'a pas à être exhaustif : seuls les modèles que le serveur peut réellement appeler
// comptent (cf. `PROVIDERS` dans `llm.ts`). Un modèle absent n'invente pas de tarif — il
// est compté ZÉRO et l'écran de suivi le dénonce, exactement comme côté client.

export interface ModelPricing {
  /** USD par million de tokens d'entrée. */
  input: number
  /** USD par million de tokens de sortie. */
  output: number
}

const PRICING: Record<string, ModelPricing> = {
  // DeepSeek — ⚠ l'entrée est celle du cache MISS : l'API ne dit pas lequel s'applique,
  // et un compteur de coût qui sous-estime ne sert à rien.
  'deepseek-v4-flash': { input: 0.14, output: 0.28 },
  'deepseek-chat': { input: 0.27, output: 1.10 },
  'deepseek-reasoner': { input: 0.55, output: 2.19 },

  // Gemini
  'gemini-3.7-flash': { input: 1.50, output: 9 },
  'gemini-3.6-flash': { input: 1.50, output: 9 },
  'gemini-3.5-flash': { input: 1.50, output: 9 },
  'gemini-3.1-pro-preview': { input: 1.25, output: 10 },
  'gemini-3.1-flash': { input: 0.30, output: 2.50 },
  'gemini-2.5-flash': { input: 0.30, output: 2.50 },

  // OpenAI
  'gpt-5.6-sol': { input: 5, output: 30 },
  'gpt-5.6-terra': { input: 2.50, output: 15 },
  'gpt-5.6-luna': { input: 1, output: 6 },
  'gpt-5.5-pro': { input: 30, output: 180 },
  'gpt-5.5': { input: 5, output: 30 },
  'gpt-5.4': { input: 2.50, output: 15 },
  'gpt-5.1': { input: 1.25, output: 10 },
  'gpt-5-mini': { input: 0.25, output: 2 },
  'gpt-5-nano': { input: 0.05, output: 0.40 },

  // Anthropic
  'claude-opus-4-8': { input: 15, output: 75 },
  'claude-opus-4-7': { input: 15, output: 75 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 0.80, output: 4 },
}

/** Tarif d'un modèle, ou `undefined` s'il est inconnu — jamais un tarif inventé. */
export function pricingOf(model: string): ModelPricing | undefined {
  return PRICING[model]
}

/** Coût en USD. Même formule que `computeCost` côté client, au caractère près. */
export function costOf(tokensIn: number, tokensOut: number, pricing: ModelPricing): number {
  return (tokensIn * pricing.input + tokensOut * pricing.output) / 1_000_000
}

/** Le catalogue brut — exposé pour le test de parité client↔serveur UNIQUEMENT. */
export const SERVER_MODEL_PRICING: Readonly<Record<string, ModelPricing>> = PRICING
