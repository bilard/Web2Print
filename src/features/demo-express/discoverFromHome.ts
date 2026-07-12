// src/features/demo-express/discoverFromHome.ts
// Descente automatique depuis l'URL DE BASE du prospect : l'accueil est un
// « hub » (menu, pas de cartes produit) — on récupère ses liens par DEUX
// sources en parallèle, comme discover() : Jina Reader (règle « Jina
// d'abord » ; tier anonyme accepté) ET la Cloud Function Puppeteer (robuste
// SPA), chacune tolérant l'échec de l'autre. Puis on filtre les rubriques
// plausibles du catalogue, et l'appelant explore chacune jusqu'à trouver des
// produits. Filtrage GÉNÉRALISTE (jamais de logique par enseigne).
import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase/config'
import { jinaRead } from '@/features/scraping/useJina'

interface HomeLinks {
  links?: string[]
  navLinks?: string[]
  cardLinks?: { url: string; title: string }[]
}

const extractBreadcrumbFn = httpsCallable<{ url: string }, HomeLinks>(functions, 'extractBreadcrumb')

/** Chemins qui ne mènent jamais au catalogue (institutionnel, compte, légal…). */
const EXCLUDE_PATH_RE =
  /(contact|blog|actualit|news|presse|cgv|cgu|mention|legal|panier|cart|checkout|login|connexion|inscription|compte|account|register|faq|aide|help|a-propos|about|qui-sommes|recrutement|carriere|jobs|magasin|store-locator|agence|service|livraison|retour|paiement|garantie|newsletter|plan-du-site|sitemap|politique|privacy|cookie|rgpd|devis|tel:|mailto:)/i

const FILE_EXT_RE = /\.(pdf|jpe?g|png|webp|gif|svg|zip|xml|js|css)(\?|#|$)/i

/** Filtre générique des liens candidats « rubrique catalogue » (même host,
 *  profondeur ≤ 3, hors chemins institutionnels/fichiers), ordre préservé. */
function filterCategoryCandidates(rawLinks: string[], baseUrl: string): string[] {
  const base = new URL(baseUrl)
  const baseHost = base.hostname.replace(/^www\./, '')
  const basePath = base.pathname.replace(/\/+$/, '')
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of rawLinks) {
    let u: URL
    try { u = new URL(raw, baseUrl) } catch { continue }
    if (u.hostname.replace(/^www\./, '') !== baseHost) continue
    const path = u.pathname.replace(/\/+$/, '')
    if (!path || path === basePath) continue // la home elle-même / ancres
    const depth = path.split('/').filter(Boolean).length
    if (depth > 3) continue
    if (EXCLUDE_PATH_RE.test(u.href)) continue
    if (FILE_EXT_RE.test(path)) continue
    const key = `${u.origin}${path}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(key)
  }
  return out
}

/**
 * Rubriques candidates du site (ordre du menu = ordre de la taxonomie).
 * navLinks (menu/footer) d'abord — c'est là que vit l'arborescence — puis le
 * reste des liens en complément.
 */
export async function discoverCategories(baseUrl: string): Promise<string[]> {
  const [cloud, jinaLinks] = await Promise.all([
    extractBreadcrumbFn({ url: baseUrl }).then((r) => r.data).catch(() => ({}) as HomeLinks),
    jinaRead(baseUrl, { listing: true })
      .then((p) => Object.values(p.links ?? {}))
      .catch(() => [] as string[]),
  ])
  return filterCategoryCandidates([...(cloud.navLinks ?? []), ...jinaLinks, ...(cloud.links ?? [])], baseUrl)
}

// ── Étage anti-bot (DataDome/Akamai) : le HTML vient de Bright Data ─────────

export interface DiscoveredPage { url: string; title: string }

/**
 * URL à l'ÉVIDENCE non-produit (pages légales, nav, actu, jeux concours,
 * store locator…) : ne JAMAIS dépenser un enrichissement complet (~1 min)
 * dessus — la découverte des cartes d'une SPA en remonte parfois.
 * Signal par vocabulaire d'URL multi-langue, jamais par site.
 */
const NON_PRODUCT_PATH_RE = new RegExp(
  '(^|[-_/])(politique|privacy|cookies?|confidentialite|mentions(-legales)?|legal|cg[uv]|conditions|contact|about|a-?propos|'
  + 'news|actualites?|blog|presse?|press|catalogues|sitemap|recherche|search|login|signin|register|compte|account|'
  + 'panier|cart|checkout|faq|support|sav|service-?client|garanties?|warranty|store-?locator|magasins?|distributeurs?|'
  + 'revendeurs?|newsletter|evenements?|events?|jeu-?concours|concours|carrieres?|jobs?|recrutement)([-_/.]|$)',
  'i',
)
export function isObviousNonProductUrl(url: string): boolean {
  try {
    return NON_PRODUCT_PATH_RE.test(new URL(url).pathname)
  } catch {
    return false
  }
}

/** Rubriques candidates depuis un HTML déjà récupéré (voie Bright Data) :
 *  ancres du menu (nav/header) d'abord, puis le reste de la page. */
export function categoriesFromHtml(html: string, baseUrl: string): string[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const hrefs = (sel: string) =>
    [...doc.querySelectorAll<HTMLAnchorElement>(sel)].map((a) => a.getAttribute('href') ?? '').filter(Boolean)
  return filterCategoryCandidates([...hrefs('nav a[href], header a[href]'), ...hrefs('a[href]')], baseUrl)
}

/**
 * Fiches produit d'une page listing déjà récupérée (voie Bright Data) :
 * JSON-LD ItemList → dataLayer GTM (parseurs du node list-products), puis
 * repli déterministe « ancres porteuses d'image » (les cartes produit d'une
 * grille contiennent le visuel). Le repli est coupé sur la home (bannières).
 */
export async function productLinksFromListingHtml(
  html: string,
  pageUrl: string,
  limit: number,
  opts: { anchorFallback: boolean },
): Promise<DiscoveredPage[]> {
  const { parseListingItemList, parseListingDataLayer, dedupListing } =
    await import('@/features/workflows/registry/listProductsNode')
  const structured = dedupListing([
    ...parseListingItemList(html),
    ...parseListingDataLayer(html, pageUrl),
  ]).filter((p) => p.url)
  if (structured.length) {
    return structured.slice(0, limit).map((p) => ({ url: p.url, title: p.name || '' }))
  }
  if (!opts.anchorFallback) return []

  const doc = new DOMParser().parseFromString(html, 'text/html')
  const base = new URL(pageUrl)
  const baseHost = base.hostname.replace(/^www\./, '')
  const basePath = base.pathname.replace(/\/+$/, '')
  const seen = new Set<string>()
  const out: DiscoveredPage[] = []
  for (const a of doc.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    if (!a.querySelector('img')) continue
    let u: URL
    try { u = new URL(a.getAttribute('href') ?? '', pageUrl) } catch { continue }
    if (u.hostname.replace(/^www\./, '') !== baseHost) continue
    const path = u.pathname.replace(/\/+$/, '')
    if (!path || path === basePath) continue
    if (EXCLUDE_PATH_RE.test(u.href) || FILE_EXT_RE.test(path)) continue
    const key = `${u.origin}${path}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ url: key, title: (a.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 120) })
    if (out.length >= limit) break
  }
  return out
}
