type Area = 'promo' | 'docs' | 'app' | 'other'
type Device = 'mobile' | 'tablet' | 'desktop'

export interface AnalyticsEvent {
  ts: number
  path: string
  area: Area
  ref: string | null
  src: string | null
  device: Device
  os: string | null
  browser: string | null
  country: string | null
  city: string | null
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
  /** Zone : `'site'` = site web public (tout sauf l'app), `'app'` = application. */
  zone: string
  device: string
  country: string
  page: string
  source: string
  user: string
}

export const NO_FILTER: EventFilter = { zone: 'all', device: 'all', country: 'all', page: 'all', source: 'all', user: 'all' }

/** Source effective d'un event : utm_source si présent, sinon domaine référent. */
function eventSource(e: AnalyticsEvent): string | null {
  return e.src ?? e.ref
}

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(['fr'], { type: 'region' })
  } catch {
    return null
  }
})()

/** Nom de pays en clair (français) depuis un code ISO-3166 alpha-2 (« FR » → « France »). */
export function countryName(iso: string | null): string | null {
  if (!iso) return null
  if (iso.length !== 2 || !/^[a-z]{2}$/i.test(iso)) return iso
  try {
    return regionNames?.of(iso.toUpperCase()) ?? iso
  } catch {
    return iso
  }
}

/**
 * Règles de catégorisation d'une source (domaine référent ou `utm_source`) en canal
 * lisible. Testées sur la valeur en minuscules ; l'ordre compte (email d'abord, puis
 * réseaux sociaux, puis moteurs de recherche). Un domaine non reconnu est conservé tel quel.
 */
const SOURCE_RULES: { re: RegExp; label: string }[] = [
  { re: /newsletter|mailchimp|sendgrid|mailjet|sendinblue|brevo|mailerlite|gmail|mail\.google|mail\.yahoo|outlook|hotmail|courriel|e-?mail/, label: 'Email' },
  { re: /linkedin|lnkd\.in/, label: 'LinkedIn' },
  { re: /(^|\.)t\.co$|twitter|(^|\.)x\.com$/, label: 'X (Twitter)' },
  { re: /facebook|(^|\.)fb\.|(^|\.)fb\.me/, label: 'Facebook' },
  { re: /instagram|instagr\.am/, label: 'Instagram' },
  { re: /youtube|youtu\.be/, label: 'YouTube' },
  { re: /reddit|redd\.it/, label: 'Reddit' },
  { re: /pinterest|pin\.it/, label: 'Pinterest' },
  { re: /tiktok/, label: 'TikTok' },
  { re: /threads\.net/, label: 'Threads' },
  { re: /whatsapp|(^|\.)wa\.me/, label: 'WhatsApp' },
  { re: /telegram|(^|\.)t\.me/, label: 'Telegram' },
  { re: /google|goo\.gl/, label: 'Google' },
  { re: /(^|\.)bing\./, label: 'Bing' },
  { re: /duckduckgo/, label: 'DuckDuckGo' },
  { re: /(^|\.)yahoo\./, label: 'Yahoo' },
  { re: /ecosia/, label: 'Ecosia' },
  { re: /qwant/, label: 'Qwant' },
  { re: /yandex/, label: 'Yandex' },
  { re: /baidu/, label: 'Baidu' },
]

/**
 * Catégorise une source effective (`utm_source` sinon domaine référent) en canal lisible :
 * « LinkedIn », « Google », « Email »… L'accès direct (source absente) devient « Direct » ;
 * un domaine/valeur non reconnu est renvoyé tel quel.
 */
export function sourceCategory(source: string | null): string {
  if (!source) return 'Direct'
  const s = source.toLowerCase()
  for (const { re, label } of SOURCE_RULES) if (re.test(s)) return label
  return source
}

