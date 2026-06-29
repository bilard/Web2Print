// functions/src/analytics/collectAnalytics.ts
import { onRequest } from 'firebase-functions/v2/https'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getApps, initializeApp } from 'firebase-admin/app'
import { buildEventDoc } from './derive'

if (!getApps().length) initializeApp()
const db = getFirestore()

export const collectAnalytics = onRequest(
  { region: 'europe-west1', maxInstances: 10, timeoutSeconds: 10, cors: true },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).end()
      return
    }
    const country =
      (req.headers['x-appengine-country'] as string | undefined) ??
      (req.headers['x-country-code'] as string | undefined) ??
      null
    // Ville best-effort : en-têtes géo edge (souvent vides derrière le rewrite Cloud Run).
    const city =
      (req.headers['x-appengine-city'] as string | undefined) ??
      (req.headers['x-vercel-ip-city'] as string | undefined) ??
      null
    const doc = buildEventDoc(req.body, {
      ua: (req.headers['user-agent'] as string) ?? '',
      referer: req.headers['referer'] as string | undefined,
      country: country && country !== 'ZZ' ? country : null,
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
