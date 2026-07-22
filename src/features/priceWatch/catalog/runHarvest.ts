// src/features/priceWatch/catalog/runHarvest.ts
// Orchestrateur d'une PASSE de moisson (un tick). Les E/S (fetch HTML, Firestore) sont
// injectées → testable sans réseau, et réutilisable à l'identique client/serveur.
//
// Une passe consomme un budget borné de pages puis rend la main : le curseur persiste,
// le tick suivant reprend. Jamais de balayage complet en un run (cf. audit : budget
// ~500 s, le node DOIT se terminer pour que le checkpoint survive).
import { parseListingPage, nextListingUrl, pageUrl } from './prestashop'
import { parseListingGeneric } from './genericListing'
import { parseListingDomCards } from './genericCards'
import { extractCategoryLinks, selectCategories, keywordsForFamilies } from './categories'
import { discoverGenericListings } from './genericDiscovery'
import {
  initCursor, currentTarget, advance, openSweep, pageDocId,
  type HarvestCursor,
} from './harvest'
import type { CompetitorListing } from './prestashop'

export interface CompetitorConfig {
  siteId: string
  domain: string
  /** Familles F1 à cibler (vide = catalogue complet). */
  families: string[]
}

export interface HarvestDeps {
  /** Récupère le HTML rendu d'une URL (CF fetchPageHtml côté client, fetch direct côté serveur). */
  fetchHtml: (url: string) => Promise<string | null>
  /** Curseur persisté du concurrent, ou null au premier passage. */
  loadCursor: (siteId: string) => Promise<HarvestCursor | null>
  /** Persiste le curseur. */
  saveCursor: (siteId: string, cursor: HarvestCursor) => Promise<void>
  /** Enregistre les produits d'une page (doc réécrit → refresh sans doublon). */
  savePage: (siteId: string, pageId: string, url: string, page: number, products: CompetitorListing[]) => Promise<void>
  /** Progression EN COURS de passe (toutes les N pages) → rafraîchit la méta live (jauge
   *  Balayage + heartbeat) pendant le run, sans attendre la fin. Optionnel. */
  onProgress?: (pagesFetched: number, productsIndexed: number, cursor: HarvestCursor) => void | Promise<void>
  log?: (msg: string) => void
  signal?: AbortSignal
}

/** Cadence des remontées de progression live (en pages). */
const PROGRESS_EVERY = 15

export interface HarvestPassResult {
  siteId: string
  pagesFetched: number
  productsIndexed: number
  sweepComplete: boolean
  cursor: HarvestCursor
}

/** `https://` + domaine nu, normalisé pour la page d'accueil. */
function homeUrl(domain: string): string {
  const d = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  return `https://www.${d.replace(/^www\./, '')}/`
}

/**
 * Découvre les catégories cibles d'un concurrent depuis sa page d'accueil, filtrées
 * par familles. Renvoie [] si l'accueil est injoignable — l'appelant décide alors de
 * ne pas ouvrir de balayage (plutôt qu'un balayage vide qui se croirait terminé).
 */
export async function planCategories(cfg: CompetitorConfig, deps: HarvestDeps): Promise<string[]> {
  const home = await deps.fetchHtml(homeUrl(cfg.domain))
  const keywords = keywordsForFamilies(cfg.families)
  // 1. PrestaShop 1.7 (rapide, éprouvé) : liens catégories `/{id}-{slug}` de l'accueil.
  if (home) {
    const ps = selectCategories(extractCategoryLinks(home, homeUrl(cfg.domain)), keywords)
    if (ps.length > 0) return ps
  }
  // 2. GÉNÉRIQUE toute techno : sitemap (structure de confiance) puis liens home.
  return discoverGenericListings(cfg.domain, deps.fetchHtml, home, { keywords })
}

/**
 * Exécute une passe de moisson pour UN concurrent, dans la limite de `pageBudget`
 * pages. Reprend le curseur persisté ; le rouvre (refresh) s'il était terminé.
 */
export async function harvestPass(
  cfg: CompetitorConfig,
  deps: HarvestDeps,
  pageBudget: number,
  /** Cadence de remontée `onProgress` (pages). Défaut 15 (heartbeat cron). La moisson
   *  manuelle mono-site passe 1 → mise à jour LIVE du tableau à chaque page. */
  progressEvery: number = PROGRESS_EVERY,
): Promise<HarvestPassResult> {
  let cursor = await deps.loadCursor(cfg.siteId)

  // Ouvrir ou rouvrir un balayage si nécessaire (premier passage, ou balayage terminé
  // → refresh sur un plan de catégories rafraîchi).
  if (!cursor || cursor.done) {
    const categories = await planCategories(cfg, deps)
    if (categories.length === 0) {
      deps.log?.(`${cfg.domain} : aucune catégorie cible trouvée (accueil injoignable ou familles absentes).`)
      const empty = cursor ?? initCursor([])
      return { siteId: cfg.siteId, pagesFetched: 0, productsIndexed: 0, sweepComplete: true, cursor: empty }
    }
    cursor = cursor ? openSweep(cursor, categories) : initCursor(categories)
    deps.log?.(`${cfg.domain} : balayage de ${categories.length} catégorie(s).`)
  }

  let pagesFetched = 0
  let productsIndexed = 0

  for (let i = 0; i < pageBudget; i++) {
    if (deps.signal?.aborted) break
    const target = currentTarget(cursor)
    if (!target) break

    const url = target.page === 1 ? target.categoryUrl : pageUrl(target.categoryUrl, target.page)
    const html = await deps.fetchHtml(url)
    let hadItems = false
    let hasNext = false

    if (html) {
      // Extraction en cascade : PrestaShop 1.7 (rapide) → JSON-LD ItemList → microdata/
      // cartes DOM génériques (garde-fous stricts : [] plutôt qu'un prix douteux).
      let products = parseListingPage(html, url)
      if (products.length === 0) products = parseListingGeneric(html, url)
      if (products.length === 0) products = parseListingDomCards(html, url)
      hadItems = products.length > 0
      hasNext = nextListingUrl(html, url) != null
      if (hadItems) {
        await deps.savePage(cfg.siteId, pageDocId(target.categoryUrl, target.page), url, target.page, products)
        productsIndexed += products.length
      }
    }
    pagesFetched++
    cursor = advance(cursor, { hadItems, hasNext })
    await deps.saveCursor(cfg.siteId, cursor)
    // Remontée live périodique (jauge Balayage + heartbeat) sans attendre la fin du site.
    if (deps.onProgress && pagesFetched % Math.max(1, progressEvery) === 0) await deps.onProgress(pagesFetched, productsIndexed, cursor)
  }

  return {
    siteId: cfg.siteId,
    pagesFetched,
    productsIndexed,
    sweepComplete: cursor.done,
    cursor,
  }
}
