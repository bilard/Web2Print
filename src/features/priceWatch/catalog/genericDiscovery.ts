// Découverte GÉNÉRIQUE de pages listes (toute techno), en repli de la découverte
// PrestaShop (categories.ts). Deux voies, dans l'ordre :
//   1. sitemap.xml (via robots.txt « Sitemap: » puis /sitemap.xml) — déterministe,
//      supporte les sitemap-index (récursion bornée) ; on préfère les URLs de type
//      CATÉGORIE/COLLECTION (beaucoup de produits/page), sinon les URLs PRODUIT.
//   2. liens « catégorie-ish » de la page d'accueil (heuristique de chemin).
// PUR + server-safe (regex, pas de DOMParser) : réutilisable client ET Cloud Function.

type FetchHtml = (url: string) => Promise<string | null>

/** Chemins qui ressentent la page LISTE (catégorie/collection), toutes techno confondues. */
const LISTING_PATH_RE = /\/(?:collections?|categor(?:y|ie|ies|ia)|categorie|rubriques?|gammes?|familles?|boutique|shop|store|catalog(?:ue|o)?|department|dept|c)\//i
/** Chemins à EXCLURE (jamais des listes produit). */
const NON_LISTING_RE = /\/(?:cart|panier|account|compte|customer|login|connexion|signin|checkout|commande|search|recherche|cms|blog|news|actualite|contact|mentions|cgv|cgu|conditions|newsletter|wishlist|favoris|faq|aide|help|about|apropos|tag|auth|password)\b/i

const bare = (domain: string) => domain.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').replace(/^www\./i, '')
const origin = (domain: string) => `https://www.${bare(domain)}`

/** Extrait les `Sitemap:` de robots.txt (0..N). */
function sitemapsFromRobots(robots: string): string[] {
  return [...robots.matchAll(/^\s*sitemap:\s*(\S+)\s*$/gim)].map((m) => m[1].trim())
}

/** Parse un sitemap XML : renvoie les `<loc>` (CDATA compris) + si c'est un index. */
function parseSitemap(xml: string): { locs: string[]; isIndex: boolean } {
  const isIndex = /<sitemapindex[\s>]/i.test(xml)
  // Gère `<loc>url</loc>` ET `<loc><![CDATA[url]]></loc>` (fréquent sur PrestaShop/Magento).
  const locs = [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)\s*(?:\]\]>)?\s*<\/loc>/gi)]
    .map((m) => decodeXml(m[1].trim()))
  return { locs, isIndex }
}

function decodeXml(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#38;/g, '&')
}

/** true si l'URL appartient bien au domaine (évite les liens externes des sitemaps). */
function sameSite(url: string, domain: string): boolean {
  try { return bare(new URL(url).hostname) === bare(domain) } catch { return false }
}

export interface DiscoverOptions {
  /** Mots-clés de familles (slug/chemin) pour filtrer. Vide = tout. */
  keywords?: string[]
  /** Plafond d'URLs listes renvoyées (borne le coût). Défaut 250. */
  maxUrls?: number
  /** Plafond de sitemaps enfants récupérés dans un index. Défaut 6. */
  maxChildSitemaps?: number
}

/** Un sous-sitemap dont le NOM évoque des catégories/collections (≠ fiches produit). */
const CATEGORY_SITEMAP_RE = /categor|collection|rubriqu|home|gamme|famille|catalog/i
const PRODUCT_SITEMAP_RE = /product|produit|item|article/i

/**
 * Localise et lit les sitemaps (index compris, récursion bornée). On FAIT CONFIANCE à
 * la structure : les URLs venant d'un sous-sitemap « catégories » sont des pages listes,
 * celles d'un sous-sitemap « produits » sont des fiches — plus fiable qu'un regex de
 * chemin (ex. PrestaShop 1.6 aux URLs `/moteur/entretien/…` sans mot-clé reconnaissable).
 */
async function collectSitemapLocs(
  domain: string, fetchHtml: FetchHtml, maxChildSitemaps: number,
): Promise<{ categoryLocs: string[]; productLocs: string[]; otherLocs: string[] }> {
  const root = origin(domain)
  const seeds = new Set<string>()
  const robots = await fetchHtml(`${root}/robots.txt`).catch(() => null)
  if (robots) for (const s of sitemapsFromRobots(robots)) seeds.add(s)
  seeds.add(`${root}/sitemap.xml`)

  const categoryLocs: string[] = []
  const productLocs: string[] = []
  const otherLocs: string[] = []
  const fetchedIdx = new Set<string>()
  let childBudget = maxChildSitemaps
  for (const sm of seeds) {
    const xml = await fetchHtml(sm).catch(() => null)
    if (!xml || !/<(?:urlset|sitemapindex)[\s>]/i.test(xml)) continue
    const { locs, isIndex } = parseSitemap(xml)
    if (isIndex) {
      const children = locs
        .filter((u) => sameSite(u, domain) && !fetchedIdx.has(u))
        .sort((a, b) => Number(CATEGORY_SITEMAP_RE.test(b)) - Number(CATEGORY_SITEMAP_RE.test(a)))
      for (const child of children) {
        if (childBudget <= 0) break
        childBudget--
        fetchedIdx.add(child)
        const cx = await fetchHtml(child).catch(() => null)
        if (!cx) continue
        const bucket = CATEGORY_SITEMAP_RE.test(child) ? categoryLocs
          : PRODUCT_SITEMAP_RE.test(child) ? productLocs : otherLocs
        bucket.push(...parseSitemap(cx).locs.filter((u) => sameSite(u, domain)))
      }
    } else {
      otherLocs.push(...locs.filter((u) => sameSite(u, domain)))
    }
  }
  return { categoryLocs, productLocs, otherLocs }
}

