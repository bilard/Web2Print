// Panneau bas de l'éditeur de workflow. Deux onglets :
//  - CONSOLE : flux LIVE chronologique de tout le run serveur (moisson, recherche
//    dirigée, comparaison, erreurs) en couleur type terminal — suivi par workflow, en
//    direct (abonné à workflowRunsLive). C'est LÀ qu'on suit l'activité, pas dans le
//    dashboard.
//  - NODES : détail par node (statut, durée, sorties, export) depuis le runContext.
import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Download, Terminal, ListTree } from 'lucide-react'
import { useRunContext } from '../runtime/runContext'
import { useWorkflowStore } from '../persistence/workflow.store'
import { nodeRegistry } from '../registry'
import { PanelResizeHandle, usePanelResize } from './usePanelResize'
import { findExportResult, type ExportPayload } from '../runtime/exportResult'
import { useWorkflowRunLive, type RunLiveLog } from './useWorkflowRunLive'
import { useTranslation } from '@/lib/i18n'

function downloadExport(payload: ExportPayload) {
  const a = document.createElement('a')
  a.href = payload.url
  a.download = payload.filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

const hhmmss = (ms: number) => new Date(ms).toLocaleTimeString('fr-FR')
const LEVEL_CLS: Record<RunLiveLog['level'], string> = {
  info: 'text-neutral-400', warn: 'text-amber-300', error: 'text-rose-400',
}

type Tab = 'console' | 'nodes'
type Level = 'all' | 'warn' | 'error'

/** Onglet CONSOLE : flux live chronologique, coloré, filtrable, autoscroll. */
function ConsoleTab({ workflowId, nodeName }: { workflowId: string | undefined; nodeName: (id: string) => string }) {
  const { t } = useTranslation()
  const live = useWorkflowRunLive(workflowId)
  const [level, setLevel] = useState<Level>('all')
  const scrollRef = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  const logs = useMemo(() => {
    const all = [...live.logs].sort((a, b) => a.ts - b.ts)
    if (level === 'error') return all.filter((l) => l.level === 'error')
    if (level === 'warn') return all.filter((l) => l.level !== 'info')
    return all
  }, [live.logs, level])
  const errorCount = live.logs.filter((l) => l.level === 'error').length

  useEffect(() => {
    const el = scrollRef.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [logs.length])

  return (
    <div className="flex-1 min-h-0 flex flex-col px-3 pb-2">
      <div className="flex items-center gap-1.5 py-1.5 shrink-0">
        {live.status === 'running'
          ? <span className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />{t('wfr.running')}</span>
          : live.status === 'error'
            ? <span className="text-[11px] font-semibold text-rose-300">{t('wfr.lastFailed')}</span>
            : live.status
              ? <span className="text-[11px] text-emerald-300/70">dernier run {live.status === 'partial' ? 'partiel' : 'OK'}</span>
              : <span className="text-[11px] text-neutral-500">{t('wfr.noServerRun')}</span>}
        {live.startedAt && <span className="text-[10px] text-neutral-600">· {live.trigger === 'cron' ? 'cron' : 'manuel'} {hhmmss(live.startedAt)}{live.endedAt ? `→${hhmmss(live.endedAt)}` : ''}</span>}
        <div className="ml-auto flex items-center gap-1">
          {(['all', 'warn', 'error'] as const).map((lv) => (
            <button key={lv} onClick={() => setLevel(lv)}
              className={`text-[10px] rounded px-1.5 py-0.5 border ${level === lv ? 'bg-indigo-500/20 border-indigo-400/40 text-indigo-200' : 'bg-white/[0.03] border-white/10 text-neutral-500 hover:text-neutral-300'}`}>
              {lv === 'all' ? `Tout ${live.logs.length}` : lv === 'warn' ? 'Warn+' : `Err ${errorCount}`}
            </button>
          ))}
        </div>
      </div>
      {live.lastError && (
        <div className="mb-1 rounded border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-200 font-mono break-words shrink-0">
          ⚠ {live.lastErrorAt ? `${hhmmss(live.lastErrorAt)} · ` : ''}{live.lastError}
        </div>
      )}
      <div ref={scrollRef}
        onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40 }}
        className="flex-1 min-h-0 overflow-y-auto bg-black/30 rounded border border-white/5 font-mono text-[11px] leading-relaxed px-2 py-1.5">
        {logs.length === 0 ? (
          <div className="text-neutral-600 py-4 text-center">Aucun log{level !== 'all' ? t('wfr.atThisLevel') : ''} — le flux arrive en direct pendant un run serveur.</div>
        ) : logs.map((l, i) => (
          <div key={`${l.ts}_${i}`} className="whitespace-pre-wrap break-words">
            <span className="text-neutral-600">{hhmmss(l.ts)}</span>
            {l.node && <span className="text-indigo-300/60"> [{nodeName(l.node)}]</span>}
            <span className={` ${LEVEL_CLS[l.level]}`}> {l.msg}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Onglet NODES : détail par node (statut, durée, sorties, export) — vue existante. */
function NodesTab() {
  const { t } = useTranslation()
  const states = useRunContext((s) => s.nodeStates)
  const wf = useWorkflowStore((s) => s.current)
  const liveIds = new Set((wf?.nodes ?? []).map((n) => n.id))
  const entries = Object.entries(states).filter(([id]) => liveIds.has(id))
  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-3 space-y-2">
      {entries.length === 0 ? (
        <div className="text-neutral-600 text-xs py-4 text-center">{t('wfr.noNodeRun')}</div>
      ) : entries.map(([id, st]) => {
        const node = wf?.nodes.find((n) => n.id === id)
        const spec = node ? nodeRegistry.get(node.type) : undefined
        const exportResult = st.status === 'success' ? findExportResult(st.outputs) : null
        return (
          <div key={id} className="bg-surface rounded p-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-neutral-300 truncate">
                {spec?.label ?? node?.type ?? id} <span className="text-neutral-600">· {st.status}</span>
              </span>
              <div className="flex items-center gap-2 shrink-0">
                {exportResult ? (
                  <button type="button" onClick={() => downloadExport(exportResult)}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-200"
                    title={t('wfr.download', { filename: exportResult.filename })}>
                    <Download className="w-3 h-3" />
                    {exportResult.filename}
                  </button>
                ) : null}
                {st.durationMs ? <span className="text-neutral-600">{st.durationMs}ms</span> : null}
              </div>
            </div>
            {st.error ? <div className="text-red-400 mt-1">{st.error}</div> : null}
            {st.logs.map((l, i) => (
              <div key={i} className={l.level === 'error' ? 'text-red-400' : l.level === 'warn' ? 'text-amber-400' : 'text-neutral-400'}>
                · {l.msg}
              </div>
            ))}
            {st.outputs ? (
              <details className="mt-1">
                <summary className="text-neutral-500 cursor-pointer">{t('wfr.outputs')}</summary>
                <pre className="text-[10px] text-neutral-400 overflow-x-auto">{JSON.stringify(st.outputs, null, 2).slice(0, 2000)}</pre>
              </details>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

export function RunPanel() {
  const { t } = useTranslation()
  const wf = useWorkflowStore((s) => s.current)
  const states = useRunContext((s) => s.nodeStates)
  const [tab, setTab] = useState<Tab>('console')
  // ⚠ Nouvelle clé (v2) : l'ancienne 'runLogs' pouvait être mémorisée REPLIÉE (l'ancien
  // panneau « Run logs ») → la console arrivait repliée, invisible sous « Aperçu données ».
  // Repartir d'une clé neuve la rouvre par défaut pour tout le monde.
  const { height, collapsed, setHeight, toggleCollapsed, minHeight, maxHeightVh } = usePanelResize({
    storageKey: 'web2print.bottomPanel.workflowConsole.v2',
    defaultHeight: 240,
    minHeight: 140,
  })
  const nodeName = (id: string) => {
    const n = wf?.nodes.find((x) => x.id === id)
    return (n && (nodeRegistry.get(n.type)?.label || n.type)) || id
  }
  const nodeCount = Object.keys(states).filter((id) => (wf?.nodes ?? []).some((n) => n.id === id)).length

  return (
    <div
      data-tour="wf-run-logs"
      className="border-t border-neutral-800 bg-background text-sm shrink-0 relative flex flex-col"
      style={{ height: collapsed ? 34 : height }}
    >
      {!collapsed ? <PanelResizeHandle height={height} onChange={setHeight} minHeight={minHeight} maxHeightVh={maxHeightVh} /> : null}
      <div className="flex items-center gap-1 px-2 h-[34px] shrink-0">
        <button type="button" onClick={toggleCollapsed} title={collapsed ? t('wfr.expand') : 'Replier'}
          className="p-1 text-neutral-500 hover:text-neutral-300">
          {collapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
        <button type="button" onClick={() => { setTab('console'); if (collapsed) toggleCollapsed() }}
          className={`flex items-center gap-1.5 text-[11px] px-2 py-1 rounded ${tab === 'console' ? 'bg-white/[0.06] text-white' : 'text-neutral-500 hover:text-neutral-300'}`}>
          <Terminal className="w-3.5 h-3.5" /> Console
        </button>
        <button type="button" onClick={() => { setTab('nodes'); if (collapsed) toggleCollapsed() }}
          className={`flex items-center gap-1.5 text-[11px] px-2 py-1 rounded ${tab === 'nodes' ? 'bg-white/[0.06] text-white' : 'text-neutral-500 hover:text-neutral-300'}`}>
          <ListTree className="w-3.5 h-3.5" /> {t('wfr.nodes')} <span className="text-neutral-600">{nodeCount}</span>
        </button>
      </div>
      {!collapsed ? (tab === 'console' ? <ConsoleTab workflowId={wf?.id} nodeName={nodeName} /> : <NodesTab />) : null}
    </div>
  )
}
