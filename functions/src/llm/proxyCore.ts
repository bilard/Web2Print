// functions/src/llm/proxyCore.ts
/**
 * Logique pure du proxy LLM serveur : mapping provider → requête HTTP
 * (endpoint + headers d'auth) et règle de budget. Séparée de la callable
 * pour être testable sans firebase-admin.
 */

export type LlmProxyProvider = 'claude' | 'gemini' | 'openai' | 'deepseek' | 'openrouter'

export const PROXY_PROVIDERS: readonly LlmProxyProvider[] = ['claude', 'gemini', 'openai', 'deepseek', 'openrouter']

/** Id de clé API dans users/{uid}.apiKeys.overrides (le provider "claude" range sa clé sous "anthropic"). */
export function keyIdForProvider(provider: LlmProxyProvider): string {
  return provider === 'claude' ? 'anthropic' : provider
}

export interface ProviderRequestSpec {
  url: string
  headers: Record<string, string>
}

export function buildProviderRequest(provider: LlmProxyProvider, model: string, apiKey: string): ProviderRequestSpec {
  switch (provider) {
    case 'claude':
      return {
        url: 'https://api.anthropic.com/v1/messages',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      }
    case 'gemini': {
      // Gemini 3.5+ n'est servi que sur l'API stable `v1` (404 sur `v1beta`) —
      // même logique que ENDPOINT() dans src/features/briefs/ai/geminiClient.ts.
      const version = /^gemini-3\.5/.test(model) ? 'v1' : 'v1beta'
      return {
        url: `https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent?key=${apiKey}`,
        headers: {},
      }
    }
    case 'openai':
      return { url: 'https://api.openai.com/v1/chat/completions', headers: { authorization: `Bearer ${apiKey}` } }
    case 'deepseek':
      return { url: 'https://api.deepseek.com/v1/chat/completions', headers: { authorization: `Bearer ${apiKey}` } }
    case 'openrouter':
      return {
        url: 'https://openrouter.ai/api/v1/chat/completions',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'http-referer': 'https://ibs-studio.com',
          'x-title': 'IBS-Studio',
        },
      }
  }
}

/** Budget mensuel bloquant : `null`/`undefined`/`0` = pas de limite. */
export function isOverBudget(budgetUsd: number | null | undefined, spentUsd: number): boolean {
  return typeof budgetUsd === 'number' && budgetUsd > 0 && spentUsd >= budgetUsd
}
