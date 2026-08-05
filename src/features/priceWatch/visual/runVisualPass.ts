// Passe d'analyse visuelle d'un concurrent : pour chaque appariement, les deux photos
// sont soumises à un modèle de vision qui dit si elles montrent la même pièce.
//
// Adaptateur : la décision (prompt, verdict) vit dans `visualMatch.ts`, la persistance
// dans `visualStore.ts`. Ici, seulement l'orchestration — charger les images, appeler,
// reprendre où on s'était arrêté.
import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase/config'
import { z } from 'zod'
import { generateJson } from '@/features/ai/llmRouter'
import {
  visualPrompt, normalizeVisual, isComparable, VISUAL_SCHEMA, VISUAL_PROMPT_VERSION,
  type VisualResult,
} from './visualMatch'
import { urlKey, type StoredVisual, type VisualMap } from './visualStore'
import { debugLog } from '@/lib/debugLog'

const imageProxyFn = httpsCallable<{ url: string; maxBytes?: number }, { data: string; mimeType: string }>(
  functions, 'imageProxy',
)

/** Vignette suffisante pour juger une pièce, et plafond qui écarte les rendus lourds :
 *  au-delà, le coût par appel monte sans rien apprendre de plus au modèle. */
const MAX_IMAGE_BYTES = 1_500_000

const schema = z.object({
  score: z.number(),
  verdict: z.string(),
  note: z.string(),
})

/** Une paire à analyser, telle que l'écran ou le node la fournit. */
export interface VisualPair {
  /** Clé de la ligne : l'URL de la fiche concurrent. */
  url: string
  sourceImage?: string | null
  listingImage?: string | null
  sourceName: string
  listingName: string
}

/**
 * Télécharge une image via la Cloud Function (CORS et SSRF gérés serveur) et la rend en
 * data URI. `null` sur échec — une image absente n'est pas une erreur de la passe : la
 * paire est simplement déclarée non analysable.
 */
async function fetchDataUri(url: string): Promise<string | null> {
  try {
    const { data } = await imageProxyFn({ url, maxBytes: MAX_IMAGE_BYTES })
    return `data:${data.mimeType};base64,${data.data}`
  } catch (e) {
    debugLog('[pw-visual] image illisible', url, (e as Error).message)
    return null
  }
}

/**
 * Analyse UNE paire. Retourne `null` quand il n'y a rien à comparer — jamais un score
 * bas : un « 12 % » posé à côté d'un appariement correct ruinerait la confiance dans
 * tout l'écran d'audit, ce que ni une image manquante ni un proxy en échec ne justifient.
 */
async function analyzePair(pair: VisualPair): Promise<VisualResult | null> {
  if (!isComparable(pair.sourceImage, pair.listingImage)) return null
  const [a, b] = await Promise.all([
    fetchDataUri(pair.sourceImage as string),
    fetchDataUri(pair.listingImage as string),
  ])
  if (!a || !b) return null
  try {
    const raw = await generateJson({
      task: 'priceWatch.visualMatch',
      prompt: visualPrompt(pair.sourceName, pair.listingName),
      schema,
      schemaForLLM: VISUAL_SCHEMA as unknown as Record<string, unknown>,
      version: VISUAL_PROMPT_VERSION,
      imageDataUris: [a, b],
    })
    return normalizeVisual(raw)
  } catch (e) {
    debugLog('[pw-visual] analyse échouée', pair.url, (e as Error).message)
    return null
  }
}

export interface VisualPassOptions {
  /** Paires à traiter, déjà ordonnées de façon STABLE (le curseur indexe cet ordre). */
  pairs: VisualPair[]
  /** Verdicts déjà connus : une paire analysée n'est jamais repayée. */
  known: VisualMap
  /** Nombre maximum de paires à analyser dans cet appel. */
  budget: number
  /** Analyses simultanées. Au-delà, les quotas du fournisseur se déclenchent. */
  concurrency?: number
  onProgress?: (done: number, total: number) => void
  /** Interrompt la passe (fin de fenêtre d'exécution, annulation utilisateur). */
  shouldStop?: () => boolean
}

export interface VisualPassResult {
  /** Table complète (connus + nouveaux), prête à persister. */
  map: VisualMap
  analyzed: number
  skipped: number
  same: number
  different: number
  unclear: number
}

/**
 * Traite les paires non encore jugées, dans la limite du budget. Les paires déjà connues
 * sont sautées SANS appel : c'est ce qui rend la passe reprenable et son coût borné à ce
 * qui a réellement changé.
 */
export async function runVisualPass(opts: VisualPassOptions): Promise<VisualPassResult> {
  const { pairs, known, budget } = opts
  const concurrency = Math.max(1, Math.min(8, opts.concurrency ?? 4))
  const map: VisualMap = new Map(known)
  const out: VisualPassResult = { map, analyzed: 0, skipped: 0, same: 0, different: 0, unclear: 0 }

  const todo = pairs.filter((p) => {
    const hit = map.get(urlKey(p.url))
    if (hit && hit.v === VISUAL_PROMPT_VERSION) { out.skipped++; return false }
    return isComparable(p.sourceImage, p.listingImage)
  }).slice(0, budget)

  let next = 0
  const worker = async () => {
    while (next < todo.length) {
      if (opts.shouldStop?.()) return
      const pair = todo[next++]
      const res = await analyzePair(pair)
      if (res) {
        const entry: StoredVisual = { ...res, at: Date.now(), v: VISUAL_PROMPT_VERSION }
        map.set(urlKey(pair.url), entry)
        out.analyzed++
        if (res.verdict === 'same') out.same++
        else if (res.verdict === 'different') out.different++
        else out.unclear++
      }
      opts.onProgress?.(out.analyzed, todo.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, worker))
  return out
}
