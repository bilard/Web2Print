import { onCall, HttpsError } from 'firebase-functions/v2/https'
import * as logger from 'firebase-functions/logger'
import { fetchHtml } from './fetchHtml'

/**
 * Récupère le HTML brut d'une URL côté serveur (pas de CORS, contrairement aux
 * proxies publics allorigins/corsproxy devenus instables). Suffit pour les sites
 * SSR/statiques (Makita, etc.) ; les SPA dures à challenge anti-bot passent par
 * `scrapeWithBrightData` (tier 2, payant). Utilisé par le builder de templates de
 * scraping (« Charger ») et par l'enrichissement PIM.
 */
export const fetchPageHtml = onCall<{ url: string }, Promise<{ html: string; length: number }>>(
  {
    timeoutSeconds: 30,
    memory: '256MiB',
    region: 'europe-west1',
  },
  async (req) => {
    if (!req.auth) {
      throw new HttpsError('unauthenticated', 'Authentification Firebase requise')
    }
    const url = req.data?.url
    if (!url || typeof url !== 'string' || !/^https?:\/\//.test(url)) {
      throw new HttpsError('invalid-argument', 'URL invalide ou manquante')
    }
    try {
      const html = await fetchHtml(url, 20000)
      return { html, length: html.length }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      logger.warn('[fetchPageHtml] échec', { url, msg: msg.slice(0, 200) })
      throw new HttpsError('internal', `Échec du fetch HTML : ${msg.slice(0, 200)}`)
    }
  },
)
