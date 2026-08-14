// src/features/priceWatch/catalog/searchDirected.ts
// Recherche DIRIGÉE (complément de la moisson par liste). Au lieu d'aspirer les listes
// catégorie par catégorie — qui rate les produits tant que la couverture est partielle —
// on interroge le MOTEUR DE RECHERCHE du concurrent avec les clés du produit source
// (réf, puis EAN), et on apparie le résultat par PREUVE EXACTE (proveMatch). Zéro faux
// positif : le nom n'est jamais une preuve ici (cf. keys.ts). Prouvé en vrai : une
// recherche « A97 » sur jardimax retourne « Courroie A97 Alpina/GGP/Stiga » que la
// moisson à 8 % de couverture n'avait jamais croisée.
//
// Fonctions PURES (E/S injectées via SearchDeps.fetchHtml), donc testables et partagées
// client/serveur, comme le reste de features/priceWatch/catalog.

import { parseListingPage, type CompetitorListing } from './competitorListing'
import { candidateKeys, proveMatch, type SourceProductKeys, type MatchProof } from './keys'
import { directedVetoedPair } from './match'
import { DEFAULT_PAIRING_RULES, type PairingRules } from './pairingRules'
import { mapWithConcurrency } from '../concurrency'
import { t, DEFAULT_LOCALE, type Locale } from '../../i18nMessages'

export interface SearchDeps {
  /** Récupère le HTML rendu d'une URL (même dépendance que la moisson : CF côté client,
   *  fetch direct côté serveur). */
  fetchHtml: (url: string) => Promise<string | null>
  /** Recherche web (`site:domaine réf`) → URLs candidates. Alimente le mode GÉNÉRIQUE
   *  (marketplaces non-PrestaShop). Optionnel : sans lui, seul le moteur du site est utilisé. */
  searchWeb?: (query: string) => Promise<string[]>
  /** Extraction produit générique (Firecrawl rendu JS + schéma) d'UNE fiche → listing.
   *  Optionnel ; requis avec searchWeb pour le mode générique. */
  extractProduct?: (url: string) => Promise<CompetitorListing | null>
  /** Signal d'abort (timeout serveur) : surveillé DANS les boucles internes du mode
   *  générique (searchWeb + Firecrawl, jusqu'à ~9 appels lents par produit·site) pour ne
   *  pas dépasser le budget de run et faire tuer la Function. */
  signal?: { aborted: boolean }
  log?: (msg: string) => void
  /** Règles d'appariement du suivi. Injectées ici plutôt qu'en paramètre de chaque
   *  fonction : c'est déjà le canal par lequel ce module reçoit tout ce qui vient du
   *  monde extérieur. Absentes = règles par défaut, soit le comportement historique. */
  rules?: PairingRules
  /** Langue des messages de run (cf. `HarvestDeps.locale`). Repli FR. */
  locale?: Locale
  /** Progression après CHAQUE produit traité (parité client). Sous parallélisme, le
   *  premier argument est le NOMBRE de produits terminés, pas un rang : les tâches ne
   *  finissent pas dans l'ordre. */
  onProduct?: (processed: number, total: number, hits: number) => void
}

/** Domaine nu (sans protocole, sans www, sans chemin) pour un opérateur `site:`. */
function bareDomain(domain: string): string {
  return domain.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').replace(/^www\./i, '')
}

/**
 * Classe les URLs candidates : FICHES PRODUIT d'abord, pages catégorie/recherche/blog en
 * dernier. Une recherche « site:X réf » renvoie souvent des catégories — on veut la fiche.
 * Générique (patterns communs à Amazon /dp/, Cdiscount /f-….html, Shopify /products/…).
 */
