// src/features/scraping/webContext.ts
//
// Récupération de contexte web GÉNÉRIQUE, réutilisable partout dans l'app
// (chat Telegram, nodes de workflow, etc.) :
//  - lecture du contenu d'URLs explicites (Jina Reader) ;
//  - recherche web sur une requête (Jina Search) + lecture réelle des premières pages.
//
// Réutilise les primitives Jina existantes (pas de second scraper). Tolérant aux
// pannes : toute erreur Jina (clé absente, réseau, site bloqué) est avalée et la
// fonction renvoie ce qui a pu être récupéré.

import { jinaRead } from '@/features/scraping/useJina'
import { jinaSearch, type SearchResult } from '@/features/excel/ai-enrichment/useProductEnrichment'

const URL_RE = /https?:\/\/[^\s<>()]+/gi
const MAX_URLS = 2
const DEFAULT_MAX_SEARCH_RESULTS = 5
/** Nb de pages de résultats dont on lit RÉELLEMENT le contenu (pas juste le snippet).
 *  Indispensable pour les données « live » (scores, prix, météo) : le snippet de
 *  recherche ne contient pas la valeur courante, seule la page la porte. */
const DEFAULT_MAX_READ_RESULTS = 2
const PER_PAGE_CHARS = 3000
/** Pages de résultats lues : plus courtes (souvent du bruit autour de la donnée). */
const PER_RESULT_CHARS = 2500

/** Un résultat de recherche web (forme neutre, découplée du moteur d'enrichissement). */
export interface WebSearchResult {
  url: string
  title?: string
  description?: string
}

export interface WebContext {
  /** Bloc texte à injecter dans un prompt (vide si rien n'a été récupéré). */
  text: string
  /** URLs réellement utilisées comme sources (pour affichage). */
  sources: string[]
  /** Résultats de recherche structurés (vide si pas de recherche ou échec). */
  results: WebSearchResult[]
}

/** Extrait les URLs http(s) d'un texte, dédupliquées, nettoyées de la ponctuation finale. */
export function extractUrls(text: string): string[] {
  const found = text.match(URL_RE) ?? []
  const cleaned = found.map((u) => u.replace(/[.,;:!?)\]]+$/, ''))
  return Array.from(new Set(cleaned))
}

/** Lit une page via Jina et renvoie un bloc texte tronqué, ou null si illisible. */
async function readPageBlock(url: string, maxChars: number, label: string): Promise<string | null> {
  try {
    const page = await jinaRead(url, { noCache: true })
    const content = (page.content ?? '').slice(0, maxChars)
    if (!content.trim()) return null
    return `### ${label} ${url}\n` + (page.title ? `Titre : ${page.title}\n` : '') + content
  } catch {
    return null
  }
}

/**
 * Récupère du contexte web : lit les URLs fournies, puis (si une requête est
 * fournie) lance une recherche web. On n'injecte PAS que les snippets : pour les
 * données « live » (scores, prix, météo) le snippet ne contient pas la valeur
 * courante. On lit donc réellement le contenu des premières pages de résultats
 * (rendu JS via le moteur navigateur de Jina), en plus de la liste des snippets.
 */
export async function gatherWebContext(opts: {
  urls?: string[]
  searchQuery?: string
  /** Nb max de résultats de recherche (défaut 5). */
  maxResults?: number
  /** Nb de pages de résultats dont on lit le contenu complet (défaut 2). */
  readPages?: number
}): Promise<WebContext> {
  const parts: string[] = []
  const sources: string[] = []
  let results: WebSearchResult[] = []

  const maxResults = Math.max(1, Math.min(20, opts.maxResults ?? DEFAULT_MAX_SEARCH_RESULTS))
  const readPages = Math.max(0, Math.min(5, opts.readPages ?? DEFAULT_MAX_READ_RESULTS))

  // ── Lecture des URLs explicitement fournies ──
  const urls = (opts.urls ?? []).slice(0, MAX_URLS)
  for (const url of urls) {
    const block = await readPageBlock(url, PER_PAGE_CHARS, 'Contenu de')
    if (block) {
      parts.push(block)
      sources.push(url)
    }
  }

  // ── Recherche web ──
  const query = opts.searchQuery?.trim()
  if (query) {
    try {
      const hits = await jinaSearch(query, maxResults)
      results = hits.map((r: SearchResult) => ({ url: r.url, title: r.title, description: r.description }))
      if (results.length > 0) {
        // 1) Liste des résultats (titres/URLs/snippets) pour le panorama.
        const lines = results.map((r, i) => {
          const title = r.title?.trim() || r.url
          const desc = r.description?.trim() ? `\n   ${r.description.trim()}` : ''
          return `${i + 1}. ${title}\n   ${r.url}${desc}`
        })
        parts.push(`### Résultats de recherche web pour « ${query} »\n${lines.join('\n')}`)
        for (const r of results) sources.push(r.url)

        // 2) Lecture RÉELLE des premières pages (en parallèle) → contient la donnée
        //    live que le snippet n'a pas. On saute celles déjà lues via les URLs fournies.
        const toRead = results
          .map((r) => r.url)
          .filter((u) => !urls.includes(u))
          .slice(0, readPages)
        const pageBlocks = await Promise.all(
          toRead.map((u) => readPageBlock(u, PER_RESULT_CHARS, 'Page')),
        )
        for (const block of pageBlocks) {
          if (block) parts.push(block)
        }
      }
    } catch {
      /* recherche échouée → contexte sans résultats web */
    }
  }

  return { text: parts.join('\n\n'), sources: Array.from(new Set(sources)), results }
}
