/**
 * Récupération de la liste des modèles texte/JSON d'un provider.
 *
 * Le listing passe désormais par la Cloud Function `listModels` (GET côté
 * serveur) : le navigateur ne peut pas interroger la plupart des endpoints
 * `/models` (bloqués par CORS pour OpenAI, DeepSeek, Qwen, Kimi, GLM…). Le
 * serveur lit la clé du user en Firestore, fait le GET sans contrainte CORS,
 * et renvoie la réponse brute `{ status, body }`. Le *parsing* (filtres
 * provider-spécifiques) reste ici, côté client, à l'identique des adaptateurs
 * historiques.
 */
import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase/config'
import { AI_MODELS, type AiProvider, type AiModelInfo } from '@/lib/aiModels'

/** Parseur de réponse `/models` → AiModelInfo[], avec seed de repli optionnel. */
interface ModelsParser {
  extract: (data: unknown) => AiModelInfo[]
  /** Seed renvoyé si l'endpoint est indisponible (404 / clé absente). Sans ça → throw. */
  fallbackOnError?: AiModelInfo[]
}

function pickArr<T>(data: unknown, key: 'data' | 'models'): T[] {
  if (typeof data !== 'object' || data === null) return []
  const arr = (data as Record<string, unknown>)[key]
  return Array.isArray(arr) ? (arr as T[]) : []
}

export const MODEL_PARSERS: Record<AiProvider, ModelsParser> = {
  claude: {
    extract: (data) =>
      pickArr<{ id: string; display_name?: string }>(data, 'data')
        .filter((m) => m.id.startsWith('claude-'))
        .map((m) => ({ id: m.id, label: m.display_name ?? m.id, pricing: { input: 0, output: 0 } })),
  },
  gemini: {
    extract: (data) =>
      pickArr<{ name: string; displayName?: string }>(data, 'models')
        .map((m) => ({ id: m.name.replace(/^models\//, ''), label: m.displayName ?? m.name }))
        .filter((m) => m.id.startsWith('gemini-') && !/(image|tts|embedding|aqa)/i.test(m.id))
        .map((m) => ({ id: m.id, label: m.label, pricing: { input: 0, output: 0 } })),
  },
  openai: {
    extract: (data) =>
      pickArr<{ id: string }>(data, 'data')
        .filter((m) =>
          (m.id.startsWith('gpt-') || /^o\d/.test(m.id)) &&
          !/(audio|realtime|search|tts|whisper|image|moderation)/i.test(m.id)
        )
        .map((m) => ({ id: m.id, label: m.id, pricing: { input: 0, output: 0 } })),
  },
  deepseek: {
    extract: (data) =>
      pickArr<{ id: string }>(data, 'data')
        .filter((m) => m.id.startsWith('deepseek-'))
        .map((m) => ({ id: m.id, label: m.id, pricing: { input: 0, output: 0 } })),
  },
  qwen: {
    extract: (data) =>
      pickArr<{ id: string }>(data, 'data')
        .filter((m) => /^qwen/i.test(m.id) && !/(audio|tts|asr|embedding|image|vl-)/i.test(m.id))
        .map((m) => ({ id: m.id, label: m.id, pricing: { input: 0, output: 0 } })),
  },
  openrouter: {
    // OpenRouter expose ~370 modèles avec pricing en USD par TOKEN (string).
    // On convertit en USD par 1M tokens (* 1e6) pour cohérence avec AI_MODELS.
    extract: (data) => {
      type RawModel = {
        id: string
        name?: string
        pricing?: { prompt?: string; completion?: string }
        architecture?: { modality?: string }
      }
      return pickArr<RawModel>(data, 'data')
        .filter((m) => {
          const mod = m.architecture?.modality ?? ''
          if (/image|audio|embedding/i.test(mod)) return false
          if (/(embedding|tts|whisper|asr|image-generation|moderation)/i.test(m.id)) return false
          return true
        })
        .map((m) => {
          const inUsd = parseFloat(m.pricing?.prompt ?? '0') * 1e6
          const outUsd = parseFloat(m.pricing?.completion ?? '0') * 1e6
          return {
            id: m.id,
            label: m.name ?? m.id,
            pricing: {
              input: Number.isFinite(inUsd) ? inUsd : 0,
              output: Number.isFinite(outUsd) ? outUsd : 0,
            },
          }
        })
    },
  },
  kimi: {
    extract: (data) =>
      pickArr<{ id: string }>(data, 'data')
        .filter((m) => /^kimi/i.test(m.id) || /^moonshot/i.test(m.id))
        .map((m) => ({ id: m.id, label: m.id, pricing: { input: 0, output: 0 } })),
    fallbackOnError: [{ id: 'kimi-for-coding', label: 'Kimi for Coding', pricing: { input: 0, output: 0 } }],
  },
  glm: {
    extract: (data) =>
      pickArr<{ id: string }>(data, 'data')
        .filter((m) => /glm/i.test(m.id))
        .map((m) => ({ id: m.id, label: m.id, pricing: { input: 0, output: 0 } })),
    fallbackOnError: AI_MODELS.glm,
  },
}

interface ListModelsResult {
  status: number
  body: string
}

const callListModels = httpsCallable<{ provider: AiProvider }, ListModelsResult>(
  functions,
  'listModels',
  { timeout: 60_000 },
)

/**
 * Récupère la liste des modèles d'un provider via la CF `listModels`.
 * Lève une erreur (message user-friendly) si le serveur échoue et qu'il n'y a
 * pas de seed de repli — l'appelant affiche alors un toast.
 */
export async function fetchModelsViaServer(provider: AiProvider): Promise<AiModelInfo[]> {
  const parser = MODEL_PARSERS[provider]
  try {
    const { data } = await callListModels({ provider })
    if (data.status < 200 || data.status >= 300) {
      if (parser.fallbackOnError) return parser.fallbackOnError
      throw new Error(`${provider} ${data.status}`)
    }
    return parser.extract(JSON.parse(data.body))
  } catch (err) {
    if (parser.fallbackOnError) return parser.fallbackOnError
    throw err
  }
}
