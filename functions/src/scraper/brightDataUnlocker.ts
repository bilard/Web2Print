/**
 * Cloud Function: proxy vers Bright Data Web Unlocker.
 *
 * Pourquoi un proxy serveur : la clé Bright Data ne doit jamais être dans le
 * navigateur (siphonnage trivial via DevTools), et Bright Data ne supporte
 * pas le CORS depuis browser. Cette Function reçoit l'URL à scraper, ajoute
 * le token Bright Data depuis Firebase Secret Manager, et renvoie le HTML.
 *
 * Auth : utilisateur Firebase authentifié uniquement (req.auth check).
 * Secrets requis :
 *   - BRIGHTDATA_API_TOKEN : token Bearer (Settings → API tokens dashboard BD)
 *   - BRIGHTDATA_ZONE : nom de la zone Web Unlocker (ex: web_unlocker1)
 *
 * Endpoint Bright Data : POST https://api.brightdata.com/request
 *   Body: { zone, url, format: 'raw', country }
 *   Returns: HTML directement (format raw) ou JSON (format json)
 *
 * Optimisations :
 *   - Country routing auto basé sur le TLD de l'URL (.fr → fr, .de → de, etc.)
 *   - Retry 1× sur erreur 5xx ou timeout (transient)
 *   - Logs structurés (durée, status, retries) pour Cloud Logging
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { logger } from 'firebase-functions/v2'

const BRIGHTDATA_API_TOKEN = defineSecret('BRIGHTDATA_API_TOKEN')
const BRIGHTDATA_ZONE = defineSecret('BRIGHTDATA_ZONE')

const BRIGHTDATA_API = 'https://api.brightdata.com/request'
const TIMEOUT_MS = 160_000

interface ScrapeRequest {
  url: string
  /** Override du country routing auto (rare — debug). */
  country?: string
  /** Cookie de session à injecter pour les sites protégés par login.
   *  Format : string HTTP Cookie standard ("NAME=value; NAME2=value2").
   *  Stocké côté client dans localStorage, jamais dans le code source.
   *  Bright Data transmet le header Cookie → le site répond comme un user connecté. */
  sessionCookies?: string
}

interface ScrapeResponse {
  html: string
  length: number
  status: number
  /** Pays utilisé pour le routing résidentiel (utile pour debugging). */
  country: string
  /** Nombre de tentatives effectuées (1 = direct, 2 = après retry). */
  attempts: number
  /** Durée totale en ms (incluant les retries). */
  durationMs: number
}

/** Mappe l'URL vers un code pays ISO 2 pour le routing résidentiel Bright Data.
 *  Priorité :
 *   1. Préfixe de chemin de locale (ex: /es/ → es, /fr/ → fr)
 *   2. ccTLD de l'hostname (ex: .fr → fr)
 *   3. Défaut 'fr' (use case principal du projet)
 *  Liste alignée sur Bright Data : https://docs.brightdata.com/proxy-manager/configuration/proxy-targeting */
function detectCountry(url: string): string {
  const supported = new Set([
    'fr', 'de', 'it', 'es', 'pt', 'nl', 'be', 'ch', 'at', 'pl',
    'uk', 'ie', 'se', 'no', 'dk', 'fi',
    'us', 'ca', 'mx', 'br',
    'jp', 'cn', 'kr', 'in', 'au', 'nz',
  ])
  try {
    const { hostname, pathname } = new URL(url)
    const host = hostname.toLowerCase()

    // 1. Préfixe de locale dans le chemin (ex: /es/product → es, /fr/ → fr)
    const pathLocale = pathname.match(/^\/([a-z]{2})(?:\/|$)/)?.[1]
    if (pathLocale && supported.has(pathLocale)) return pathLocale

    // 2. ccTLD direct (ex: .fr, .de, .it — pas .eu qui est régional)
    const tld = host.match(/\.([a-z]{2})$/)?.[1]
    if (tld && supported.has(tld)) return tld

    // Domaines sans ccTLD mais hébergement géolocalisé connu
    if (/\.(?:fr|france|paris)\b/.test(host)) return 'fr'
    if (/\.(?:de|deutschland|berlin)\b/.test(host)) return 'de'

    return 'fr' // défaut FR
  } catch {
    return 'fr'
  }
}

