// src/features/workflows/registry/listProductsNode.ts
// Node « Produits d'une page liste » : prend une ou plusieurs URLs de page
// catégorie / résultats de recherche e-commerce (PAS des fiches produit), lit
// la page via Jina en mode `listing` (moteur navigateur + lazy-load), puis fait
// extraire par le LLM TOUS les produits affichés (nom, marque, EAN, prix, URL).
// Sortie : une feuille où chaque ligne = un produit, taguée par `site` (domaine).
// Brique d'entrée du workflow de comparaison de prix multi-sites — chaîner avec
// le node « Comparer les prix » puis un node Export.
import { ListChecks } from 'lucide-react'
import { z } from 'zod'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import type { ExcelColumn, ExcelRow, ExcelSheet } from '@/features/excel/types'
import { generateJson } from '@/features/ai/llmRouter'
import { parsePrice } from '@/features/priceWatch/core'

interface ListProductsConfig {
  /** URLs de pages liste (une par ligne ou séparées par virgule). */
  urls: string
  /** Nombre max de produits retenus au total (0 = pas de limite). */
  maxProducts: number
  /** Nombre de pages à parcourir par URL (1 = page seule). */
  maxPages?: number
  /** Nom du paramètre d'URL de pagination (ex « page », « p »). */
  pageParam?: string
  /** Enrichir chaque fiche produit (EAN/marque/prix via JSON-LD canonique). */
  enrichFiches?: boolean
  /** Famille produit à découvrir (ex « barbecue »). Si renseigné, les lignes
   *  d'`urls` sont des DOMAINES et le node trouve la page liste par recherche. */
  family?: string
  /** Marque à conserver (ex « Ryobi ») : écarte les produits hors-marque. Vide = tout garder. */
  marque?: string
}

/** Normalise pour comparaison marque : minuscules, sans accents. */
function normBrand(s: string): string {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}
/** Vrai si le terme marque apparaît dans la marque OU le nom. Terme vide → toujours vrai. */
function matchesBrand(name: unknown, brand: unknown, term: string): boolean {
  if (!term) return true
  return normBrand(`${brand ?? ''} ${name ?? ''}`).includes(normBrand(term))
}

interface ListProductsOutputs {
  sheet: ExcelSheet
}

/** Produit extrait d'une page liste par le LLM. */
const ExtractedSchema = z.object({
  products: z.array(
    z.object({
      name: z.string(),
      brand: z.string(),
      ean: z.string(),
      price: z.number(),
      originalPrice: z.number(),
      url: z.string(),
      image: z.string(),
    }),
  ),
})
type Extracted = z.infer<typeof ExtractedSchema>

const EXTRACTED_SCHEMA_FOR_LLM = {
  type: 'object',
  properties: {
    products: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Intitulé complet du produit tel qu’affiché.' },
          brand: { type: 'string', description: 'Marque du produit (vide si inconnue).' },
          ean: { type: 'string', description: 'Code EAN à 13 chiffres UNIQUEMENT s’il est littéralement présent dans l’URL de la fiche ou le chemin du fichier image (ex « 3700812025181_CAFR.prd »). NE JAMAIS le deviner ni le reconstituer : sinon "".' },
          price: { type: 'number', description: 'Prix de vente ACTUEL en euros (si prix barré + promo, prendre le prix promo, le plus bas). 0 si illisible.' },
          originalPrice: { type: 'number', description: 'Prix D’ORIGINE barré (avant réduction) en euros, UNIQUEMENT s’il est affiché barré au-dessus du prix actuel. 0 si pas de promo / pas de prix barré.' },
          url: { type: 'string', description: 'URL absolue de la fiche produit.' },
          image: { type: 'string', description: 'URL absolue de l’image du produit (souvent porteuse de l’EAN dans son chemin).' },
        },
        required: ['name', 'brand', 'ean', 'price', 'originalPrice', 'url', 'image'],
      },
    },
  },
  required: ['products'],
} as const

