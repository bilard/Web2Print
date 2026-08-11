// Orchestrateur d'une PASSE de moisson (un tick). Les E/S (fetch HTML, Firestore) sont
// injectées → testable sans réseau, et réutilisable à l'identique client/serveur.
//
// Une passe consomme un budget borné de pages puis rend la main : le curseur persiste,
// le tick suivant reprend. Jamais de balayage complet en un run (cf. audit : budget
// ~500 s, le node DOIT se terminer pour que le checkpoint survive).
import { parseListingPage, nextListingUrl, pageUrl, detectCatalogMode } from './competitorListing'
import { parseListingGeneric } from './genericListing'
import { parseListingDomCards } from './genericCards'
import { extractCategoryLinks, selectCategories, keywordsForFamilies } from './categories'
import { discoverGenericListings } from './genericDiscovery'
import { candidateListingUrls, probeListingUrls, childListings, shapeMates } from './probeListings'
import { MIN_PATHS_TO_TARGET } from './categoryTargeting'
import {
  initCursor, currentTarget, advance, openSweep, pageDocId, pageSignature,
  PLAN_RETRY_COOLDOWN_MS, type HarvestCursor,
} from './harvest'
import type { CompetitorListing } from './competitorListing'
// Messages de run : ces logs remontent dans le panneau d'exécution du workflow via
// `deps.log`. Helper `t()` de module — ce fichier est un moteur pur, pas un composant.
import { t } from '@/lib/i18n'

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
  /** Ciblage IA des catégories : reçoit les familles source et le plan brut, renvoie le
   *  plan RETENU (ou null pour « garde tout »). Injecté par le node — le module reste pur
   *  et testable sans LLM. Absent = comportement historique (filtre par mots-clés seul). */
  selectCategories?: (families: string[], urls: string[]) => Promise<string[] | null>
  /** Progression EN COURS de passe (toutes les N pages) → rafraîchit la méta live (jauge
   *  Balayage + heartbeat) pendant le run, sans attendre la fin. Optionnel. */
  onProgress?: (pagesFetched: number, productsIndexed: number, cursor: HarvestCursor) => void | Promise<void>
  /** Ignore le délai de reprise après un échec de planification — la relance MANUELLE
   *  (▶ d'un site) doit re-sonder tout de suite, l'utilisateur vient de changer un
   *  réglage (moteur, identifiants). */
  force?: boolean
  /** Horloge injectable (tests). Défaut : `Date.now`. */
  now?: () => number
  /**
   * Échéance de restitution (ms epoch) : la passe rend la main dès qu'elle est franchie,
   * curseur persisté, MÊME si le budget de pages n'est pas épuisé.
   *
   * ⚠ C'est ce qui rend un gros budget de pages SÛR. Sans elle, `pageBudget` est le seul
   * gouverneur : le régler haut pour collecter davantage risquait de faire dépasser la
   * fenêtre du run et d'affamer les nodes aval (« Comparer »), le régler bas bridait la
   * collecte alors que le temps était disponible. Avec elle, le budget redevient un
   * simple plafond de sécurité et c'est le TEMPS qui décide.
   */
  deadlineAt?: number
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
    if (ps.length > 0) return targetPlan(cfg, deps, ps)
  }
  // 2. GÉNÉRIQUE toute techno : sitemap (structure de confiance) puis liens home.
  const generic = await discoverGenericListings(cfg.domain, deps.fetchHtml, home, { keywords })
  if (generic.length > 0) return targetPlan(cfg, deps, generic)
  // 3. SONDAGE (dernier recours, coûteux) : les étages 1 et 2 devinent d'après l'URL et
  //    restent muets sur les plateformes maison (castorama : `…/cat_id_0003374.cat`).
  //    Ici on ouvre quelques liens internes et on garde ceux qui contiennent VRAIMENT des
  //    produits — le contenu tranche, pas la convention de chemin. Sans accueil lisible
  //    (403 anti-bot), il n'y a aucun candidat : on ne dépense rien.
  if (!home) return []
  const candidates = candidateListingUrls(home, cfg.domain, { keywords })
  if (candidates.length === 0) return []
  deps.log?.(t('run.harvest.unknownUrlPattern', { domain: cfg.domain, count: candidates.length }))

  // Les sous-rayons se lisent dans le HTML que la sonde a DÉJÀ récupéré : la descente
  // hiérarchique ne coûte pas une requête de plus.
  const children: string[] = []
  const confirmed = await probeListingUrls(
    candidates, deps.fetchHtml, (html, url) => extractListingProducts(html, url).length,
    { log: deps.log, onListing: (url, html) => children.push(...childListings(html, url)) },
  )
  if (confirmed.length === 0) return []

  // Une forme d'URL jugée liste vaut pour TOUS ses membres — c'est la raison d'être du
  // regroupement par forme, et le plan n'en retenait que le représentant sondé.
  const mates = shapeMates(home, cfg.domain, confirmed)
  const plan = dedupeUrls([...confirmed, ...children, ...mates]).slice(0, MAX_PLAN)
  deps.log?.(t('run.harvest.listPagesConfirmed', {
    domain: cfg.domain, confirmed: confirmed.length, plan: plan.length,
    children: children.length, mates: mates.length,
  }))
  return targetPlan(cfg, deps, plan)
}

