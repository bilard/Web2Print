// Les trois sources de l'écran « Suivi », abonnées en direct.
//
// ⚠ Aucune mise en cache : l'application est dynamique et un chiffre figé sur cet écran-ci
// est pire qu'un écran vide — on décide de ne PAS relancer sur sa foi.
import { useEffect, useRef, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useWorkspaceUid } from '@/features/access/useWorkspaceUid'
import { notify } from '@/lib/notify'
import { t } from '@/lib/i18n'
import { opsProgressDoc } from '../paths'
import { buildWatchOps, type WatchOpsView, type RunSnapshot } from './buildWatchOps'
import { watchIncidents, newIncidentsSince } from './incidents'
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
  // Plancher de l'alerte : un incident antérieur à ce plancher ne notifie jamais (cf.
  // l'effet ci-dessous). Initialisé ici pour le tout premier rendu (avant qu'aucun effet
  // n'ait tourné) ; l'effet d'abonnement aux incidents le REMET À JOUR à chaque changement
  // de `watchId` — cf. son commentaire.
  const mountedAtRef = useRef<number | null>(null)
  if (mountedAtRef.current === null) mountedAtRef.current = Date.now()
  const prevIncidentsRef = useRef<(WatchIncident & { id: string })[]>([])

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
              // ⚠ Le repli RESTE, bien que les deux origines estampillent désormais `beatAt`
              // (navigateur : `publishClientRun.ts` ; serveur : `writeRunLive`). Raison : les
              // documents ÉCRITS AVANT ce correctif n'ont pas de `beatAt` et ne se soignent
              // pas rétroactivement — il n'y a qu'un document par flux, écrasé au run suivant,
              // donc un flux qui ne tourne plus garde son doc muet indéfiniment. Sans repli, il
              // s'afficherait « démarré à l'instant » (`beatAt` absent ⇒ 0 ⇒ écart énorme…
              // ou pire, `now - 0` le dirait mort d'un âge absurde). Même repli, aux mêmes
              // sources, que `useServerRunLive` — surtout ne pas raconter deux versions de
              // « depuis quand ce run est muet ».
              beatAt: d.beatAt ?? Math.max(d.startedAt, d.endedAt ?? 0, ...(d.logs ?? []).map((l) => l.ts)),
              trigger: d.trigger ?? null,
            }
          : null)
      },
      (e) => console.warn('[suivi] état du run illisible :', e),
    )
  }, [uid, workflowId])

  useEffect(() => {
    // Changement de SUIVI : on repart comme un nouveau montage. Sans ce reset, les
    // incidents déjà connus du suivi qu'on vient d'ouvrir n'étaient simplement pas dans la
    // liste « précédente » du suivi qu'on vient de quitter — `newIncidentsSince` les
    // prenait donc tous pour des pannes fraîches et déclenchait une volée de notifications
    // pour l'historique de l'AUTRE suivi, à chaque bascule.
    prevIncidentsRef.current = []
    mountedAtRef.current = Date.now()
    // Sans ce reset, l'écran affiche le journal du suivi PRÉCÉDENT (encore en state) sous
    // le nom du nouveau, le temps que le premier instantané Firestore du nouveau suivi
    // arrive — des pannes de l'autre suivi, faussement attribuées à celui-ci.
    setIncidents([])
    if (!uid || !watchId) return
    return watchIncidents(uid, watchId, setIncidents)
  }, [uid, watchId])

  // ⚠ Alerte à l'APPARITION d'une panne, jamais au premier chargement : `newIncidentsSince`
  // (testée isolément) porte cette décision — voir son commentaire pour le piège qu'elle évite.
  useEffect(() => {
    const fresh = newIncidentsSince(prevIncidentsRef.current, incidents, mountedAtRef.current ?? 0)
    prevIncidentsRef.current = incidents
    for (const incident of fresh) {
      notify.error(t('ops.incident.alert.title'), incident.message.slice(0, 160))
    }
  }, [incidents])

  return { view: buildWatchOps({ progress, cockpit, run, now }), incidents }
}
