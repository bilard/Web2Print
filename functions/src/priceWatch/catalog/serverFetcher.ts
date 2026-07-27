// functions/src/priceWatch/catalog/serverFetcher.ts
// Choix du canal de lecture d'une page concurrent, côté SERVEUR (cron/headless).
//
// ⚠ Jusqu'ici le node de moisson serveur lisait TOUJOURS en direct et anonyme : le
// drapeau `auth` et le moteur forcé de la config n'avaient d'effet que sur les runs
// lancés depuis le navigateur. Conséquence observée : progarden et sodipieces indexaient
// des milliers de fiches à « prix 0 % » — leurs prix ne sont visibles que connecté — et
// un site en Bright Data restait bloqué par son anti-bot à chaque tick de cron.
//
// Ordre : accès connecté (le prix EST derrière le login, aucun moteur ne le remplace) →
// moteur forcé → direct. Toute erreur rend null : la moisson enchaîne, elle ne casse pas.
import { prestashopLogin, fetchWithJar } from '../../scraper/prestashopLogin'
import { getSiteCredentials } from '../../scraper/siteCredentials'
import { brightDataRead } from '../../workflow/brightData'
import { firecrawlScrapeHtml } from '../../scraper/firecrawlHtml'
import { getUserApiKey } from '../../workflow/apiKeys'
import { fetchHtml } from '../../scraper/fetchHtml'
import { runBrowserActBot } from '../../scraper/browserAct'
import type { CompetitorSite } from '../helpers'

export interface ServerFetcher {
  fetchHtml: (url: string) => Promise<string | null>
  /** Canal ayant réellement fourni le HTML (chip « via … » du tableau des sites). */
  lastEngine: () => string | undefined
}

/** Jina Reader en mode HTML — mêmes en-têtes que le client. */
async function jinaHtml(url: string, timeoutMs: number): Promise<string | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: { 'X-Return-Format': 'html', Accept: 'text/html' },
      signal: ctrl.signal,
    })
    if (!res.ok) return null
    const html = await res.text()
    return html.length > 500 ? html : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Construit le lecteur de pages d'un concurrent. La session connectée est ouverte UNE
 * fois puis réutilisée pour toutes les pages de la passe (un login par page serait lent
 * et ferait sonner les alarmes du site) ; si elle échoue, on retombe sur le direct plutôt
 * que d'abandonner le site — un catalogue sans prix vaut mieux qu'aucun catalogue.
 */
/** Plafond d'exécutions de bot par passe et par site (chaque appel = une tâche facturée). */
const BROWSERACT_MAX_CALLS_PER_PASS = 20

export function buildServerFetcher(uid: string, site: CompetitorSite, timeoutMs = 20_000): ServerFetcher {
  let last: string | undefined
  let jar: string | null = null
  let jarTried = false

  if (site.auth) {
    return {
      lastEngine: () => last,
      fetchHtml: async (url) => {
        if (!jarTried) {
          jarTried = true
          try {
            const creds = await getSiteCredentials(uid, site.domain)
            if (creds) jar = await prestashopLogin(creds, timeoutMs)
          } catch { jar = null }
        }
        if (jar) {
          const html = await fetchWithJar(url, jar, timeoutMs).catch(() => null)
          if (html) { last = 'authenticated'; return html }
        }
        const plain = await fetchHtml(url, timeoutMs).catch(() => null)
        if (plain) last = 'cloudFunction'
        return plain ?? null
      },
    }
  }

  if (site.engine === 'brightdata') {
    return {
      lastEngine: () => last,
      fetchHtml: async (url) => {
        // `brightDataRead` porte déjà le token/zone Firestore, l'escalade Web Unlocker →
        // Scraping Browser et le circuit-breaker crédits : rien à réimplémenter ici.
        const res = await brightDataRead(url).catch(() => null)
        if (res?.html) { last = 'brightdata'; return res.html }
        return null
      },
    }
  }

  if (site.engine === 'browseract') {
    // Parité exacte avec `siteFetch` côté client : bot OBLIGATOIRE, plafond par passe
    // (une page = une TÂCHE facturée), et la sortie doit être le CONTENU de la page —
    // les parseurs en aval lisent du HTML, pas des lignes JSON.
    const botId = (site.botId ?? '').trim()
    let calls = 0
    return {
      lastEngine: () => last,
      fetchHtml: async (url) => {
        if (!botId || calls >= BROWSERACT_MAX_CALLS_PER_PASS) return null
        const key = await getUserApiKey(uid, 'browseract').catch(() => '')
        if (!key) return null
        calls++
        const out = (await runBrowserActBot(key, botId, { url }, 300_000))?.trim()
        if (!out || !out.includes('<')) return null
        last = 'browseract'
        return out
      },
    }
  }

  if (site.engine === 'firecrawl') {
    return {
      lastEngine: () => last,
      fetchHtml: async (url) => {
        // Clé PAR UTILISATEUR (comme le client) : pas de clé = pas de lecture. On ne
        // retombe PAS en direct — un site réglé sur Firecrawl l'est parce que le direct
        // ne donne rien ; le faire en silence produirait des pages vides à chaque tick.
        const key = await getUserApiKey(uid, 'firecrawl').catch(() => '')
        if (!key) return null
        // `scroll` : pages LISTE lazy-load — parité exacte avec `siteFetch` côté client.
        const html = await firecrawlScrapeHtml(url, key, { scroll: true }).catch(() => null)
        if (html) { last = 'firecrawl'; return html }
        return null
      },
    }
  }

  if (site.engine === 'jina') {
    return {
      lastEngine: () => last,
      fetchHtml: async (url) => {
        const html = await jinaHtml(url, timeoutMs)
        if (html) { last = 'jina'; return html }
        return null
      },
    }
  }

  return {
    lastEngine: () => last,
    fetchHtml: async (url) => {
      const html = await fetchHtml(url, timeoutMs).catch(() => null)
      if (html) last = 'cloudFunction'
      return html ?? null
    },
  }
}
