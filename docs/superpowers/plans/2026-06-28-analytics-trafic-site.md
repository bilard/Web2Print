# Analytics de trafic — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner à l'owner un tableau de bord de trafic (pages vues, visiteurs, sessions, sources, pays, top pages) pour ibs-studio.com, 100 % hébergé sur Firebase, sans cookie ni service tiers.

**Architecture:** Un beacon vanilla unique (`public/analytics-beacon.js`) chargé par le shell SPA et par les pages statiques `/promo` et `/docs` envoie chaque page vue, via `navigator.sendBeacon`, à une Cloud Function HTTP `collectAnalytics` exposée en **same-origin** par une réécriture Firebase Hosting (pas de CORS). La CF filtre les bots, dérive pays/device, et écrit 1 doc dans la collection Firestore `analyticsEvents` (read owner-only, write interdit côté client). Un onglet « Analytics » dans la page admin existante lit les events sur une plage de dates et calcule toutes les métriques côté client via un module pur. Une fonction planifiée purge les events > 13 mois.

**Tech Stack:** firebase-functions v2.7.2 (onRequest + onSchedule), firebase-admin v13.8.0, React 18 + React Query v5, react-chartjs-2 / chart.js, Zustand (`useThemeStore`), xlsx (sheetjs), Vitest.

## Global Constraints

- TypeScript strict, cible ES2022. Pas d'`any` dans les props ; typer explicitement.
- Composants `PascalCase.tsx`, **max 150 lignes** ; hooks `useCamelCase.ts` ; logique métier hors des composants UI (modules `.ts` purs).
- Théming par tokens : `bg-background` / `bg-surface` / `bg-surface-2` / `bg-well`, `white` = avant-plan thémable, `text-[#fff]` = blanc vrai. Couleurs programmatiques (chart.js) via `useThemeStore` (`resolvedTheme`). Accent `#6366f1`.
- Cloud Functions : region `europe-west1`, accès Firestore via Admin SDK (`db` depuis firebase-admin), exportées depuis `functions/src/index.ts`.
- Vérif types : **`npx tsc -b`** (project references — `tsc --noEmit` ne vérifie rien). Front à la racine, fonctions via `cd functions && npx tsc`.
- Tests : `npm run test:run` (Vitest). Lint : `npm run lint`. Code mort : `npx knip` doit rester exit 0 (un symbole utilisé seulement dans son fichier ne doit PAS être exporté).
- Pas de cookie, pas d'IP stockée, pas de PII. Id visiteur = jeton aléatoire `localStorage`.
- `/promo` ne doit jamais charger le bundle de la SPA authentifiée — le tracking statique passe uniquement par le beacon vanilla.
- Réponses et commentaires en **français**.
- Fichiers à NE JAMAIS modifier : `src/components/ui/**`, `src/lib/firebase/config.ts`, `public/fonts/`. Ne pas éditer `public/docs/content.js` (auto-généré au prebuild).

---

### Task 1: Helpers de dérivation serveur (purs)

Module pur, sans dépendance Firebase, qui transforme une requête entrante en champs normalisés. Tout le code testable de la CF vit ici.

**Files:**
- Create: `functions/src/analytics/derive.ts`
- Test: `functions/src/analytics/derive.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces:
  - `type Area = 'promo' | 'docs' | 'app' | 'other'`
  - `type Device = 'mobile' | 'tablet' | 'desktop'`
  - `deriveArea(path: string): Area`
  - `deriveDevice(userAgent: string): Device`
  - `normalizeRef(referrer: string | undefined): string | null` — domaine seul, sans `www.`, null si vide/same-host.
  - `isBot(userAgent: string): boolean`
  - `interface EventInput { path: string; ref: string | null; src: string | null; vid: string; sid: string; uid: string | null }`
  - `buildEventDoc(body: unknown, headers: { ua: string; referer: string | undefined; country: string | null }): EventInput & { area: Area; device: Device; country: string | null } | null` — retourne `null` si payload invalide ou bot.

- [ ] **Step 1: Écrire les tests qui échouent**

```ts
// functions/src/analytics/derive.test.ts
import { describe, it, expect } from 'vitest'
import { deriveArea, deriveDevice, normalizeRef, isBot, buildEventDoc } from './derive'

describe('deriveArea', () => {
  it('classe /promo et ses sous-pages', () => {
    expect(deriveArea('/promo')).toBe('promo')
    expect(deriveArea('/promo/offre')).toBe('promo')
  })
  it('classe /docs', () => expect(deriveArea('/docs/intro')).toBe('docs'))
  it('classe les routes app connues', () => {
    expect(deriveArea('/dashboard')).toBe('app')
    expect(deriveArea('/editor/abc')).toBe('app')
  })
  it('tombe sur other pour l’inconnu', () => expect(deriveArea('/xyz')).toBe('other'))
})

