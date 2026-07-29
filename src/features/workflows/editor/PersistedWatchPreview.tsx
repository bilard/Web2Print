// Aperçu des données DÉJÀ COLLECTÉES (persistées) pour un node de veille tarifaire
// (« Moisson concurrents » / « Comparer catalogue »), affiché quand la carte n'a pas
// (encore) tourné dans la session : au lieu d'un « lance le workflow » vide, on lit le
// rapport Firestore du suivi et on montre l'état de la collecte. Lecture seule.
import { stableId } from '@/features/priceWatch/core'
import { DEFAULT_WATCH_ID } from '@/features/priceWatch/paths'
import { useCatalogReport } from '@/features/priceWatch/useCatalogReport'
import { buildOpsCockpit } from '@/features/priceWatch/dashboard/opsMetrics'
import { duration, ago } from '@/features/priceWatch/dashboard/format'
import { Database } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from '@/lib/i18n'

/** Reproduit la dérivation du watchId côté node (config.watchId sinon id du workflow). */
function watchIdOf(configWatchId: unknown, workflowId: string | undefined): string {
  return stableId((typeof configWatchId === 'string' ? configWatchId : '').trim() || workflowId || DEFAULT_WATCH_ID)
}

export function PersistedWatchPreview({ configWatchId, workflowId, fallback }: {
  configWatchId: unknown
  workflowId: string | undefined
  /** Rendu quand aucune donnée persistée n'existe (message vide standard). */
  fallback: ReactNode
}) {
  const { t } = useTranslation()
  const report = useCatalogReport(watchIdOf(configWatchId, workflowId))
  if (!report) return <>{fallback}</>
  const ck = buildOpsCockpit(report)
  const rows = ck.competitors.filter((c) => c.indexed > 0)
  if (rows.length === 0) return <>{fallback}</>

  return (
    <div className="flex-1 min-h-0 overflow-auto flex flex-col gap-2">
      <div className="flex items-center gap-2 text-[11px] text-neutral-400 shrink-0">
        <Database className="w-3.5 h-3.5 text-emerald-400" />
        <span className="text-emerald-300">{t('wfd.alreadyCollected')}</span>
        <span className="text-neutral-600">·</span>
        <span>{ck.totalIndexed.toLocaleString('fr-FR')} fiches · {ck.sitesActive} concurrent{ck.sitesActive > 1 ? 's' : ''}</span>
        <span className="text-neutral-600">·</span>
        <span>analyse {ago(ck.runAt)}</span>
        <span className="ml-auto text-neutral-600">{t('wfd.notRunThisSession')}</span>
      </div>
      <div className="rounded border border-neutral-800 overflow-auto">
        <table className="text-xs w-full tabular-nums">
          <thead className="bg-well sticky top-0">
            <tr className="text-neutral-400 text-[10px] uppercase tracking-wide text-right">
              <th className="text-left px-2 py-1.5 font-medium">{t('wfd.competitor')}</th>
              <th className="px-2 py-1.5 font-medium">{t('wfd.records')}</th>
              <th className="px-2 py-1.5 font-medium">{t('wfd.pricePct')}</th>
              <th className="px-2 py-1.5 font-medium">{t('wfd.families')}</th>
              <th className="px-2 py-1.5 font-medium">{t('wfd.cycles')}</th>
              <th className="px-2 py-1.5 font-medium">{t('wfd.cumulativeTime')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.siteId} className="border-t border-neutral-900 text-right">
                <td className="text-left px-2 py-1 text-neutral-200 truncate max-w-[220px]" title={c.domain}>
                  {c.domain.replace(/^www\./, '')}
                </td>
                <td className="px-2 py-1 text-neutral-300">{c.indexed.toLocaleString('fr-FR')}</td>
                <td className={`px-2 py-1 ${c.pctPrice >= 80 ? 'text-emerald-300' : c.pctPrice > 0 ? 'text-amber-300' : 'text-rose-300'}`}>{c.pctPrice}%</td>
                <td className="px-2 py-1 text-neutral-300">{Math.round(c.progress * 100)}%</td>
                <td className={`px-2 py-1 ${c.sweeps > 0 ? 'text-emerald-300' : 'text-neutral-500'}`}>×{c.sweeps}</td>
                <td className="px-2 py-1 text-neutral-400">{duration(c.cumulMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