/** Plafond du plan de moisson — aligné sur la découverte par sitemap. */
const MAX_PLAN = 250

/** Dédup insensible au `www.` et au `/` final (deux formes = deux `pageDocId` = doublons). */
function dedupeUrls(urls: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const u of urls) {
    let key = u
    try { const x = new URL(u); key = `${x.hostname.replace(/^www\./i, '')}${x.pathname.replace(/\/$/, '')}` } catch { /* URL exotique : clé brute */ }
    if (seen.has(key)) continue
    seen.add(key)
    out.push(u)
  }
  return out
}

/**
 * Réordonne/réduit un plan de moisson par appariement IA des vocabulaires (cf.
 * `categoryTargeting.ts`). Le filtre par mots-clés amont ne sait pas voir qu'un
 * concurrent range les courroies sous « transmission » ; ici on soumet ses catégories
 * RÉELLES au modèle avec les libellés RÉELS des familles source.
 *
 * FAIL-OPEN à chaque étage (pas de familles, plan trop court, pas d'injection, LLM en
 * erreur, réponse illisible) : on rend le plan d'origine. Un ciblage qui échoue ne doit
 * JAMAIS vider une moisson — c'est le mode de panne que ce module est censé supprimer.
 */
async function targetPlan(cfg: CompetitorConfig, deps: HarvestDeps, urls: string[]): Promise<string[]> {
  if (!deps.selectCategories || cfg.families.length === 0) return urls
  if (urls.length < MIN_PATHS_TO_TARGET) return urls
  try {
    const kept = await deps.selectCategories(cfg.families, urls)
    if (!kept || kept.length === 0) return urls
    deps.log?.(t('run.harvest.aiTargeting', { domain: cfg.domain, kept: kept.length, total: urls.length }))
    return kept
  } catch (e) {
    deps.log?.(t('run.harvest.aiTargetingUnavailable', {
      domain: cfg.domain, message: e instanceof Error ? e.message.slice(0, 120) : String(e),
    }))
    return urls
  }
}

/**
 * Produits d'une page liste, en cascade PrestaShop → JSON-LD → cartes DOM.
 *
 * ⚠ Le premier palier NON VIDE ne gagne pas. Une page catégorie qui se publie elle-même
 * en JSON-LD `Product` — pratique SEO courante ; swap-europe annonce « Pièces détachées
 * pour tondeuses » à 0,29 € — rendait 1 pseudo-produit qui masquait les 30 vraies cartes
 * du DOM, et faisait échouer la sonde (`minProducts = 4`) donc la découverte entière.
 *
 * Règle : le premier palier à ≥ 2 items gagne (une liste en a plusieurs par définition) ;
 * à défaut, le plus fourni — ce qui préserve la page FICHE isolée, moissonnée une par une
 * quand le sitemap ne donne que des produits, et qui n'expose légitimement qu'un item.
 */
