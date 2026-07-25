import type { ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'
import type { WatchSummary } from '@/features/priceWatch/useCatalogReport'
import { hhmm } from '@/features/priceWatch/radar/radarFormat'
import { RadarMenuButton } from './RadarMenu'

/** Barre de titre translucide sticky : nom, sélecteur de source (picker iOS natif),
 *  badge « EN DIRECT » (heure de la dernière analyse), actualisation et menu des vues.
 *  `children` = bandeau ÉPINGLÉ sous le titre (planificateur de l'onglet Scraping). */
export function RadarHeader({ watches, value, onChange, runAt, scrolled, viewLabel, onOpenMenu, children }: {
  watches: WatchSummary[]
  value: string
  onChange: (id: string) => void
  runAt: number | null
  scrolled: boolean
  /** Nom de la vue courante, porté par le bouton hamburger (les onglets ont disparu). */
  viewLabel: string
  onOpenMenu: () => void
  children?: ReactNode
}) {
  return (
    <header className="radar-topbar radar-safe-top radar-safe-x sticky top-0 z-20 pb-2.5" data-scrolled={scrolled}>
      <div className="mx-auto max-w-lg pt-1 landscape:max-w-5xl">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="radar-rounded text-[22px] font-bold leading-none">radarPrice</h1>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full radar-live-dot" style={{ background: 'var(--radar-live)' }} />
              <span className="text-[11px]" style={{ color: 'var(--radar-text-2)' }}>
                {runAt ? `Analyse ${hhmm(runAt)}` : 'En direct'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {watches.length > 1 && (
              <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="radar-inset max-w-[26vw] truncate px-2 py-1.5 text-[13px]"
                style={{ color: 'var(--radar-text)', border: '0.5px solid var(--radar-hair)' }}
              >
                {watches.map((w) => (
                  <option key={w.watchId} value={w.watchId}>{w.label || w.watchId}</option>
                ))}
              </select>
            )}
            <button
              onClick={() => window.location.reload()}
              aria-label="Actualiser"
              className="radar-tap grid h-9 w-9 place-items-center rounded-full"
              style={{ background: 'var(--radar-surface-2)', color: 'var(--radar-text-2)' }}
            >
              <RefreshCw size={16} />
            </button>
            <RadarMenuButton label={viewLabel} onClick={onOpenMenu} />
          </div>
        </div>
        {/* Bandeau épinglé (planificateur) : reste visible au scroll, dans la barre sticky. */}
        {children && <div className="mt-2">{children}</div>}
      </div>
    </header>
  )
}
