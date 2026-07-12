// functions/src/analytics/deleteAnalyticsEvents.ts
// Supprime une liste précise d'events analytics (par ids de documents) — le
// « résultat filtré » affiché dans l'onglet Analytics. Owner-only (l'Admin SDK
// bypasse les règles → garde d'exécution explicite).
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { getApps, initializeApp } from 'firebase-admin/app'
import { getOwnerUid } from '../email/ownerMailer'

if (!getApps().length) initializeApp()
const db = getFirestore()

const MAX_IDS = 100_000
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/

export const deleteAnalyticsEvents = onCall<{ ids: string[] }, Promise<{ deleted: number }>>(
  { region: 'europe-west1', timeoutSeconds: 300, memory: '256MiB' },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Authentification requise')
    if (req.auth.uid !== (await getOwnerUid())) {
      throw new HttpsError('permission-denied', 'Réservé au propriétaire')
    }
    const raw = req.data?.ids
    if (!Array.isArray(raw) || raw.length === 0) {
      throw new HttpsError('invalid-argument', 'Liste d’ids requise')
    }
    if (raw.length > MAX_IDS) {
      throw new HttpsError('invalid-argument', `Trop d’ids (max ${MAX_IDS})`)
    }
    const ids = [...new Set(raw.filter((id) => typeof id === 'string' && ID_RE.test(id)))]
    const col = db.collection('analyticsEvents')
    let deleted = 0
    // Suppression par lots de 400 (limite batch Firestore : 500 écritures).
    for (let i = 0; i < ids.length; i += 400) {
      const chunk = ids.slice(i, i + 400)
      const batch = db.batch()
      chunk.forEach((id) => batch.delete(col.doc(id)))
      await batch.commit()
      deleted += chunk.length
    }
    return { deleted }
  },
)