/** Valide la clé de contrôle d'un EAN-13 (GS1). Écarte les nombres à 13 chiffres
 *  qui n'en sont pas — typiquement un id produit marketplace planqué dans un slug
 *  d'URL (jardiland : « …rbc36x2-6744473726508 », checksum KO). */
function isValidEan13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false
  const d = [...code].map(Number)
  const sum = d.slice(0, 12).reduce((s, n, i) => s + n * (i % 2 === 0 ? 1 : 3), 0)
  return (10 - (sum % 10)) % 10 === d[12]
}

/** EAN robuste, anti-hallucination : on ne fait JAMAIS confiance à l'EAN brut du
 *  LLM (il fabrique des codes plausibles mais faux), et on n'accepte qu'un EAN-13
 *  dont la CLÉ DE CONTRÔLE est valide (écarte les id marketplace à 13 chiffres).
 *  L'EAN du LLM n'est retenu que s'il est valide ET CORROBORÉ dans l'image/URL/nom ;
 *  sinon on prend le premier code 13 chiffres VALIDE de l'image (Jardiland le cache
 *  dans le chemin image), puis l'URL, puis le nom. '' si rien. */
export function resolveEan(ean: string, image: string, url: string, name: string): string {
  const sources = [image, url, name].map((s) => String(s ?? ''))
  const clean = (ean ?? '').replace(/\D/g, '')
  if (isValidEan13(clean) && sources.some((s) => s.includes(clean))) return clean
  for (const src of sources) {
    for (const m of src.matchAll(/\d{13}/g)) {
      if (isValidEan13(m[0])) return m[0]
    }
  }
  return ''
}

type LdProduct = Extracted['products'][number]
const asObj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? v as Record<string, unknown> : {})

/** Collecte récursivement les nœuds `ItemList` d'un JSON-LD (direct, `@graph`, `mainEntity`). */
function collectItemLists(node: unknown, acc: Record<string, unknown>[]): void {
  const n = asObj(node)
  const t = n['@type']
  if ((t === 'ItemList' || (Array.isArray(t) && t.includes('ItemList'))) && Array.isArray(n.itemListElement)) acc.push(n)
  if (Array.isArray(n['@graph'])) for (const g of n['@graph']) collectItemLists(g, acc)
  if (n.mainEntity) collectItemLists(n.mainEntity, acc)
}

/** Extraction DÉTERMINISTE des produits d'une page liste depuis le JSON-LD `ItemList`
 *  (schema.org). Jumeau navigateur (DOMParser) du parseur serveur `listProducts.ts`. */
export function parseListingItemList(html: string): LdProduct[] {
  const out: LdProduct[] = []
  if (!html || !html.includes('ItemList') || typeof DOMParser === 'undefined') return out
  let doc: Document
  try { doc = new DOMParser().parseFromString(html, 'text/html') } catch { return out }
  doc.querySelectorAll('script[type="application/ld+json"]').forEach((el) => {
    let data: unknown
    try { data = JSON.parse(el.textContent ?? '') } catch { return }
    for (const block of Array.isArray(data) ? data : [data]) {
      const lists: Record<string, unknown>[] = []
      collectItemLists(block, lists)
      for (const list of lists) {
        const els = list.itemListElement
        if (!Array.isArray(els)) continue
        for (const e of els) {
          const eo = asObj(e)
          const it = asObj('item' in eo ? eo.item : e)
          const name = String(it.name ?? '').trim()
          if (!name) continue
          const offer = asObj(Array.isArray(it.offers) ? (it.offers as unknown[])[0] : it.offers)
          const priceNum = Number(offer.price ?? offer.lowPrice)
          const sku = String(it.gtin13 ?? it.gtin ?? it.sku ?? '').replace(/\D/g, '')
          const brandRaw = it.brand
          const imageRaw = it.image
          out.push({
            name,
            brand: typeof brandRaw === 'object' ? String(asObj(brandRaw).name ?? '') : String(brandRaw ?? ''),
            ean: isValidEan13(sku) ? sku : '',
            price: Number.isFinite(priceNum) && priceNum > 0 ? priceNum : 0,
            originalPrice: 0,
            url: String(it.url ?? '').trim(),
            image: typeof imageRaw === 'string' ? imageRaw : Array.isArray(imageRaw) ? String(imageRaw[0] ?? '') : '',
          })
        }
      }
    }
  })
  return out
}

