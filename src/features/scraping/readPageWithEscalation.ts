// src/features/scraping/readPageWithEscalation.ts
// Lecture d'une page web avec ESCALADE de connecteurs : Jina d'abord, puis
// Bright Data (Web Unlocker → Scraping Browser) si Jina est bloqué / vide /
// renvoie un challenge anti-bot. Chaque palier est tracé via `log`.
//
// Volontairement générique (vendor-neutral) : aucun parser par-marque. Le markdown
// renvoyé est ensuite consommé tel quel (ex. extraction LLM des produits d'une
// page liste). Réutilisable par tout node de workflow qui lit une page.
import { jinaRead } from './useJina'
import { brightDataScrapeWithDocs } from './core/brightDataFallback'
import { looksLikeBotChallenge } from '@/features/excel/ai-enrichment/markdownSanitize'

type ScrapeSource = 'jina' | 'brightdata' | null

export interface EscalatedRead {
  /** Markdown exploitable, ou '' si tous les connecteurs ont échoué / restent bloqués. */
  markdown: string
  /** Connecteur qui a fourni le contenu (null si rien d'exploitable). */
  source: ScrapeSource
}

type LogFn = (level: 'info' | 'warn' | 'error', msg: string) => void

/** Vrai si le markdown est vide ou ressemble à une page de challenge anti-bot. */
function isBlocked(markdown: string): boolean {
  return !markdown.trim() || looksLikeBotChallenge(markdown)
}

/**
 * Lit `url` en enchaînant les connecteurs de scraping jusqu'à obtenir un contenu
 * exploitable. Ne lève jamais : renvoie `{ markdown: '', source: null }` si tout échoue.
 */
export async function readPageWithEscalation(
  url: string,
  opts: { listing?: boolean; log: LogFn; onConnector?: (id: string) => void },
): Promise<EscalatedRead> {
  const { log, listing, onConnector } = opts

  // Palier 1 — Jina (lecteur markdown, moteur navigateur si `listing`).
  onConnector?.('jina')
  let jinaMarkdown = ''
  try {
    const data = await jinaRead(url, { listing })
    jinaMarkdown = data.content ?? ''
  } catch (e) {
    log('warn', `Jina a échoué : ${e instanceof Error ? e.message : String(e)}`)
  }
  if (!isBlocked(jinaMarkdown)) {
    return { markdown: jinaMarkdown, source: 'jina' }
  }

  // Palier 2 — Bright Data (Web Unlocker, puis Scraping Browser en escalade interne).
  onConnector?.('brightdata')
  log('info', 'Page bloquée ou vide sur Jina → escalade Bright Data…')
  try {
    const bd = await brightDataScrapeWithDocs(url)
    const bdMarkdown = bd?.markdown ?? ''
    if (!isBlocked(bdMarkdown)) {
      log('info', '✓ Page débloquée via Bright Data.')
      return { markdown: bdMarkdown, source: 'brightdata' }
    }
    log('warn', 'Bright Data n’a rien renvoyé d’exploitable (toujours bloqué).')
  } catch (e) {
    log('warn', `Bright Data a échoué : ${e instanceof Error ? e.message : String(e)}`)
  }

  // Tous les connecteurs ont échoué : pas de contenu exploitable.
  return { markdown: '', source: null }
}