export function extractListingProducts(html: string, url: string): CompetitorListing[] {
  let best: CompetitorListing[] = []
  for (const parse of [parseListingPage, parseListingGeneric, parseListingDomCards]) {
    const items = parse(html, url)
    if (items.length >= 2) return items
    if (items.length > best.length) best = items
  }
  return best
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
  const now = (deps.now ?? Date.now)()
  if (!cursor || cursor.done) {
    // Planification en veille après un échec récent : ne PAS repayer le sondage (jusqu'à
    // 24 requêtes) à chaque tick sur un site que la découverte ne sait pas lire.
    if (!deps.force && cursor?.planFailedAt != null && now - cursor.planFailedAt < PLAN_RETRY_COOLDOWN_MS) {
      deps.log?.(t('run.harvest.discoveryCoolingDown', {
        domain: cfg.domain, minutes: Math.round(PLAN_RETRY_COOLDOWN_MS / 60000),
      }))
      return { siteId: cfg.siteId, pagesFetched: 0, productsIndexed: 0, sweepComplete: true, cursor }
    }
    const categories = await planCategories(cfg, deps)
    if (categories.length === 0) {
      deps.log?.(t('run.harvest.noCategory', { domain: cfg.domain }))
      const empty = { ...(cursor ?? initCursor([])), planFailedAt: now }
      await deps.saveCursor(cfg.siteId, empty)
      return { siteId: cfg.siteId, pagesFetched: 0, productsIndexed: 0, sweepComplete: true, cursor: empty }
    }
    // Plan retrouvé : la veille n'a plus lieu d'être.
    cursor = cursor ? { ...openSweep(cursor, categories), planFailedAt: undefined } : initCursor(categories)
    deps.log?.(t('run.harvest.sweepingCategories', { domain: cfg.domain, count: categories.length }))
  }

  let pagesFetched = 0
  let productsIndexed = 0
  // Dit une seule fois par passe, pas à chaque page : le signal est une propriété de la
  // boutique, pas de la page.
  let catalogModeSeen = false

  for (let i = 0; i < pageBudget; i++) {
    if (deps.signal?.aborted) break
    // Restitution sur ÉCHÉANCE : le curseur est déjà persisté page par page, la reprise
    // au tick suivant est exacte.
    if (deps.deadlineAt != null && (deps.now ?? Date.now)() > deps.deadlineAt) {
      deps.log?.(t('run.harvest.runWindowReached', { domain: cfg.domain, pages: pagesFetched }))
      break
    }
    const target = currentTarget(cursor)
    if (!target) break

    // Page 2+ : l'URL VUE sur la page précédente (`rel="next"`) prime sur `?page=N`.
    // Un site qui pagine par segment de chemin (`/tondeuse/2` chez swap-europe) ignore
    // `?page=2` et resert la page 1 : le verrou d'empreinte fermait alors la catégorie
    // au bout de 2 requêtes, soit 1 page utile sur 18.
    const url = target.page === 1 ? target.categoryUrl : (cursor.nextUrl ?? pageUrl(target.categoryUrl, target.page))
    const html = await deps.fetchHtml(url)
    let hadItems = false
    let nextUrl: string | undefined
    let signature: string | undefined

    if (html) {
      // ⚠ Marchand qui NE PUBLIE PAS ses prix (PrestaShop en mode catalogue). Dit UNE fois
      // par passe : sans cela, un tel site se lit comme une panne de scraping — des
      // milliers de fiches, « prix 0 % », un écart médian vide, et l'on cherche pendant des
      // heures un sélecteur qui n'a jamais existé. Cas vécu : 5 907 fiches pour rien.
      if (!catalogModeSeen && detectCatalogMode(html)) {
        catalogModeSeen = true
        deps.log?.(t('run.harvest.catalogMode', { domain: cfg.domain }))
      }
      // Extraction en cascade : PrestaShop 1.7 (rapide) → JSON-LD ItemList → microdata/
      // cartes DOM génériques (garde-fous stricts : [] plutôt qu'un prix douteux).
      const products = extractListingProducts(html, url)
      hadItems = products.length > 0
      const next = nextListingUrl(html, url)
      // Un `rel="next"` pointant sur la page courante est une boucle : pas de suivante.
      nextUrl = next && next !== url ? next : undefined
      signature = pageSignature(products.map((p) => p.url))
      if (hadItems) {
        await deps.savePage(cfg.siteId, pageDocId(target.categoryUrl, target.page), url, target.page, products)
        productsIndexed += products.length
      }
    }
    pagesFetched++
    cursor = advance(cursor, { hadItems, hasNext: nextUrl != null, signature, nextUrl })
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
