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
        'Tu filtres une liste de liens découverts sur un site marchand (grille de catégorie).\n' +
        'Règles, dans l\'ordre :\n' +
        '1. EXCLUS d\'office les liens qui ne sont PAS une fiche produit individuelle : ' +
        'catégories, sous-catégories, listes/gammes, méga-menu, navigation, fil d\'Ariane, ' +
        'footer, « Nos agences/marques », contact, compte, recherche, pages marketing/collection. ' +
        '(Indice : une catégorie a souvent un compteur « (1 234) » ou une URL de type liste.)\n' +
        `2. Parmi les fiches produit restantes, conserve UNIQUEMENT celles dont le TYPE correspond à : « ${inst} ». ` +
        'Utilise le libellé ET le slug de l\'URL (le type produit y figure souvent).\n' +
        'IMPORTANT : ne garde JAMAIS un produit d\'un AUTRE type par proximité — ' +
        'ex. si on demande « perforateur », NE GARDE PAS les perceuses/visseuses/meuleuses/décapeurs. ' +
        'Si AUCUNE fiche ne correspond au type demandé, renvoie keep = [] (liste vide) — c\'est une réponse valide.\n' +
        'Réponds avec keep = la liste des indices (0-based) à CONSERVER.\n\n' +
        `Éléments :\n${list}`,
      schema: ResSchema,
      schemaForLLM: RES_SCHEMA_FOR_LLM as unknown as Record<string, unknown>,
    })
    const idx = new Set((raw.keep ?? []).filter((n) => Number.isInteger(n) && n >= 0 && n < items.length))
    const kept = items.filter((_, i) => idx.has(i))
    // Le LLM A RÉPONDU (même keep=[]) → on lui fait confiance : `applied:true`.
    // Un keep vide = « aucun ne correspond » HONNÊTE (ne pas ré-afficher les
    // non-correspondants). Le fail-open (garder tout) est réservé à un ÉCHEC LLM
    // (catch ci-dessous) — jamais un import à zéro par hoquet réseau/quota.
    return { kept, excludedCount: items.length - kept.length, applied: true }
  } catch (err) {
    console.warn('[instruction-filter] LLM indisponible — aucun filtrage (fail-open)', err)
    return { kept: items, excludedCount: 0, applied: false }
  }
}
