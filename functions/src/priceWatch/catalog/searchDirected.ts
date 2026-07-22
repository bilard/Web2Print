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

import { parseListingPage, type CompetitorListing } from './prestashop'
import { candidateKeys, proveMatch, type SourceProductKeys, type MatchProof } from './keys'

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
}

/** Domaine nu (sans protocole, sans www, sans chemin) pour un opérateur `site:`. */
function bareDomain(domain: string): string {
  return domain.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').replace(/^www\./i, '')
}

/**
 * Classe les URLs candidates : FICHES PRODUIT d'abord, pages catégorie/recherche/blog en
 * dernier. Une recherche « site:X réf » renvoie souvent des catégories — on veut la fiche.
 * Générique (patterns communs à Amazon /dp/, Cdiscount /f-…​.html, Shopify /products/…).
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
async function searchProductGeneric(
  product: SourceProductKeys,
  domain: string,
  deps: SearchDeps,
): Promise<DirectedHit | null> {
  if (!deps.searchWeb || !deps.extractProduct) return null
  const keys = candidateKeys(product)
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
      const proof = proveMatch(keys, toIdentity(listing))
      if (proof) {
        deps.log?.(`${domain} (générique) : « ${query} » → ${listing.name} (preuve ${proof.evidence})`)
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
  product: SourceProductKeys,
  domain: string,
  deps: SearchDeps,
  opts?: { generic?: boolean },
): Promise<DirectedHit | null> {
  // Site GÉNÉRIQUE (marketplace / non-PrestaShop) : recherche web + Firecrawl, PAS le
  // moteur de recherche PrestaShop (inexistant / bloqué chez ces sites).
  if (opts?.generic) return searchProductGeneric(product, domain, deps)
  const keys = candidateKeys(product)
  if (keys.length === 0) return null
  // Un terme de recherche par valeur de clé distincte (réf, réf sans zéros, EAN).
  const queries = [...new Set(keys.map((k) => k.value))]
  for (const query of queries) {
    const html = await deps.fetchHtml(searchUrl(domain, query))
    if (!html) continue
    for (const listing of parseListingPage(html)) {
      const proof = proveMatch(keys, toIdentity(listing))
      if (proof) {
        deps.log?.(`${domain} : « ${query} » → ${listing.name} (preuve ${proof.evidence})`)
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
export async function directedPass(
  products: DirectedSourceProduct[],
  sites: DirectedSite[],
  cursor: number,
  budget: number,
  deps: SearchDeps & { signal?: { aborted: boolean } },
): Promise<DirectedPassResult> {
  const results: DirectedPassResult['results'] = []
  const start = Math.min(Math.max(cursor, 0), products.length)
  const end = Math.min(products.length, start + Math.max(budget, 0))
  let i = start
  for (; i < end; i++) {
    if (deps.signal?.aborted) break
    const p = products[i]
    for (const site of sites) {
      if (deps.signal?.aborted) break
      const hit = await searchProductOnSite(p, site.domain, deps, { generic: site.generic })
      if (hit) results.push({ productId: p.id, siteId: site.siteId, hit })
    }
  }
  const done = i >= products.length
  return { results, nextCursor: done ? 0 : i, done, processed: i - start }
}