/** Fusionne l'ItemList déterministe (nom/EAN/prix canoniques) avec l'extraction LLM
 *  (prix barré + produits hors liste). Union par URL ; ItemList vide → LLM seul. */
export function mergeListing(ld: LdProduct[], llm: LdProduct[]): LdProduct[] {
  if (ld.length === 0) return llm
  const normUrl = (u: string): string => String(u ?? '').trim().toLowerCase().replace(/[#?].*$/, '')
  const llmByUrl = new Map<string, LdProduct>()
  for (const p of llm) { const u = normUrl(p.url); if (u) llmByUrl.set(u, p) }
  const used = new Set<string>()
  const out: LdProduct[] = []
  for (const p of ld) {
    const u = normUrl(p.url)
    const m = u ? llmByUrl.get(u) : undefined
    if (m && u) used.add(u)
    out.push({
      name: p.name,
      brand: p.brand || (m?.brand ?? ''),
      ean: p.ean || (m?.ean ?? ''),
      price: p.price > 0 ? p.price : (m?.price ?? 0),
      originalPrice: m?.originalPrice ?? 0,
      url: p.url,
      image: p.image || (m?.image ?? ''),
    })
  }
  for (const p of llm) { const u = normUrl(p.url); if (!u || !used.has(u)) out.push(p) }
  return out
}

/** Marqueurs de prix (€) — signal de grille produit rendue (mirroir serveur). */
function priceMarkerCount(text: string): number {
  return (String(text).match(/\d[\d  .,]{0,12}€|€\s?\d/g) ?? []).length
}
const THIN_LISTING_MARKERS = 30

/** Au-delà de ce nombre de chars, un « 0 produit » est presque toujours un FAUX NÉGATIF du
 *  LLM (deepseek/gemini rendent par intermittence une liste vide sur un markdown pourtant
 *  riche — cf. Leroy Merlin : même page ~32k → 0, 5 ou 24 selon le tirage) plutôt qu'une page
 *  vide → on relance l'extraction. Jumeaux du node serveur `functions/…/listProducts.ts`. */
export const RETRY_EXTRACT_MIN_CONTENT = 1500
/** 1 essai + 2 relances. */
export const MAX_EXTRACT_TRIES = 3
/** Faut-il relancer l'extraction LLM ? OUI seulement si 0 produit sur un contenu SUBSTANTIEL,
 *  sur la page principale, sous le plafond de tentatives. Jamais sur la pagination (0 = fin de
 *  catalogue légitime) ni sur un contenu réellement maigre. */
export function shouldRetryExtraction(found: number, contentLength: number, allowRetry: boolean, triesSoFar: number): boolean {
  return found === 0 && allowRetry && contentLength > RETRY_EXTRACT_MIN_CONTENT && triesSoFar < MAX_EXTRACT_TRIES
}

/** En dessous de ce nombre de produits sur la page principale, la grille est jugée
 *  ANORMALEMENT MAIGRE (vide = rendue 100 % JS, ou partielle = le Web Unlocker n'a rendu que
 *  les produits SSR/sponsorisés — cf. Leroy Merlin le soir : 5 alors que la page en a 24+).
 *  Seuil bas pour épargner les grilles normales (Castorama ~11, Jardiland ~47). Jumeau serveur. */
export const ESCALATE_BELOW_COUNT = 8
/** Faut-il tenter le Scraping Browser (rendu JS) ? Page principale uniquement, résultat maigre. */
export function shouldEscalateToBrowser(productCount: number, isMainPage: boolean): boolean {
  return productCount < ESCALATE_BELOW_COUNT && isMainPage
}

/** Réduit du HTML brut au texte significatif pour l'extraction LLM (jumeau de
 *  functions/src/workflow/brightData.ts) : retire script/style/head, garde liens + sources
 *  d'images (le chemin image porte souvent l'EAN), aplatit les espaces. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi, ' [$1] ')
    .replace(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi, ' [$1] ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&euro;/gi, '€')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, ' ')
    .trim()
}

const COLUMNS: ExcelColumn[] = [
  { key: 'site', label: 'Site', fieldType: 'text', detectedType: 'text', isPrimary: false, width: 160 },
  { key: 'name', label: 'Produit', fieldType: 'text', detectedType: 'text', isPrimary: true, width: 320 },
  { key: 'brand', label: 'Marque', fieldType: 'text', detectedType: 'text', isPrimary: false, width: 120 },
  { key: 'ean', label: 'EAN', fieldType: 'text', detectedType: 'text', isPrimary: false, width: 140 },
  { key: 'price', label: 'Prix', fieldType: 'number', detectedType: 'number', isPrimary: false, width: 100 },
  { key: 'originalPrice', label: 'Prix barré', fieldType: 'number', detectedType: 'number', isPrimary: false, width: 100 },
  { key: 'url', label: 'URL', fieldType: 'url', detectedType: 'url', isPrimary: false, width: 280 },
]

function parseUrls(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** En mode « famille » : chaque ligne est un DOMAINE (on retire protocole/chemin). */
function parseDomains(raw: string): string[] {
  return parseUrls(raw).map((s) => s.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '')).filter(Boolean)
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** Choisit, parmi des résultats de recherche, la meilleure URL de PAGE LISTE
 *  (catégorie/résultats) pour une famille sur un domaine : sur le domaine, qui
 *  N'EST PAS une fiche produit, et qui ressemble à une liste (marqueurs de
 *  catégorie ou contient le mot-clé). Repli : 1er résultat du domaine. */
export function pickListingUrl(
  results: { url: string; title?: string }[],
  domain: string,
  family: string,
): string | null {
  const d = domain.replace(/^www\./, '')
  const onDomain = results.filter((r) => {
    try { return new URL(r.url).hostname.replace(/^www\./, '').endsWith(d) } catch { return false }
  })
  if (onDomain.length === 0) return null
  const fam = family.toLowerCase()
  const isProduct = (u: string) => /\/p\/|\.prd(\?|$)|-p\.html|\/produit\/|\/product\//i.test(u)
  const isListing = (u: string) =>
    /\/c\/|\/s\/|cat[_.-]|categor|\/produits\/|\/rayon|\/recherche|\/search|dyn\.cat/i.test(u) || u.toLowerCase().includes(fam)
  const notProduct = onDomain.filter((r) => !isProduct(r.url))
  const hit =
    notProduct.find((r) => isListing(r.url) && `${r.url} ${r.title ?? ''}`.toLowerCase().includes(fam)) ||
    notProduct.find((r) => isListing(r.url)) ||
    notProduct[0] ||
    onDomain[0]
  return hit?.url ?? null
}

const listProductsNode: NodeSpec<ListProductsConfig, Record<string, never>, ListProductsOutputs> = {
  type: 'list-products',
  hidden: true,
  // Source autonome (URL → produits) : doit pouvoir démarrer un workflow seule.
  category: 'import',
  label: 'Produits d’une page liste',
  description:
    'Lit une page CATÉGORIE / résultats de recherche e-commerce (pas une fiche) via Jina (mode listing, anti-bot), ' +
    'puis fait extraire par le LLM tous les produits affichés : nom, marque, EAN, prix, URL. ' +
    'Chaque ligne est taguée par « site ». Chaîner avec « Comparer les prix » pour un tableau source↔cible.',
  icon: ListChecks,
  inputs: [],
  outputs: [{ name: 'sheet', type: 'sheet' }],
  outputColumns: ['site', 'name', 'brand', 'ean', 'price', 'url'],
  configSchema: [
    {
      name: 'urls',
      kind: 'textarea',
      label: 'URLs de pages liste (ou DOMAINES si « Famille » est renseigné)',
      required: true,
      help: 'Une par ligne. Soit des URLs de page liste, soit — si tu remplis « Famille produit » — juste des domaines (ex : castorama.fr, leroymerlin.fr).',
    },
    {
      name: 'family',
      kind: 'text',
      label: 'Famille produit (découverte auto)',
      default: '',
      help: 'Ex : « barbecue ». Si renseigné, les lignes ci-dessus sont des DOMAINES et le node TROUVE la page liste de cette famille sur chaque site par recherche (tu n\'as pas à coller d\'URL).',
    },
    {
      name: 'maxProducts',
      kind: 'number',
      label: 'Max produits (total)',
      default: 40,
      help: '0 = pas de limite. Plafond sur le total agrégé (toutes URLs + pages).',
    },
    {
      name: 'maxPages',
      kind: 'number',
      label: 'Pages à parcourir par URL',
      default: 1,
      help: 'Pagination : 1 = page seule ; N = suit aussi les pages 2..N (catalogues paginés).',
    },
    {
      name: 'pageParam',
      kind: 'text',
      label: 'Param de pagination',
      default: 'page',
      help: 'Nom du paramètre d’URL de page. Ex : « page » (défaut), « p » (Leroy Merlin).',
    },
    {
      name: 'enrichFiches',
      kind: 'checkbox',
      label: 'Enrichir chaque fiche (EAN, marque, prix)',
      default: true,
      help: 'Va chercher sur CHAQUE fiche produit l’EAN/marque/prix canoniques (JSON-LD, cascade Jina→Firecrawl→Bright Data). Plus complet mais 1 requête par produit (plus lent).',
    },
    {
      name: 'marque',
      kind: 'text',
      label: 'Marque (filtre)',
      default: '',
      help: 'Si renseigné (ex « Ryobi »), ne garde que les produits dont la marque ou le nom contient ce terme — écarte le bruit (ex robots Sunseeker dans une recherche « tondeuse ryobi »). Vide = aucun filtrage.',
    },
  ],
  defaultConfig: { urls: '', maxProducts: 40, maxPages: 1, pageParam: 'page', enrichFiches: true, family: '', marque: '' },
  runtime: 'any',
  run: async (ctx, config) => {
    const family = String(config.family ?? '').trim()
    let urls: string[]
    if (family) {
      // Découverte auto : chaque ligne = un domaine, on cherche la page liste de la famille.
      const domains = parseDomains(config.urls)
      if (domains.length === 0) throw new Error('Aucun domaine fourni — renseignez au moins un domaine (ex : castorama.fr).')
      const { gatherWebContext } = await import('@/features/scraping/webContext')
      urls = []
      for (const domain of domains) {
        if (ctx.signal.aborted) break
        ctx.log('info', `Recherche « ${family} » sur ${domain}…`)
        const found = await gatherWebContext({ searchQuery: `${family} site:${domain}`, maxResults: 8, readPages: 0 })
          .then((c) => pickListingUrl(c.results, domain, family))
          .catch(() => null)
        if (found) { urls.push(found); ctx.log('info', `${domain} → ${found}`) }
        else ctx.log('warn', `Aucune page liste trouvée pour « ${family} » sur ${domain}.`)
      }
      if (urls.length === 0) throw new Error(`Découverte échouée : aucune page liste « ${family} » trouvée sur les domaines fournis.`)
    } else {
      urls = parseUrls(config.urls)
      if (urls.length === 0) {
        throw new Error('Aucune URL fournie — renseignez au moins une page liste (ou une « Famille produit » + des domaines).')
      }
    }
    const max = Math.max(0, Number(config.maxProducts) || 0)
    const maxPages = Math.max(1, Math.min(20, Number(config.maxPages) || 1))
    const pageParam = String(config.pageParam ?? '').trim() || 'page'
    const brandTerm = String(config.marque ?? '').trim() // filtre marque optionnel
    let brandFiltered = 0

    // Pagination : page 1 = URL telle quelle (isMain) ; pages 2..N = URL + ?/&{pageParam}=k.
    const pages: { url: string; site: string; isMain: boolean }[] = []
    for (const url of urls) {
      const site = hostOf(url)
      pages.push({ url, site, isMain: true })
      for (let k = 2; k <= maxPages; k++) {
        const sep = url.includes('?') ? '&' : '?'
        pages.push({ url: `${url}${sep}${pageParam}=${k}`, site, isMain: false })
      }
    }

    const { readPageWithEscalation } = await import('@/features/scraping/readPageWithEscalation')
    const { brightDataScrapeHtml, forceScrapingBrowserHtml } = await import('@/features/scraping/core/brightDataFallback')
    const allRows: ExcelRow[] = []
    const seen = new Set<string>()
    let rowId = 0
    // Modèles LLM réellement utilisés (diagnostic visible dans le log de synthèse : confirme
    // que la bascule preferProviders utilise bien gemini-3.1-pro et non le repli deepseek).
    const modelsSeen = new Set<string>()

    // Extraction LLM d'une LISTE (JSON exhaustif) : modèle fiable d'abord (gemini-3.1-pro via
    // forceProvider, cascade en repli) + relance anti faux-négatif sur la page principale.
    const runExtraction = async (context: string, label: string, allowRetry: boolean): Promise<{ products: LdProduct[]; error: unknown }> => {
      let products: LdProduct[] = []
      let error: unknown = null
      for (let tries = 0; ; tries++) {
        try {
          const extracted = await generateJson<Extracted>({
            task: 'product.enrichment',
            version: 'listProducts.extract.v1',
            prompt:
              'Voici le contenu MARKDOWN d’une page LISTE / catégorie d’un site e-commerce. ' +
              'Extrais TOUS les produits réellement listés sur cette page (ignore le menu de navigation, ' +
              'le pied de page, les bannières promo génériques et les blocs « vous aimerez aussi »). ' +
              'Pour chaque produit : name = intitulé complet ; brand = marque ; ean = code EAN à 13 chiffres ' +
              'UNIQUEMENT s’il apparaît LITTÉRALEMENT dans l’URL de la fiche (ex : « 4892210822604_CAFR.prd ») ou le nom de fichier image — ' +
              'ne le devine JAMAIS, ne le reconstitue pas : sinon "" ; ' +
              'price = prix de vente ACTUEL en euros (s’il y a un prix barré et un prix promo, prends TOUJOURS le plus bas, le prix promo) ; ' +
              'originalPrice = le prix D’ORIGINE barré (avant réduction) s’il est affiché barré au-dessus du prix actuel, sinon 0 ; ' +
              'url = lien absolu de la fiche produit ; image = URL absolue de l’image du produit ' +
              '(son chemin contient souvent l’EAN même quand l’URL fiche ne l’a pas).\n\n' +
              `## CONTENU\n${context}`,
            schema: ExtractedSchema,
            schemaForLLM: EXTRACTED_SCHEMA_FOR_LLM as unknown as Record<string, unknown>,
            forceProvider: 'gemini',
            onProviderUsed: ({ model }) => modelsSeen.add(model),
          })
          products = extracted.products ?? []
          error = null
        } catch (e) {
          error = e
          products = []
        }
        if (!shouldRetryExtraction(products.length, context.length, allowRetry, tries + 1)) break
        ctx.log('info', `${label} : 0 produit sur ${context.length} chars → nouvelle tentative d’extraction (${tries + 2}/${MAX_EXTRACT_TRIES}) — le LLM rend parfois une liste vide à tort.`)
      }
      return { products, error }
    }

    for (let i = 0; i < pages.length; i++) {
      if (ctx.signal.aborted) break
      const { url, site, isMain } = pages[i]
      ctx.log('info', `(${i + 1}/${pages.length}) Lecture de la page liste ${site}…`)
      ctx.setProgress?.(Math.round((i / pages.length) * 100))

      const { markdown, source } = await readPageWithEscalation(url, {
        listing: true,
        log: ctx.log,
        onConnector: ctx.reportConnector,
      })
      if (!markdown.trim()) {
        ctx.log('warn', `Aucun contenu pour ${site} — bloqué malgré l'escalade (Jina + Bright Data).`)
        continue
      }
      if (source === 'brightdata') {
        ctx.log('info', `Contenu récupéré via Bright Data pour ${site}.`)
      }

      // Extraction DÉTERMINISTE via JSON-LD ItemList si la grille est maigre (rendue JS) :
      // on récupère le HTML brut Bright Data et on lit le schema.org ItemList (EAN propres).
      let ld: LdProduct[] = []
      if (priceMarkerCount(markdown) < THIN_LISTING_MARKERS) {
        try {
          // Borne DURE : le fetch BD est best-effort et ne doit JAMAIS bloquer le run
          // client (sinon isRunning reste coincé → cartes figées). 20 s max, sinon repli LLM.
          const html = await Promise.race([
            brightDataScrapeHtml(url),
            new Promise<null>((res) => setTimeout(() => res(null), 20000)),
          ])
          ld = html ? parseListingItemList(html) : []
          if (ld.length) ctx.log('info', `${site} : ${ld.length} produit(s) via JSON-LD ItemList (déterministe).`)
        } catch { /* pas d'ItemList → repli LLM */ }
      }

      // Bornage du contexte LLM (les pages liste peuvent être volumineuses).
      const context = markdown.length > 28000 ? markdown.slice(0, 28000) : markdown
      ctx.reportConnector?.('llm')
      // Extraction d'une LISTE = JSON exhaustif non déterministe : deepseek-chat sous-extrait
      // (Leroy Merlin : 0/5/24 sur le même markdown). On privilégie gemini-3.1-pro et on relance
      // tant qu'un contenu substantiel sort 0 produit (cf. runExtraction).
      const { products: llmProducts, error: llmError } = await runExtraction(context, site, isMain)
      if (llmError && llmProducts.length === 0) {
        // L'ItemList déterministe sauve la page même si le LLM échoue.
        if (ld.length === 0) { ctx.log('error', `Extraction LLM échouée pour ${site} : ${llmError instanceof Error ? llmError.message : String(llmError)}`); continue }
        ctx.log('warn', `Extraction LLM échouée pour ${site} (${llmError instanceof Error ? llmError.message : String(llmError)}) — repli sur l'ItemList JSON-LD.`)
      }

      let products = mergeListing(ld, llmProducts)
      // Escalade rendu JS sur résultat MAIGRE (page principale) : le Web Unlocker peut ne rendre
      // qu'une grille partielle (produits SSR/sponsorisés — ex Leroy Merlin le soir : 5 / 24).
      // Le Scraping Browser (navigateur réel) rend la grille complète. On ne REMPLACE que s'il
      // ramène STRICTEMENT PLUS → aucune régression, coût payé uniquement sur un listing maigre.
      if (shouldEscalateToBrowser(products.length, isMain)) {
        ctx.log('info', `${site} : ${products.length} produit(s) (maigre) via Jina/Web Unlocker → escalade Scraping Browser (rendu JS).`)
        const renderedHtml = await forceScrapingBrowserHtml(url)
        if (renderedHtml) {
          const renderedText = htmlToText(renderedHtml).slice(0, 28000)
          const ld2 = parseListingItemList(renderedHtml)
          const { products: llm2 } = await runExtraction(renderedText, `${site} (rendu JS)`, true)
          const products2 = mergeListing(ld2, llm2)
          if (products2.length > products.length) {
            ctx.log('info', `${site} : ${products2.length} produit(s) via Scraping Browser — grille rendue en JS (Web Unlocker insuffisant : ${products.length}).`)
            products = products2
          }
        }
      }
      let added = 0
      for (const p of products) {
        const name = (p.name ?? '').trim()
        const url2 = (p.url ?? '').trim()
        if (!name) continue
        if (!matchesBrand(name, p.brand, brandTerm)) { brandFiltered++; continue }
        const key = `${site}|${url2 || name.toLowerCase()}` // dédup multi-pages
        if (seen.has(key)) continue
        seen.add(key)
        const price = Number.isFinite(p.price) && p.price > 0 ? p.price : parsePrice(p.name)
        // Prix barré = prix d'origine SI affiché barré et strictement > prix actuel.
        const orig = Number.isFinite(p.originalPrice) && p.originalPrice > price ? p.originalPrice : NaN
        allRows.push({
          _id: `lp_${rowId++}`,
          site,
          name,
          brand: (p.brand ?? '').trim(),
          ean: resolveEan(p.ean ?? '', p.image ?? '', p.url ?? '', p.name ?? ''),
          price: Number.isFinite(price) && price > 0 ? String(price) : '',
          originalPrice: Number.isFinite(orig) ? String(orig) : '',
          url: url2,
        } as ExcelRow)
        added++
        ctx.reportCount?.(allRows.length) // compteur live au fil de l'eau (sur l'edge)
      }
      ctx.log('info', `${added} produit(s) extrait(s) de ${site}.`)
    }

    ctx.setProgress?.(100)
    const capped = max > 0 ? allRows.slice(0, max) : allRows

    // Enrichissement par FICHE : l'EAN (et souvent la marque/prix canoniques) ne sont
    // pas sur la page liste mais sur la fiche produit. Pour chaque produit, on lit la
    // fiche via la cascade structurée (CF → proxies → Jina → Firecrawl → Bright Data,
    // SANS LLM) et on récupère le JSON-LD `gtin`/`brand`/`offers.price`.
    if (config.enrichFiches !== false && capped.length > 0) {
      const { extractStructuredDataFromUrl } = await import('@/features/scraping/core/structuredDataFetcher')
      const targets = capped.filter((r) => String(r.url ?? '').startsWith('http'))
      let done = 0
      let enriched = 0
      ctx.log('info', `Enrichissement de ${targets.length} fiche(s) (EAN/marque/prix)…`)
      // Pool de concurrence borné (coût/temps + rate-limit) ; respecte l'abort.
      const POOL = 5
      let cursor = 0
      const worker = async (): Promise<void> => {
        while (cursor < targets.length && !ctx.signal.aborted) {
          const row = targets[cursor++]
          try {
            const sd = await extractStructuredDataFromUrl(String(row.url))
            if (sd) {
              const eanFromFiche = String(sd.gtin ?? '').replace(/\D/g, '')
              if (isValidEan13(eanFromFiche)) row.ean = eanFromFiche
              if (sd.brand && !String(row.brand ?? '').trim()) row.brand = sd.brand
              // Ne PAS écraser un prix déjà extrait de la liste : c'est le prix de vente
              // (promo) affiché ; la fiche JSON-LD porte souvent le prix catalogue.
              const p = sd.offers?.price
              if (typeof p === 'number' && p > 0 && !String(row.price ?? '').trim()) row.price = String(p)
              if (sd.gtin || sd.brand || sd.offers?.price != null) enriched++
            }
          } catch { /* fiche inaccessible → on garde la donnée de la liste */ }
          done++
          ctx.setProgress?.(Math.round((done / targets.length) * 100))
        }
      }
      await Promise.all(Array.from({ length: Math.min(POOL, targets.length) }, () => worker()))
      ctx.log('info', `Fiches enrichies : ${enriched}/${targets.length}.`)
    }

    // Garde-fou : un prix barré DOIT être strictement supérieur au prix de vente
    // (sinon ce n'est pas une promo). Vide les prix barrés incohérents.
    for (const row of capped) {
      const pr = parsePrice(String(row.price ?? ''))
      const ob = parsePrice(String(row.originalPrice ?? ''))
      if (!(Number.isFinite(ob) && Number.isFinite(pr) && ob > pr)) row.originalPrice = ''
    }

    if (brandTerm && brandFiltered > 0) ctx.log('info', `Filtre marque « ${brandTerm} » : ${brandFiltered} produit(s) hors-marque écarté(s).`)
    if (capped.length === 0) {
      ctx.log('warn', '⚠️ Aucun produit extrait — vérifie les URLs (pages liste) et la disponibilité Jina.')
    } else {
      const modelLabel = modelsSeen.size > 0 ? ` — extraction via ${[...modelsSeen].join(', ')}` : ''
      ctx.log('info', `Total : ${capped.length} produit(s) sur ${pages.length} page(s)${modelLabel}.`)
    }
    return { sheet: { name: 'Produits (liste)', columns: COLUMNS, rows: capped, taxonomy: [] } }
  },
}

nodeRegistry.register(listProductsNode)
