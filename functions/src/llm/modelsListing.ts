// functions/src/llm/modelsListing.ts
/**
 * Construction de la requête GET `/models` par provider, exécutée côté serveur
 * (aucune contrainte CORS, contrairement au navigateur). Le parsing de la
 * réponse reste côté client (`src/lib/aiModelsListing.ts`).
 */

export type ListModelsProvider =
  | 'claude' | 'gemini' | 'openai' | 'deepseek' | 'qwen' | 'kimi' | 'glm' | 'openrouter'

export const LIST_MODELS_PROVIDERS: readonly ListModelsProvider[] = [
  'claude', 'gemini', 'openai', 'deepseek', 'qwen', 'kimi', 'glm', 'openrouter',
]

/** Clé Firestore (`users/{uid}.apiKeys.overrides[keyId]`) associée au provider. */
export function keyIdForListProvider(provider: ListModelsProvider): string {
  return provider === 'claude' ? 'anthropic' : provider
}

/** OpenRouter liste ses modèles sans authentification ; les autres exigent une clé. */
export function needsKeyForListing(provider: ListModelsProvider): boolean {
  return provider !== 'openrouter'
}

/** Plafond documenté de `models.list` : « at most 1000 models per page ». */
const GEMINI_PAGE_SIZE = 1000

/** Nombre de pages suivies au maximum. Garde-fou : un jeton qui ne se tarirait pas
 *  boucherait la Function jusqu'au timeout. Mille modèles par page × cinq pages couvre
 *  très largement le catalogue d'un provider. */
export const MAX_MODEL_PAGES = 5

export interface ModelsRequestSpec {
  url: string
  headers: Record<string, string>
}

/**
 * URL + headers du GET `/models` pour un provider donné.
 *
 * ⚠⚠ GEMINI PAGINE, et son défaut est BAS : sans `pageSize`, l'API rend **50 modèles**
 * et un `nextPageToken`. Google en publie bien davantage (toutes générations et variantes
 * confondues) — les plus RÉCENTS tombaient donc hors de la première page, et le bouton
 * « rafraîchir » annonçait « aucun nouveau modèle » en toute bonne foi. On demande le
 * maximum documenté (1000, plafonné côté Google) ET on suit le jeton : les deux, parce
 * qu'un plafond n'est pas une garantie.
 */
export function buildModelsRequest(
  provider: ListModelsProvider, apiKey: string, pageToken?: string,
): ModelsRequestSpec {
  const bearer: Record<string, string> = apiKey ? { Authorization: `Bearer ${apiKey}` } : {}
  switch (provider) {
    case 'claude':
      return {
        url: 'https://api.anthropic.com/v1/models',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      }
    case 'gemini':
      return {
        url: 'https://generativelanguage.googleapis.com/v1beta/models'
          + `?key=${encodeURIComponent(apiKey)}&pageSize=${GEMINI_PAGE_SIZE}`
          + (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''),
        headers: {},
      }
    case 'openai':
      return { url: 'https://api.openai.com/v1/models', headers: bearer }
    case 'deepseek':
      return { url: 'https://api.deepseek.com/v1/models', headers: bearer }
    case 'qwen':
      return { url: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models', headers: bearer }
    case 'kimi':
      return { url: 'https://api.kimi.com/coding/v1/models', headers: bearer }
    case 'glm':
      return { url: 'https://api.z.ai/api/paas/v4/models', headers: bearer }
    case 'openrouter':
      return { url: 'https://openrouter.ai/api/v1/models', headers: bearer }
  }
}

/**
 * Jeton de la page suivante, ou `null` s'il n'y en a plus.
 *
 * Seul Gemini pagine parmi les providers listés ici ; pour les autres, une seule requête
 * rend tout le catalogue. Un corps illisible rend `null` : on garde ce qu'on a plutôt que
 * de faire échouer un rafraîchissement déjà à moitié réussi.
 */
export function nextModelsPageToken(provider: ListModelsProvider, body: string): string | null {
  if (provider !== 'gemini') return null
  try {
    const token = (JSON.parse(body) as { nextPageToken?: unknown }).nextPageToken
    return typeof token === 'string' && token ? token : null
  } catch {
    return null
  }
}

/**
 * Recolle les pages en UNE réponse, dans la forme que le client sait déjà parser
 * (`{ models: [...] }`). Le client reste inchangé : il ne doit pas avoir à savoir
 * lequel des huit providers pagine.
 */
export function mergeModelsPages(bodies: string[]): string {
  const models: unknown[] = []
  for (const b of bodies) {
    try {
      const page = (JSON.parse(b) as { models?: unknown }).models
      if (Array.isArray(page)) models.push(...page)
    } catch {
      // Page illisible : ignorée, les autres restent exploitables.
    }
  }
  return JSON.stringify({ models })
}
