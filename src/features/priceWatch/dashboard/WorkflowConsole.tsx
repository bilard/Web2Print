// src/features/priceWatch/dashboard/WorkflowConsole.tsx
// Console LIVE du workflow de veille (type terminal) : tout le trafic du run serveur —
// moisson, recherche dirigée, comparaison, erreurs — en couleur, en direct. S'abonne au
// doc `workflowRunsLive/{workflowId}` (200 derniers logs, streamé pendant le run) et au
// planning (`workflowSchedules`) pour le POURQUOI d'un « dernier run en erreur ».
import { useEffect, useMemo, useRef, useState } from 'react'
import { doc, getDoc, onSnapshot } from 'firebase/firestore'
import { Terminal, ChevronDown, ChevronRight } from 'lucide-react'
import { auth, db } from '@/lib/firebase/config'

interface LiveLog { ts: number; level: 'info' | 'warn' | 'error'; node?: string; msg: string }
interface LiveDoc {
  runId?: string; trigger?: string; startedAt?: number; endedAt?: number
  status?: 'running' | 'success' | 'partial' | 'error'
  logs?: LiveLog[]
}
interface SchedDoc { lastStatus?: string; lastError?: string; lastErrorAt?: number }

type Level = 'all' | 'warn' | 'error'
const LEVEL_CLS: Record<LiveLog['level'], string> = {
  info: 'text-white/55', warn: 'text-amber-300', error: 'text-rose-400',
}
const hhmmss = (ms: number) => new Date(ms).toLocaleTimeString('fr-FR')

export function WorkflowConsole({ watchId }: { watchId: string | null }) {
  const uid = auth.currentUser?.uid
  const [live, setLive] = useState<LiveDoc | null>(null)
  const [sched, setSched] = useState<SchedDoc | null>(null)
  const [open, setOpen] = useState(true)
  const [level, setLevel] = useState<Level>('all')
  const [nodeNames, setNodeNames] = useState<Map<string, string>>(() => new Map())
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickBottom = useRef(true)

  useEffect(() => {
    if (!uid || !watchId) { setLive(null); return }
    const un1 = onSnapshot(doc(db, 'users', uid, 'workflowRunsLive', watchId),
      (s) => setLive(s.exists() ? (s.data() as LiveDoc) : null), () => setLive(null))
    const un2 = onSnapshot(doc(db, 'workflowSchedules', watchId),
      (s) => setSched(s.exists() ? (s.data() as SchedDoc) : null), () => setSched(null))
    // Libellés des nodes (one-shot) : les logs portent l'id technique (n_…) — illisible.
    getDoc(doc(db, 'users', uid, 'workflows', watchId)).then((s) => {
      const nodes = (s.data()?.nodes ?? []) as { id: string; type?: string; label?: string }[]
      setNodeNames(new Map(nodes.map((n) => [n.id, n.label || n.type || n.id])))
    }).catch(() => {})
    return () => { un1(); un2() }
  }, [uid, watchId])

  const logs = useMemo(() => {
    const all = [...(live?.logs ?? [])].sort((a, b) => a.ts - b.ts)
    if (level === 'error') return all.filter((l) => l.level === 'error')
    if (level === 'warn') return all.filter((l) => l.level !== 'info')
    return all
  }, [live?.logs, level])
  const errorCount = (live?.logs ?? []).filter((l) => l.level === 'error').length

  // Autoscroll : suit le bas TANT QUE l'utilisateur y est (sinon on respecte sa lecture).
  useEffect(() => {
    const el = scrollRef.current
    if (el && stickBottom.current) el.scrollTop = el.scrollHeight
  }, [logs.length, open])

  if (!watchId) return null
  const status = live?.status
  const statusChip = status === 'running'
    ? <span className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300"><span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />run en cours</span>
    : status === 'error'
      ? <span className="text-[11px] font-semibold text-rose-300">dernier run en erreur</span>
      : status
        ? <span className="text-[11px] text-emerald-300/80">dernier run {status === 'partial' ? 'partiel' : 'OK'}</span>
        : <span className="text-[11px] text-white/35">aucun run serveur</span>

  return (
    <section className="bg-surface rounded-lg" data-pw-section="console">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 text-sm font-semibold text-white/80 hover:text-white">
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        <Terminal className="w-4 h-4 text-indigo-400" />
        Journal du workflow
        <span className="text-[11px] text-white/35 font-normal">console live</span>
        {statusChip}
        {errorCount > 0 && (
          <span className="text-[10px] font-semibold text-rose-300 bg-rose-500/15 border border-rose-500/30 rounded-full px-2 py-px">
            {errorCount} erreur(s)
          </span>
        )}
        {live?.startedAt && (
          <span className="ml-auto text-[11px] text-white/35 font-normal">
            {live.trigger === 'cron' ? 'cron' : 'manuel'} · démarré {hhmmss(live.startedAt)}{live.endedAt ? ` · fini ${hhmmss(live.endedAt)}` : ''}
          </span>
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2">
          {/* Le POURQUOI d'un run planifié en échec (persisté par le scheduler). */}
          {sched?.lastStatus === 'error' && sched.lastError && (
            <div className="rounded border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200 font-mono break-words">
              ⚠ {sched.lastErrorAt ? `${hhmmss(sched.lastErrorAt)} · ` : ''}{sched.lastError}
            </div>
          )}
          <div className="flex items-center gap-1.5">
            {(['all', 'warn', 'error'] as const).map((lv) => (
              <button key={lv} onClick={() => setLevel(lv)}
                className={`text-[11px] rounded px-2 py-1 border ${level === lv ? 'bg-indigo-500/20 border-indigo-400/40 text-indigo-200' : 'bg-well border-white/10 text-white/50 hover:text-white/80'}`}>
                {lv === 'all' ? `Tout (${(live?.logs ?? []).length})` : lv === 'warn' ? 'Avertissements+' : `Erreurs (${errorCount})`}
              </button>
            ))}
          </div>
          <div ref={scrollRef}
            onScroll={(e) => {
              const el = e.currentTarget
              stickBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
            }}
            className="bg-well rounded border border-white/10 max-h-80 overflow-auto font-mono text-[11px] leading-relaxed px-3 py-2">
            {logs.length === 0 ? (
              <div className="text-white/30 py-4 text-center">Aucun log {level !== 'all' ? 'à ce niveau ' : ''}— les logs arrivent en direct pendant un run serveur.</div>
            ) : logs.map((l, i) => (
              <div key={`${l.ts}_${i}`} className="whitespace-pre-wrap break-words">
                <span className="text-white/25">{hhmmss(l.ts)}</span>
                {l.node && <span className="text-indigo-300/60"> [{nodeNames.get(l.node) ?? l.node}]</span>}
                <span className={` ${LEVEL_CLS[l.level]}`}> {l.msg}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
