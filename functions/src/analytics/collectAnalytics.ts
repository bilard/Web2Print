// functions/src/analytics/collectAnalytics.ts
import { onRequest } from 'firebase-functions/v2/https'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getApps, initializeApp } from 'firebase-admin/app'
import { buildEventDoc } from './derive'
import { clientIpFromHeaders, lookupGeo } from './geoip'

if (!getApps().length) initializeApp()
const db = getFirestore()

export const collectAnalytics = onRequest(
  // 512 Mo : la base DB-IP (~124 Mo) est tenue en mémoire par instance (cf. geoip.ts).
  { region: 'europe-west1', maxInstances: 10, timeoutSeconds: 15, memory: '512MiB', cors: true },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).end()
      return
    }
    // En-têtes géo edge (souvent vides derrière le rewrite Cloud Run).
    const hdrCountry =
      (req.headers['x-appengine-country'] as string | undefined) ??
      (req.headers['x-country-code'] as string | undefined) ??
      null
    const hdrCity =
      (req.headers['x-appengine-city'] as string | undefined) ??
      (req.headers['x-vercel-ip-city'] as string | undefined) ??
      null
    // Géolocalisation par IP (lue puis JETÉE, jamais stockée) en repli des en-têtes vides.
    const geo = await lookupGeo(clientIpFromHeaders(req.headers))
    const country = (hdrCountry && hdrCountry !== 'ZZ' ? hdrCountry : null) ?? geo?.country ?? null
    const city = hdrCity ?? geo?.city ?? null

    const doc = buildEventDoc(req.body, {
      ua: (req.headers['user-agent'] as string) ?? '',
      referer: req.headers['referer'] as string | undefined,
      country,
      city,
    })
    if (!doc) {
      res.status(204).end()
      return
    }
    try {
      await db.collection('analyticsEvents').add({ ...doc, ts: FieldValue.serverTimestamp() })
    } catch {
      // best-effort : on n'expose jamais d'erreur au visiteur
    }
    res.status(204).end()
  },
)
