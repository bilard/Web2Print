// src/features/workflows/editor/CronStatusPanel.tsx
import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { CalendarClock, Play, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { db, functions } from '@/lib/firebase/config'
import { formatCountdown } from '../runtime/cronSchedule'

interface ScheduleDoc {
  enabled: boolean; every: number; unit: string
  nextRunAt: number; lastRunAt?: number; lastStatus?: string
}

// timeout aligné sur la Function (540 s) : un run avec escalade Bright Data dépasse
// largement le défaut httpsCallable de 70 s → « deadline-exceeded » alors que le run
// serveur aboutissait. L'état des cartes vient en parallèle via useServerRunLive.
const runNow = httpsCallable<{ workflowId: string }, { status: string; nodeCount: number; errorCount: number }>(
  functions, 'runWorkflowNow', { timeout: 540_000 },
)

export function CronStatusPanel({ workflowId }: { workflowId: string }) {
  const [sched, setSched] = useState<ScheduleDoc | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [running, setRunning] = useState(false)

  useEffect(() => onSnapshot(doc(db, 'workflowSchedules', workflowId),
    (s) => setSched(s.exists() ? (s.data() as ScheduleDoc) : null),
    (err) => console.warn('[cron] écoute Firestore interrompue :', err.message)), [workflowId])

  useEffect(() => {
    if (!sched?.enabled) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [sched?.enabled])

  if (!sched?.enabled) return null

  const onRun = async () => {
    setRunning(true)
    try {
      const { data } = await runNow({ workflowId })
      if (data.errorCount > 0) toast.warning(`Run serveur : ${data.nodeCount} node(s), ${data.errorCount} erreur(s).`)
      else toast.success(`Run serveur OK — ${data.nodeCount} node(s).`)
    } catch (e) {
      toast.error(`Run serveur échoué : ${e instanceof Error ? e.message : e}`)
    } finally { setRunning(false) }
  }

  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 rounded bg-indigo-500/15 border border-indigo-500/30 text-indigo-200 text-xs">
      <CalendarClock className="w-3.5 h-3.5" />
      <span title="Planification serveur active">
        Prochaine · {formatCountdown(sched.nextRunAt - now)}
        {sched.lastStatus ? ` · dernier : ${sched.lastStatus}` : ''}
      </span>
      <button
        onClick={onRun}
        disabled={running}
        className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-500/25 hover:bg-indigo-500/40 disabled:opacity-50"
        title="Exécuter maintenant côté serveur"
      >
        {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
        Lancer (serveur)
      </button>
    </div>
  )
}
