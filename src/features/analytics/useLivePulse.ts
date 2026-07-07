import { useCallback, useMemo, useState } from 'react'
import { useAnalyticsEvents } from './useAnalyticsEvents'
import { computeKpis, deltaPct, type AnalyticsEvent, type Kpis } from './metrics'

const MIN = 60_000
const DAY = 86_400_000
const LIVE_WINDOW = 5 * MIN
const HERO_MINUTES = 60

export type PulsePeriod = '24h' | '7d' | '30d' | '90d'
const SPAN: Record<PulsePeriod, number> = { '24h': DAY, '7d': 7 * DAY, '30d': 30 * DAY, '90d': 90 * DAY }

export interface KpiWithDelta extends Kpis {
  dVisitors: number | null
  dPageViews: number | null
  dSessions: number | null
}

export interface LivePulse {
  loading: boolean
  fetching: boolean
  error: boolean
  events: AnalyticsEvent[]
  kpis: KpiWithDelta
  /** Visiteurs uniques actifs sur les 5 dernières minutes. */
  liveVisitors: number
  /** Nombre de pages vues sur les 5 dernières minutes. */
  liveViews: number
  /** Battements par minute sur la dernière heure (60 valeurs) pour le tracé du héros. */
  heroSeries: number[]
  /** Borne basse de la période courante (pour les tracés). */
  fromMs: number
  /** Instant de référence de la période (borne haute figée pour les tracés). */
  anchorMs: number
  refresh: () => void
}

/**
 * Agrège les events analytics pour la vue mobile « Pulse ». La borne haute de la
 * période courante reste ouverte (`toMs = null`) pour capter les visites en direct ;
 * la période précédente sert au calcul des deltas. `anchor` n'est recalculé qu'au
 * changement de période ou au rafraîchissement manuel, pour garder la clé de requête
 * stable (le polling 60 s de `useAnalyticsEvents` fait le reste).
 */
export function useLivePulse(period: PulsePeriod): LivePulse {
  const [nonce, setNonce] = useState(0)
  const { fromMs, prevFromMs, prevToMs, anchorMs } = useMemo(() => {
    const now = Date.now()
    const span = SPAN[period]
    return { fromMs: now - span, prevFromMs: now - 2 * span, prevToMs: now - span, anchorMs: now }
  }, [period, nonce])

  const cur = useAnalyticsEvents(fromMs, null, true)
  const prev = useAnalyticsEvents(prevFromMs, prevToMs, true)

  const events = cur.data ?? []
  const kpis = useMemo<KpiWithDelta>(() => {
    const k = computeKpis(events)
    const p = computeKpis(prev.data ?? [])
    return {
      ...k,
      dVisitors: deltaPct(k.visitors, p.visitors),
      dPageViews: deltaPct(k.pageViews, p.pageViews),
      dSessions: deltaPct(k.sessions, p.sessions),
    }
  }, [events, prev.data])

  const live = useMemo(() => {
    const cutoff = Date.now() - LIVE_WINDOW
    const recent = events.filter((e) => e.ts >= cutoff)
    return { liveVisitors: new Set(recent.map((e) => e.vid)).size, liveViews: recent.length }
  }, [events])

  const heroSeries = useMemo(() => {
    const now = Date.now()
    const start = now - HERO_MINUTES * MIN
    const buckets = new Array<number>(HERO_MINUTES).fill(0)
    for (const e of events) {
      if (e.ts < start) continue
      const idx = Math.min(HERO_MINUTES - 1, Math.floor((e.ts - start) / MIN))
      if (idx >= 0) buckets[idx] += 1
    }
    return buckets
  }, [events])

  const refresh = useCallback(() => {
    setNonce((n) => n + 1)
    void cur.refetch()
    void prev.refetch()
  }, [cur, prev])

  return {
    loading: cur.isLoading,
    fetching: cur.isFetching || prev.isFetching,
    error: cur.isError,
    events,
    kpis,
    liveVisitors: live.liveVisitors,
    liveViews: live.liveViews,
    heroSeries,
    fromMs,
    anchorMs,
    refresh,
  }
}
