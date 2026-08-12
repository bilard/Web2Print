// Enrichir l'index d'un concurrent en VISITANT ses fiches produit.
//
// ⚠⚠ Pourquoi cette passe existe : mesuré en production, progarden.fr indexait 6 982 fiches
// dont ZÉRO ne portait de référence — son thème n'en affiche aucune sur les pages de rayon.
// Sans clé, ces fiches ne peuvent s'apparier que par libellé, et 6 982 produits collectés
// pesaient 849 appariements. La référence existe pourtant : elle est sur la page produit,
// une page plus loin.
//
// La moisson ne peut pas la chercher elle-même — elle parcourt des rayons, pas des fiches,
// et ouvrir chaque produit pendant le balayage ferait exploser son budget. C'est donc une
// passe SÉPARÉE, avec son propre curseur et son propre budget, qui reprend là où elle s'est
// arrêtée : quelques dizaines de fiches par tick, jusqu'à couvrir l'index.
//
// Ne touche QUE les fiches sans référence : une fiche déjà identifiée n'a rien à gagner à
// une visite, et le budget doit aller là où il manque une clé.
import { parseProductPage } from './competitorListing'
import type { CompetitorListing } from './competitorListing'

/** Une page d'index telle qu'elle est stockée (cf. `store.savePage`). */
export interface IndexedPage {
  id: string
  url: string
  page: number
  products: CompetitorListing[]
}

export interface RefEnrichDeps {
  /** Pages de l'index, dans un ordre stable. */
  loadPages: () => Promise<IndexedPage[]>
  /** Lit une fiche produit (canal du site : connecté, moteur forcé…). */
  fetchHtml: (url: string) => Promise<string | null>
  /** Réécrit une page enrichie. */
  savePage: (page: IndexedPage) => Promise<void>
  log?: (m: string) => void
  signal?: { aborted: boolean }
  /** Échéance du segment serveur : on rend la main ENTRE deux fiches. */
  deadlineAt?: number
  now?: () => number
}

export interface RefEnrichResult {
  /** Fiches ouvertes pendant cette passe. */
  visited: number
  /** Fiches qui ont gagné une référence. */
  enriched: number
  /** Position de reprise : identifiant de la dernière page traitée, ou null si tout est vu. */
  cursor: string | null
}

/** Une fiche mérite-t-elle une visite ? */
function needsRef(l: CompetitorListing): boolean {
  return !l.ref && !l.gtin13 && !!l.url
}

/**
 * Visite les fiches sans référence et complète l'index.
 *
 * `budget` borne le nombre de fiches OUVERTES, pas de pages parcourues : c'est le fetch qui
 * coûte. `fromCursor` reprend après la dernière page traitée — les pages sont parcourues
 * dans l'ordre rendu par `loadPages`, qui doit donc être stable d'un tick à l'autre.
 */
export async function refEnrichPass(
  deps: RefEnrichDeps, budget: number, fromCursor?: string | null,
): Promise<RefEnrichResult> {
  const now = deps.now ?? (() => Date.now())
  const pages = await deps.loadPages()
  // Reprise : on saute tout ce qui précède le curseur. Curseur absent de la liste (page
  // supprimée depuis) → on repart du début plutôt que de tout sauter.
  const start = fromCursor ? pages.findIndex((p) => p.id === fromCursor) + 1 : 0
  const from = start > 0 && start <= pages.length ? start : 0

  let visited = 0
  let enriched = 0
  let cursor: string | null = fromCursor ?? null

  for (let i = from; i < pages.length; i++) {
    if (deps.signal?.aborted) break
    if (visited >= budget) break
    if (deps.deadlineAt != null && now() > deps.deadlineAt) break

    const page = pages[i]
    const targets = page.products.filter(needsRef)
    if (targets.length === 0) { cursor = page.id; continue }

    const byUrl = new Map<string, CompetitorListing>()
    // ⚠ « Page interrompue » ≠ « budget tout juste épuisé ». Une page dont la DERNIÈRE
    // fiche consomme le dernier crédit est terminée : ne pas la marquer la ferait rouvrir
    // au tick suivant, indéfiniment, sur un index qui n'avancerait jamais.
    let interrupted = false
    for (const l of targets) {
      if (visited >= budget || deps.signal?.aborted
        || (deps.deadlineAt != null && now() > deps.deadlineAt)) { interrupted = true; break }
      visited++
      const html = await deps.fetchHtml(l.url).catch(() => null)
      if (!html) continue
      const fiche = parseProductPage(html, l.url)
      // On ne retient QUE la clé manquante et ce qui la corrobore. Le prix, lui, reste
      // celui de la page liste : c'est le prix de rayon, celui que la veille compare, et
      // une fiche produit peut afficher une autre grille (quantité, promotion).
      if (fiche?.ref || fiche?.gtin13) {
        byUrl.set(l.url, {
          ...l,
          ...(fiche.ref ? { ref: fiche.ref } : {}),
          ...(fiche.gtin13 ? { gtin13: fiche.gtin13 } : {}),
          ...(!l.image && fiche.image ? { image: fiche.image } : {}),
        })
        enriched++
      }
    }

    if (byUrl.size > 0) {
      await deps.savePage({
        ...page,
        products: page.products.map((p) => byUrl.get(p.url) ?? p),
      })
    }
    // Page marquée traitée seulement si on l'a menée à son terme : sinon le tick suivant
    // reprendrait APRÈS des fiches jamais ouvertes.
    if (interrupted) break
    cursor = page.id
  }

  // Index entièrement parcouru : on rend `null` pour que le prochain cycle reparte du
  // début — les pages remoissonnées entre-temps peuvent avoir perdu leur référence.
  const done = cursor != null && pages.length > 0 && cursor === pages[pages.length - 1].id
  return { visited, enriched, cursor: done ? null : cursor }
}
