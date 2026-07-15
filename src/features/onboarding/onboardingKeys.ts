import { getApiKey } from '@/lib/apiKeys'

/** Fournisseurs LLM proposés dans le wizard d'onboarding, dans l'ordre d'affichage.
 *  Les deux premiers (Gemini + Claude) sont les modèles par défaut de l'app. */
export const LLM_KEY_IDS = ['gemini', 'anthropic', 'openrouter', 'openai', 'deepseek', 'qwen', 'kimi', 'glm'] as const

/** Clés mises en avant comme « recommandées » (modèles utilisés par défaut partout). */
export const RECOMMENDED_KEY_IDS: ReadonlySet<string> = new Set(['gemini', 'anthropic'])

/** true si AU MOINS une clé LLM est renseignée. Tant que c'est false, l'app ne peut
 *  rien générer → le wizard d'onboarding s'affiche pour réclamer une clé. */
export function hasAnyLlmKey(): boolean {
  return LLM_KEY_IDS.some((id) => !!getApiKey(id).trim())
}

/** Clé sessionStorage : « Plus tard » masque le wizard pour la session courante
 *  uniquement — il réapparaît à la prochaine ouverture tant qu'aucune clé n'existe. */
export const ONBOARDING_DISMISS_KEY = 'w2p:onboarding_keys_dismissed'
