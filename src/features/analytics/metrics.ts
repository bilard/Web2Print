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

/** Filtres d'affichage (façon Google Analytics). `'all'` = pas de filtre. */
export interface EventFilter {
  device: string
  country: string
  page: string
  source: string
  user: string
}

export const NO_FILTER: EventFilter = { device: 'all', country: 'all', page: 'all', source: 'all', user: 'all' }

/** Source effective d'un event : utm_source si présent, sinon domaine référent. */
function eventSource(e: AnalyticsEvent): string | null {
  return e.src ?? e.ref
}

/** Restreint la liste d'events selon les filtres choisis (appareil / pays / page / source / utilisateur). */
export function filterEvents(events: AnalyticsEvent[], f: EventFilter): AnalyticsEvent[] {
  return events.filter(
    (e) =>
      (f.device === 'all' || e.device === f.device) &&
      (f.country === 'all' || e.country === f.country) &&
      (f.page === 'all' || e.path === f.page) &&
      (f.source === 'all' || eventSource(e) === f.source) &&
      (f.user === 'all' || e.uid === f.user),
  )
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

/** Les `limit` events les plus récents (tri décroissant par ts). */
export function recentEvents(events: AnalyticsEvent[], limit = 20): AnalyticsEvent[] {
  return [...events].sort((a, b) => b.ts - a.ts).slice(0, limit)
}

/** Noms lisibles pour les pages connues du site (chemin → libellé humain). */
const KNOWN_PAGES: Record<string, string> = {
  '/promo': 'Promo',
  '/docs': 'Documentation',
  '/dashboard': 'Tableau de bord',
  '/login': 'Connexion',
  '/onboarding': 'Bienvenue',
}

/**
 * Noms lisibles des ancres/sections du site mono-page public (ancre → libellé).
 * Source : la navigation de `public/promo/index.html`.
 */
const KNOWN_ANCHORS: Record<string, string> = {
  modules: 'Modules',
  scraper: 'Collecter',
  templates: 'Mapper',
  pim: 'Données',
  taxonomies: 'Classer',
  publipostage: 'Décliner',
  export: 'Publier',
  import: 'Importer',
  nouveau: 'Créer',
  editer: 'Éditer',
  bibliotheque: 'Organiser',
  imgen: 'Générer',
  animation: 'Animer',
  chat: 'Assister',
  dam: 'Médias',
  telegram: 'Piloter',
  workflows: 'Automatiser',
  settings: 'Paramétrer',
  roles: 'Gouverner',
  decouverte: 'Découverte',
  explorer: 'Explorer',
}

const pretty = (s: string): string =>
  s.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

/** Transforme un chemin technique (`/promo/offre`, `/#modules`) en nom lisible. */
export function pageLabel(path: string): string {
  if (!path) return 'Accueil'
  // Ancre/section d'un site mono-page : `/#modules` → « Modules ».
  const hashIdx = path.indexOf('#')
  if (hashIdx >= 0) {
    const anchor = path.slice(hashIdx + 1)
    if (!anchor) return 'Accueil'
    return KNOWN_ANCHORS[anchor] ?? pretty(anchor)
  }
  if (path === '/') return 'Accueil'
  const clean = path.replace(/\/+$/, '')
  if (KNOWN_PAGES[clean]) return KNOWN_PAGES[clean]
  const segs = clean.split('/').filter(Boolean)
  if (segs.length === 0) return 'Accueil'
  if (segs.length === 1) return pretty(segs[0])
  const head = KNOWN_PAGES['/' + segs[0]] ?? pretty(segs[0])
  return head + ' · ' + segs.slice(1).map(pretty).join(' · ')
}

/** Top des sources effectives : utm_source si présent, sinon domaine référent. */
export function topSources(events: AnalyticsEvent[], limit: number): { label: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const e of events) {
    const s = e.src ?? e.ref
    if (!s) continue
    counts.set(s, (counts.get(s) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}
