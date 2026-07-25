import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import type { RadarSchedule, RadarRunLive } from '@/features/priceWatch/radar/scrapeState'

/** Planning serveur du workflow, en temps réel. ⚠ La clé est l'id du WORKFLOW — le
 *  watchId en est dérivé (stableId) et peut différer : lire au mauvais chemin donne un
 *  bandeau muet ET un STOP sans effet, en silence. Absent → null (jamais de faux état). */
export function useRadarSchedule(workflowId: string | null): RadarSchedule | null {
  const [sched, setSched] = useState<RadarSchedule | null>(null)
  useEffect(() => {
    if (!workflowId) { setSched(null); return }
    return onSnapshot(doc(db, 'workflowSchedules', workflowId),
      (s) => setSched(s.exists() ? (s.data() as RadarSchedule) : null),
      () => setSched(null))
  }, [workflowId])
  return sched
}

/** État live du run serveur. Écrit pour TOUT déclencheur (cron, « Lancer » manuel,
 *  webhook) et porteur de `endedAt` — c'est lui qui dit si quelque chose tourne encore,
 *  là où le planning est muet (run manuel) ou supprimé (flux suspendu). */
export function useRadarRunLive(workflowId: string | null): RadarRunLive | null {
  const uid = useAuthStore((s) => s.user?.uid)
  const [live, setLive] = useState<RadarRunLive | null>(null)
  useEffect(() => {
    if (!uid || !workflowId) { setLive(null); return }
    return onSnapshot(doc(db, 'users', uid, 'workflowRunsLive', workflowId),
      (s) => setLive(s.exists() ? (s.data() as RadarRunLive) : null),
      () => setLive(null))
  }, [uid, workflowId])
  return live
}

/** Horloge partagée : re-rend le composant au rythme demandé pour que les décomptes
 *  (« dans 26 min 59 s », « il y a 3 min ») vivent sans écriture Firestore. */
export function useNowTick(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
