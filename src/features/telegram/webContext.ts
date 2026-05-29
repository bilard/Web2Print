// src/features/telegram/webContext.ts
//
// Récupération de contexte web pour le chat Telegram libre :
//  - Option B : lecture du contenu des URLs présentes dans le message (Jina Reader).
//  - Option A : recherche web sur une requête formulée par le LLM (Jina Search).
//
// Réutilise les primitives Jina existantes (pas de second scraper). Tolérant aux
// pannes : toute erreur Jina (clé absente, réseau, site bloqué) est avalée et la
// fonction renvoie ce qui a pu être récupéré — la réponse dégrade alors vers une
// réponse du modèle sans contexte plutôt que d'échouer.

import { jinaRead } from '@/features/scraping/useJina'
import { jinaSearch, type SearchResult } from '@/features/excel/ai-enrichment/useProductEnrichment'

const URL_RE = /https?:\/\/[^\s<>()]+/gi
const MAX_URLS = 2
const MAX_SEARCH_RESULTS = 5
/** Nb de pages de résultats dont on lit RÉELLEMENT le contenu (pas juste le snippet).
 *  Indispensable pour les données « live » (scores, prix, météo) : le snippet de
 *  recherche ne contient pas la valeur courante, seule la page la porte. */
const MAX_READ_RESULTS = 2
const PER_PAGE_CHARS = 3000
/** Pages de résultats lues : plus courtes (souvent du bruit autour de la donnée). */
const PER_RESULT_CHARS = 2500

export interface WebContext {
  /** Bloc texte à injecter dans le prompt (vide si rien n'a été récupéré). */
  text: string
  /** URLs réellement utilisées comme sources (pour affichage). */
  sources: string[]
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
 * Récupère du contexte web : lit les URLs du message, puis (si une requête est
 * fournie) lance une recherche web. On n'injecte PAS que les snippets : pour les
 * données « live » (scores, prix, météo) le snippet ne contient pas la valeur
 * courante. On lit donc réellement le contenu des premières pages de résultats
 * (rendu JS via le moteur navigateur de Jina), en plus de la liste des snippets.
 */
export async function gatherWebContext(opts: {
  urls?: string[]
  searchQuery?: string
}): Promise<WebContext> {
  const parts: string[] = []
  const sources: string[] = []

  // ── Option B : lecture des URLs explicitement présentes dans le message ──
  const urls = (opts.urls ?? []).slice(0, MAX_URLS)
  for (const url of urls) {
    const block = await readPageBlock(url, PER_PAGE_CHARS, 'Contenu de')
    if (block) {
      parts.push(block)
      sources.push(url)
    }
  }

  // ── Option A : recherche web ──
  const query = opts.searchQuery?.trim()
  if (query) {
    try {
      const results = await jinaSearch(query, MAX_SEARCH_RESULTS)
      if (results.length > 0) {
        // 1) Liste des résultats (titres/URLs/snippets) pour le panorama.
        const lines = results.map((r: SearchResult, i) => {
          const title = r.title?.trim() || r.url
          const desc = r.description?.trim() ? `\n   ${r.description.trim()}` : ''
          return `${i + 1}. ${title}\n   ${r.url}${desc}`
        })
        parts.push(`### Résultats de recherche web pour « ${query} »\n${lines.join('\n')}`)
        for (const r of results) sources.push(r.url)

        // 2) Lecture RÉELLE des premières pages (en parallèle) → contient la donnée
        //    live que le snippet n'a pas. On saute celles déjà lues via les URLs du message.
        const toRead = results
          .map((r) => r.url)
          .filter((u) => !urls.includes(u))
          .slice(0, MAX_READ_RESULTS)
        const pageBlocks = await Promise.all(
          toRead.map((u) => readPageBlock(u, PER_RESULT_CHARS, 'Page')),
        )
        for (const block of pageBlocks) {
          if (block) parts.push(block)
        }
      }
    } catch {
      /* recherche échouée → réponse sans contexte web */
    }
  }

  return { text: parts.join('\n\n'), sources: Array.from(new Set(sources)) }
}