describe('deriveDevice', () => {
  it('détecte mobile', () =>
    expect(deriveDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe('mobile'))
  it('détecte tablet', () =>
    expect(deriveDevice('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe('tablet'))
  it('défaut desktop', () =>
    expect(deriveDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)')).toBe('desktop'))
})

describe('normalizeRef', () => {
  it('extrait le domaine sans www', () =>
    expect(normalizeRef('https://www.google.com/search?q=x')).toBe('google.com'))
  it('null si vide', () => expect(normalizeRef(undefined)).toBeNull())
})

describe('isBot', () => {
  it('repère googlebot', () => expect(isBot('Googlebot/2.1')).toBe(true))
  it('laisse passer un vrai navigateur', () =>
    expect(isBot('Mozilla/5.0 (Macintosh; Intel Mac OS X)')).toBe(false))
})

describe('buildEventDoc', () => {
  const headers = { ua: 'Mozilla/5.0 (iPhone)', referer: 'https://google.com/', country: 'FR' }
  it('construit un doc valide', () => {
    const doc = buildEventDoc(
      { path: '/promo', vid: 'v1', sid: 's1', src: null, uid: null }, headers,
    )
    expect(doc).toMatchObject({ path: '/promo', area: 'promo', device: 'mobile', ref: 'google.com', country: 'FR', vid: 'v1', sid: 's1' })
  })
  it('rejette un payload sans path', () =>
    expect(buildEventDoc({ vid: 'v1', sid: 's1' }, headers)).toBeNull())
  it('rejette un bot', () =>
    expect(buildEventDoc({ path: '/promo', vid: 'v1', sid: 's1' }, { ...headers, ua: 'Googlebot/2.1' })).toBeNull())
})
```

- [ ] **Step 2: Lancer les tests (doivent échouer)**

Run: `cd functions && npx vitest run src/analytics/derive.test.ts`
Expected: FAIL — `derive.ts` introuvable. (Si vitest n'est pas configuré dans `functions/`, lancer depuis la racine : `npx vitest run functions/src/analytics/derive.test.ts`.)

- [ ] **Step 3: Implémenter le module**

```ts
// functions/src/analytics/derive.ts
export type Area = 'promo' | 'docs' | 'app' | 'other'
export type Device = 'mobile' | 'tablet' | 'desktop'

const APP_PREFIXES = ['/dashboard', '/editor', '/data', '/taxonomies', '/scraping-templates', '/workflows', '/login', '/onboarding']
const BOT_RE = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|headless|lighthouse|pingdom|monitor/i

export function deriveArea(path: string): Area {
  if (path === '/promo' || path.startsWith('/promo/')) return 'promo'
  if (path === '/docs' || path.startsWith('/docs/')) return 'docs'
  if (APP_PREFIXES.some((p) => path === p || path.startsWith(p + '/'))) return 'app'
  return 'other'
}

export function deriveDevice(ua: string): Device {
  if (/ipad|tablet|(android(?!.*mobile))/i.test(ua)) return 'tablet'
  if (/mobi|iphone|ipod|android.*mobile|windows phone/i.test(ua)) return 'mobile'
  return 'desktop'
}

export function normalizeRef(referrer: string | undefined): string | null {
  if (!referrer) return null
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, '')
    return host || null
  } catch {
    return null
  }
}

export function isBot(ua: string): boolean {
  return !ua || BOT_RE.test(ua)
}

export interface EventInput {
  path: string
  ref: string | null
  src: string | null
  vid: string
  sid: string
  uid: string | null
}

export function buildEventDoc(
  body: unknown,
  headers: { ua: string; referer: string | undefined; country: string | null },
): (EventInput & { area: Area; device: Device; country: string | null }) | null {
  if (isBot(headers.ua)) return null
  const b = (body ?? {}) as Record<string, unknown>
  const path = typeof b.path === 'string' ? b.path : null
  const vid = typeof b.vid === 'string' ? b.vid : null
  const sid = typeof b.sid === 'string' ? b.sid : null
  if (!path || !path.startsWith('/') || !vid || !sid) return null
  return {
    path: path.slice(0, 300),
    area: deriveArea(path),
    ref: normalizeRef(headers.referer),
    src: typeof b.src === 'string' ? b.src.slice(0, 120) : null,
    device: deriveDevice(headers.ua),
    country: headers.country,
    vid: vid.slice(0, 60),
    sid: sid.slice(0, 60),
    uid: typeof b.uid === 'string' ? b.uid : null,
  }
}
```

- [ ] **Step 4: Lancer les tests (doivent passer)**

Run: `cd functions && npx vitest run src/analytics/derive.test.ts`
Expected: PASS (tous les `describe`).

- [ ] **Step 5: Commit**

```bash
git add functions/src/analytics/derive.ts functions/src/analytics/derive.test.ts
git commit -m "feat(analytics): helpers serveur de dérivation (area/device/ref/bot)"
```

---

### Task 2: Cloud Function `collectAnalytics` (HTTP)

Wrapper mince autour de `buildEventDoc` : reçoit le beacon, écrit l'event via Admin SDK, répond 204 sans bloquer.

**Files:**
- Create: `functions/src/analytics/collectAnalytics.ts`

**Interfaces:**
- Consumes: `buildEventDoc` (Task 1).
- Produces: `export const collectAnalytics` (onRequest). Écrit dans `analyticsEvents` un doc `{ ...buildEventDoc(...), ts: FieldValue.serverTimestamp() }`.

- [ ] **Step 1: Implémenter la fonction**

Note : pas de test unitaire ici (toute la logique testable est dans `buildEventDoc`). Vérification = smoke `curl` à l'étape 3.

```ts
// functions/src/analytics/collectAnalytics.ts
import { onRequest } from 'firebase-functions/v2/https'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getApps, initializeApp } from 'firebase-admin/app'
import { buildEventDoc } from './derive'

if (!getApps().length) initializeApp()
const db = getFirestore()

export const collectAnalytics = onRequest(
  { region: 'europe-west1', maxInstances: 10, timeoutSeconds: 10, cors: true },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).end()
      return
    }
    const country =
      (req.headers['x-appengine-country'] as string | undefined) ??
      (req.headers['x-country-code'] as string | undefined) ??
      null
    const doc = buildEventDoc(req.body, {
      ua: (req.headers['user-agent'] as string) ?? '',
      referer: req.headers['referer'] as string | undefined,
      country: country && country !== 'ZZ' ? country : null,
    })
    if (!doc) {
      res.status(204).end()
      return
    }
    try {
      await db.collection('analyticsEvents').add({ ...doc, ts: FieldValue.serverTimestamp() })
    } catch {
      // best-effort : on n'expose jamais d'erreur au visiteur
    }
    res.status(204).end()
  },
)
```

- [ ] **Step 2: Vérifier les types des fonctions**

Run: `cd functions && npx tsc`
Expected: aucune erreur.

- [ ] **Step 3: Smoke local (émulateur)**

Run (terminal A) : `cd functions && npm run build && firebase emulators:start --only functions,firestore`
Run (terminal B) :
```bash
curl -i -X POST "http://127.0.0.1:5001/web2print-6fe5a/europe-west1/collectAnalytics" \
  -H "Content-Type: application/json" -H "User-Agent: Mozilla/5.0 (iPhone)" \
  -d '{"path":"/promo","vid":"v-test","sid":"s-test","src":null}'
