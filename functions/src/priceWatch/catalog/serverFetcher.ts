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

  // ⚠⚠ Mode AUTO : une vraie CASCADE, comme au navigateur. Le serveur se contentait d'UN
  // fetch direct et abandonnait — donc tout site derrière un anti-bot (Cloudflare et
  // consorts) rendait 0 fiche au cron, pendant que le même site se moissonnait sans peine
  // depuis l'onglet. Mesuré sur granit-parts.fr : « via Jina, 12 pages » à la main, rien
  // du tout la nuit. Le cron est pourtant le seul chemin qui tourne tout seul.
  //
  // Ordre = du GRATUIT au PAYANT : direct → Jina → Firecrawl → Bright Data.
  let sinceRetry = 0
  return {
    lastEngine: () => last,
    fetchHtml: async (url) => {
      // Collant sur le moteur payant qui a fonctionné : repayer l'échec des paliers
      // gratuits à chaque page coûterait une seconde et demie pour rien. On re-teste
      // quand même périodiquement — un site redevenu accessible ne doit pas rester sur
      // un moteur soixante-dix fois plus lent.
      const sticky = last === 'firecrawl' || last === 'brightdata'
      const retry = sticky && sinceRetry >= FREE_RETRY_EVERY
      if (retry) sinceRetry = 0

      if (!sticky || retry) {
        const direct = await fetchHtml(url, timeoutMs).catch(() => null)
        if (direct) { last = 'cloudFunction'; sinceRetry = 0; return direct }
        const viaJina = await jinaHtml(url, timeoutMs)
        if (viaJina) { last = 'jina'; sinceRetry = 0; return viaJina }
      }

      const key = await getUserApiKey(uid, 'firecrawl').catch(() => '')
      if (key) {
        const viaFirecrawl = await firecrawlScrapeHtml(url, key, { scroll: true }).catch(() => null)
        if (viaFirecrawl) { last = 'firecrawl'; sinceRetry++; return viaFirecrawl }
      }
      const viaBd = await brightDataRead(url).catch(() => null)
      if (viaBd?.html) { last = 'brightdata'; sinceRetry++; return viaBd.html }

      // Tous les paliers ont échoué : on le DIT dans le canal, sinon le tableau affiche
      // « via cloudFunction » pour une page qui n'a jamais été lue.
      return null
    },
  }
}

/** Pages servies par un moteur payant avant de re-tenter les paliers gratuits. Même
 *  valeur qu'au navigateur (`siteFetch.ts`) : les deux doivent facturer pareil. */
const FREE_RETRY_EVERY = 25
