// src/features/workflows/persistence/scheduleSync.ts
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { Workflow } from '../types'
import {
  computeNextRun, computeNextCycleRun, normalizeEvery, sanitizeCycle,
  type CronConfig, type CronUnit,
} from '../runtime/cronSchedule'

/** Renvoie la config du 1ᵉʳ node cron ACTIVÉ d'un workflow, sinon null. Utilisé pour
 *  la synchro du planning ET pour le badge « CRON » de la liste des workflows. */
export function findActiveCron(wf: Workflow): CronConfig | null {
  for (const n of wf.nodes) {
    if (n.type !== 'cron') continue
    const c = n.config as Partial<CronConfig>
    if (c?.enabled) {
      const unit = (['minute', 'hour', 'day', 'week', 'month'] as CronUnit[]).includes(c.unit as CronUnit)
        ? (c.unit as CronUnit) : 'day'
      const atTime = typeof c.atTime === 'string' && /^\d{1,2}:\d{2}$/.test(c.atTime) ? c.atTime : undefined
      let weekday: number | undefined
      if (c.weekday != null && Number.isFinite(Number(c.weekday))) {
        const n = Math.trunc(Number(c.weekday))
        weekday = n < 0 ? -1 : ((n % 7) + 7) % 7 // -1 = « Tous les jours »
      }
      return {
        enabled: true, every: normalizeEvery(c.every ?? 1), unit, atTime, weekday,
        afterCompletion: !!c.afterCompletion, cycle: sanitizeCycle(c.cycle),
      }
    }
  }
  return null
}

/** Synchronise le doc workflowSchedules à partir d'un éventuel node cron actif. */
export async function syncWorkflowSchedule(uid: string, wf: Workflow): Promise<void> {
  const ref = doc(db, 'workflowSchedules', wf.id)
  const cron = findActiveCron(wf)
  if (!cron) { await deleteDoc(ref).catch(() => {}); return }
  // Préserver l'ATTENTE calendaire : si le cycle est terminé et le planning déjà calé
  // sur la prochaine échéance (cycleWaiting), un simple re-save du workflow ne doit pas
  // relancer la cadence rapide — on recalcule l'échéance avec la config (peut-être
  // éditée), sans réveiller le cron.
  let nextRunAt = computeNextRun(cron, Date.now())
  let cycleWaiting = false
  if (cron.cycle?.enabled) {
    const prev = await getDoc(ref).catch(() => null)
    if (prev?.exists() && (prev.data() as { cycleWaiting?: boolean }).cycleWaiting) {
      const next = computeNextCycleRun(cron.cycle, Date.now())
      if (next != null) { nextRunAt = next; cycleWaiting = true }
    }
  }
  await setDoc(ref, {
    uid, workflowId: wf.id, name: wf.name,
    enabled: true, every: cron.every, unit: cron.unit,
    afterCompletion: !!cron.afterCompletion,
    // Firestore refuse `undefined` → null pour les champs optionnels absents.
    atTime: cron.atTime ?? null,
    weekday: cron.weekday ?? null,
    // `sanitizeCycle` renvoie un objet à champs TOUS définis (Firestore-safe).
    cycle: cron.cycle ?? null,
    nextRunAt,
    cycleWaiting,
    updatedAt: Date.now(),
  }, { merge: true })
}