function matchesKeywords(url: string, keywords?: string[]): boolean {
  if (!keywords || keywords.length === 0) return true
  const u = url.toLowerCase()
  return keywords.some((k) => u.includes(k.toLowerCase()))
}

/** Profondeur d'un chemin (nombre de segments). */
function depthOf(url: string): number {
  try { return new URL(url).pathname.split('/').filter(Boolean).length } catch { return 0 }
}

/**
 * Ordonne des catégories de sitemap pour maximiser le rendement produit.
 *
 * Un sitemap hiérarchique liste du général au particulier : prendre les N premières donne
 * des pages de RAYON, qui n'affichent que des sous-rayons (constaté sur leroymerlin :
 * 12 pages lues → 8 produits). Les FEUILLES portent les grilles. On trie donc par
 * profondeur décroissante, mais en round-robin par rayon de tête — sinon les 250 URLs
 * retenues viendraient toutes du même univers.
 */
export function orderByLeafFirst(urls: string[]): string[] {
  const groups = new Map<string, string[]>()
  for (const u of urls) {
    let head = ''
    try {
      const segs = new URL(u).pathname.split('/').filter(Boolean)
      head = segs.slice(0, 2).join('/') // ex. `produits/salle-de-bains`
    } catch { /* URL exotique : groupe commun */ }
    const arr = groups.get(head)
    if (arr) arr.push(u); else groups.set(head, [u])
  }
  for (const arr of groups.values()) arr.sort((a, b) => depthOf(b) - depthOf(a) || a.localeCompare(b))
  const lists = [...groups.values()]
  const out: string[] = []
  for (let i = 0; out.length < urls.length; i++) {
    // Tour i : une URL par univers, la plus profonde d'abord. Sans ce tri, un univers
    // réduit à sa seule page de rayon (`/produits/`) passait en tête de tout le lot.
    const round = lists.map((l) => l[i]).filter((u): u is string => !!u)
    if (round.length === 0) break
    round.sort((a, b) => depthOf(b) - depthOf(a) || a.localeCompare(b))
    out.push(...round)
  }
  return out
}

/**
 * Découvre des URLs de pages listes via sitemap. Préfère les catégories ; à défaut,
 * renvoie des fiches produit (la moisson les scrape une par une — plus lent mais couvre
 * les sites sans page catégorie exploitable). [] si aucun sitemap.
 */
export async function discoverViaSitemap(
  domain: string, fetchHtml: FetchHtml, opts: DiscoverOptions = {},
): Promise<string[]> {
  const { keywords, maxUrls = 250, maxChildSitemaps = 6 } = opts
  const { categoryLocs, productLocs, otherLocs } = await collectSitemapLocs(domain, fetchHtml, maxChildSitemaps)
  // Retire doublons, pages non-listes, ET les racines/home (path vide après la locale).
  const isRoot = (u: string) => { try { return /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/?)?$/i.test(new URL(u).pathname) } catch { return false } }
  const clean = (arr: string[]) => [...new Set(arr)].filter((u) =>
    !isRoot(u) && !NON_LISTING_RE.test(u) && !/\/(?:module|plan-site|sitemap|quote|form|contenu|content|cms|store-locator|magasins?)\b/i.test(u))

  // 1. Catégories issues du sous-sitemap « catégories » (structure de confiance).
  const cats = clean(categoryLocs).filter((u) => matchesKeywords(u, keywords))
  if (cats.length > 0) return orderByLeafFirst(cats).slice(0, maxUrls)

  // 2. À défaut, catégories reconnues par motif de chemin dans les sitemaps « autres ».
  const byPath = clean(otherLocs).filter((u) => LISTING_PATH_RE.test(u) && matchesKeywords(u, keywords))
  if (byPath.length > 0) return byPath.slice(0, maxUrls)

  // 3. Dernier recours : fiches produit (scrapées une par une, plus lent mais couvrant).
  const products = clean([...productLocs, ...otherLocs]).filter((u) => matchesKeywords(u, keywords))
  return products.slice(0, maxUrls)
}

/** Extrait des liens « catégorie-ish » de la page d'accueil (heuristique de chemin). */
export function extractGenericCategoryLinks(homeHtml: string, domain: string): string[] {
  const out = new Set<string>()
  const root = origin(domain)
  for (const m of homeHtml.matchAll(/href=["']([^"'#]+)["']/gi)) {
    let href = m[1].trim()
    if (!href || href.startsWith('javascript:') || href.startsWith('mailto:')) continue
    if (href.startsWith('/')) href = root + href
    if (!/^https?:\/\//i.test(href)) continue
    if (!sameSite(href, domain)) continue
    if (NON_LISTING_RE.test(href)) continue
    if (LISTING_PATH_RE.test(href)) out.add(href.split('#')[0])
  }
  return [...out]
}

/**
 * Découverte GÉNÉRIQUE complète (sitemap puis liens home). Renvoie [] si rien —
 * l'appelant garde alors la découverte PrestaShop (ou n'ouvre pas de balayage).
 */
export async function discoverGenericListings(
  domain: string, fetchHtml: FetchHtml, homeHtml: string | null, opts: DiscoverOptions = {},
): Promise<string[]> {
  const viaSitemap = await discoverViaSitemap(domain, fetchHtml, opts)
  if (viaSitemap.length > 0) return viaSitemap
  if (homeHtml) {
    const links = extractGenericCategoryLinks(homeHtml, domain)
    const kw = opts.keywords
    const filtered = kw && kw.length ? links.filter((u) => matchesKeywords(u, kw)) : links
    return (filtered.length ? filtered : links).slice(0, opts.maxUrls ?? 250)
  }
  return []
}