/** Effectue un appel Bright Data avec timeout. Retourne le HTML ou throw. */
async function callBrightData(
  url: string,
  token: string,
  zone: string,
  country: string,
  sessionCookies?: string,
): Promise<{ html: string; status: number }> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const reqBody: Record<string, unknown> = { zone, url, format: 'raw', country }
    if (sessionCookies) reqBody.headers = { Cookie: sessionCookies }
    const res = await fetch(BRIGHTDATA_API, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(reqBody),
      signal: ctrl.signal,
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      const snippet = body.slice(0, 200)
      if (res.status === 401 || res.status === 403) {
        throw new HttpsError('unauthenticated', `Bright Data auth refusée (${res.status}) : ${snippet}`)
      }
      if (res.status === 402) {
        throw new HttpsError('resource-exhausted', `Bright Data : balance insuffisante. Recharger sur le dashboard. ${snippet}`)
      }
      if (res.status === 429) {
        throw new HttpsError('resource-exhausted', `Bright Data : rate limit atteint. ${snippet}`)
      }
      // 4xx (sauf auth) = erreur définitive (URL invalide, zone inconnue) — pas de retry utile
      // 5xx = transient, retry possible côté caller
      const code = res.status >= 500 ? 'unavailable' : 'internal'
      throw new HttpsError(code, `Bright Data ${res.status} : ${snippet}`)
    }

    const html = await res.text()
    return { html, status: res.status }
  } finally {
    clearTimeout(timer)
  }
}

export const scrapeWithBrightData = onCall<ScrapeRequest, Promise<ScrapeResponse>>(
  {
    secrets: [BRIGHTDATA_API_TOKEN, BRIGHTDATA_ZONE],
    timeoutSeconds: 200,  // 90s × 2 retries + marge
    memory: '512MiB',
    region: 'europe-west1',
  },
  async (req) => {
    const startedAt = Date.now()
    if (!req.auth) {
      throw new HttpsError('unauthenticated', 'Authentification Firebase requise')
    }
    const url = req.data?.url
    if (!url || typeof url !== 'string' || !/^https?:\/\//.test(url)) {
      throw new HttpsError('invalid-argument', 'URL invalide ou manquante')
    }

    const token = BRIGHTDATA_API_TOKEN.value()
    const zone = BRIGHTDATA_ZONE.value() || 'web_unlocker1'
    if (!token) {
      throw new HttpsError('failed-precondition', 'BRIGHTDATA_API_TOKEN non configuré')
    }

    const country = req.data?.country || detectCountry(url)
    const sessionCookies = typeof req.data?.sessionCookies === 'string' ? req.data.sessionCookies : undefined

    let lastError: Error | null = null
    try {
      const result = await callBrightData(url, token, zone, country, sessionCookies)
      const durationMs = Date.now() - startedAt
      logger.info('[brightdata] success', {
        url, country, status: result.status, length: result.html.length, durationMs,
      })
      return {
        html: result.html,
        length: result.html.length,
        status: result.status,
        country,
        attempts: 1,
        durationMs,
      }
    } catch (e: unknown) {
      lastError = e instanceof Error ? e : new Error(String(e))
    }

    const durationMs = Date.now() - startedAt
    logger.error('[brightdata] failure', {
      url, country, durationMs, msg: lastError?.message.slice(0, 200) ?? 'unknown',
    })
    if (lastError instanceof HttpsError) throw lastError
    if (lastError && /aborted/.test(lastError.message)) {
      throw new HttpsError('deadline-exceeded', `Bright Data timeout après ${TIMEOUT_MS / 1000}s`)
    }
    throw new HttpsError('internal', `Bright Data fetch failed : ${lastError?.message ?? 'unknown'}`)
  },
)
