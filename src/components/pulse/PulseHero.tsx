import { PulseSparkline } from './PulseSparkline'

interface PulseHeroProps {
  liveVisitors: number
  liveViews: number
  heroSeries: number[]
}

/** Héros « en direct » : visiteurs actifs (5 min) + tracé du pouls sur la dernière heure. */
export function PulseHero({ liveVisitors, liveViews, heroSeries }: PulseHeroProps) {
  const active = liveVisitors > 0
  return (
    <section className="pulse-card relative overflow-hidden px-5 pt-5 pb-4">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-24"
        style={{ background: 'radial-gradient(120% 80% at 80% 0%, var(--pulse-accent-soft), transparent 70%)' }}
      />
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-[13px] font-medium" style={{ color: 'var(--pulse-text-2)' }}>
            Visiteurs actifs
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="pulse-rounded pulse-tnum text-[64px] font-bold leading-none">{liveVisitors}</span>
            <span className="pb-2 text-[15px]" style={{ color: 'var(--pulse-text-2)' }}>
              {liveVisitors > 1 ? 'personnes' : 'personne'}
            </span>
          </div>
          <p className="mt-1 text-[12px]" style={{ color: 'var(--pulse-text-3)' }}>
            {active ? `${liveViews} page${liveViews > 1 ? 's' : ''} vue${liveViews > 1 ? 's' : ''} · 5 dernières min` : 'aucune visite ces 5 dernières min'}
          </p>
        </div>
      </div>
      <div className="relative mt-3 h-16" aria-hidden={!active}>
        <PulseSparkline
          values={heroSeries}
          height={48}
          stroke={active ? 'var(--pulse-live)' : 'var(--pulse-text-3)'}
          area
          strokeWidth={2.25}
          leadingDot={active}
          ariaLabel="Activité de la dernière heure, minute par minute"
        />
      </div>
      <p className="relative mt-1 text-right text-[11px]" style={{ color: 'var(--pulse-text-3)' }}>
        dernière heure
      </p>
    </section>
  )
}
