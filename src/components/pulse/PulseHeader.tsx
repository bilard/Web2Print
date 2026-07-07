import { RotateCw } from 'lucide-react'
import { PulsePeriodControl, type PeriodValue } from './PulsePeriodControl'

interface PulseHeaderProps {
  period: PeriodValue
  onPeriod: (v: PeriodValue) => void
  liveVisitors: number
  fetching: boolean
  onRefresh: () => void
  scrolled: boolean
}

/** Barre de titre translucide + pastille « en direct » + sélecteur de période. */
export function PulseHeader({ period, onPeriod, liveVisitors, fetching, onRefresh, scrolled }: PulseHeaderProps) {
  return (
    <header className="pulse-topbar pulse-safe-top pulse-safe-x sticky top-0 z-30" data-scrolled={scrolled}>
      <div className="mx-auto w-full max-w-lg">
      <div className="flex items-end justify-between pb-2">
        <div>
          <h1 className="pulse-rounded text-[30px] font-bold leading-none">Pulse</h1>
          <p className="mt-1 text-[13px]" style={{ color: 'var(--pulse-text-2)' }}>
            ibs-studio.com
          </p>
        </div>
        <div className="flex items-center gap-2 pb-1">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold"
            style={{ background: 'rgba(48,209,88,0.14)', color: 'var(--pulse-live)' }}
          >
            <span className="relative flex h-1.5 w-1.5">
              {liveVisitors > 0 && (
                <span className="pulse-live-ring absolute inset-0 rounded-full" style={{ background: 'var(--pulse-live)' }} />
              )}
              <span className="pulse-live-dot relative h-1.5 w-1.5 rounded-full" style={{ background: 'var(--pulse-live)' }} />
            </span>
            En direct
          </span>
          <button
            onClick={onRefresh}
            aria-label="Actualiser"
            className="pulse-tap grid h-9 w-9 place-items-center rounded-full"
            style={{ background: 'var(--pulse-surface-2)', color: 'var(--pulse-text-2)' }}
          >
            <RotateCw size={16} className={fetching ? 'pulse-spin' : undefined} />
          </button>
        </div>
      </div>
      <div className="pb-3">
        <PulsePeriodControl value={period} onChange={onPeriod} />
      </div>
      </div>
    </header>
  )
}
