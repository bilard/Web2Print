import { z } from 'zod'
import { generateJson } from '@/features/ai/llmRouter'

/** Un élément découvert filtrable (page produit du crawl, lien du map…). */
export interface FilterCandidate { url: string; title?: string }

export interface FilterOutcome<T> {
  /** Sous-ensemble à conserver. */
  kept: T[]
  /** Nombre d'éléments exclus par le filtre. */
  excludedCount: number
  /** Vrai si le filtre LLM a réellement été appliqué (sinon fail-open = tout gardé). */
  applied: boolean
}

const ResSchema = z.object({ keep: z.array(z.number()) })
const RES_SCHEMA_FOR_LLM = {
  type: 'object',
  properties: { keep: { type: 'array', items: { type: 'number' }, description: 'Indices 0-based à CONSERVER' } },
  required: ['keep'],
}

/**
 * Filtre une liste de pages/produits DÉCOUVERTS selon une instruction en langage
 * naturel (« ne garder que les perceuses Makita »). Le LLM localise/sélectionne,
 * il ne réécrit rien.
 *
 * FAIL-OPEN par conception (cf. « le LLM ne gate jamais la complétude ») : sur
 * erreur, réponse vide, ou résultat qui viderait tout, on retourne TOUT — jamais
 * de cull silencieux vers zéro. Le caller affiche les compteurs (transparence).
 */
export async function filterByInstruction<T extends FilterCandidate>(
  items: T[],
  instruction: string,
): Promise<FilterOutcome<T>> {
  const inst = instruction.trim()
  if (!inst || items.length === 0) return { kept: items, excludedCount: 0, applied: false }
  try {
    const list = items.map((it, i) => `${i}. ${(it.title ?? '').trim()} — ${it.url}`).join('\n')
    const raw = await generateJson<z.infer<typeof ResSchema>>({
      task: 'web.discoveryFilter',
      version: 'web.discoveryFilter.v1',
      prompt:
        'Tu filtres une liste de pages produit découvertes sur un site marchand.\n' +
        "Conserve UNIQUEMENT les éléments qui correspondent à l'instruction de l'utilisateur " +
        '(marque, catégorie, gamme…). En cas de doute, GARDE (mieux vaut garder à tort que jeter à tort).\n' +
        'Réponds avec keep = la liste des indices (0-based) des éléments à CONSERVER.\n\n' +
        `Instruction : ${inst}\n\nÉléments :\n${list}`,
      schema: ResSchema,
      schemaForLLM: RES_SCHEMA_FOR_LLM as unknown as Record<string, unknown>,
    })
    const idx = new Set((raw.keep ?? []).filter((n) => Number.isInteger(n) && n >= 0 && n < items.length))
    const kept = items.filter((_, i) => idx.has(i))
    // Fail-open : un filtre qui vide tout = probable dérapage LLM → on garde tout.
    if (kept.length === 0) return { kept: items, excludedCount: 0, applied: false }
    return { kept, excludedCount: items.length - kept.length, applied: true }
  } catch (err) {
    console.warn('[instruction-filter] LLM indisponible — aucun filtrage', err)
    return { kept: items, excludedCount: 0, applied: false }
  }
}