/** Restreint la liste d'events selon les filtres choisis (appareil / pays / page / source / utilisateur). */
export function filterEvents(events: AnalyticsEvent[], f: EventFilter): AnalyticsEvent[] {
  return events.filter(
    (e) =>
      (f.zone === 'all' || (f.zone === 'app' ? e.area === 'app' : e.area !== 'app')) &&
      (f.device === 'all' || e.device === f.device) &&
      (f.country === 'all' || e.country === f.country) &&
      (f.page === 'all' || e.path === f.page) &&
      (f.source === 'all' || sourceCategory(eventSource(e)) === f.source) &&
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

/** Connexions groupées par ville, triées par volume décroissant. */
export interface CityCount {
  city: string
  country: string | null
  count: number
}

/** Agrège les events par ville (ceux sans ville sont ignorés). */
export function cityCounts(events: AnalyticsEvent[]): CityCount[] {
  const counts = new Map<string, CityCount>()
  for (const e of events) {
    if (!e.city) continue
    const key = `${e.city}|${e.country ?? ''}`
    const cur = counts.get(key)
    if (cur) cur.count += 1
    else counts.set(key, { city: e.city, country: e.country, count: 1 })
  }
  return [...counts.values()].sort((a, b) => b.count - a.count)
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

export interface CountryCityRow {
  country: string | null
  city: string | null
  count: number
  /** Timestamp (ms) de la visite la plus récente pour ce couple pays·ville. */
  lastTs: number
}

/** Agrégat Pays · Ville : nombre de visites et dernière visite, tri par visites décroissantes. */
export function countryCityStats(events: AnalyticsEvent[], limit: number): CountryCityRow[] {
  const map = new Map<string, CountryCityRow>()
  for (const e of events) {
    const key = (e.country ?? '') + '|' + (e.city ?? '')
    const row = map.get(key) ?? { country: e.country, city: e.city, count: 0, lastTs: 0 }
    row.count += 1
    if (e.ts > row.lastTs) row.lastTs = e.ts
    map.set(key, row)
  }
  return [...map.values()].sort((a, b) => b.count - a.count).slice(0, limit)
}

export interface CountryGroup {
  country: string | null
  /** Total des visites du pays (toutes villes confondues). */
  count: number
  lastTs: number
  /** Villes du pays, triées par visites décroissantes. */
  cities: CountryCityRow[]
}

/**
 * Villes regroupées par pays : pays triés par visites décroissantes, villes idem à l'intérieur.
 * Passe unique sur les events → totaux pays exacts (pas de troncature de la longue traîne).
 */
export function countryGroupStats(events: AnalyticsEvent[]): CountryGroup[] {
  const groups = new Map<string, CountryGroup>()
  const cities = new Map<string, CountryCityRow>()
  for (const e of events) {
    const gKey = e.country ?? ''
    const g = groups.get(gKey) ?? { country: e.country, count: 0, lastTs: 0, cities: [] }
    g.count += 1
    if (e.ts > g.lastTs) g.lastTs = e.ts

    const cKey = gKey + '|' + (e.city ?? '')
    const city = cities.get(cKey)
    if (city) {
      city.count += 1
      if (e.ts > city.lastTs) city.lastTs = e.ts
    } else {
      const row: CountryCityRow = { country: e.country, city: e.city, count: 1, lastTs: e.ts }
      cities.set(cKey, row)
      g.cities.push(row)
    }
    groups.set(gKey, g)
  }
  const list = [...groups.values()]
  for (const g of list) g.cities.sort((a, b) => b.count - a.count)
  return list.sort((a, b) => b.count - a.count)
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
  '/data': 'PIM',
  '/taxonomies': 'Taxonomies',
  '/editor': 'Éditeur',
  '/scraping-templates': 'Templates scraping',
  '/workflows': 'Workflows',
  '/catalog': 'Catalogue studio',
}

/**
 * Modules du dashboard — pages « virtuelles » `/dashboard/<section>` émises par
 * `trackSection` (les modules ne sont PAS des routes, cf. `navigation/modules.ts`).
 * Miroir des labels de MODULE_ITEMS (non importé : ce module reste pur).
 */
const SECTION_LABELS: Record<string, string> = {
  blank: 'Nouveau document',
  import: 'Importer',
  library: 'Bibliothèque',
  images: 'DAM',
  data: 'PIM',
  taxonomies: 'Taxonomies',
  'scraping-templates': 'Templates scraping',
  'scraping-hub': 'Scraping Hub',
  'price-watch': 'Veille tarifaire',
  'retail-promo': 'Création studio',
  catalog: 'Catalogue studio',
  hyperframes: 'Animation',
  workflows: 'Workflows',
  chat: 'Chat IA',
  telegram: 'Telegram',
  access: 'Utilisateurs & rôles',
  settings: 'Réglages',
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
  studio: 'Studio',
  catalogue: 'Catalogue',
}

const pretty = (s: string): string =>
  s.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

/** Traductions des segments techniques connus en fin de chemin. */
const SEG_LABELS: Record<string, string> = { result: 'Résultat' }

/** Déclinaisons de langue du site vitrine et de la doc (`/promo/en/…`, `/docs/de/…`). */
const LANG_RE = /^(en|es|de|it)$/
/** Segment opaque (id Firestore, jeton machine) : long, alphanumérique, avec chiffre. */
const ID_RE = /^(?=.*\d)[A-Za-z0-9-]{15,}$/

/** Transforme un chemin technique (`/promo/offre`, `/#modules`) en nom lisible. */
export function pageLabel(path: string): string {
  if (!path) return 'Accueil'
  // Ancre/section : `/#modules` → « Modules » ; sur une page interne inconnue,
  // préfixer par la page (`/docs/#m-settings` → « Documentation · Settings »).
  const hashIdx = path.indexOf('#')
  if (hashIdx >= 0) {
    const base = path.slice(0, hashIdx).replace(/\/index\.html$/, '/')
    const anchor = path.slice(hashIdx + 1)
    // `#` vide ou `#top` = la page elle-même.
    if (!anchor || anchor === 'top') return pageLabel(base || '/')
    // Sections du site vitrine : identiques sur `/`, `/promo` et leurs langues.
    const known = KNOWN_ANCHORS[anchor]
    if (known) return known
    const baseLabel = pageLabel(base || '/')
    const anchorLabel = pretty(anchor.replace(/^m-/, '')) // ancres de la doc préfixées « m- »
    return baseLabel === 'Accueil' ? anchorLabel : baseLabel + ' · ' + anchorLabel
  }
  if (path === '/') return 'Accueil'
  const clean = path.replace(/\/+$/, '')
  if (KNOWN_PAGES[clean]) return KNOWN_PAGES[clean]
  const segs = clean.split('/').filter(Boolean)
  if (segs.length === 0) return 'Accueil'
  // Modules du dashboard : pages virtuelles `/dashboard/<section>` (cf. trackSection).
  if (segs[0] === 'dashboard' && segs.length === 2 && SECTION_LABELS[segs[1]]) return SECTION_LABELS[segs[1]]
  let head = KNOWN_PAGES['/' + segs[0]] ?? pretty(segs[0])
  let rest = segs.slice(1)
  if (rest.length > 0 && LANG_RE.test(rest[0]) && (segs[0] === 'promo' || segs[0] === 'docs')) {
    head += ' (' + rest[0].toUpperCase() + ')'
    rest = rest.slice(1)
  }
  // Les ids opaques (documents Firestore) sont du bruit, pas un nom de page.
  const tail = rest.filter((s) => !ID_RE.test(s)).map((s) => SEG_LABELS[s] ?? pretty(s))
  return tail.length > 0 ? head + ' · ' + tail.join(' · ') : head
}

/**
 * Regroupement des modules par famille — même découpage que le menu « LES 20 MODULES »
 * de la landing `/promo` (cf. `public/promo/index.html`). Clé = libellé de page (`pageLabel`).
 */
const MODULE_GROUP: Record<string, string> = {
  'Créer': 'Créer & éditer', 'Importer': 'Créer & éditer', 'Éditer': 'Créer & éditer', 'Générer': 'Créer & éditer', 'Animer': 'Créer & éditer',
  'Données': 'Données & catalogue', 'Classer': 'Données & catalogue', 'Organiser': 'Données & catalogue', 'Médias': 'Données & catalogue',
  'Mapper': 'Collecter le web', 'Collecter': 'Collecter le web', 'Surveiller': 'Collecter le web', 'Veille': 'Collecter le web',
  'Décliner': 'Produire & diffuser', 'Publier': 'Produire & diffuser',
  'Automatiser': 'Automatiser & assister', 'Piloter': 'Automatiser & assister', 'Assister': 'Automatiser & assister',
  'Gouverner': 'Administrer', 'Paramétrer': 'Administrer', 'Explorer': 'Administrer',
  // Modules de l'app (routes SPA + sections du dashboard) — mêmes familles que `navigation/modules.ts`.
  'Nouveau document': 'Créer & éditer', 'Bibliothèque': 'Créer & éditer', 'Éditeur': 'Créer & éditer', 'Animation': 'Créer & éditer',
  'PIM': 'Données & catalogue', 'Taxonomies': 'Données & catalogue', 'DAM': 'Données & catalogue',
  'Templates scraping': 'Collecter le web', 'Scraping Hub': 'Collecter le web', 'Veille tarifaire': 'Collecter le web',
  'Création studio': 'Produire & diffuser', 'Catalogue studio': 'Produire & diffuser',
  'Workflows': 'Automatiser & assister', 'Chat IA': 'Automatiser & assister', 'Telegram': 'Automatiser & assister',
  'Utilisateurs & rôles': 'Administrer', 'Réglages': 'Administrer',
}

/** Ordre d'affichage des groupes (+ « Autres » pour les pages hors modules). */
export const MODULE_GROUP_ORDER = ['Créer & éditer', 'Données & catalogue', 'Collecter le web', 'Produire & diffuser', 'Automatiser & assister', 'Administrer', 'Autres'] as const

/** Groupe de modules d'une page (`'Autres'` si la page n'est pas un module). */
export function moduleGroupOf(path: string): string {
  return MODULE_GROUP[pageLabel(path)] ?? 'Autres'
}

/**
 * Navigation interne / peu informative (tableau de bord nu, pages `/workflows/…`,
 * accueil) à exclure de « Activité récente » : ce n'est pas du trafic visiteur utile.
 */
export function isInternalActivity(path: string): boolean {
  const label = pageLabel(path)
  return label === 'Tableau de bord' || label === 'Accueil' || label.startsWith('Workflows')
}

/** Top des sources effectives brutes : utm_source si présent, sinon domaine référent (accès direct exclu). */
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

/**
 * Top des sources de trafic regroupées par canal (« LinkedIn », « Google », « Direct »…).
 * Compte tous les events, y compris l'accès direct (classé « Direct »).
 */
export function topSourceCategories(events: AnalyticsEvent[], limit: number): { label: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const e of events) {
    const cat = sourceCategory(e.src ?? e.ref)
    counts.set(cat, (counts.get(cat) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}
