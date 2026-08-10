// Journal des pannes : horodatage, site en cause, carte qui a signalé, message. Un journal
// vide N'EST PAS muet — il dit qu'aucune panne n'est survenue, ce qui est une information.
import { AlertTriangle } from 'lucide-react'
import type { WatchIncident } from './opsTypes'
import { ago } from '../dashboard/format'
import { useTranslation } from '@/lib/i18n'

export function IncidentLog({ incidents }: { incidents: (WatchIncident & { id: string })[] }) {
  const { t } = useTranslation()

  return (
    <div className="bg-surface rounded-lg p-4">
      <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
        {t('ops.incidents.title')}
      </h3>
      {incidents.length === 0 ? (
        <p className="text-sm text-white/45">{t('ops.incidents.empty')}</p>
      ) : (
        <ul className="space-y-1.5 max-h-72 overflow-y-auto">
          {incidents.map((i) => (
            <li key={i.id} className="flex items-start gap-2 text-[12px] border-b border-white/5 pb-1.5 last:border-0">
              <span className="shrink-0 text-white/35 tabular-nums w-16">{ago(i.ts)}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {i.domain && <span className="text-indigo-300/80">{i.domain}</span>}
                  {i.nodeLabel && <span className="text-white/40">· {i.nodeLabel}</span>}
                </div>
                <p className="text-white/50 truncate" title={i.message}>{i.message}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
