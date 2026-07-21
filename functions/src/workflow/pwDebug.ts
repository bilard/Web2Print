// functions/src/workflow/pwDebug.ts
// TEMPORAIRE — point de diagnostic lecture seule (protégé par jeton) pour lire l'état
// RÉEL du suivi F1 Pro : rapport `latest`, planning cron, métas concurrents. À SUPPRIMER
// après diagnostic (ne pas laisser en prod).
import { onRequest } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'

const UID = 'DFcvxQdh0GMojuaSbZJ0fA80ghz1'
const WATCH = 'wf_1784591652775_9qn25z'
const TOKEN = 'peekF1_9x72kq'

export const pwDebug = onRequest({ region: 'europe-west1', memory: '256MiB' }, async (req, res) => {
  if (req.query.token !== TOKEN) { res.status(403).send('forbidden'); return }
  const db = getFirestore()
  const now = Date.now()
  const iso = (ms?: number) => (ms ? new Date(ms).toISOString() : null)

  const repSnap = await db.doc(`users/${UID}/priceWatch/${WATCH}/reports/latest`).get()
  const rep = (repSnap.data() as Record<string, unknown>) || {}
  const bytes = repSnap.exists ? Buffer.byteLength(JSON.stringify(rep)) : 0
  const kpis = rep.kpis as { products?: number } | undefined

  const schedSnap = await db.doc(`workflowSchedules/${WATCH}`).get()
  const sched = (schedSnap.data() as Record<string, unknown>) || null

  const compSnap = await db.collection(`users/${UID}/priceWatch/${WATCH}/competitors`).get()
  const meta = compSnap.docs.map((d) => {
    const x = d.data() as Record<string, unknown>
    const upd = x.updatedAt as { toMillis?: () => number } | number | undefined
    const updMs = typeof upd === 'number' ? upd : upd?.toMillis?.()
    return { id: d.id, dom: x.domain, pages: x.pageCount, sweeps: x.harvestSweeps, prog: x.harvestProgress, updMs, upd: iso(updMs) }
  }).sort((a, b) => (b.updMs || 0) - (a.updMs || 0))

  res.json({
    nowISO: iso(now),
    report: {
      exists: repSnap.exists,
      runAtISO: iso(rep.runAt as number | undefined),
      ageMin: rep.runAt ? Math.round((now - (rep.runAt as number)) / 60000) : null,
      products: kpis?.products, totalMatched: rep.totalMatched, truncated: rep.truncated, bytes,
    },
    schedule: sched ? {
      enabled: sched.enabled, lastStatus: sched.lastStatus,
      lastRunISO: iso(sched.lastRunAt as number | undefined),
      nextRunISO: iso(sched.nextRunAt as number | undefined),
      nextRunInMin: sched.nextRunAt ? Math.round(((sched.nextRunAt as number) - now) / 60000) : null,
    } : null,
    competitors: meta.slice(0, 20),
    lastMetaUpdateISO: meta[0]?.upd ?? null,
  })
})
