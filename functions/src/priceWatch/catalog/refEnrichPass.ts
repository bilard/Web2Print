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
import { mapWithConcurrency } from '../concurrency'
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
  /**
   * Le site est lu en accès CONNECTÉ : ses fiches portent des prix professionnels qui
   * valent une visite même quand la référence est déjà connue (cf. `needsVisit`).
   */
  wantB2BPrices?: boolean
  /** Échéance du segment serveur : on rend la main ENTRE deux fiches. */
  deadlineAt?: number
  now?: () => number
}

/**
 * Fiches ouvertes SIMULTANÉMENT. Même esprit que le plafond de la moisson : assez pour
 * saturer la fenêtre, assez peu pour ne pas déclencher les limites de débit du site — qui,
 * sur un accès connecté, verrait une rafale comme un comportement suspect.
 */
const ENRICH_CONCURRENCY = 8

export interface RefEnrichResult {
  /** Fiches ouvertes pendant cette passe. */
  visited: number
  /** Fiches qui ont gagné une référence. */
  enriched: number
  /** Position de reprise : identifiant de la dernière page traitée, ou null si tout est vu. */
  cursor: string | null
}

/**
 * Une fiche mérite-t-elle une visite ?
 *
 * ⚠ Sur un site professionnel, la fiche porte aussi le prix d'ACHAT, le prix conseillé et
 * la remise, tous absents des pages de rayon : une fiche déjà identifiée mais dont ces prix
 * manquent vaut encore la visite.
 *
 * ⚠⚠ Mais SEULEMENT sur un accès connecté. Sans cette borne, un site public — dont aucune
 * fiche n'aura jamais de prix d'achat — verrait tout son index revisité à chaque cycle,
 * indéfiniment, pour ne rien trouver.
 */
function needsVisit(l: CompetitorListing, wantB2B: boolean): boolean {
  if (!l.url) return false
  if (!l.ref && !l.gtin13) return true
  // ⚠ Une fiche SANS PRIX vaut la visite : certaines pages de rayon n'en affichent aucun
  // (kramp n'expose le sien que sur la fiche), et une fiche sans prix ne se compare pas.
  if (l.price == null) return true
  return wantB2B && l.netPrice == null
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
    const targets = page.products.filter((l) => needsVisit(l, !!deps.wantB2BPrices))
    if (targets.length === 0) { cursor = page.id; continue }

    const byUrl = new Map<string, CompetitorListing>()
    // ⚠ « Page interrompue » ≠ « budget tout juste épuisé ». Une page dont la DERNIÈRE
    // fiche consomme le dernier crédit est terminée : ne pas la marquer la ferait rouvrir
    // au tick suivant, indéfiniment, sur un index qui n'avancerait jamais.
    let interrupted = false
    // ⚠⚠ Fiches ouvertes EN PARALLÈLE. Une visite prend une à deux secondes ; en série,
    // cent cinquante fiches occupaient quatre minutes de fenêtre pour couvrir 2 % d'un
    // index de sept mille — soit une nuit entière avant que les appariements ne bougent.
    // Elles sont indépendantes : rien ne justifiait de les attendre l'une après l'autre.
    const slice = targets.slice(0, Math.max(0, budget - visited))
    if (slice.length < targets.length) interrupted = true
    const fiches = await mapWithConcurrency(slice, ENRICH_CONCURRENCY, async (l) => {
      if (deps.signal?.aborted || (deps.deadlineAt != null && now() > deps.deadlineAt)) return null
      const html = await deps.fetchHtml(l.url).catch(() => null)
      return html ? { l, fiche: parseProductPage(html, l.url) } : { l, fiche: null }
    })
    for (const got of fiches) {
      if (!got) { interrupted = true; continue }
      visited++
      const { l, fiche } = got
      // On ne retient QUE la clé manquante et ce qui la corrobore. Le prix, lui, reste
      // celui de la page liste : c'est le prix de rayon, celui que la veille compare, et
      // une fiche produit peut afficher une autre grille (quantité, promotion).
      if (fiche?.ref || fiche?.gtin13 || fiche?.netPrice != null || fiche?.price != null) {
        byUrl.set(l.url, {
          ...l,
          ...(fiche.ref ? { ref: fiche.ref } : {}),
          ...(fiche.gtin13 ? { gtin13: fiche.gtin13 } : {}),
          // ⚠ Prix d'un espace PROFESSIONNEL : ils n'existent que sur la fiche, jamais sur
          // la page de rayon, et ils ne remplacent PAS `price`. Le prix d'achat sert la
          // négociation fournisseur, le conseillé la comparaison de marché — les fusionner
          // annoncerait des écarts de 150 % qui n'existent pas.
          ...(fiche.netPrice != null ? { netPrice: fiche.netPrice } : {}),
          ...(fiche.advisedPrice != null ? { advisedPrice: fiche.advisedPrice } : {}),
          ...(fiche.discountPct != null ? { discountPct: fiche.discountPct } : {}),
          // ⚠ Le prix de la fiche ne COMPLÈTE que l'absence — il ne remplace jamais celui
          // du rayon. Une fiche produit peut afficher une autre grille (quantité,
          // promotion), et c'est le prix de rayon que la veille compare.
          ...(l.price == null && fiche.price != null ? { price: fiche.price } : {}),
          ...(l.price == null && fiche.taxIncluded != null ? { taxIncluded: fiche.taxIncluded } : {}),
          // ⚠ Le visuel de la FICHE remplace celui de la liste, même s'il y en avait un :
          // la page de rayon sert une vignette de cent à trois cents pixels, la fiche le
          // grand visuel (cf. `extractZoomImage`). C'est celui-là qu'on veut pour comparer
          // deux produits côte à côte.
          ...(fiche.image ? { image: fiche.image } : {}),
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
