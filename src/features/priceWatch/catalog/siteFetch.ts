// src/features/priceWatch/catalog/siteFetch.ts
// Fetch HTML d'un site concurrent pendant la moisson, avec moteur FORCÉ par site
// (node « Sites sources ») et télémétrie du moteur réellement utilisé (persistée en
// `CompetitorMeta.lastEngine`, affichée dans le tableau de gestion).
//   - 'jina'       → Jina Reader seul (pas de fetch serveur ni proxy) ;
//   - 'firecrawl'  → Firecrawl rendu JS + scroll (grilles lazy-load, payant/crédit) ;
//   - 'brightdata' → Scraping Browser Bright Data (anti-bot durs, payant) ;
//   - défaut       → cascade standard fetch serveur → Jina → proxies.
import { fetchJinaHtml, fetchSourceHtmlWithEngine } from '@/features/scraping-templates/fetchSourceHtml'
import { brightDataScrapeHtml } from '@/features/scraping/core/brightDataFallback'
import { firecrawlScrapeHtml } from '@/features/scraping/core/firecrawlFallback'
import { getApiKey } from '@/lib/apiKeys'
import type { SiteEngine } from '../types'

export interface SiteFetcher {
  fetchHtml: (url: string) => Promise<string | null>
  /** Dernier moteur ayant réellement fourni du HTML pendant la passe. */
  lastEngine: () => string | undefined
  /** Pastille connecteur à annoncer via ctx.reportConnector. */
  connectorId: 'jina' | 'firecrawl' | 'brightdata'
}

export function buildSiteFetcher(engine?: SiteEngine): SiteFetcher {
  let last: string | undefined
  if (engine === 'brightdata') {
    return {
      connectorId: 'brightdata',
      lastEngine: () => last,
      fetchHtml: async (url) => {
        const html = await brightDataScrapeHtml(url)
        if (html) last = 'brightdata'
        return html
      },
    }
  }
  if (engine === 'firecrawl') {
    return {
      connectorId: 'firecrawl',
      lastEngine: () => last,
      fetchHtml: async (url) => {
        const key = getApiKey('firecrawl').trim()
        if (!key) throw new Error('Moteur Firecrawl forcé mais clé absente — renseigne-la dans Réglages → Connecteurs.')
        // scroll: pages LISTE lazy-load — on défile pour hydrater la grille complète.
        const html = await firecrawlScrapeHtml(url, key, { scroll: true })
        if (html) last = 'firecrawl'
        return html
      },
    }
  }
  if (engine === 'jina') {
    return {
      connectorId: 'jina',
      lastEngine: () => last,
      fetchHtml: async (url) => {
        const html = await fetchJinaHtml(url)
        if (html) last = 'jina'
        return html
      },
    }
  }
  return {
    connectorId: 'jina',
    lastEngine: () => last,
    fetchHtml: async (url) => {
      const r = await fetchSourceHtmlWithEngine(url)
      if (r) last = r.engine
      return r?.html ?? null
    },
  }
}
