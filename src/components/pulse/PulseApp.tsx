import { useEffect, useMemo, useState } from 'react'
import { PULSE_PRESETS, useLivePulse } from '@/features/analytics/useLivePulse'
import { NO_FILTER, type EventFilter } from '@/features/analytics/metrics'
import { PulseHeader } from './PulseHeader'
import { PulseFilters } from './PulseFilters'
import { PulseHero } from './PulseHero'
import { PulseKpiGrid } from './PulseKpiGrid'
import { PulseTrend } from './PulseTrend'
import { PulseLiveFeed } from './PulseLiveFeed'
import { PulseTopLists } from './PulseTopLists'
import { PulseCountries } from './PulseCountries'
import { PulseInstallHint } from './PulseInstallHint'
import type { PeriodValue } from './PulsePeriodControl'

/** Coquille de la PWA « Pulse » : orchestre période, filtres, données live et sections. */
export function PulseApp() {
  const [period, setPeriod] = useState<PeriodValue>({ key: '7d', from: '', to: '' })
  const [filter, setFilter] = useState<EventFilter>(NO_FILTER)
  const [scrolled, setScrolled] = useState(false)

  // Presets → fenêtre glissante (spanMs) ; « Perso » → bornes fixes une fois Du+Au saisis.
  const { spanMs, customFromMs, customToMs } = useMemo(() => {
    if (period.key === 'custom' && period.from && period.to) {
      const from = new Date(`${period.from}T00:00:00`).getTime()
      const to = new Date(`${period.to}T23:59:59.999`).getTime()
      return { spanMs: null, customFromMs: from, customToMs: to }
    }
    const preset = PULSE_PRESETS.find((p) => p.key === period.key)
    return { spanMs: preset?.spanMs ?? PULSE_PRESETS[1].spanMs, customFromMs: null, customToMs: null }
  }, [period])

  const p = useLivePulse(spanMs, customFromMs, customToMs, filter)
  const hourly = period.key === '24h'

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="pulse-root min-h-[100dvh]">
      <PulseHeader
        period={period}
        onPeriod={setPeriod}
        liveVisitors={p.liveVisitors}
        fetching={p.fetching}
        onRefresh={p.refresh}
        scrolled={scrolled}
      />

      <main className="pulse-safe-x pulse-safe-bottom mx-auto flex max-w-lg flex-col gap-5 pt-3">
        {p.error ? (
          <div className="pulse-card px-4 py-8 text-center">
            <p className="text-[15px] font-semibold">Données indisponibles</p>
            <p className="mt-1 text-[13px]" style={{ color: 'var(--pulse-text-2)' }}>
              Impossible de charger le trafic. Tirez pour actualiser.
            </p>
            <button onClick={p.refresh} className="pulse-tap mt-4 rounded-full px-5 py-2 text-[14px] font-semibold" style={{ background: 'var(--pulse-accent)', color: '#fff' }}>
              Réessayer
            </button>
          </div>
        ) : p.loading ? (
          <PulseSkeleton />
        ) : (
          <>
            <PulseFilters events={p.allEvents} filter={filter} onChange={setFilter} />
            <PulseHero liveVisitors={p.liveVisitors} liveViews={p.liveViews} heroSeries={p.heroSeries} />
            <PulseKpiGrid kpis={p.kpis} />
            <PulseTrend events={p.events} fromMs={p.fromMs} toMs={p.anchorMs} hourly={hourly} />
            <PulseTopLists events={p.events} />
            <PulseCountries events={p.events} />
            <PulseLiveFeed events={p.events} />
            <PulseInstallHint />
            <p className="pb-2 text-center text-[11px]" style={{ color: 'var(--pulse-text-3)' }}>
              Sans cookie · sans donnée personnelle · vos propres visites sont exclues
            </p>
          </>
        )}
      </main>
    </div>
  )
}

function PulseSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="pulse-card h-40 animate-pulse" />
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="pulse-card h-24 animate-pulse" />
        ))}
      </div>
      <div className="pulse-card h-36 animate-pulse" />
    </div>
  )
}
