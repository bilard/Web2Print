// src/features/workflows/results/WorkflowResultsScreen.tsx
// Écran dédié « Résultats » d'un workflow (Phase 1) : visualisation contextuelle du
// dernier run (dashboard / table / graphe / galerie / document) + export PNG/PDF.
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Download, FileImage, Loader2, Eye, History } from 'lucide-react'
import { initWorkflowsRegistry } from '../registry/builtin'
import { useRunResult, type RunHistoryItem } from './useRunResult'
import { ResultPanelView } from './ResultPanelView'
import { exportElementToPng, exportElementToPdf } from '@/lib/domExport'

function fmtDate(ts?: number): string {
  if (!ts) return ''
  try { return new Date(ts).toLocaleString('fr-FR') } catch { return '' }
}

const STATUS_DOT: Record<string, string> = {
  success: 'bg-emerald-500', partial: 'bg-amber-500', error: 'bg-red-500', running: 'bg-indigo-500',
}

function HistorySidebar({
  runs, selectedRunId, onSelect,
}: { runs: RunHistoryItem[]; selectedRunId: string | null; onSelect: (id: string | null) => void }) {
  if (runs.length === 0) return null
  const effective = selectedRunId ?? runs[0]?.id ?? null
  return (
    <aside className="w-56 shrink-0 border-r border-neutral-800 overflow-auto">
      <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-neutral-500 flex items-center gap-1.5 sticky top-0 bg-background">
        <History className="w-3 h-3" /> Historique ({runs.length})
      </div>
      <ul className="px-1.5 pb-2 space-y-1">
        {runs.map((r) => {
          const on = r.id === effective
          return (
            <li key={r.id}>
              <button
                onClick={() => onSelect(r.id)}
                className={`w-full text-left px-2 py-1.5 rounded-md flex items-center gap-2 text-xs ${
                  on ? 'bg-indigo-500/15 border border-indigo-500/40 text-neutral-100' : 'hover:bg-white/[0.04] text-neutral-300 border border-transparent'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[r.status ?? ''] ?? 'bg-neutral-600'}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{fmtDate(r.endedAt)}</span>
                  <span className="block text-[10px] text-neutral-500">{r.trigger ?? 'run'}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}

export function WorkflowResultsScreen({ workflowId }: { workflowId: string }) {
  const nav = useNavigate()
  useEffect(() => { initWorkflowsRegistry() }, [])
  const { loading, wf, source, status, endedAt, panels, error, runs, selectedRunId, selectRun } = useRunResult(workflowId)
  const contentRef = useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState<'png' | 'pdf' | null>(null)

  const slug = (wf?.name || 'workflow').replace(/[^\w-]+/g, '_').slice(0, 40)
  const doExport = async (kind: 'png' | 'pdf') => {
    if (!contentRef.current) return
    setExporting(kind)
    try {
      const fn = kind === 'png' ? exportElementToPng : exportElementToPdf
      await fn(contentRef.current, `resultat_${slug}.${kind}`)
    } catch (e) {
      console.warn('[results] export échoué', e)
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="h-screen bg-background text-white flex flex-col">
      <header className="border-b border-neutral-800 px-3 py-2 flex items-center gap-2 shrink-0">
        <button
          onClick={() => nav(`/workflows/${workflowId}`)}
          className="p-1.5 hover:bg-white/[0.06] text-white/40 hover:text-white/80 rounded-md"
          aria-label="Retour à l'éditeur"
          title="Retour à l'éditeur"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <Eye className="w-4 h-4 text-indigo-400" />
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{wf?.name ?? 'Résultats'}</div>
          <div className="text-[11px] text-neutral-500">
            {source === 'history' ? 'Run sauvegardé' : source === 'server' ? 'Dernier run serveur' : source === 'client' ? 'Run de la session' : 'Aucun run'}
            {status ? ` · ${status}` : ''}{endedAt ? ` · ${fmtDate(endedAt)}` : ''}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => void doExport('png')}
            disabled={!panels.length || !!exporting}
            className="px-2.5 py-1.5 rounded bg-white/[0.06] hover:bg-white/[0.1] text-white/80 flex items-center gap-2 text-sm disabled:opacity-40"
          >
            {exporting === 'png' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileImage className="w-4 h-4" />} PNG
          </button>
          <button
            onClick={() => void doExport('pdf')}
            disabled={!panels.length || !!exporting}
            className="px-2.5 py-1.5 rounded bg-indigo-500 hover:bg-indigo-600 flex items-center gap-2 text-sm disabled:opacity-40"
          >
            {exporting === 'pdf' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} PDF
          </button>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        <HistorySidebar runs={runs} selectedRunId={selectedRunId} onSelect={selectRun} />
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-neutral-500 p-8">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-400" /> Chargement…
            </div>
          ) : error ? (
            <div className="text-sm text-amber-300/90 p-8">{error}</div>
          ) : !source || panels.length === 0 ? (
            <div className="max-w-md mx-auto text-center text-sm text-neutral-500 p-12 space-y-2">
              <Eye className="w-8 h-8 mx-auto text-neutral-700" />
              <p>Aucun résultat à afficher pour l'instant.</p>
              <p className="text-[12px] text-neutral-600">
                Lance le workflow (« Run » dans l'éditeur, ou « Lancer serveur » / cron) puis reviens ici.
              </p>
            </div>
          ) : (
            <div ref={contentRef} className="max-w-7xl mx-auto p-4 space-y-4 bg-background">
              {panels.map((p) => <ResultPanelView key={`${p.nodeId}:${p.portName}`} panel={p} contextHint={wf?.name} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
