/**
 * Bright Data Web Unlocker wrapper (browser-side).
 *
 * Bright Data n'a pas de CORS browser-side et la clé doit rester serveur. On
 * délègue donc à la Cloud Function `scrapeWithBrightData` qui :
 *  - vérifie l'auth Firebase ID token
 *  - injecte le token Bright Data depuis Firebase Secret Manager
 *  - appelle l'API REST Bright Data et renvoie le HTML brut
 *
 * Côté browser : on convertit HTML → markdown via Turndown, et on extrait
 * les liens documentaires en parallèle.
 *
 * Erreurs typées : auth/balance/timeout/internal pour permettre à l'UI
 * d'afficher un message clair (`getLastBrightDataError()`).
 */

import { httpsCallable, type FunctionsError } from 'firebase/functions'
import TurndownService from 'turndown'
import { functions } from '@/lib/firebase/config'
import { getSiteCookieForUrl } from '@/lib/siteCookies'
import { recordBrightDataUsage } from '@/features/stats/brightDataUsageTracking'
import { parseStructuredDataAny, type StructuredProductData } from './structuredData'

// ─── Host cache (24h TTL) ────────────────────────────────────────────────────
// Mémorise les hosts qui renvoient systématiquement un challenge anti-bot.
// Permet de court-circuiter Firecrawl et aller directement à Bright Data.

const HOST_CACHE_KEY = 'designstudio_antibot_blocked_hosts'
const HOST_TTL_MS = 24 * 60 * 60 * 1000

type HostMap = Record<string, number>

function readHostMap(): HostMap {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(HOST_CACHE_KEY)
    return raw ? (JSON.parse(raw) as HostMap) : {}
  } catch { return {} }
}

function writeHostMap(map: HostMap): void {
  if (typeof localStorage === 'undefined') return
  try { localStorage.setItem(HOST_CACHE_KEY, JSON.stringify(map)) } catch { /* quota */ }
}

function hostFromUrl(url: string): string | null {
  try { return new URL(url).hostname.toLowerCase() } catch { return null }
}

export function markHostBlocked(url: string): void {
  const host = hostFromUrl(url)
  if (!host) return
  const map = readHostMap()
  map[host] = Date.now()
  writeHostMap(map)
}

export function isHostKnownBlocked(url: string): boolean {
  const host = hostFromUrl(url)
  if (!host) return false
  const map = readHostMap()
  const ts = map[host]
  if (!ts) return false
  if (Date.now() - ts > HOST_TTL_MS) {
    delete map[host]
    writeHostMap(map)
    return false
  }
  return true
}

export function clearHostCache(): void {
  if (typeof localStorage !== 'undefined') localStorage.removeItem(HOST_CACHE_KEY)
}

// ─── PDF link extraction ─────────────────────────────────────────────────────