```
Expected: `HTTP/1.1 204`. Vérifier dans l'UI émulateur Firestore qu'un doc est apparu dans `analyticsEvents` avec `area:"promo"`, `device:"mobile"`, `ts` renseigné.

- [ ] **Step 4: Commit**

```bash
git add functions/src/analytics/collectAnalytics.ts
git commit -m "feat(analytics): Cloud Function collectAnalytics (beacon HTTP → Firestore)"
```

---

### Task 3: Câblage déploiement (export, rewrite Hosting, règles Firestore)

Expose la CF, la rend same-origin, et verrouille la collection.

**Files:**
- Modify: `functions/src/index.ts` (ajout d'un export)
- Modify: `firebase.json` (rewrite Hosting AVANT le catch-all `**`)
- Modify: `firestore.rules` (bloc `analyticsEvents`)

**Interfaces:**
- Consumes: `collectAnalytics` (Task 2).
- Produces: endpoint same-origin `POST /_w2p/collect` ; collection `analyticsEvents` lisible owner-only.

- [ ] **Step 1: Exporter la fonction**

Dans `functions/src/index.ts`, ajouter (à la suite des autres exports) :

```ts
// --- Analytics de trafic : beacon entrant + purge ---
export { collectAnalytics } from './analytics/collectAnalytics'
```

- [ ] **Step 2: Ajouter la réécriture Hosting same-origin**

Dans `firebase.json`, dans `hosting.rewrites`, insérer cet objet **en première position** (avant `{ "source": "**", "destination": "/_app.html" }`) :

```json
{
  "source": "/_w2p/collect",
  "function": { "functionId": "collectAnalytics", "region": "europe-west1" }
}
```

Résultat attendu du tableau `rewrites` :
```json
"rewrites": [
  { "source": "/_w2p/collect", "function": { "functionId": "collectAnalytics", "region": "europe-west1" } },
  { "source": "**", "destination": "/_app.html" }
]
```

- [ ] **Step 3: Verrouiller la collection dans les règles**

Dans `firestore.rules`, juste après le bloc `match /auditLog/{logId} { ... }` (vers la ligne 511), ajouter :

```
    // ── Analytics de trafic (pages vues) ───────────────────────
    // Écriture UNIQUEMENT via la Cloud Function (Admin SDK contourne ces règles).
    // Lecture réservée à l'owner (dashboard analytics).
    match /analyticsEvents/{eventId} {
      allow read:   if isAdmin();
      allow create: if false;
      allow update: if false;
      allow delete: if false;
    }
```

- [ ] **Step 4: Vérifier la syntaxe des règles**

Run: `firebase deploy --only firestore:rules --dry-run` (ou `firebase emulators:start --only firestore` qui échoue si les règles sont invalides).
Expected: pas d'erreur de compilation des règles.

- [ ] **Step 5: Commit**

```bash
git add functions/src/index.ts firebase.json firestore.rules
git commit -m "chore(analytics): export CF, rewrite same-origin /_w2p/collect, règles owner-only"
```

---

### Task 4: Module d'agrégation client (pur) — cœur testable

Transforme une liste d'events en toutes les métriques du dashboard. Aucune dépendance React/Firebase.

**Files:**
- Create: `src/features/analytics/metrics.ts`
- Test: `src/features/analytics/metrics.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces:
  - `type Area = 'promo' | 'docs' | 'app' | 'other'`
  - `type Device = 'mobile' | 'tablet' | 'desktop'`
  - `interface AnalyticsEvent { ts: number; path: string; area: Area; ref: string | null; src: string | null; device: Device; country: string | null; vid: string; sid: string; uid: string | null }`
  - `interface Kpis { pageViews: number; visitors: number; sessions: number; avgSessionMs: number; bounceRate: number }`
  - `computeKpis(events: AnalyticsEvent[]): Kpis`
  - `topBy(events: AnalyticsEvent[], field: 'path' | 'src' | 'country' | 'device', limit: number): { label: string; count: number }[]`
  - `timeSeries(events: AnalyticsEvent[], fromMs: number, toMs: number): { day: string; pageViews: number; visitors: number }[]`
  - `deltaPct(current: number, previous: number): number | null`

- [ ] **Step 1: Écrire les tests qui échouent**

```ts
// src/features/analytics/metrics.test.ts
import { describe, it, expect } from 'vitest'
import { computeKpis, topBy, timeSeries, deltaPct, type AnalyticsEvent } from './metrics'

const ev = (o: Partial<AnalyticsEvent>): AnalyticsEvent => ({
  ts: 0, path: '/promo', area: 'promo', ref: null, src: null,
  device: 'desktop', country: 'FR', vid: 'v1', sid: 's1', uid: null, ...o,
})

describe('computeKpis', () => {
  it('compte pages vues, visiteurs et sessions distincts', () => {
    const k = computeKpis([
      ev({ vid: 'a', sid: 's1', ts: 1000 }),
      ev({ vid: 'a', sid: 's1', ts: 5000 }),
      ev({ vid: 'b', sid: 's2', ts: 2000 }),
    ])
    expect(k.pageViews).toBe(3)
    expect(k.visitors).toBe(2)
    expect(k.sessions).toBe(2)
  })
  it('durée moyenne = écart 1er/dernier event par session', () => {
    const k = computeKpis([ev({ sid: 's1', ts: 0 }), ev({ sid: 's1', ts: 4000 })])
    expect(k.avgSessionMs).toBe(4000)
  })
  it('taux de rebond = part des sessions à 1 page vue', () => {
    const k = computeKpis([
      ev({ sid: 's1', ts: 0 }),
      ev({ sid: 's2', ts: 0 }), ev({ sid: 's2', ts: 1000 }),
    ])
    expect(k.bounceRate).toBeCloseTo(0.5)
  })
  it('jeu vide → zéros sans crash', () => {
    expect(computeKpis([])).toEqual({ pageViews: 0, visitors: 0, sessions: 0, avgSessionMs: 0, bounceRate: 0 })
  })
})

describe('topBy', () => {
  it('agrège et trie décroissant', () => {
    const top = topBy([ev({ path: '/a' }), ev({ path: '/a' }), ev({ path: '/b' })], 'path', 10)
    expect(top[0]).toEqual({ label: '/a', count: 2 })
    expect(top[1]).toEqual({ label: '/b', count: 1 })
  })
  it('ignore les valeurs nulles et applique la limite', () => {
    const top = topBy([ev({ src: null }), ev({ src: 'google.com' })], 'src', 1)
    expect(top).toEqual([{ label: 'google.com', count: 1 }])
  })
})

describe('timeSeries', () => {
  it('un point par jour avec pages vues et visiteurs', () => {
    const day = 86_400_000
    const ts = timeSeries(
      [ev({ ts: 0, vid: 'a' }), ev({ ts: 1000, vid: 'b' }), ev({ ts: day, vid: 'a' })],
      0, day,
    )
    expect(ts).toHaveLength(2)
    expect(ts[0]).toMatchObject({ pageViews: 2, visitors: 2 })
    expect(ts[1]).toMatchObject({ pageViews: 1, visitors: 1 })
  })
})

describe('deltaPct', () => {
  it('calcule la variation', () => expect(deltaPct(150, 100)).toBe(50))
  it('null si base 0', () => expect(deltaPct(5, 0)).toBeNull())
})
```

