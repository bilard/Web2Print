// functions/src/analytics/purgeAnalytics.ts
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { getApps, initializeApp } from 'firebase-admin/app'
import { cutoffMs } from './retention'

if (!getApps().length) initializeApp()
const db = getFirestore()

export const purgeAnalytics = onSchedule(
  { schedule: 'every day 03:00', timeZone: 'Europe/Paris', region: 'europe-west1' },
  async () => {
    const cut = Timestamp.fromMillis(cutoffMs(Date.now()))
    let deleted = 0
    // Suppression par lots de 400
    for (;;) {
      const snap = await db.collection('analyticsEvents').where('ts', '<', cut).limit(400).get()
      if (snap.empty) break
      const batch = db.batch()
      snap.docs.forEach((d) => batch.delete(d.ref))
      await batch.commit()
      deleted += snap.size
      if (snap.size < 400) break
    }
    console.log(`[purgeAnalytics] supprimés: ${deleted}`)
  },
)
