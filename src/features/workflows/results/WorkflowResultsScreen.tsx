// src/features/workflows/results/WorkflowResultsScreen.tsx
// Écran dédié « Résultats » d'un workflow (Phase 1) : visualisation contextuelle du
// dernier run (dashboard / table / graphe / galerie / document) + export PNG/PDF.
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Download, FileImage, Loader2, Eye } from 'lucide-react'
import { initWorkflowsRegistry } from '../registry/builtin'
import { useRunResult } from './useRunResult'
import { ResultPanelView } from './ResultPanelView'
import { exportElementToPng, exportElementToPdf } from '@/lib/domExport'

function fmtDate(ts?: number): string {
  if (!ts) return ''
  try { return new Date(ts).toLocaleString('fr-FR') } catch { return '' }
}

export function WorkflowResultsScreen({ workflowId }: { workflowId: string }) {
  const nav = useNavigate()
  useEffect(() => { initWorkflowsRegistry() }, [])
  const { loading, wf, source, status, endedAt, panels, error } = useRunResult(workflowId)
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
            {source === 'server' ? 'Dernier run serveur' : source === 'client' ? 'Run de la session' : 'Aucun run'}
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
          <div ref={contentRef} className="max-w-5xl mx-auto p-4 space-y-4 bg-background">
            {panels.map((p) => <ResultPanelView key={`${p.nodeId}:${p.portName}`} panel={p} />)}
          </div>
        )}
      </div>
    </div>
  )
}
