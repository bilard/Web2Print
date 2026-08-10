// Planning serveur d'un workflow (prochaine relance, dernier statut) — un seul abonnement,
// relu à la fois par le Cockpit opérationnel et par l'en-tête du suivi.
import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'

export interface ScheduleDoc {
  enabled: boolean; nextRunAt: number; lastRunAt?: number; lastStatus?: string
  /** Cycle de moisson terminé à 100 % (tous les sites) — attend l'échéance calendaire. */
  cycleWaiting?: boolean
}

/** Abonnement best-effort au planning du workflow. Absent → pas de compteur (jamais de faux
 *  countdown). */
export function useWorkflowSchedule(workflowId: string | null): ScheduleDoc | null {
  const [sched, setSched] = useState<ScheduleDoc | null>(null)
  useEffect(() => {
    if (!workflowId) { setSched(null); return }
    return onSnapshot(doc(db, 'workflowSchedules', workflowId),
      (s) => setSched(s.exists() ? (s.data() as ScheduleDoc) : null),
      () => setSched(null))
  }, [workflowId])
  return sched
}