- [ ] **Step 2: Lancer les tests (doivent échouer)**

Run: `npx vitest run src/features/analytics/metrics.test.ts`
Expected: FAIL — `metrics.ts` introuvable.

- [ ] **Step 3: Implémenter le module**

```ts
// src/features/analytics/metrics.ts
export type Area = 'promo' | 'docs' | 'app' | 'other'
export type Device = 'mobile' | 'tablet' | 'desktop'

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
```

- [ ] **Step 4: Lancer les tests (doivent passer)**

Run: `npx vitest run src/features/analytics/metrics.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/analytics/metrics.ts src/features/analytics/metrics.test.ts
git commit -m "feat(analytics): module pur d'agrégation (KPIs, top, série temporelle)"
```

---

### Task 5: Beacon vanilla + pont uid + injection dans les 3 entrées HTML

Un seul script vanilla envoie les pages vues depuis la SPA et les pages statiques. Il patche `history` pour capter la navigation SPA.

**Files:**
- Create: `public/analytics-beacon.js`
- Create: `src/features/analytics/uidBridge.ts`
- Modify: `src/main.tsx` (import du pont uid)
- Modify: `index.html` (shell SPA — balise script)
- Modify: `public/promo/index.html` (balise script)
- Modify: `public/docs/index.html` (balise script)

**Interfaces:**
- Consumes: endpoint `POST /_w2p/collect` (Task 3).
- Produces: pages vues envoyées avec `{ path, vid, sid, src, uid }`. Lit `window.__w2pAnalyticsUid` (posé par `uidBridge`).

- [ ] **Step 1: Écrire le beacon vanilla**

```js
// public/analytics-beacon.js
// Beacon analytics maison — sans cookie, sans dépendance. Voir docs/superpowers/specs.
(function () {
  var ENDPOINT = '/_w2p/collect'
  var SESSION_TTL = 30 * 60 * 1000 // 30 min d'inactivité

  function rand() {
    return (Date.now().toString(36) + Math.random().toString(36).slice(2, 10))
  }
  function visitorId() {
    try {
      var v = localStorage.getItem('w2p_vid')
      if (!v) { v = rand(); localStorage.setItem('w2p_vid', v) }
      return v
    } catch (e) { return rand() }
  }
  function sessionId() {
    try {
      var now = Date.now()
      var sid = sessionStorage.getItem('w2p_sid')
      var last = parseInt(sessionStorage.getItem('w2p_sid_ts') || '0', 10)
      if (!sid || now - last > SESSION_TTL) { sid = rand() }
      sessionStorage.setItem('w2p_sid', sid)
      sessionStorage.setItem('w2p_sid_ts', String(now))
      return sid
    } catch (e) { return rand() }
  }
  function utmSource() {
    try {
      var p = new URLSearchParams(location.search).get('utm_source')
      return p ? p.slice(0, 120) : null
    } catch (e) { return null }
  }
  function send() {
    try {
      var payload = JSON.stringify({
        path: location.pathname,
        vid: visitorId(),
        sid: sessionId(),
        src: utmSource(),
        uid: window.__w2pAnalyticsUid || null,
      })
      var blob = new Blob([payload], { type: 'application/json' })
      if (navigator.sendBeacon) navigator.sendBeacon(ENDPOINT, blob)
      else fetch(ENDPOINT, { method: 'POST', body: payload, headers: { 'Content-Type': 'application/json' }, keepalive: true })
    } catch (e) { /* best-effort */ }
  }

  // Page vue initiale
  send()

  // Navigation SPA : patcher history + popstate
  var push = history.pushState
  history.pushState = function () { push.apply(this, arguments); send() }
  var replace = history.replaceState
  history.replaceState = function () { replace.apply(this, arguments); send() }
  window.addEventListener('popstate', send)
})()
```

- [ ] **Step 2: Écrire le pont uid (SPA)**

```ts
// src/features/analytics/uidBridge.ts
// Expose l'uid Firebase au beacon vanilla (public/analytics-beacon.js).
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase/config'

declare global {
  interface Window {
    __w2pAnalyticsUid?: string | null
  }
}

export function initAnalyticsUidBridge(): void {
  onAuthStateChanged(auth, (user) => {
    window.__w2pAnalyticsUid = user?.uid ?? null
  })
}
```

- [ ] **Step 3: Initialiser le pont dans `src/main.tsx`**

Ajouter l'import en haut puis l'appel avant le rendu React. Exemple de `main.tsx` après modification (adapter aux lignes existantes) :

```tsx
import { initAnalyticsUidBridge } from '@/features/analytics/uidBridge'
// ... autres imports existants ...

initAnalyticsUidBridge()

// ... ReactDOM.createRoot(...).render(...) existant inchangé ...
```

