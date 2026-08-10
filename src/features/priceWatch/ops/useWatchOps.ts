// Les trois sources de l'écran « Suivi », abonnées en direct.
//
// ⚠ Aucune mise en cache : l'application est dynamique et un chiffre figé sur cet écran-ci
// est pire qu'un écran vide — on décide de ne PAS relancer sur sa foi.
import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useWorkspaceUid } from '@/features/access/useWorkspaceUid'
import { opsProgressDoc } from '../paths'
import { buildWatchOps, type WatchOpsView, type RunSnapshot } from './buildWatchOps'
import { watchIncidents } from './incidents'
import type { WatchOpsProgress, WatchIncident } from './opsTypes'
import type { OpsCockpit } from '../dashboard/opsMetrics'

/** Cadence de rafraîchissement de l'horloge : les durées écoulées et les estimations
 *  doivent avancer même quand aucun document ne bouge. */
const TICK_MS = 1_000

export function useWatchOps(
  watchId: string | null, workflowId: string | undefined, cockpit: OpsCockpit | null,
): { view: WatchOpsView; incidents: (WatchIncident & { id: string })[] } {
  // ⚠ Le hook RÉACTIF, pas `getWorkspaceUid()` : un rattachement de société doit rediriger
  // l'écran sans rechargement (cf. la doc de useWorkspaceUid). `getWorkspaceUid()` est pour
  // les services hors composant — trois abonnements figés sur l'ancien uid après une
  // bascule d'espace de travail resteraient sourds, sans la moindre erreur.
  const uid = useWorkspaceUid()
  const [progress, setProgress] = useState<WatchOpsProgress | null>(null)
  const [run, setRun] = useState<RunSnapshot | null>(null)
  const [incidents, setIncidents] = useState<(WatchIncident & { id: string })[]>([])
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!uid || !watchId) { setProgress(null); return }
    return onSnapshot(
      doc(db, opsProgressDoc(uid, watchId)),
      (snap) => setProgress((snap.data() as WatchOpsProgress | undefined) ?? null),
      (e) => console.warn('[suivi] avancement illisible :', e),
    )
  }, [uid, watchId])

  useEffect(() => {
    if (!uid || !workflowId) { setRun(null); return }
    return onSnapshot(
      doc(db, 'users', uid, 'workflowRunsLive', workflowId),
      (snap) => {
        const d = snap.data() as
          | {
              status?: string; startedAt?: number; beatAt?: number; trigger?: string
              endedAt?: number; logs?: { ts: number }[]
            }
          | undefined
        setRun(d?.startedAt
          ? {
              status: d.status ?? 'running', startedAt: d.startedAt,
              // ⚠ Repli quand `beatAt` manque : seul le run NAVIGATEUR l'écrit à ce jour
              // (`publishClientRun.ts`) — un run SERVEUR n'en porte encore aucun (jumeau côté
              // Functions non aligné). Sans repli, tout run cron passerait pour mort au bout
              // de trois minutes alors qu'il tourne — même repli que `useServerRunLive`.
              beatAt: d.beatAt ?? Math.max(d.startedAt, d.endedAt ?? 0, ...(d.logs ?? []).map((l) => l.ts)),
              trigger: d.trigger ?? null,
            }
          : null)
      },
      (e) => console.warn('[suivi] état du run illisible :', e),
    )
  }, [uid, workflowId])

  useEffect(() => {
    if (!uid || !watchId) { setIncidents([]); return }
    return watchIncidents(uid, watchId, setIncidents)
  }, [uid, watchId])

  return { view: buildWatchOps({ progress, cockpit, run, now }), incidents }
}
