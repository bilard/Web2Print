import { useCallback, useMemo, useState } from 'react'
import { useAnalyticsEvents } from './useAnalyticsEvents'
import { computeKpis, deltaPct, filterEvents, type AnalyticsEvent, type EventFilter, type Kpis } from './metrics'

const MIN = 60_000
const DAY = 86_400_000
const LIVE_WINDOW = 5 * MIN
const HERO_MINUTES = 60

/** Presets rapides de période. `custom` (plage Du/Au) se sélectionne à part. */
export const PULSE_PRESETS = [
  { key: '24h', label: '24 h', spanMs: DAY },
  { key: '7d', label: '7 j', spanMs: 7 * DAY },
  { key: '30d', label: '30 j', spanMs: 30 * DAY },
  { key: '90d', label: '90 j', spanMs: 90 * DAY },
  { key: '12m', label: '12 mois', spanMs: 365 * DAY },
] as const

export interface KpiWithDelta extends Kpis {
  dVisitors: number | null
  dPageViews: number | null
  dSessions: number | null
}

export interface LivePulse {
  loading: boolean
  fetching: boolean
  error: boolean
  /** Events de la période après application des filtres (base de toutes les vues). */
  events: AnalyticsEvent[]
  /** Events de la période SANS filtre — pour peupler les options de filtre. */
  allEvents: AnalyticsEvent[]
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
 * Agrège les events analytics pour la vue mobile « Pulse ».
 *
 * Deux modes de période :
 * - **Preset** (`spanMs` fourni, `customFromMs`/`customToMs` nuls) : fenêtre glissante
 *   finissant maintenant ; borne haute OUVERTE (`toMs = null`) pour capter le direct.
 * - **Plage perso** (`customFromMs`+`customToMs` fournis) : bornes fixes, borne haute fermée.
 *
 * La période précédente (même durée, décalée) sert aux deltas. Les bornes ne sont
 * recalculées qu'au changement de période/filtre ou au rafraîchissement (clé de requête stable).
 */
export function useLivePulse(
  spanMs: number | null,
  customFromMs: number | null,
  customToMs: number | null,
  filter: EventFilter,
): LivePulse {
  const [nonce, setNonce] = useState(0)
  const { fromMs, upperBound, prevFromMs, prevToMs, anchorMs } = useMemo(() => {
    if (customFromMs != null && customToMs != null && customToMs > customFromMs) {
      const span = customToMs - customFromMs
      return { fromMs: customFromMs, upperBound: customToMs as number | null, prevFromMs: customFromMs - span, prevToMs: customFromMs, anchorMs: customToMs }
    }
    const now = Date.now()
    const span = spanMs ?? 30 * DAY
    return { fromMs: now - span, upperBound: null as number | null, prevFromMs: now - 2 * span, prevToMs: now - span, anchorMs: now }
  }, [spanMs, customFromMs, customToMs, nonce])

  const cur = useAnalyticsEvents(fromMs, upperBound, true)
  const prev = useAnalyticsEvents(prevFromMs, prevToMs, true)

  const allEvents = cur.data ?? []
  const events = useMemo(() => filterEvents(allEvents, filter), [allEvents, filter])
  const kpis = useMemo<KpiWithDelta>(() => {
    const k = computeKpis(events)
    const p = computeKpis(filterEvents(prev.data ?? [], filter))
    return {
      ...k,
      dVisitors: deltaPct(k.visitors, p.visitors),
      dPageViews: deltaPct(k.pageViews, p.pageViews),
      dSessions: deltaPct(k.sessions, p.sessions),
    }
  }, [events, prev.data, filter])

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
    allEvents,
    kpis,
    liveVisitors: live.liveVisitors,
    liveViews: live.liveViews,
    heroSeries,
    fromMs,
    anchorMs,
    refresh,
  }
}