- [ ] **Step 4: Injecter le script dans le shell SPA `index.html`**

Juste avant `</head>` (le `</head>` du shell SPA), ajouter :

```html
    <script src="/analytics-beacon.js" defer></script>
```

- [ ] **Step 5: Injecter le script dans `public/promo/index.html`**

Avant `</head>` (ligne 1349), ajouter la même balise :

```html
<script src="/analytics-beacon.js" defer></script>
```

- [ ] **Step 6: Injecter le script dans `public/docs/index.html`**

Avant `</head>` (ligne 33), ajouter :

```html
  <script src="/analytics-beacon.js" defer></script>
```

- [ ] **Step 7: Vérifier types + build**

Run: `npx tsc -b && npm run build`
Expected: build OK, `dist/analytics-beacon.js` présent (copié depuis `public/`).

- [ ] **Step 8: Vérification manuelle (émulateurs + dev)**

Run: `npm run dev` avec les émulateurs Functions/Firestore actifs (cf. Task 2). Ouvrir l'app, naviguer entre 2-3 routes, ouvrir l'onglet réseau : confirmer des requêtes `POST /_w2p/collect` (status 204) à chaque changement de page. Vérifier l'apparition des docs dans `analyticsEvents`.
Note : si l'émulateur Hosting n'est pas lancé, le rewrite `/_w2p/collect` n'existe pas en dev — tester alors en pointant temporairement `ENDPOINT` vers l'URL directe de la fonction émulateur, ou valider ce point après déploiement (Task 9 / déploiement final).

- [ ] **Step 9: Commit**

```bash
git add public/analytics-beacon.js src/features/analytics/uidBridge.ts src/main.tsx index.html public/promo/index.html public/docs/index.html
git commit -m "feat(analytics): beacon vanilla unifié (SPA + promo + docs) + pont uid"
```

---

### Task 6: Hook de lecture des events (React Query, owner-only)

**Files:**
- Create: `src/features/analytics/useAnalyticsEvents.ts`

**Interfaces:**
- Consumes: collection Firestore `analyticsEvents` ; type `AnalyticsEvent` (Task 4).
- Produces: `useAnalyticsEvents(fromMs: number, toMs: number, enabled: boolean): UseQueryResult<AnalyticsEvent[]>` — events mappés (`ts` en ms), triés croissants.

- [ ] **Step 1: Implémenter le hook**

```ts
// src/features/analytics/useAnalyticsEvents.ts
import { useQuery } from '@tanstack/react-query'
import { collection, getDocs, query, where, orderBy, Timestamp, type DocumentData } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { AnalyticsEvent } from './metrics'

function mapDoc(d: DocumentData): AnalyticsEvent {
  return {
    ts: (d.ts as Timestamp | undefined)?.toMillis() ?? 0,
    path: d.path ?? '/',
    area: d.area ?? 'other',
    ref: d.ref ?? null,
    src: d.src ?? null,
    device: d.device ?? 'desktop',
    country: d.country ?? null,
    vid: d.vid ?? '',
    sid: d.sid ?? '',
    uid: d.uid ?? null,
  }
}

export function useAnalyticsEvents(fromMs: number, toMs: number, enabled: boolean) {
  return useQuery({
    queryKey: ['analyticsEvents', fromMs, toMs],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<AnalyticsEvent[]> => {
      const snap = await getDocs(
        query(
          collection(db, 'analyticsEvents'),
          where('ts', '>=', Timestamp.fromMillis(fromMs)),
          where('ts', '<=', Timestamp.fromMillis(toMs)),
          orderBy('ts', 'asc'),
        ),
      )
      return snap.docs.map((s) => mapDoc(s.data()))
    },
  })
}
```

- [ ] **Step 2: Vérifier les types**

Run: `npx tsc -b`
Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add src/features/analytics/useAnalyticsEvents.ts
git commit -m "feat(analytics): hook de lecture des events par plage de dates"
```

---

### Task 7: Export CSV de la plage

**Files:**
- Create: `src/features/analytics/exportCsv.ts`
- Test: `src/features/analytics/exportCsv.test.ts`

**Interfaces:**
- Consumes: `AnalyticsEvent` (Task 4), `xlsx`.
- Produces: `eventsToCsv(events: AnalyticsEvent[]): string` (pur, testable) ; `downloadEventsCsv(events: AnalyticsEvent[], filename: string): void` (effet de bord navigateur).

- [ ] **Step 1: Écrire le test qui échoue**

```ts
// src/features/analytics/exportCsv.test.ts
import { describe, it, expect } from 'vitest'
import { eventsToCsv } from './exportCsv'
import type { AnalyticsEvent } from './metrics'

const ev: AnalyticsEvent = {
  ts: 0, path: '/promo', area: 'promo', ref: 'google.com', src: null,
  device: 'mobile', country: 'FR', vid: 'v1', sid: 's1', uid: null,
}

describe('eventsToCsv', () => {
  it('produit un en-tête et une ligne par event', () => {
    const csv = eventsToCsv([ev])
    const lines = csv.trim().split('\n')
    expect(lines[0]).toContain('path')
    expect(lines).toHaveLength(2)
    expect(lines[1]).toContain('/promo')
  })
})
```

- [ ] **Step 2: Lancer le test (doit échouer)**

Run: `npx vitest run src/features/analytics/exportCsv.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Implémenter**

```ts
// src/features/analytics/exportCsv.ts
import * as XLSX from 'xlsx'
import type { AnalyticsEvent } from './metrics'

function rows(events: AnalyticsEvent[]) {
  return events.map((e) => ({
    date: new Date(e.ts).toISOString(),
    path: e.path,
    area: e.area,
    source: e.src ?? e.ref ?? '',
    device: e.device,
    country: e.country ?? '',
    visitor: e.vid,
    session: e.sid,
    uid: e.uid ?? '',
  }))
}

export function eventsToCsv(events: AnalyticsEvent[]): string {
  const ws = XLSX.utils.json_to_sheet(rows(events))
  return XLSX.utils.sheet_to_csv(ws)
}

export function downloadEventsCsv(events: AnalyticsEvent[], filename: string): void {
  const csv = eventsToCsv(events)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
```

