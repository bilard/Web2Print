import { useEffect, useMemo, useState } from 'react'
import { Workflow as WorkflowIcon, AlertTriangle } from 'lucide-react'
import { getWorkflow } from '@/features/workflows/persistence/workflowsApi'
import { getWorkspaceUid } from '@/features/access/useWorkspaceUid'
import type { Workflow } from '@/features/workflows/types'
import { graphLayout, NODE_W, NODE_H } from './radarWorkflowLayout'
import { t } from '@/lib/i18n'

/**
 * Le graphe du workflow, en LECTURE seule, dans la PWA.
 *
 * ⚠️ Rendu en SVG à la main, PAS avec ReactFlow : la bibliothèque d'édition pèse
 * plusieurs centaines de kilo-octets et embarque zoom, glisser-déposer et
 * connecteurs — inutile ici, et coûteux sur un mobile en 4G. On ne veut qu'une
 * vue d'ensemble : quelles étapes, dans quel ordre.
 *
 * Le graphe est mis à l'échelle de la largeur disponible via `viewBox` : aucun
 * calcul de zoom, le navigateur s'en charge et le rendu reste net.
 */

/** Libellé lisible d'un type de node. Volontairement autonome : importer le
 *  registre des nodes tirerait tout le moteur d'exécution dans le bundle PWA. */
const NODE_LABELS: Record<string, string> = {
  cron: 'Cron (planifié)',
  'source-sites': 'Sites sources',
  'gsheets-import': 'Import Google Sheets',
  'gsheets-export': 'Export Google Sheets',
  'harvest-competitor': 'Moisson concurrents',
  'compare-catalog': 'Comparer catalogue',
  'directed-search': 'Recherche dirigée',
  'price-watch': 'Veille tarifaire',
  'price-watch-track': 'Suivi tarifaire',
}

export function RadarWorkflowGraph({ workflowId, runningNodes }: {
  workflowId: string | null
  /** Ids des nodes en cours d'exécution, si l'information est disponible. */
  runningNodes?: string[]
}) {
  const [wf, setWf] = useState<Workflow | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    const uid = getWorkspaceUid()
    if (!workflowId || !uid) { setWf(null); return }
    let cancelled = false
    void getWorkflow(uid, workflowId)
      .then((w) => { if (!cancelled) { setWf(w); setError(false) } })
      .catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [workflowId])

  const layout = useMemo(() => (wf ? graphLayout(wf.nodes) : null), [wf])

  if (error) {
    return (
      <section className="radar-card radar-in px-5 py-8 text-center text-[13px] flex items-center justify-center gap-2"
        style={{ color: 'var(--radar-text-2)' }}>
        <AlertTriangle size={15} /> {t('rd.wf.unavailable')}
      </section>
    )
  }
  if (!wf || !layout) {
    return (
      <section className="radar-card radar-in px-5 py-8 text-center text-[13px]" style={{ color: 'var(--radar-text-2)' }}>
        {t('rd.wf.none')}
      </section>
    )
  }

  const running = new Set(runningNodes ?? [])

  return (
    <section className="radar-card radar-in px-4 py-4">
      <div className="mb-3 flex items-center gap-2">
        <WorkflowIcon size={16} color="var(--radar-accent-2)" />
        <h2 className="text-[15px] font-semibold">{wf.name || t('rd.wf.title')}</h2>
        <span className="ml-auto text-[12px]" style={{ color: 'var(--radar-text-3)' }}>
          {t('rd.wf.count', { nodes: wf.nodes.length, links: wf.edges.length })}
        </span>
      </div>

      {/* Le SVG s'adapte à la largeur ; en paysage le graphe gagne mécaniquement
          en lisibilité, sans code d'orientation dédié. */}
      <div className="w-full overflow-hidden rounded-xl" style={{ background: 'rgba(0,0,0,0.18)' }}>
        <svg viewBox={`0 0 ${layout.width} ${layout.height}`} className="w-full h-auto block" role="img"
          aria-label={t('rd.wf.title')}>
          {/* Liens d'abord : ils passent SOUS les cartes. */}
          {wf.edges.map((e) => {
            const a = layout.pos.get(e.source)
            const b = layout.pos.get(e.target)
            if (!a || !b) return null   // arête orpheline (node supprimé) : ignorée
            const x1 = a.x + NODE_W
            const y1 = a.y + NODE_H / 2
            const x2 = b.x
            const y2 = b.y + NODE_H / 2
            const mid = (x1 + x2) / 2
            return (
              <path key={e.id} d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
                fill="none" stroke="rgba(110,231,183,0.5)" strokeWidth={2} />
            )
          })}

          {wf.nodes.map((n) => {
            const p = layout.pos.get(n.id)
            if (!p) return null
            const isRunning = running.has(n.id)
            const label = NODE_LABELS[n.type] ?? n.type
            return (
              <g key={n.id}>
                <rect x={p.x} y={p.y} width={NODE_W} height={NODE_H} rx={14}
                  fill={isRunning ? 'rgba(16,185,129,0.16)' : 'rgba(255,255,255,0.04)'}
                  stroke={isRunning ? 'rgba(16,185,129,0.7)' : 'rgba(255,255,255,0.14)'}
                  strokeWidth={isRunning ? 2 : 1} />
                {/* Le libellé est coupé plutôt que débordé : sur un mobile, deux
                    cartes qui se chevauchent rendent le graphe illisible. */}
                <text x={p.x + NODE_W / 2} y={p.y + NODE_H / 2 + 5} textAnchor="middle"
                  fill="rgba(255,255,255,0.82)" fontSize={15} fontWeight={500}>
                  {label.length > 20 ? `${label.slice(0, 19)}…` : label}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </section>
  )
}
