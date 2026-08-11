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
import { antiBotChallenge } from '../../scraper/antiBot'
import type { CompetitorSite } from '../helpers'

export interface ServerFetcher {
  fetchHtml: (url: string) => Promise<string | null>
  /** Canal ayant réellement fourni le HTML (chip « via … » du tableau des sites). */
  lastEngine: () => string | undefined
  /**
   * Protection anti-bot ayant répondu à la place du site, quand TOUS les paliers ont été
   * refusés (« Cloudflare », « DataDome »…). `undefined` tant qu'aucune page n'a été
   * bloquée.
   *
   * ⚠ Sans cette remontée, un site entièrement protégé se lit « 50 pages · 0 produit » —
   * indiscernable d'un catalogue vide ou d'un extracteur cassé. Ce sont trois pannes très
   * différentes, et une seule se corrige en changeant de moteur.
   */
  blockedBy: () => string | undefined
  /** Pages demandées / réellement rendues sur la passe (cf. `counting`). */
  stats: () => { asked: number; got: number }
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
    // ⚠ Le tri « défi ou contenu » est fait par l'appelant (`keep`), pour qu'il puisse
    // RETENIR le nom de la protection : ici, on ne saurait à qui le dire.
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

/**
 * Compte les pages DEMANDÉES et RENDUES, autour de n'importe quel lecteur.
 *
 * ⚠⚠ Un moteur forcé qui échoue est totalement muet. Mesuré sur granit-parts.fr réglé sur
 * Firecrawl pendant une panne de ce service : « +0 produit(s) sur 82 page(s) » —
 * quatre-vingt-deux lectures REFUSÉES présentées comme quatre-vingt-deux pages lues. Sans
 * ce compte, rien ne distingue « le catalogue est vide » de « aucune page n'est arrivée »,
 * et ce sont deux pannes qui ne se réparent pas du tout de la même façon.
 *
 * Enveloppé ICI, autour du fetcher complet : une garde par branche finirait par en oublier
 * une, et c'est précisément ce genre d'oubli qui a créé le trou qu'on vient de boucher.
 */
function counting(f: ServerFetcher): ServerFetcher {
  let asked = 0
  let got = 0
  return {
    ...f,
    stats: () => ({ asked, got }),
    fetchHtml: async (url) => {
      asked++
      const html = await f.fetchHtml(url)
      if (html) got++
      return html
    },
  }
}

export function buildServerFetcher(uid: string, site: CompetitorSite, timeoutMs = 20_000): ServerFetcher {
  return counting(buildRawFetcher(uid, site, timeoutMs))
}

function buildRawFetcher(uid: string, site: CompetitorSite, timeoutMs: number): ServerFetcher {
  let last: string | undefined
  let blocked: string | undefined

  /**
   * Garde d'entrée de CHAQUE palier : rend le HTML s'il est exploitable, `null` si c'est
   * une page de défi — et retient au passage le nom de la protection.
   *
   * Un seul point de passage, parce qu'un palier oublié rouvrirait exactement le trou
   * qu'on bouche : il suffit d'un lecteur qui accepte un défi pour que la cascade
   * s'arrête net en croyant avoir réussi.
   */
  const keep = (html: string | null | undefined): string | null => {
    const challenge = antiBotChallenge(html)
    if (challenge) { blocked = challenge; return null }
    return html ?? null
  }
  let jar: string | null = null
  let jarTried = false

  if (site.auth) {
    return {
      lastEngine: () => last,
      blockedBy: () => blocked,
      stats: () => ({ asked: 0, got: 0 }),
      fetchHtml: async (url) => {
        if (!jarTried) {
          jarTried = true
          try {
            const creds = await getSiteCredentials(uid, site.domain)
            if (creds) jar = await prestashopLogin(creds, timeoutMs)
          } catch { jar = null }
        }
        if (jar) {
          const html = keep(await fetchWithJar(url, jar, timeoutMs).catch(() => null))
          if (html) { last = 'authenticated'; return html }
        }
        const plain = keep(await fetchHtml(url, timeoutMs).catch(() => null))
        if (plain) last = 'cloudFunction'
        return plain
      },
    }
  }

  if (site.engine === 'brightdata') {
    return {
      lastEngine: () => last,
      blockedBy: () => blocked,
      stats: () => ({ asked: 0, got: 0 }),
      fetchHtml: async (url) => {
        // `brightDataRead` porte déjà le token/zone Firestore, l'escalade Web Unlocker →
        // Scraping Browser et le circuit-breaker crédits : rien à réimplémenter ici.
        const res = await brightDataRead(url).catch(() => null)
        const html = keep(res?.html)
        if (html) { last = 'brightdata'; return html }
        return null
      },
    }
  }

  if (site.engine === 'firecrawl') {
    return {
      lastEngine: () => last,
      blockedBy: () => blocked,
      stats: () => ({ asked: 0, got: 0 }),
      fetchHtml: async (url) => {
        // Clé PAR UTILISATEUR (comme le client) : pas de clé = pas de lecture. On ne
        // retombe PAS en direct — un site réglé sur Firecrawl l'est parce que le direct
        // ne donne rien ; le faire en silence produirait des pages vides à chaque tick.
        const key = await getUserApiKey(uid, 'firecrawl').catch(() => '')
        if (!key) return null
        // `scroll` : pages LISTE lazy-load — parité exacte avec `siteFetch` côté client.
        const html = keep(await firecrawlScrapeHtml(url, key, { scroll: true }).catch(() => null))
        if (html) { last = 'firecrawl'; return html }
        return null
      },
    }
  }

  if (site.engine === 'jina') {
    return {
      lastEngine: () => last,
      blockedBy: () => blocked,
      stats: () => ({ asked: 0, got: 0 }),
      fetchHtml: async (url) => {
        const html = keep(await jinaHtml(url, timeoutMs))
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
    blockedBy: () => blocked,
    stats: () => ({ asked: 0, got: 0 }),
    fetchHtml: async (url) => {
      // Collant sur le moteur payant qui a fonctionné : repayer l'échec des paliers
      // gratuits à chaque page coûterait une seconde et demie pour rien. On re-teste
      // quand même périodiquement — un site redevenu accessible ne doit pas rester sur
      // un moteur soixante-dix fois plus lent.
      const sticky = last === 'firecrawl' || last === 'brightdata'
      const retry = sticky && sinceRetry >= FREE_RETRY_EVERY
      if (retry) sinceRetry = 0

      if (!sticky || retry) {
        const direct = keep(await fetchHtml(url, timeoutMs).catch(() => null))
        if (direct) { last = 'cloudFunction'; sinceRetry = 0; return direct }
        const viaJina = keep(await jinaHtml(url, timeoutMs))
        if (viaJina) { last = 'jina'; sinceRetry = 0; return viaJina }
      }

      const key = await getUserApiKey(uid, 'firecrawl').catch(() => '')
      if (key) {
        const viaFirecrawl = keep(await firecrawlScrapeHtml(url, key, { scroll: true }).catch(() => null))
        if (viaFirecrawl) { last = 'firecrawl'; sinceRetry++; return viaFirecrawl }
      }
      const bdHtml = keep((await brightDataRead(url).catch(() => null))?.html)
      if (bdHtml) { last = 'brightdata'; sinceRetry++; return bdHtml }

      // Tous les paliers ont échoué : on le DIT dans le canal, sinon le tableau affiche
      // « via cloudFunction » pour une page qui n'a jamais été lue.
      return null
    },
  }
}

/** Pages servies par un moteur payant avant de re-tenter les paliers gratuits. Même
 *  valeur qu'au navigateur (`siteFetch.ts`) : les deux doivent facturer pareil. */
const FREE_RETRY_EVERY = 25
