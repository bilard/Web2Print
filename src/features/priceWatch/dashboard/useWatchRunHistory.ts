// Historique DURABLE des runs d'un suivi (`users/{uid}/workflowRuns`), abonné en direct.
//
// ⚠ Aucun cache : l'abonnement `onSnapshot` reflète la base, un run qui se termine apparaît
// sans rechargement — c'est la règle de cette application.
//
// ⚠ Tri et bornage côté CLIENT, comme la purge de `runHistoryClient` : la collection est
// plafonnée à vingt runs par workflow, et un `orderBy` sur `endedAt` combiné au `where`
// exigerait un index composite à déployer pour vingt documents.
import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import { summarizeRuns, type RunEntry, type RunHistorySummary } from './runHistorySummary'

export function useWatchRunHistory(workflowId: string | null): RunHistorySummary | null {
  const uid = useAuthStore((s) => s.user?.uid ?? null)
  const [summary, setSummary] = useState<RunHistorySummary | null>(null)

  useEffect(() => {
    if (!uid || !workflowId) { setSummary(null); return }
    return onSnapshot(
      query(collection(db, 'users', uid, 'workflowRuns'), where('workflowId', '==', workflowId)),
      (snap) => {
        const entries: RunEntry[] = snap.docs.map((d) => {
          const v = d.data() as Partial<RunEntry>
          return {
            id: d.id,
            startedAt: typeof v.startedAt === 'number' ? v.startedAt : 0,
            endedAt: typeof v.endedAt === 'number' ? v.endedAt : 0,
            status: typeof v.status === 'string' ? v.status : 'error',
            trigger: typeof v.trigger === 'string' ? v.trigger : undefined,
          }
        })
        setSummary(summarizeRuns(entries))
      },
      // Un historique illisible ne doit pas masquer le reste du cockpit : on n'affiche
      // simplement pas la bande.
      () => setSummary(null),
    )
  }, [uid, workflowId])

  return summary
}