export function extractPdfLinksFromHtml(html: string, baseUrl: string): Array<{ name: string; url: string }> {
  if (!html) return []
  let doc: Document
  try { doc = new DOMParser().parseFromString(html, 'text/html') } catch { return [] }
  const DOC_EXT = /\.(pdf|docx?|xlsx?|pptx?|zip|dwg|step|stp|iges)(\?[^"']*)?$/i
  const DOC_LABEL_RE = /^(fiche\s*technique|notice(?:\s+d['']utilisation)?|datasheet|tech[\s-]?sheet|manuel(?:\s+d['']utilisation)?|user\s+manual|brochure|catalogue|guide(?:\s+d['']utilisation)?|d[eé]claration(?:\s+(?:de\s+)?conformit[eé]|\s+ce)?|certificat|sp[eé]cifications?\s+(?:techniques?|du\s+produit)|fds|sds|safety\s+data\s+sheet|notice\s+technique|ce\s+declaration|installation\s+guide|manual)\b/i
  const seen = new Set<string>()
  const out: Array<{ name: string; url: string }> = []
  for (const a of doc.querySelectorAll('a[href]')) {
    const href = (a.getAttribute('href') ?? '').trim()
    if (!href || href.startsWith('#') || /^(javascript|mailto|tel):/i.test(href)) continue
    const text = (a.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (!DOC_EXT.test(href) && !a.hasAttribute('download') && !(text.length > 2 && text.length < 100 && DOC_LABEL_RE.test(text))) continue
    let absolute: string
    try { absolute = new URL(href, baseUrl).toString() } catch { continue }
    if (seen.has(absolute)) continue
    seen.add(absolute)
    out.push({ name: text || absolute.split('/').pop()?.replace(/\?.*$/, '') || 'Document', url: absolute })
  }
  return out
}

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
})
turndown.remove(['script', 'style', 'noscript', 'iframe'])

interface BrightDataCallResponse {
  html: string
  length: number
  status: number
  country: string
  attempts: number
  durationMs: number
}

const callBrightData = httpsCallable<{ url: string; sessionCookies?: string }, BrightDataCallResponse>(
  functions,
  'scrapeWithBrightData',
  // Le Web Unlocker (DataDome/Cloudflare) peut dépasser 70s — le défaut httpsCallable — alors que la
  // Cloud Function a un budget de 200s (TIMEOUT_MS=160s). Sans ça, le client abandonnait à 70s
  // (« deadline-exceeded ») pendant que la fonction résolvait encore le challenge.
  { timeout: 180_000 },
)

/** Metadata du dernier appel réussi — utile pour debug / monitoring. */
let lastSuccess: { country: string; attempts: number; durationMs: number; lengthBytes: number } | null = null
export function getLastBrightDataSuccess() {
  return lastSuccess
}

export interface BrightDataResult {
  markdown: string
}

export interface BrightDataError {
  code: 'unauthenticated' | 'balance_exhausted' | 'rate_limited' | 'timeout' | 'not_configured' | 'internal'
  message: string
}

let lastError: BrightDataError | null = null
export function getLastBrightDataError(): BrightDataError | null {
  return lastError
}

/** Mapping FunctionsError code → BrightDataError lisible. */
function mapError(e: unknown): BrightDataError {
  const err = e as FunctionsError
  const code = err?.code ?? 'unknown'
  const message = err?.message ?? String(e)
  if (code === 'functions/unauthenticated') return { code: 'unauthenticated', message }
  if (code === 'functions/resource-exhausted') {
    return { code: /rate/i.test(message) ? 'rate_limited' : 'balance_exhausted', message }
  }
  if (code === 'functions/deadline-exceeded') return { code: 'timeout', message }
  if (code === 'functions/failed-precondition') return { code: 'not_configured', message }
  return { code: 'internal', message }
}

/** Appel sous-jacent — retourne le HTML ou null en cas d'erreur.
 *  Stocke aussi la metadata (country, attempts, durée) du dernier succès
 *  pour permettre l'affichage dans Settings UI / TypedLogConsole.
 *  Si un cookie de session est stocké pour l'hostname, il est injecté automatiquement. */
async function callScrape(url: string): Promise<string | null> {
  const sessionCookies = getSiteCookieForUrl(url) || undefined
  try {
    const result = await callBrightData({ url, ...(sessionCookies && { sessionCookies }) })
    const data = result.data
    if (data?.html) {
      lastError = null
      lastSuccess = {
        country: data.country,
        attempts: data.attempts,
        durationMs: data.durationMs,
        lengthBytes: data.length,
      }
      void recordBrightDataUsage()
      return data.html
    }
    return null
  } catch (e) {
    lastError = mapError(e)
    console.warn('[brightdata] call failed:', lastError)
    return null
  }
}

/**
 * Récupère le markdown rendu d'une page via Bright Data Web Unlocker.
 * 
 */
export async function brightDataScrape(url: string): Promise<BrightDataResult | null> {
  const html = await callScrape(url)
  if (!html) return null
  try {
    const markdown = turndown.turndown(html)
    return { markdown }
  } catch (e) {
    console.warn('[brightdata] turndown failed:', e)
    return null
  }
}

/**
 * Récupère le HTML brut. Utile pour parser JSON-LD/microdata côté caller.
 */
export async function brightDataScrapeHtml(url: string): Promise<string | null> {
  return callScrape(url)
}

/**
 * Extrait les URLs d'images depuis le HTML rendu (src, srcset, data-src,
 * format Next.js /_next/image?url=...). Injecté dans le markdown comme bloc
 * JINA_EXTRACTED_IMAGES pour que parseImagesFromMarkdown les ramasse.
 */
function extractImagesFromHtml(html: string, baseUrl: string): string[] {
  if (typeof DOMParser === 'undefined') return []
  let doc: Document
  try {
    doc = new DOMParser().parseFromString(html, 'text/html')
  } catch { return [] }

  const seen = new Set<string>()
  const result: string[] = []

  const addUrl = (raw: string | null | undefined) => {
    if (!raw) return
    let u = raw.trim()
    if (!u || u.startsWith('data:') || u.startsWith('blob:')) return
    // Décoder les URLs Next.js : /_next/image?url=ENCODED_URL&w=N&q=N
    if (u.includes('/_next/image')) {
      try {
        const qs = u.includes('?') ? u.split('?')[1] : ''
        const decoded = new URLSearchParams(qs).get('url')
        if (decoded) u = decoded
      } catch { return }
    }
    // Résoudre protocole-relatif et absolu-relatif
    if (u.startsWith('//')) u = 'https:' + u
    else if (u.startsWith('/')) {
      try { u = new URL(u, baseUrl).href } catch { return }
    }
    if (!u.startsWith('http')) return
    if (seen.has(u)) return
    seen.add(u)
    result.push(u)
  }

  const parseSrcset = (srcset: string | null) => {
    if (!srcset) return
    for (const part of srcset.split(',')) {
      const candidate = part.trim().split(/\s+/)[0]
      if (candidate) addUrl(candidate)
    }
  }

  for (const img of Array.from(doc.querySelectorAll('img'))) {
    addUrl(img.getAttribute('src'))
    addUrl(img.getAttribute('data-src'))
    addUrl(img.getAttribute('data-lazy-src'))
    addUrl(img.getAttribute('data-original'))
    parseSrcset(img.getAttribute('srcset') || img.getAttribute('data-srcset'))
  }
  for (const source of Array.from(doc.querySelectorAll('picture source'))) {
    parseSrcset(source.getAttribute('srcset') || source.getAttribute('data-srcset'))
  }

  console.log('[brightdata] extractImagesFromHtml:', result.length, 'URLs candidates')
  return result
}

/**
 * Récupère markdown + liens PDF en une seule passe (équivalent
 * `). Utilisé par le pipeline d'enrichissement.
 * Injecte aussi un bloc JINA_EXTRACTED_IMAGES avec toutes les URLs d'images
 * extraites du HTML (srcset, data-src, Next.js /_next/image).
 */
export async function brightDataScrapeWithDocs(
  url: string,
): Promise<{
  markdown: string
  pdfLinks: Array<{ name: string; url: string }>
  /** JSON-LD / microdata Schema.org parsé directement depuis le HTML BD.
   *  Crucial pour les sites anti-bot (Akamai, DataDome) où le fetch parallèle
   *  `extractStructuredDataFromUrl` est bloqué : le HTML BD contient les
   *  scripts <script type="application/ld+json"> mais Turndown les supprime,
   *  donc on parse AVANT la conversion markdown. */
  structuredData: StructuredProductData | null
} | null> {
  const html = await callScrape(url)
  if (!html) return null
  let markdown = ''
  try {
    markdown = turndown.turndown(html)
  } catch (e) {
    console.warn('[brightdata] turndown failed:', e)
    return null
  }
  const pdfLinks = extractPdfLinksFromHtml(html, url)
  // Injecter les images extraites du HTML pour que parseImagesFromMarkdown les ramasse
  const rawImages = extractImagesFromHtml(html, url)
  if (rawImages.length > 0) {
    const imgBlock = `\nJINA_EXTRACTED_IMAGES_START\n${rawImages.join('\n')}\nJINA_EXTRACTED_IMAGES_END\n`
    markdown = imgBlock + markdown
  }
  let structuredData: StructuredProductData | null = null
  try {
    structuredData = parseStructuredDataAny(html)
  } catch (e) {
    console.warn('[brightdata] parseStructuredData failed:', e)
  }
  return { markdown, pdfLinks, structuredData }
}
