// functions/src/analytics/clearAnalytics.ts
// Vide TOUT l'historique analytics (collection globale owner-only). L'Admin SDK
// bypasse les règles Firestore → on garde l'exécution sur l'owner uniquement.
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { getApps, initializeApp } from 'firebase-admin/app'
import { getOwnerUid } from '../email/ownerMailer'

if (!getApps().length) initializeApp()
const db = getFirestore()

export const clearAnalytics = onCall<void, Promise<{ deleted: number }>>(
  { region: 'europe-west1', timeoutSeconds: 300, memory: '256MiB' },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Authentification requise')
    if (req.auth.uid !== (await getOwnerUid())) {
      throw new HttpsError('permission-denied', 'Réservé au propriétaire')
    }
    let deleted = 0
    // Suppression par lots de 400 jusqu'à épuisement.
    for (;;) {
      const snap = await db.collection('analyticsEvents').limit(400).get()
      if (snap.empty) break
      const batch = db.batch()
      snap.docs.forEach((d) => batch.delete(d.ref))
      await batch.commit()
      deleted += snap.size
    }
    return { deleted }
  },
)
