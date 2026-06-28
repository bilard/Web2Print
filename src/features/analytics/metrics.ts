type Area = 'promo' | 'docs' | 'app' | 'other'
type Device = 'mobile' | 'tablet' | 'desktop'

export interface AnalyticsEvent {
  ts: number
  path: string
  area: Area
  ref: string | null
  src: string | null
  device: Device
  country: string | null
  vid: string
  sid: string
  uid: string | null
}

export interface Kpis {
  pageViews: number
  visitors: number
  sessions: number
  avgSessionMs: number
  bounceRate: number
}

export function computeKpis(events: AnalyticsEvent[]): Kpis {
  if (events.length === 0) return { pageViews: 0, visitors: 0, sessions: 0, avgSessionMs: 0, bounceRate: 0 }
  const visitors = new Set<string>()
  const sessions = new Map<string, { min: number; max: number; count: number }>()
  for (const e of events) {
    visitors.add(e.vid)
    const s = sessions.get(e.sid)
    if (!s) sessions.set(e.sid, { min: e.ts, max: e.ts, count: 1 })
    else {
      s.min = Math.min(s.min, e.ts)
      s.max = Math.max(s.max, e.ts)
      s.count++
    }
  }
  const sList = [...sessions.values()]
  const totalMs = sList.reduce((a, s) => a + (s.max - s.min), 0)
  const single = sList.filter((s) => s.count === 1).length
  return {
    pageViews: events.length,
    visitors: visitors.size,
    sessions: sessions.size,
    avgSessionMs: Math.round(totalMs / sessions.size),
    bounceRate: single / sessions.size,
  }
}

export function topBy(
  events: AnalyticsEvent[],
  field: 'path' | 'src' | 'country' | 'device',
  limit: number,
): { label: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const e of events) {
    const v = e[field]
    if (!v) continue
    counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

const DAY = 86_400_000
const dayKey = (ms: number): string => new Date(ms).toISOString().slice(0, 10)

export function timeSeries(
  events: AnalyticsEvent[],
  fromMs: number,
  toMs: number,
): { day: string; pageViews: number; visitors: number }[] {
  const buckets = new Map<string, { pageViews: number; vids: Set<string> }>()
  for (let t = fromMs; t <= toMs; t += DAY) buckets.set(dayKey(t), { pageViews: 0, vids: new Set() })
  for (const e of events) {
    const b = buckets.get(dayKey(e.ts))
    if (!b) continue
    b.pageViews++
    b.vids.add(e.vid)
  }
  return [...buckets.entries()].map(([day, b]) => ({ day, pageViews: b.pageViews, visitors: b.vids.size }))
}

export function deltaPct(current: number, previous: number): number | null {
  if (previous === 0) return null
  return Math.round(((current - previous) / previous) * 100)
}