- [ ] **Step 4: Lancer le test (doit passer)**

Run: `npx vitest run src/features/analytics/exportCsv.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/analytics/exportCsv.ts src/features/analytics/exportCsv.test.ts
git commit -m "feat(analytics): export CSV de la plage d'events"
```

---

### Task 8: Écran « Analytics » + intégration dans la page admin

Onglet owner-only à côté du Journal d'audit. Découpé en sous-composants ≤ 150 lignes.

**Files:**
- Create: `src/features/analytics/admin/AnalyticsTab.tsx` (conteneur : barre période + assemblage)
- Create: `src/features/analytics/admin/AnalyticsKpiCards.tsx`
- Create: `src/features/analytics/admin/AnalyticsTimeChart.tsx`
- Create: `src/features/analytics/admin/AnalyticsTopLists.tsx`
- Create: `src/features/analytics/admin/AnalyticsRecent.tsx`
- Create: `src/features/analytics/usePeriod.ts` (état période → `{ fromMs, toMs, prevFromMs, prevToMs }`)
- Modify: `src/features/access/admin/AccessAdminPage.tsx` (ajout onglet `analytics`)

**Interfaces:**
- Consumes: `useAnalyticsEvents` (Task 6), `computeKpis`/`topBy`/`timeSeries`/`deltaPct` (Task 4), `downloadEventsCsv` (Task 7), `useThemeStore` (`resolvedTheme`), `react-chartjs-2`.
- Produces: `export function AnalyticsTab()` ; `usePeriod()`.

- [ ] **Step 1: Hook de période**

```ts
// src/features/analytics/usePeriod.ts
import { useMemo, useState } from 'react'

export type PeriodKey = '7d' | '30d' | '90d' | '12m'
const DAY = 86_400_000
const SPAN: Record<PeriodKey, number> = { '7d': 7 * DAY, '30d': 30 * DAY, '90d': 90 * DAY, '12m': 365 * DAY }

export function usePeriod(initial: PeriodKey = '30d') {
  const [period, setPeriod] = useState<PeriodKey>(initial)
  const range = useMemo(() => {
    const toMs = Date.now()
    const span = SPAN[period]
    return { fromMs: toMs - span, toMs, prevFromMs: toMs - 2 * span, prevToMs: toMs - span }
  }, [period])
  return { period, setPeriod, ...range }
}
```

- [ ] **Step 2: Cartes KPI**

```tsx
// src/features/analytics/admin/AnalyticsKpiCards.tsx
import { type Kpis, deltaPct } from '../metrics'

function Delta({ cur, prev }: { cur: number; prev: number }) {
  const d = deltaPct(cur, prev)
  if (d === null) return <span className="text-white/40 text-xs">—</span>
  const up = d >= 0
  return <span className={`text-xs ${up ? 'text-emerald-400' : 'text-rose-400'}`}>{up ? '+' : ''}{d}%</span>
}

const CARDS: { key: keyof Kpis; label: string; fmt?: (n: number) => string }[] = [
  { key: 'pageViews', label: 'Pages vues' },
  { key: 'visitors', label: 'Visiteurs uniques' },
  { key: 'sessions', label: 'Sessions' },
  { key: 'avgSessionMs', label: 'Durée moy. session', fmt: (n) => `${Math.round(n / 1000)} s` },
]

export function AnalyticsKpiCards({ cur, prev }: { cur: Kpis; prev: Kpis }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {CARDS.map((c) => (
        <div key={c.key} className="bg-surface rounded-lg p-4">
          <div className="text-white/50 text-xs">{c.label}</div>
          <div className="text-2xl font-semibold text-white mt-1">
            {c.fmt ? c.fmt(cur[c.key]) : cur[c.key].toLocaleString('fr-FR')}
          </div>
          <Delta cur={cur[c.key]} prev={prev[c.key]} />
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Graphe temporel (chart.js, thème-aware)**

```tsx
// src/features/analytics/admin/AnalyticsTimeChart.tsx
import { Line } from 'react-chartjs-2'
import {
  Chart, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler,
} from 'chart.js'
import { useThemeStore } from '@/stores/theme.store'

Chart.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler)

export function AnalyticsTimeChart({ series }: { series: { day: string; pageViews: number; visitors: number }[] }) {
  const isLight = useThemeStore((s) => s.resolvedTheme === 'light')
  const grid = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'
  const tick = isLight ? '#475569' : 'rgba(255,255,255,0.55)'
  const data = {
    labels: series.map((p) => p.day.slice(5)),
    datasets: [
      { label: 'Pages vues', data: series.map((p) => p.pageViews), borderColor: '#6366f1', backgroundColor: '#6366f155', fill: true, tension: 0.3 },
      { label: 'Visiteurs', data: series.map((p) => p.visitors), borderColor: '#22d3ee', backgroundColor: 'transparent', tension: 0.3 },
    ],
  }
  const options = {
    responsive: true, maintainAspectRatio: false, animation: false as const,
    plugins: { legend: { labels: { color: tick } } },
    scales: { x: { grid: { color: grid }, ticks: { color: tick } }, y: { grid: { color: grid }, ticks: { color: tick }, beginAtZero: true } },
  }
  return <div className="h-64 bg-surface rounded-lg p-4"><Line data={data} options={options} /></div>
}
```

- [ ] **Step 4: Top listes (pages / sources / pays / device)**

```tsx
// src/features/analytics/admin/AnalyticsTopLists.tsx
import { topBy, type AnalyticsEvent } from '../metrics'

