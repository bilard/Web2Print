// src/features/workflows/persistence/scheduleSync.ts
import { doc, setDoc, deleteDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { Workflow } from '../types'
import { computeNextRun, normalizeEvery, type CronConfig, type CronUnit } from '../runtime/cronSchedule'

function findActiveCron(wf: Workflow): CronConfig | null {
  for (const n of wf.nodes) {
    if (n.type !== 'cron') continue
    const c = n.config as Partial<CronConfig>
    if (c?.enabled) {
      const unit = (['hour', 'day', 'week', 'month'] as CronUnit[]).includes(c.unit as CronUnit)
        ? (c.unit as CronUnit) : 'day'
      return { enabled: true, every: normalizeEvery(c.every ?? 1), unit }
    }
  }
  return null
}

/** Synchronise le doc workflowSchedules à partir d'un éventuel node cron actif. */
export async function syncWorkflowSchedule(uid: string, wf: Workflow): Promise<void> {
  const ref = doc(db, 'workflowSchedules', wf.id)
  const cron = findActiveCron(wf)
  if (!cron) { await deleteDoc(ref).catch(() => {}); return }
  await setDoc(ref, {
    uid, workflowId: wf.id, name: wf.name,
    enabled: true, every: cron.every, unit: cron.unit,
    nextRunAt: computeNextRun(cron, Date.now()),
    updatedAt: Date.now(),
  }, { merge: true })
}
