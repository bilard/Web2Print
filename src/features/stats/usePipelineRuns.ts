// Lecture des runs de pipelines persistés par recordPipelineRun (pipelineLog.ts)
// pour l'onglet Statistiques : les 50 derniers runs du user, du plus récent au
// plus ancien. Index composite requis : pipelineRuns (ownerId ASC, createdAt DESC).
import { useQuery } from '@tanstack/react-query'
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'

export interface PipelineRun {
  id: string
  module: 'enrichment' | 'decompose'
  label: string
  status: 'success' | 'error'
  durationMs: number
  error?: string
  steps: string[]
  createdAt: number
}

const MAX_RUNS = 50

export function usePipelineRuns() {
  const uid = useAuthStore((s) => s.user?.uid)
  return useQuery({
    queryKey: ['pipelineRuns', uid],
    enabled: !!uid,
    staleTime: 30_000,
    queryFn: async (): Promise<PipelineRun[]> => {
      const snap = await getDocs(query(
        collection(db, 'pipelineRuns'),
        where('ownerId', '==', uid),
        orderBy('createdAt', 'desc'),
        limit(MAX_RUNS),
      ))
      return snap.docs.map((d) => {
        const data = d.data() as Partial<PipelineRun>
        return {
          id: d.id,
          module: data.module === 'decompose' ? 'decompose' : 'enrichment',
          label: data.label ?? '(sans label)',
          status: data.status === 'error' ? 'error' : 'success',
          durationMs: data.durationMs ?? 0,
          error: data.error,
          steps: Array.isArray(data.steps) ? data.steps : [],
          createdAt: data.createdAt ?? 0,
        }
      })
    },
  })
}

/** Durée lisible : « 12 s », « 1 min 05 », « 480 ms ». */
export function formatRunDuration(ms: number): string {
  if (ms < 1_000) return `${Math.round(ms)} ms`
  const s = ms / 1_000
  if (s < 60) return `${s < 10 ? s.toFixed(1) : Math.round(s)} s`
  const min = Math.floor(s / 60)
  const rest = Math.round(s % 60)
  return `${min} min ${String(rest).padStart(2, '0')}`
}