export function preferProductUrls(urls: string[]): string[] {
  const score = (u: string): number => {
    let s = 0
    if (/\/(?:p|dp|vp|product|products|prod|item|itm)\//i.test(u)) s += 3
    if (/\/f-\d+-/i.test(u)) s += 3          // Cdiscount : fiche produit
    if (/-\d{6,}(?:\.html?)?(?:[?#]|$)/i.test(u)) s += 1 // id produit en fin d'URL
    if (/\/(?:cat|categorie|category|r|recherche|search|k|blog|guide|conseils|aide)\//i.test(u)) s -= 5
    if (/\/(?:cat|r)-/i.test(u)) s -= 5      // manomano /cat/…, cdiscount /r-…
    return s
  }
  return urls
    .map((u, i) => ({ u, s: score(u), i }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.u)
}

/**
 * Mode GÉNÉRIQUE (toute techno, marketplaces) : pour chaque clé, cherche `site:domaine clé`
 * sur le web, puis extrait les fiches candidates via Firecrawl (rendu JS + anti-bot) et
 * renvoie le premier apparié par PREUVE EXACTE. Ciblé par réf → coût borné (crédits).
 */
/** Produit source, clés + LIBELLÉ. Le nom ne prouve jamais un appariement — mais il peut
 *  le DÉMENTIR : cf. `directedVetoedPair`. */
export type DirectedProductInput = SourceProductKeys & {
  name?: string
  /** Prix source HT. Sert UNIQUEMENT au démenti par gouffre de prix, et seulement quand
   *  les démentis sont unifiés — absent, ce test-là ne se déclenche pas. */
  price?: number
  /** Description F1 et rangement du catalogue : ils ne servent pas à CHERCHER, mais à
   *  établir la NATURE du produit (origine / adaptable). Sans eux, le démenti de nature
   *  ne dispose que du libellé — et un adaptable qui déclare « Remplace origine : … »
   *  passerait pour muet. */
  description?: string
  taxo?: string[]
}

async function searchProductGeneric(
  product: DirectedProductInput,
  domain: string,
  deps: SearchDeps,
): Promise<DirectedHit | null> {
  if (!deps.searchWeb || !deps.extractProduct) return null
  const rules = deps.rules ?? DEFAULT_PAIRING_RULES
  const keys = candidateKeys(product, rules)
  if (keys.length === 0) return null
  const site = bareDomain(domain)
  const queries = [...new Set(keys.map((k) => k.value))]
  const tried = new Set<string>()
  for (const query of queries) {
    if (deps.signal?.aborted) break // budget de run épuisé → on s'arrête proprement
    const urls = preferProductUrls(await deps.searchWeb(`site:${site} ${query}`))
    for (const url of urls.slice(0, 3)) {
      if (deps.signal?.aborted) break
      if (tried.has(url)) continue
      tried.add(url)
      const listing = await deps.extractProduct(url)
      if (!listing) continue
      const proof = proveMatch(keys, toIdentity(listing), rules)
      // Une recherche « site:x 5208301 » ramène tout ce qui porte ce nombre quelque part —
      // chez un marchand, l'identifiant de page suffit. Cas VÉCU : « CARBURATEUR » rendu
      // comme « Mousse pré-filtre à air CUB CADET ». `proveMatch` valide (le nombre EST
      // dans l'adresse) : seul le démenti l'écarte. Même règle que la passe Kramp.
      if (proof && directedVetoedPair(product, listing, proof, rules)) continue
      if (proof) {
        deps.log?.(t(deps.locale ?? DEFAULT_LOCALE, 'run.directed.genericHit', { domain, query, name: listing.name, evidence: proof.evidence }))
        return { listing, evidence: proof.evidence, query }
      }
    }
  }
  return null
}

/** Convertit un résultat de recherche en identité appariable (pour proveMatch). */
function toIdentity(l: CompetitorListing): { sku?: string; gtin13?: string; url?: string; name?: string } {
  return { sku: l.ref, gtin13: l.gtin13, url: l.url, name: l.name }
}

/** URL du moteur de recherche PrestaShop pour un terme (thème standard `controller=search`). */
export function searchUrl(domain: string, query: string): string {
  const base = domain.replace(/\/+$/, '')
  const withProto = /^https?:\/\//i.test(base) ? base : `https://${base}`
  return `${withProto}/recherche?controller=search&s=${encodeURIComponent(query)}`
}

export interface DirectedHit {
  /** Le listing concurrent apparié (prix, réf, url, dispo…). */
  listing: CompetitorListing
  /** Preuve de l'appariement (gtin13 / sku / ref-in-name…) — jamais le nom seul. */
  evidence: MatchProof['evidence']
  /** Terme de recherche qui a abouti (réf ou EAN). */
  query: string
}

/**
 * Cherche un produit source sur UN concurrent : essaie chaque clé (réf(s) d'abord, EAN
 * ensuite), parse les résultats, et renvoie le PREMIER apparié par égalité exacte.
 * `null` si aucun résultat prouvé (le produit n'y est pas, ou pas sous une clé commune).
 */
export async function searchProductOnSite(
  product: DirectedProductInput,
  domain: string,
  deps: SearchDeps,
  opts?: { generic?: boolean },
): Promise<DirectedHit | null> {
  // Site GÉNÉRIQUE (marketplace / non-PrestaShop) : recherche web + Firecrawl, PAS le
  // moteur de recherche PrestaShop (inexistant / bloqué chez ces sites).
  if (opts?.generic) return searchProductGeneric(product, domain, deps)
  const rules = deps.rules ?? DEFAULT_PAIRING_RULES
  const keys = candidateKeys(product, rules)
  if (keys.length === 0) return null
  // Un terme de recherche par valeur de clé distincte (réf, réf sans zéros, EAN).
  const queries = [...new Set(keys.map((k) => k.value))]
  for (const query of queries) {
    const html = await deps.fetchHtml(searchUrl(domain, query))
    if (!html) continue
    for (const listing of parseListingPage(html)) {
      const proof = proveMatch(keys, toIdentity(listing), rules)
      // Une recherche « site:x 5208301 » ramène tout ce qui porte ce nombre quelque part —
      // chez un marchand, l'identifiant de page suffit. Cas VÉCU : « CARBURATEUR » rendu
      // comme « Mousse pré-filtre à air CUB CADET ». `proveMatch` valide (le nombre EST
      // dans l'adresse) : seul le démenti l'écarte. Même règle que la passe Kramp.
      if (proof && directedVetoedPair(product, listing, proof, rules)) continue
      if (proof) {
        deps.log?.(t(deps.locale ?? DEFAULT_LOCALE, 'run.directed.hit', { domain, query, name: listing.name, evidence: proof.evidence }))
        return { listing, evidence: proof.evidence, query }
      }
    }
  }
  return null
}

/** Produit source léger, tel qu'issu de la Sheet F1 (id stable + clés). */
export interface DirectedSourceProduct extends SourceProductKeys {
  /** Identifiant stable de la ligne source (pour rattacher le hit au produit). */
  id: string
  /** Libellé F1. Ne prouve rien, mais peut DÉMENTIR une fiche trouvée (`directedVetoedPair`). */
  name?: string
  /** Prix source HT — utilisé par le démenti de gouffre de prix quand les démentis sont
   *  unifiés avec ceux de la matrice. */
  price?: number
  /** Description F1 et rangement du catalogue : ils établissent la NATURE du produit
   *  (origine / adaptable), que le démenti applique sur ce chemin comme sur la matrice. */
  description?: string
  taxo?: string[]
}

export interface DirectedSite {
  siteId: string
  domain: string
  /** true = site non-PrestaShop / marketplace → mode générique (recherche web + Firecrawl). */
  generic?: boolean
}

export interface DirectedPassResult {
  /** Appariements trouvés ce tick, rattachés à leur produit source et à leur site. */
  results: { productId: string; siteId: string; hit: DirectedHit }[]
  /** Index produit où reprendre au prochain tick (curseur persistant). */
  nextCursor: number
  /** true quand tous les produits ont été balayés → le cursor peut recommencer à 0. */
  done: boolean
  /** Nombre de produits effectivement traités ce tick. */
  processed: number
}

/**
 * UNE passe de recherche dirigée (un tick), bornée par `budget` produits. Reprend au
 * curseur, interroge chaque site pour chaque produit, et renvoie les appariés + le
 * curseur avancé. Le cron rappelle passe après passe jusqu'à `done`, comme la moisson.
 * `signal` permet d'arrêter proprement (timeout serveur).
 */
/** Produits cherchés de front (cf. jumeau client). Chacun lance déjà une requête PAR
 *  SITE : à 15 sites, 3 produits = 45 requêtes en vol, 3 par domaine. */
/**
 * Produits traités de front. Le vrai coût d'un produit, c'est `sites` requêtes lancées
 * en parallèle : le parallélisme utile est donc le PRODUIT des deux, et c'est lui qu'on
 * borne. Un seul site actif → 8 produits de front ; dix-neuf sites → 2, sinon on
 * envoie une centaine de requêtes simultanées chez les fournisseurs.
 */
function directedConcurrency(siteCount: number): number {
  return Math.max(1, Math.min(8, Math.ceil(DIRECTED_PARALLEL_REQUESTS / Math.max(1, siteCount))))
}
const DIRECTED_PARALLEL_REQUESTS = 8

export async function directedPass(
  products: DirectedSourceProduct[],
  sites: DirectedSite[],
  cursor: number,
  budget: number,
  deps: SearchDeps & { signal?: { aborted: boolean } },
): Promise<DirectedPassResult> {
  const start = Math.min(Math.max(cursor, 0), products.length)
  const end = Math.min(products.length, start + Math.max(budget, 0))
  const indices = Array.from({ length: Math.max(0, end - start) }, (_, k) => start + k)

  // Produits traités EN PARALLÈLE BORNÉ. Les sites l'étaient déjà, mais chaque produit
  // attendait le site le PLUS LENT avant de passer au suivant : mesuré en production,
  // 20 produits par run de 11 min, soit ~29 jours pour un seul tour d'un catalogue de
  // 75 000 références. Le facteur limitant est la latence réseau, pas le calcul — donc
  // on en couvre plusieurs de front. Borné : chaque produit lance déjà une requête par
  // site, et le produit de ces deux parallélismes doit rester supportable pour les
  // fournisseurs (et pour le circuit-breaker de crédits).
  const completed = new Set<number>()
  const byIndex = new Map<number, DirectedPassResult['results']>()
  await mapWithConcurrency(indices, directedConcurrency(sites.length), async (i) => {
    if (deps.signal?.aborted) return
    const p = products[i]
    // Sites interrogés EN PARALLÈLE : en séquence, le débit d'une passe est la SOMME
    // des latences (19 sites × 2-20 s = quelques produits par run seulement) ; en
    // parallèle il est borné par le site le plus lent. Promise.all préserve l'ordre.
    const hits = await Promise.all(sites.map(async (site) => {
      if (deps.signal?.aborted) return null
      const hit = await searchProductOnSite(p, site.domain, deps, { generic: site.generic }).catch(() => null)
      return hit ? { productId: p.id, siteId: site.siteId, hit } : null
    }))
    if (deps.signal?.aborted) return
    byIndex.set(i, hits.filter((h): h is NonNullable<typeof h> => h != null))
    completed.add(i)
    deps.onProduct?.(completed.size, indices.length, [...byIndex.values()].reduce((n, r) => n + r.length, 0))
  })

  // Curseur avancé au plus grand préfixe CONTIGU réellement traité. En parallèle, une
  // interruption laisse des trous : avancer jusqu'à `end` sauterait silencieusement des
  // produits jamais cherchés — exactement le genre de perte muette qui fait croire à un
  // catalogue « couvert ». Les produits au-delà du trou seront refaits au tick suivant.
  let i = start
  while (completed.has(i)) i++
  // Ordre STABLE (indice croissant) malgré des fins dans le désordre : deux runs sur les
  // mêmes données doivent produire la même sortie.
  const results: DirectedPassResult['results'] = []
  for (let k = start; k < end; k++) { const r = byIndex.get(k); if (r) results.push(...r) }

  const done = i >= products.length
  return { results, nextCursor: done ? 0 : i, done, processed: i - start }
}
