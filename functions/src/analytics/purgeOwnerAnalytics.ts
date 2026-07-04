// functions/src/analytics/purgeOwnerAnalytics.ts
// Supprime UNIQUEMENT les events analytics du propriétaire (uid == ownerUid) —
// nettoyage de ses propres visites de test, sans toucher au trafic réel.
// Owner-only (l'Admin SDK bypasse les règles → garde d'exécution explicite).
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { getApps, initializeApp } from 'firebase-admin/app'
import { getOwnerUid } from '../email/ownerMailer'

if (!getApps().length) initializeApp()
const db = getFirestore()

export const purgeMyAnalytics = onCall<void, Promise<{ deleted: number }>>(
  { region: 'europe-west1', timeoutSeconds: 300, memory: '256MiB' },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Authentification requise')
    const ownerUid = await getOwnerUid()
    if (!ownerUid || req.auth.uid !== ownerUid) {
      throw new HttpsError('permission-denied', 'Réservé au propriétaire')
    }
    let deleted = 0
    // Suppression par lots de 400 des docs où uid == ownerUid (index simple auto).
    for (;;) {
      const snap = await db.collection('analyticsEvents').where('uid', '==', ownerUid).limit(400).get()
      if (snap.empty) break
      const batch = db.batch()
      snap.docs.forEach((d) => batch.delete(d.ref))
      await batch.commit()
      deleted += snap.size
    }
    return { deleted }
  },
)