function List({ title, rows }: { title: string; rows: { label: string; count: number }[] }) {
  const max = rows[0]?.count ?? 1
  return (
    <div className="bg-surface rounded-lg p-4">
      <div className="text-white/70 text-sm font-medium mb-3">{title}</div>
      <div className="space-y-2">
        {rows.length === 0 && <div className="text-white/35 text-xs">Aucune donnée</div>}
        {rows.map((r) => (
          <div key={r.label} className="relative">
            <div className="absolute inset-0 bg-indigo-500/15 rounded" style={{ width: `${(r.count / max) * 100}%` }} />
            <div className="relative flex justify-between text-xs px-2 py-1">
              <span className="text-white/80 truncate">{r.label}</span>
              <span className="text-white/50">{r.count}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function AnalyticsTopLists({ events }: { events: AnalyticsEvent[] }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
      <List title="Top pages" rows={topBy(events, 'path', 8)} />
      <List title="Sources de trafic" rows={topBy(events, 'src', 8)} />
      <List title="Pays" rows={topBy(events, 'country', 8)} />
    </div>
  )
}
```

- [ ] **Step 5: Activité récente**

```tsx
// src/features/analytics/admin/AnalyticsRecent.tsx
import type { AnalyticsEvent } from '../metrics'

export function AnalyticsRecent({ events }: { events: AnalyticsEvent[] }) {
  const recent = [...events].sort((a, b) => b.ts - a.ts).slice(0, 20)
  return (
    <div className="bg-surface rounded-lg p-4">
      <div className="text-white/70 text-sm font-medium mb-3">Activité récente</div>
      <div className="space-y-1 max-h-64 overflow-auto">
        {recent.map((e, i) => (
          <div key={i} className="flex justify-between text-xs text-white/70 py-1 border-b border-white/5">
            <span className="truncate">{e.path}</span>
            <span className="text-white/40 shrink-0 ml-2">
              {e.device} · {e.country ?? '—'} · {new Date(e.ts).toLocaleTimeString('fr-FR')}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Conteneur `AnalyticsTab`**

```tsx
// src/features/analytics/admin/AnalyticsTab.tsx
import { useMemo } from 'react'
import { Download } from 'lucide-react'
import { useAnalyticsEvents } from '../useAnalyticsEvents'
import { usePeriod, type PeriodKey } from '../usePeriod'
import { computeKpis } from '../metrics'
import { timeSeries } from '../metrics'
import { downloadEventsCsv } from '../exportCsv'
import { AnalyticsKpiCards } from './AnalyticsKpiCards'
import { AnalyticsTimeChart } from './AnalyticsTimeChart'
import { AnalyticsTopLists } from './AnalyticsTopLists'
import { AnalyticsRecent } from './AnalyticsRecent'

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: '7d', label: '7 j' }, { key: '30d', label: '30 j' }, { key: '90d', label: '90 j' }, { key: '12m', label: '12 mois' },
]

export function AnalyticsTab() {
  const { period, setPeriod, fromMs, toMs, prevFromMs, prevToMs } = usePeriod('30d')
  const cur = useAnalyticsEvents(fromMs, toMs, true)
  const prev = useAnalyticsEvents(prevFromMs, prevToMs, true)
  const events = cur.data ?? []
  const kpis = useMemo(() => computeKpis(events), [events])
  const prevKpis = useMemo(() => computeKpis(prev.data ?? []), [prev.data])
  const series = useMemo(() => timeSeries(events, fromMs, toMs), [events, fromMs, toMs])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 rounded text-sm ${period === p.key ? 'bg-white/[0.08] text-white' : 'text-white/45 hover:text-white/70'}`}>
              {p.label}
            </button>
          ))}
        </div>
        <button onClick={() => downloadEventsCsv(events, `analytics-${period}.csv`)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm text-white/70 hover:text-white bg-surface-2">
          <Download className="w-4 h-4" /> CSV
        </button>
      </div>
      {cur.isLoading ? (
        <div className="text-white/40 text-sm py-12 text-center">Chargement…</div>
      ) : events.length === 0 ? (
        <div className="text-white/40 text-sm py-12 text-center">Aucune donnée de trafic sur cette période.</div>
      ) : (
        <>
          <AnalyticsKpiCards cur={kpis} prev={prevKpis} />
          <AnalyticsTimeChart series={series} />
          <AnalyticsTopLists events={events} />
          <AnalyticsRecent events={events} />
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 7: Ajouter l'onglet dans `AccessAdminPage.tsx`**

Importer le composant et l'icône, étendre le type de `tab`, ajouter l'entrée de nav et le rendu conditionnel. Modifications dans `src/features/access/admin/AccessAdminPage.tsx` :

```tsx
// en tête
import { BarChart3 } from 'lucide-react'
import { AnalyticsTab } from '@/features/analytics/admin/AnalyticsTab'

// type d'état
const [tab, setTab] = useState<'users' | 'roles' | 'audit' | 'analytics'>('users')

// tableau de nav : ajouter l'entrée
// ['analytics', 'Analytics', BarChart3]

// rendu conditionnel : ajouter la branche
// tab === 'analytics' ? <AnalyticsTab /> : ...
```

Adapter exactement à la structure existante (le `.map(...)` des onglets et la chaîne de ternaires de rendu).

- [ ] **Step 8: Vérifier types, lint, build**

Run: `npx tsc -b && npm run lint && npm run build`
Expected: 0 erreur de type, lint sans erreur bloquante, build OK.

- [ ] **Step 9: Vérifier l'absence de code mort**

Run: `npx knip`
Expected: exit 0. (Si knip signale un export inutilisé, le retirer — un symbole utilisé seulement dans son fichier ne doit pas être exporté.)

- [ ] **Step 10: Commit**

```bash
git add src/features/analytics/ src/features/access/admin/AccessAdminPage.tsx
git commit -m "feat(analytics): onglet Analytics (KPIs, graphe, top listes, activité, CSV)"
```

---

### Task 9: Fonction de purge planifiée (rétention 13 mois)

**Files:**
- Create: `functions/src/analytics/purgeAnalytics.ts`
- Create: `functions/src/analytics/retention.ts` (prédicat pur testable)
- Test: `functions/src/analytics/retention.test.ts`
- Modify: `functions/src/index.ts` (export)

**Interfaces:**
- Consumes: collection `analyticsEvents`.
- Produces: `cutoffMs(nowMs: number): number` (pur) ; `export const purgeAnalytics` (onSchedule).

- [ ] **Step 1: Écrire le test du prédicat**

```ts
// functions/src/analytics/retention.test.ts
import { describe, it, expect } from 'vitest'
import { cutoffMs } from './retention'

describe('cutoffMs', () => {
  it('coupe ~13 mois avant maintenant', () => {
    const now = Date.UTC(2026, 5, 28)
    const cut = cutoffMs(now)
    expect(cut).toBeLessThan(now)
    // ~13 mois ≈ 395 jours
    expect(Math.round((now - cut) / 86_400_000)).toBeGreaterThanOrEqual(390)
    expect(Math.round((now - cut) / 86_400_000)).toBeLessThanOrEqual(400)
  })
})
```

- [ ] **Step 2: Lancer le test (doit échouer)**

Run: `cd functions && npx vitest run src/analytics/retention.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Implémenter le prédicat puis la fonction**

```ts
// functions/src/analytics/retention.ts
const DAY = 86_400_000
export function cutoffMs(nowMs: number): number {
  return nowMs - 395 * DAY // ~13 mois
}
```

```ts
// functions/src/analytics/purgeAnalytics.ts
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { getApps, initializeApp } from 'firebase-admin/app'
import { cutoffMs } from './retention'

if (!getApps().length) initializeApp()
const db = getFirestore()

export const purgeAnalytics = onSchedule(
  { schedule: 'every day 03:00', timeZone: 'Europe/Paris', region: 'europe-west1' },
  async () => {
    const cut = Timestamp.fromMillis(cutoffMs(Date.now()))
    let deleted = 0
    // Suppression par lots de 400
    for (;;) {
      const snap = await db.collection('analyticsEvents').where('ts', '<', cut).limit(400).get()
      if (snap.empty) break
      const batch = db.batch()
      snap.docs.forEach((d) => batch.delete(d.ref))
      await batch.commit()
      deleted += snap.size
      if (snap.size < 400) break
    }
    console.log(`[purgeAnalytics] supprimés: ${deleted}`)
  },
)
```

- [ ] **Step 4: Lancer le test (doit passer) + types**

Run: `cd functions && npx vitest run src/analytics/retention.test.ts && npx tsc`
Expected: PASS + 0 erreur de type.

- [ ] **Step 5: Exporter la fonction**

Dans `functions/src/index.ts`, compléter la ligne d'export analytics :

```ts
export { collectAnalytics } from './analytics/collectAnalytics'
export { purgeAnalytics } from './analytics/purgeAnalytics'
```

- [ ] **Step 6: Commit**

```bash
git add functions/src/analytics/purgeAnalytics.ts functions/src/analytics/retention.ts functions/src/analytics/retention.test.ts functions/src/index.ts
git commit -m "feat(analytics): purge planifiée des events > 13 mois"
```

---

### Task 10: Déploiement & vérification de bout en bout

**Files:** aucun (déploiement).

- [ ] **Step 1: Vérification globale**

Run: `npx tsc -b && npm run test:run && (cd functions && npx tsc) && npm run build`
Expected: tout vert.

- [ ] **Step 2: Déployer fonctions, règles, hosting**

Run:
```bash
firebase deploy --only functions:collectAnalytics,functions:purgeAnalytics,firestore:rules
npm run build
firebase deploy --only hosting
```
(Build hosting via `.env.production.local` conformément à la convention de déploiement prod.)

- [ ] **Step 3: Vérification de bout en bout en production**

- Ouvrir https://ibs-studio.com/promo/ → onglet réseau : `POST /_w2p/collect` = 204.
- Ouvrir https://ibs-studio.com/docs/ → idem.
- Se connecter à l'app, naviguer entre 2 routes → un POST par changement de route, `uid` renseigné dans le doc Firestore.
- Ouvrir l'admin → onglet **Analytics** : les KPI, le graphe et les top listes se remplissent.
- Cliquer **CSV** → fichier téléchargé non vide.

- [ ] **Step 4: Commit éventuel de config**

Si des fichiers de config ont changé (ex. `firestore.indexes.json`), les committer :
```bash
git add -A && git commit -m "chore(analytics): config déploiement"
```

---

## Self-Review

**Spec coverage :**
- Tracker SPA + snippet statique → Task 5 (beacon unifié, plus simple qu'un hook React Router compte tenu du routeur plat). ✓
- CF `collectAnalytics` (bots, géo, anti-PII) → Tasks 1+2. ✓
- Collection `analyticsEvents` + règles owner-only/no-write → Task 3. ✓
- Purge 13 mois → Task 9. ✓
- Métriques (visiteurs, sessions, rebond, durée, top, série) → Task 4. ✓
- Écran (période, KPI Δ%, graphe, top pages/sources/pays, activité, CSV) → Tasks 6/7/8. ✓
- RGPD sans cookie, id localStorage, pas d'IP → Task 5 (vid/sid) + Task 2 (pas d'IP stockée). ✓
- On compte tout (owner inclus) → aucun filtre uid/owner ajouté. ✓
- Same-origin (pas de CORS) → rewrite Task 3 (amélioration vs spec, conforme à l'intention). ✓
- Device donut mentionné dans la spec : simplifié en top liste device disponible via `topBy(..., 'device')` ; le donut séparé est YAGNI pour le MVP (les données restent exportables/affichables). Écart mineur assumé.

**Placeholders :** aucun TODO/TBD ; tout le code des modules purs et tests est complet. Les 2 points « adapter à la structure existante » (main.tsx Step 3, AccessAdminPage Step 7) pointent des fichiers précis avec le diff exact à appliquer.

**Cohérence des types :** `AnalyticsEvent`, `Area`, `Device`, `Kpis` définis en Task 4 et réutilisés tels quels (Tasks 6/7/8). Côté serveur, `EventInput`/`buildEventDoc` (Task 1) consommés en Task 2. `cutoffMs` (Task 9) cohérent test/impl. Endpoint `/_w2p/collect` identique beacon (Task 5) / rewrite (Task 3).
