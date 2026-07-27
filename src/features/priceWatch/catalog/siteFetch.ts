// Fetch HTML d'un site concurrent pendant la moisson, avec moteur FORCÉ par site
// (node « Sites sources ») et télémétrie du moteur réellement utilisé (persistée en
// `CompetitorMeta.lastEngine`, affichée dans le tableau de gestion).
//   - 'jina'       → Jina Reader seul (pas de fetch serveur ni proxy) ;
//   - 'firecrawl'  → Firecrawl rendu JS + scroll (grilles lazy-load, payant/crédit) ;
//   - 'brightdata' → Scraping Browser Bright Data (anti-bot durs, payant) ;
//   - 'browseract' → exécution d'un BOT BrowserAct (Amazon, LinkedIn, anti-bot durs).
//     ⚠ Un bot ne rend JAMAIS le HTML d'une page : ses formats de sortie sont JSON, CSV,
//     XML ou Markdown. Ses lignes sont donc converties en document JSON-LD synthétique
//     (`botOutputToHtml`), ce qui en fait une source comme une autre pour la suite du
//     pipeline. Une page = une TÂCHE facturée et longue, l'ID du bot est obligatoire :
//     réservé à la RECHERCHE DIRIGÉE (quelques pages par produit), plafonné par passe ;
//   - défaut       → cascade standard fetch serveur → Jina → proxies.
import { fetchJinaHtml, fetchSourceHtmlWithEngine } from '@/features/scraping-templates/fetchSourceHtml'
import { brightDataScrapeHtml } from '@/features/scraping/core/brightDataFallback'
import { firecrawlScrapeHtml } from '@/features/scraping/core/firecrawlFallback'
import { fetchAuthHtml } from './authFetchClient'
import { getApiKey } from '@/lib/apiKeys'
import { runBrowserActWorkflow } from '@/features/scraping/core/browserAct'
import { botOutputToHtml } from './botListing'
import type { SiteEngine } from '../types'

export interface SiteFetcher {
  fetchHtml: (url: string) => Promise<string | null>
  /** Dernier moteur ayant réellement fourni du HTML pendant la passe. */
  lastEngine: () => string | undefined
  /** Pastille connecteur à annoncer via ctx.reportConnector. */
  connectorId: 'jina' | 'firecrawl' | 'brightdata' | 'browseract'
}

/** Plafond d'exécutions de bot par passe et par site (chaque appel = une tâche facturée). */
const BROWSERACT_MAX_CALLS_PER_PASS = 20

/**
 * Attente maximale d'UNE exécution de bot dans une boucle de moisson.
 *
 * ⚠ Relevé en prod : à 300 s, un bot qui n'aboutit jamais (version non publiée, paramètre
 * d'entrée mal nommé, file d'attente du palier gratuit) coûtait 5 minutes PAR PAGE, soit
 * 100 minutes pour un seul site avant d'atteindre le plafond d'appels — un run entier
 * bloqué sans le moindre résultat. Un bot utilisable dans une boucle répond en moins de
 * deux minutes ; au-delà, c'est le node « BrowserAct (bot) » qu'il faut utiliser, où
 * l'attente est explicite et réglable.
 */
const BROWSERACT_PAGE_TIMEOUT_MS = 120_000

/** @param opts.auth site à prix connectés → passe par la CF `fetchPageHtmlAuth`.
 *  @param opts.host domaine configuré = clé Firestore des identifiants (requis si auth).
 *  @param opts.botId identifiant du bot BrowserAct (requis avec le moteur 'browseract'). */
export function buildSiteFetcher(
  engine?: SiteEngine,
  opts?: { auth?: boolean; host?: string; botId?: string; signal?: AbortSignal },
): SiteFetcher {
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
  if (engine === 'browseract') {
    const botId = (opts?.botId ?? '').trim()
    if (!botId) {
      throw new Error(
        'Moteur BrowserAct forcé mais aucun bot choisi — renseigne l’ID du bot sur la carte du site. ' +
        'BrowserAct n’a pas de primitive « lis cette URL » : il exécute un bot de ton tableau de bord.')
    }
    let calls = 0
    // Disjoncteur : un bot qui n'aboutit pas une fois n'aboutira pas davantage la
    // suivante. Sans lui, chaque page repayait l'attente complète.
    let broken = false
    return {
      connectorId: 'browseract',
      lastEngine: () => last,
      fetchHtml: async (url) => {
        const key = getApiKey('browseract').trim()
        if (!key) throw new Error('Moteur BrowserAct forcé mais clé absente — renseigne-la dans Réglages → Connecteurs.')
        // ⚠ DISJONCTEUR. Une page = une TÂCHE BrowserAct : facturée, et longue (le bot
        // navigue réellement). Les autres moteurs coûtent une requête ; celui-ci coûte un
        // run. Sans ce plafond, une passe de moisson à plusieurs centaines de pages
        // viderait le compte. C'est aussi pourquoi ce moteur est fait pour la RECHERCHE
        // DIRIGÉE (quelques pages par produit), pas pour balayer un catalogue.
        if (broken || calls >= BROWSERACT_MAX_CALLS_PER_PASS) return null
        calls++
        const res = await runBrowserActWorkflow(key, botId, { url }, {
          timeoutMs: BROWSERACT_PAGE_TIMEOUT_MS,
          signal: opts?.signal,
        })
        if (res == null || res.status !== 'finished') {
          broken = true
          console.warn(
            `[browseract] bot « ${botId} » ${res ? `resté « ${res.status} »` : 'non démarré'} — site abandonné pour cette passe. ` +
            'Vérifie qu’une version est PUBLIÉE et que son paramètre d’entrée s’appelle « url ».')
          return null
        }
        // La STRUCTURE de sortie du bot est inconnue (il est construit site par site) :
        // `botOutputToHtml` déduit les champs par nom de clé PUIS par forme de valeur.
        const html = botOutputToHtml(res?.output, url)
        if (!html) {
          console.warn('[browseract] le bot n’a rendu aucune fiche exploitable — vérifie ses champs de sortie (nom/prix/référence).')
          return null
        }
        last = 'browseract'
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
