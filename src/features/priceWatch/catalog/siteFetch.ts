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
import { fetchAuthHtml } from './authFetchClient'
import { getApiKey } from '@/lib/apiKeys'
import type { SiteEngine } from '../types'

export interface SiteFetcher {
  fetchHtml: (url: string) => Promise<string | null>
  /** Dernier moteur ayant réellement fourni du HTML pendant la passe. */
  lastEngine: () => string | undefined
  /** Pastille connecteur à annoncer via ctx.reportConnector. */
  connectorId: 'jina' | 'firecrawl' | 'brightdata'
}


/** @param opts.auth site à prix connectés → passe par la CF `fetchPageHtmlAuth`.
 *  @param opts.host domaine configuré = clé Firestore des identifiants (requis si auth). */
export function buildSiteFetcher(engine?: SiteEngine, opts?: { auth?: boolean; host?: string }): SiteFetcher {
  let last: string | undefined
  // Site authentifié : le login cookie serveur PRIME sur le moteur (les prix ne sont
  // visibles que connecté). Le moteur forcé éventuel n'a pas de sens ici.
  if (opts?.auth && opts.host) {
    const host = opts.host
    return {
      connectorId: 'jina', // pastille neutre ; l'auth est un canal, pas un fournisseur externe facturé
      lastEngine: () => last,
      fetchHtml: async (url) => {
        const html = await fetchAuthHtml(url, host)
        if (html) last = 'authenticated'
        return html
      },
    }
  }
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
  // Mode AUTO : cascade Serveur → Jina → Firecrawl → Bright Data → proxies. `last`
  // sert de MÉMO — une fois qu'un moteur (souvent payant) a débloqué ce site, les
  // pages suivantes l'essaient en premier au lieu de re-payer l'échec des paliers
  // gratuits à chaque page (garde-fou anti-gouffre de crédits).
  return {
    connectorId: 'jina',
    lastEngine: () => last,
    fetchHtml: async (url) => {
      const prefer = last === 'firecrawl' || last === 'brightdata' ? last : undefined
      const r = await fetchSourceHtmlWithEngine(url, 20_000, prefer)
      if (r) last = r.engine
      return r?.html ?? null
    },
  }
}
