// functions/src/scraper/fetchPageHtmlAuth.ts
// CF « fetch authentifié » : récupère le HTML d'une page en étant CONNECTÉ au site
// (login cookie PrestaShop), pour les sites où les prix ne sont visibles qu'authentifié
// (ex. progarden). Les identifiants viennent de users/{uid}.siteCredentials[host] — le
// navigateur ne les voit jamais. Le cookie jar est mis en cache par instance chaude
// (TTL 10 min) pour ne pas re-loguer à chaque page.
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import * as logger from 'firebase-functions/logger'
import { getSiteCredentials } from './siteCredentials'
import { prestashopLogin, fetchWithJar } from './prestashopLogin'

interface SessionEntry { jar: string; at: number }
const SESSION_TTL_MS = 10 * 60_000
// Cache par instance chaude (uid::host → jar). Éphémère (perdu au cold start) : simple
// optimisation de latence, jamais une source de vérité.
const sessions = new Map<string, SessionEntry>()

async function ensureJar(uid: string, host: string, now: number): Promise<string> {
  const key = `${uid}::${host}`
  const cached = sessions.get(key)
  if (cached && now - cached.at < SESSION_TTL_MS) return cached.jar
  const creds = await getSiteCredentials(uid, host)
  if (!creds) throw new HttpsError('failed-precondition', `Aucun identifiant enregistré pour ${host}.`)
  const jar = await prestashopLogin(creds)
  sessions.set(key, { jar, at: now })
  return jar
}

export const fetchPageHtmlAuth = onCall<{ host?: string; url?: string }, Promise<{ html: string; length: number }>>(
  { timeoutSeconds: 60, memory: '256MiB', region: 'europe-west1' },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Authentification Firebase requise')
    const uid = req.auth.uid
    const host = (req.data?.host ?? '').toLowerCase().trim()
    const url = req.data?.url
    if (!host) throw new HttpsError('invalid-argument', 'host manquant')
    if (!url || typeof url !== 'string' || !/^https?:\/\//.test(url)) {
      throw new HttpsError('invalid-argument', 'URL invalide ou manquante')
    }

    // Date.now() : autorisé côté functions (pas dans les scripts Workflow).
    const now = Date.now()
    try {
      let jar = await ensureJar(uid, host, now)
      let html = await fetchWithJar(url, jar)
      // Jar périmé côté serveur du site (session expirée) → une relance login propre.
      if (!html) {
        sessions.delete(`${uid}::${host}`)
        jar = await ensureJar(uid, host, now)
        html = await fetchWithJar(url, jar)
      }
      if (!html) throw new HttpsError('unavailable', `Page inaccessible même connecté : ${url}`)
      return { html, length: html.length }
    } catch (e: unknown) {
      if (e instanceof HttpsError) throw e
      const msg = e instanceof Error ? e.message : String(e)
      logger.warn('[fetchPageHtmlAuth] échec', { uid, host, msg: msg.slice(0, 200) })
      throw new HttpsError('internal', `Échec du fetch authentifié : ${msg.slice(0, 200)}`)
    }
  },
)
