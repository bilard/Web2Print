// Sélecteur de la SOURCE du tableau de bord (le suivi actif) + accès au gestionnaire de
// suivis (suppression des résidus de test). Le `<select>` reste pour CHOISIR ; la
// suppression multiple passe par la modale WatchManager (pas de dropdown custom fragile).
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Settings2, Workflow } from 'lucide-react'
import type { WatchSummary } from '../useCatalogReport'
import { when } from './format'
import { WatchManager } from './WatchManager'
import { t } from '@/lib/i18n'

export function WatchSelector({ watches, value, onChange }: {
  watches: WatchSummary[]
  value: string
  onChange: (id: string) => void
}) {
  const [manage, setManage] = useState(false)
  const navigate = useNavigate()
  if (watches.length === 0) return null
  // Workflow d'origine de la source active → lien « Ouvrir le workflow ». Absent pour les
  // suivis créés avant cette liaison : ils l'obtiennent au prochain « Comparer catalogue ».
  const activeWorkflowId = watches.find((w) => w.watchId === value)?.workflowId

  return (
    <div className="flex items-center gap-2 shrink-0">
      <span className="text-xs text-white/40">Source</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="bg-well text-white/80 text-sm rounded px-2 py-1.5 border border-white/10 focus:outline-none focus:border-white/25">
        {watches.map((w) => (
          <option key={w.watchId} value={w.watchId}>
            {w.label || w.watchId}{w.lastReportAt ? ` — ${when(w.lastReportAt)}` : ''}
          </option>
        ))}
      </select>
      <button type="button" onClick={() => setManage(true)} title={t('pw.tail.manageWatches')}
        className="p-1.5 rounded border border-white/10 text-white/40 hover:text-white/80 hover:border-white/25">
        <Settings2 className="w-3.5 h-3.5" />
      </button>
      {activeWorkflowId && (
        <button type="button" onClick={() => navigate(`/workflows/${activeWorkflowId}`)}
          title={t('pw.watch.openWorkflow')}
          className="flex items-center gap-1.5 px-2 py-1.5 rounded border border-white/10 text-indigo-400 hover:text-indigo-300 hover:border-indigo-400/40">
          <Workflow className="w-3.5 h-3.5" />
          <span className="text-xs font-medium">Workflow</span>
        </button>
      )}
      <WatchManager open={manage} onOpenChange={setManage} watches={watches} activeId={value} />
    </div>
  )
}
