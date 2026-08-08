// Journal du dernier run, dans la PWA.
//
// ⚠ C'était le manque le plus coûteux : un node rouge disait qu'il avait échoué, jamais
// POURQUOI. Il fallait ouvrir un ordinateur pour lire la console de l'éditeur — alors que
// les messages voyagent déjà dans le document que cette vue lit pour ses pastilles.
import { useState } from 'react'
import { ScrollText } from 'lucide-react'
import { filterLogs, type LogFilter, type RunLog } from '@/features/priceWatch/radar/runLive'
import { hhmm } from '@/features/priceWatch/radar/radarFormat'
import { t } from '@/lib/i18n'

const LEVEL_COLOR: Record<string, string> = {
  error: '#fb7185', warn: '#fbbf24', info: 'var(--radar-text-2)',
}

const FILTERS: { id: LogFilter; labelKey: 'rd.wf.logs.all' | 'rd.wf.logs.warn' | 'rd.wf.logs.error' }[] = [
  { id: 'all', labelKey: 'rd.wf.logs.all' },
  { id: 'warn', labelKey: 'rd.wf.logs.warn' },
  { id: 'error', labelKey: 'rd.wf.logs.error' },
]

export function RadarRunLogs({ logs }: { logs: RunLog[] }) {
  // Ouvert sur les ERREURS quand il y en a : c'est ce qu'on vient chercher. Sinon replié,
  // parce qu'un journal de plusieurs centaines de lignes noie le graphe au-dessus.
  const hasError = logs.some((l) => l.level === 'error')
  const [filter, setFilter] = useState<LogFilter>(hasError ? 'error' : 'all')
  const [open, setOpen] = useState(hasError)

  if (logs.length === 0) return null
  const shown = filterLogs(logs, filter)

  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 rounded-xl px-3 py-2 text-[12px]"
        style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--radar-text-2)' }}
      >
        <ScrollText size={14} />
        <span className="flex-1 text-left">{t('rd.wf.logs.title', { count: logs.length })}</span>
        <span style={{ color: 'var(--radar-text-3)' }}>{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="mt-2">
          <div className="flex gap-1.5 mb-2">
            {FILTERS.map((f) => (
              <button
                key={f.id} onClick={() => setFilter(f.id)}
                className="px-2 py-1 rounded-lg text-[11px]"
                style={{
                  background: filter === f.id ? 'rgba(99,102,241,0.22)' : 'rgba(255,255,255,0.05)',
                  color: filter === f.id ? '#c7d2fe' : 'var(--radar-text-3)',
                }}
              >
                {t(f.labelKey)}
              </button>
            ))}
          </div>

          {shown.length === 0 ? (
            <p className="text-[11px] px-1" style={{ color: 'var(--radar-text-3)' }}>{t('rd.wf.logs.none')}</p>
          ) : (
            // Hauteur bornée et défilement propre : le journal ne doit pas repousser le
            // graphe hors de l'écran sur un téléphone.
            <div className="max-h-72 overflow-y-auto rounded-xl px-2.5 py-2 space-y-1.5"
              style={{ background: 'rgba(0,0,0,0.25)' }}>
              {shown.map((l, i) => (
                <div key={`${l.ts}-${i}`} className="text-[11px] leading-snug flex gap-2">
                  <span className="shrink-0 tabular-nums" style={{ color: 'var(--radar-text-3)' }}>{hhmm(l.ts)}</span>
                  <span className="break-words" style={{ color: LEVEL_COLOR[l.level] ?? 'var(--radar-text-2)' }}>
                    {l.msg}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
