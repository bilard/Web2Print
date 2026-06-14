# Veille tarifaire concurrentielle — v1 (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Partir du catalogue de l'utilisateur (SKU/EAN/Nom/Marque + son prix), retrouver chaque produit chez des concurrents (pattern d'URL + recherche web), valider le rapprochement par LLM, épingler l'URL, et alerter (Telegram) sur le positionnement prix et les variations concurrentes — le tout exécutable headless sous Cron.

**Architecture:** Un module dédié (section `price-watch` dans `DashboardPage`) pour configurer/visualiser, persisté dans Firestore sous `users/{uid}/priceWatch/{watchId}/...`. Un node de workflow `price-watch-track` (implémenté **côté client** pour l'aperçu ET **côté serveur** pour le Cron) exécute le pipeline. Toute la logique pure (clé relationnelle, construction d'URL, requêtes de découverte, diff/positionnement, ring buffer, parsing LLM) vit dans un module pur testé, dupliqué côté serveur selon la convention wire-compatible existante (cf. `parsePrice`/`diffPriceRows`).

**Tech Stack:** React 18, TypeScript strict, Zustand, Firestore (client SDK + firebase-admin côté functions), Vitest, briques existantes `gatherWebContext`/`enrichRow` (client) et `jinaSearch`/`jinaRead`/`callLlm` (serveur).

---

## File Structure

**Client (`src/`)**
- Create `src/features/priceWatch/core.ts` — logique pure (clé relationnelle, URL pattern, requêtes découverte, diff/positionnement, ring buffer, parsing validation LLM). Aucune dépendance Firebase/React.
- Create `src/features/priceWatch/core.test.ts` — tests Vitest de `core.ts`.
- Create `src/features/priceWatch/types.ts` — types partagés (`TrackedProduct`, `CompetitorSite`, `PriceMatch`, `HistoryPoint`, `PriceWatchAlert`).
- Create `src/features/priceWatch/paths.ts` — helpers de chemins Firestore.
- Create `src/features/priceWatch/usePriceWatch.ts` — hooks CRUD (suivi/produits/sites/matchs).
- Create `src/features/priceWatch/runPriceWatch.ts` — orchestrateur du pipeline (client).
- Create `src/features/priceWatch/PriceWatchPanel.tsx` — panneau module (onglets).
- Create `src/features/priceWatch/components/CatalogTab.tsx`, `SitesTab.tsx`, `ComparisonTab.tsx`.
- Create `src/features/workflows/registry/priceWatchTrackNode.ts` — node client `price-watch-track`.
- Modify `src/features/workflows/registry/builtin.ts` — importer le nouveau node.
- Modify `src/features/navigation/modules.ts` — ajouter la section `price-watch`.
- Modify `src/features/access/permissions.ts` — ajouter `priceWatch.view`.
- Modify `src/pages/DashboardPage.tsx` — rendre la section.

**Server (`functions/src/`)**
- Create `functions/src/workflow/nodes/priceWatchTrack.ts` — node serveur `price-watch-track` (réimplémente le pipeline headless).
- Create `functions/src/workflow/nodes/priceWatchTrack.test.ts` — tests de la logique pure dupliquée.
- Modify `functions/src/workflow/nodes/index.ts` — importer `./priceWatchTrack`.

---

## Task 1: Logique pure — clé relationnelle & construction d'URL

**Files:**
- Create: `src/features/priceWatch/types.ts`
- Create: `src/features/priceWatch/core.ts`
- Test: `src/features/priceWatch/core.test.ts`

- [ ] **Step 1: Écrire les types**

Create `src/features/priceWatch/types.ts`:

```typescript
// src/features/priceWatch/types.ts
// Types partagés du module Veille tarifaire. Pas de dépendance Firebase/React.

export interface TrackedProduct {
  id: string
  sku?: string
  ean?: string
  name: string
  brand?: string
  myPrice?: number
  sourceSheetId?: string
  sourceRowId?: string
}

export interface CompetitorSite {
  id: string
  domain: string // ex: "exemple.com"
  /** Gabarit d'URL avec placeholders {sku} {ean} {name}. Optionnel. */
  urlPattern?: string
}

export type MatchStatus = 'auto' | 'confirmed' | 'pending' | 'rejected'

export interface PriceMatch {
  productId: string
  siteId: string
  url?: string
  confidence: number
  status: MatchStatus
  lastPrice?: number
  lastInStock?: boolean
  lastDiscoveredAt?: number
  updatedAt?: number
}

export interface HistoryPoint {
  price: number
  inStock?: boolean
  at: number
}

export type AlertKind = 'positioning' | 'competitor-variation'

export interface PriceWatchAlert {
  kind: AlertKind
  productId: string
  productName: string
  siteId: string
  domain: string
  url?: string
  myPrice?: number
  competitorPrice: number
  previousPrice?: number
  variationPct?: number
  message: string
}
```

- [ ] **Step 2: Écrire le test (échouant) pour la clé relationnelle et l'URL**

Create `src/features/priceWatch/core.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { relationalKey, buildPatternUrl } from './core'
import type { TrackedProduct } from './types'

const base: TrackedProduct = { id: 'p1', name: 'Perceuse X', brand: 'Acme' }

describe('relationalKey', () => {
  it('préfère le SKU', () => {
    expect(relationalKey({ ...base, sku: 'SK1', ean: '123' })).toEqual({ kind: 'sku', value: 'SK1' })
  })
  it('replie sur EAN si pas de SKU', () => {
    expect(relationalKey({ ...base, ean: '123' })).toEqual({ kind: 'ean', value: '123' })
  })
  it('replie sur nom+marque si ni SKU ni EAN', () => {
    expect(relationalKey(base)).toEqual({ kind: 'name', value: 'Acme Perceuse X' })
  })
})

describe('buildPatternUrl', () => {
  it('substitue {sku}', () => {
    expect(buildPatternUrl('https://s.com/p/{sku}', { ...base, sku: 'SK1' })).toBe('https://s.com/p/SK1')
  })
  it('rend null si placeholder manquant côté produit', () => {
    expect(buildPatternUrl('https://s.com/p/{sku}', base)).toBeNull()
  })
  it('encode {name}', () => {
    expect(buildPatternUrl('https://s.com/q?n={name}', base)).toBe('https://s.com/q?n=Perceuse%20X')
  })
  it('rend null si pas de pattern', () => {
    expect(buildPatternUrl(undefined, { ...base, sku: 'SK1' })).toBeNull()
  })
})
```

- [ ] **Step 3: Lancer le test → échec**

Run: `npx vitest run src/features/priceWatch/core.test.ts`
Expected: FAIL — `core.ts` n'existe pas / fonctions non définies.

- [ ] **Step 4: Implémenter `core.ts` (clé + URL)**

Create `src/features/priceWatch/core.ts`:

```typescript
// src/features/priceWatch/core.ts
// Logique PURE de la veille tarifaire (aucune dépendance Firebase/React).
// Dupliquée côté serveur (functions/.../priceWatchTrack.ts) — convention
// wire-compatible (cf. parsePrice/diffPriceRows du node price-watch).
import type { TrackedProduct } from './types'

export interface RelationalKey {
  kind: 'sku' | 'ean' | 'name'
  value: string
}

/** Clé relationnelle d'un produit : SKU → EAN → (Marque + Nom). */
export function relationalKey(p: TrackedProduct): RelationalKey {
  if (p.sku?.trim()) return { kind: 'sku', value: p.sku.trim() }
  if (p.ean?.trim()) return { kind: 'ean', value: p.ean.trim() }
  return { kind: 'name', value: [p.brand, p.name].filter(Boolean).join(' ').trim() }
}

/** Construit une URL depuis un gabarit `{sku}/{ean}/{name}`. null si un placeholder
 *  requis manque, ou si pas de pattern. */
export function buildPatternUrl(
  pattern: string | undefined,
  p: TrackedProduct,
): string | null {
  if (!pattern?.trim()) return null
  const values: Record<string, string | undefined> = { sku: p.sku, ean: p.ean, name: p.name }
  let missing = false
  const url = pattern.replace(/\{(sku|ean|name)\}/g, (_, k: string) => {
    const v = values[k]
    if (!v?.trim()) { missing = true; return '' }
    return encodeURIComponent(v.trim())
  })
  return missing ? null : url
}
```

- [ ] **Step 5: Lancer le test → succès**

Run: `npx vitest run src/features/priceWatch/core.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add src/features/priceWatch/types.ts src/features/priceWatch/core.ts src/features/priceWatch/core.test.ts
git commit -m "feat(veille): logique pure clé relationnelle + URL pattern"
```

---

## Task 2: Logique pure — requêtes de découverte & sélection de candidat

**Files:**
- Modify: `src/features/priceWatch/core.ts`
- Test: `src/features/priceWatch/core.test.ts`

- [ ] **Step 1: Ajouter le test (échouant)**

Append to `src/features/priceWatch/core.test.ts`:

```typescript
import { discoveryQueries, pickCandidate } from './core'

describe('discoveryQueries', () => {
  it('SKU/EAN d\'abord, puis marque+nom, scopés au domaine', () => {
    const qs = discoveryQueries('exemple.com', { id: 'p1', name: 'Perceuse X', brand: 'Acme', sku: 'SK1' })
    expect(qs[0]).toBe('site:exemple.com SK1')
    expect(qs[1]).toBe('site:exemple.com Acme Perceuse X')
  })
  it('sans SKU/EAN : juste marque+nom', () => {
    const qs = discoveryQueries('exemple.com', { id: 'p1', name: 'Perceuse X', brand: 'Acme' })
    expect(qs).toEqual(['site:exemple.com Acme Perceuse X'])
  })
})

describe('pickCandidate', () => {
  const results = [
    { title: 'Autre', url: 'https://autre.com/x', snippet: '' },
    { title: 'Perceuse X — Exemple', url: 'https://exemple.com/p/sk1', snippet: '' },
  ]
  it('garde le premier résultat sur le domaine cible', () => {
    expect(pickCandidate(results, 'exemple.com')).toBe('https://exemple.com/p/sk1')
  })
  it('rend null si aucun résultat sur le domaine', () => {
    expect(pickCandidate([results[0]], 'exemple.com')).toBeNull()
  })
})
```

- [ ] **Step 2: Lancer → échec**

Run: `npx vitest run src/features/priceWatch/core.test.ts`
Expected: FAIL — `discoveryQueries`/`pickCandidate` non définis.

- [ ] **Step 3: Implémenter**

Append to `src/features/priceWatch/core.ts`:

```typescript
/** Requêtes de recherche scopées domaine, par ordre de fiabilité. */
export function discoveryQueries(domain: string, p: TrackedProduct): string[] {
  const queries: string[] = []
  if (p.sku?.trim()) queries.push(`site:${domain} ${p.sku.trim()}`)
  else if (p.ean?.trim()) queries.push(`site:${domain} ${p.ean.trim()}`)
  const nameQuery = [p.brand, p.name].filter(Boolean).join(' ').trim()
  if (nameQuery) queries.push(`site:${domain} ${nameQuery}`)
  return queries
}

/** Premier résultat dont l'URL appartient au domaine cible. */
export function pickCandidate(
  results: { url: string }[],
  domain: string,
): string | null {
  const d = domain.replace(/^www\./, '')
  const hit = results.find((r) => {
    try { return new URL(r.url).hostname.replace(/^www\./, '').endsWith(d) }
    catch { return false }
  })
  return hit?.url ?? null
}
```

- [ ] **Step 4: Lancer → succès**

Run: `npx vitest run src/features/priceWatch/core.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/priceWatch/core.ts src/features/priceWatch/core.test.ts
git commit -m "feat(veille): requêtes de découverte + sélection de candidat"
```

---

## Task 3: Logique pure — prix, diff, positionnement, ring buffer

**Files:**
- Modify: `src/features/priceWatch/core.ts`
- Test: `src/features/priceWatch/core.test.ts`

- [ ] **Step 1: Ajouter le test (échouant)**

Append to `src/features/priceWatch/core.test.ts`:

```typescript
import { parsePrice, pushHistory, evaluate } from './core'
import type { HistoryPoint } from './types'

describe('parsePrice', () => {
  it('parse « 1 299,90 € »', () => expect(parsePrice('1 299,90 €')).toBe(1299.9))
  it('NaN si illisible', () => expect(Number.isNaN(parsePrice('n/a'))).toBe(true))
})

describe('pushHistory (ring buffer)', () => {
  it('borne à maxLen, garde les plus récents', () => {
    let h: HistoryPoint[] = []
    for (let i = 0; i < 35; i++) h = pushHistory(h, { price: i, at: i }, 30)
    expect(h.length).toBe(30)
    expect(h[0].price).toBe(5)
    expect(h[29].price).toBe(34)
  })
})

describe('evaluate', () => {
  const product = { id: 'p1', name: 'Perceuse X', myPrice: 100 }
  it('alerte positionnement si concurrent sous mon prix', () => {
    const a = evaluate(product, { id: 's1', domain: 'e.com' }, 90, undefined, 0)
    expect(a.some((x) => x.kind === 'positioning')).toBe(true)
  })
  it('alerte variation concurrent au-delà du seuil', () => {
    const a = evaluate(product, { id: 's1', domain: 'e.com' }, 120, 100, 10)
    expect(a.some((x) => x.kind === 'competitor-variation')).toBe(true)
  })
  it('pas d\'alerte variation sous le seuil', () => {
    const a = evaluate(product, { id: 's1', domain: 'e.com' }, 105, 100, 10)
    expect(a.some((x) => x.kind === 'competitor-variation')).toBe(false)
  })
  it('premier relevé : pas d\'alerte variation', () => {
    const a = evaluate(product, { id: 's1', domain: 'e.com' }, 120, undefined, 0)
    expect(a.some((x) => x.kind === 'competitor-variation')).toBe(false)
  })
})
```

- [ ] **Step 2: Lancer → échec**

Run: `npx vitest run src/features/priceWatch/core.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implémenter**

Append to `src/features/priceWatch/core.ts`:

```typescript
import type { CompetitorSite, HistoryPoint, PriceWatchAlert } from './types'

/** Parse un prix : « 1 299,90 € » → 1299.9. NaN si illisible. (Identique au node price-watch.) */
export function parsePrice(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v !== 'string') return NaN
  const cleaned = v.replace(/[\s€$£]/g, '').replace(',', '.').replace(/[^0-9.+-]/g, '')
  return cleaned ? parseFloat(cleaned) : NaN
}

/** Ring buffer borné : ajoute un point et garde les `maxLen` plus récents. */
export function pushHistory(history: HistoryPoint[], point: HistoryPoint, maxLen: number): HistoryPoint[] {
  const next = [...history, point]
  return next.length > maxLen ? next.slice(next.length - maxLen) : next
}

/**
 * Compare un relevé concurrent au produit et au relevé précédent → alertes.
 * - positioning : competitorPrice < myPrice
 * - competitor-variation : |Δ| / prev ≥ thresholdPct (premier relevé = silencieux)
 */
export function evaluate(
  product: { id: string; name: string; myPrice?: number },
  site: { id: string; domain: string },
  competitorPrice: number,
  previousPrice: number | undefined,
  thresholdPct: number,
): PriceWatchAlert[] {
  const alerts: PriceWatchAlert[] = []
  const common = {
    productId: product.id, productName: product.name,
    siteId: site.id, domain: site.domain, myPrice: product.myPrice, competitorPrice,
  }
  if (product.myPrice != null && competitorPrice < product.myPrice) {
    alerts.push({
      ...common, kind: 'positioning',
      message: `${product.name} : ${site.domain} à ${competitorPrice} € < votre prix ${product.myPrice} €`,
    })
  }
  if (previousPrice != null && previousPrice !== competitorPrice) {
    const deltaPct = previousPrice === 0 ? 100 : Math.abs((competitorPrice - previousPrice) / previousPrice) * 100
    if (deltaPct >= thresholdPct) {
      alerts.push({
        ...common, kind: 'competitor-variation',
        previousPrice,
        variationPct: Math.round(((competitorPrice - previousPrice) / (previousPrice || 1)) * 1000) / 10,
        message: `${product.name} : ${site.domain} ${previousPrice} € → ${competitorPrice} €`,
      })
    }
  }
  return alerts
}
```

> Note : l'import `CompetitorSite` n'est pas encore utilisé par les signatures mais sera réutilisé en Task 7 ; le garder si besoin, sinon ne pas l'importer pour éviter un warning eslint `unused`. Retirer `CompetitorSite` de la ligne d'import si `npm run lint` le signale.

- [ ] **Step 4: Lancer → succès**

Run: `npx vitest run src/features/priceWatch/core.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/priceWatch/core.ts src/features/priceWatch/core.test.ts
git commit -m "feat(veille): prix, ring buffer historique, évaluation alertes"
```

---

## Task 4: Logique pure — prompt & parsing de validation LLM

**Files:**
- Modify: `src/features/priceWatch/core.ts`
- Test: `src/features/priceWatch/core.test.ts`

- [ ] **Step 1: Ajouter le test (échouant)**

Append to `src/features/priceWatch/core.test.ts`:

```typescript
import { buildMatchPrompt, parseMatchVerdict } from './core'

describe('buildMatchPrompt', () => {
  it('inclut nom, marque, sku et un extrait de page', () => {
    const prompt = buildMatchPrompt({ id: 'p1', name: 'Perceuse X', brand: 'Acme', sku: 'SK1' }, 'contenu page…')
    expect(prompt).toContain('Perceuse X')
    expect(prompt).toContain('Acme')
    expect(prompt).toContain('SK1')
    expect(prompt).toContain('contenu page')
  })
})

describe('parseMatchVerdict', () => {
  it('lit { confidence }', () => {
    expect(parseMatchVerdict('{"confidence":0.9}')).toBe(0.9)
  })
  it('borne 0..1', () => {
    expect(parseMatchVerdict('{"confidence":5}')).toBe(1)
    expect(parseMatchVerdict('{"confidence":-2}')).toBe(0)
  })
  it('0 si illisible', () => {
    expect(parseMatchVerdict('pas du json')).toBe(0)
  })
})
```

- [ ] **Step 2: Lancer → échec**

Run: `npx vitest run src/features/priceWatch/core.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implémenter**

Append to `src/features/priceWatch/core.ts`:

```typescript
/** Prompt de validation : le produit correspond-il à la page candidate ? */
export function buildMatchPrompt(
  p: { name: string; brand?: string; sku?: string; ean?: string },
  pageContent: string,
): string {
  return (
    `On veut vérifier qu'une page concurrente décrit EXACTEMENT le produit suivant.\n` +
    `Produit : nom="${p.name}", marque="${p.brand ?? ''}", sku="${p.sku ?? ''}", ean="${p.ean ?? ''}".\n` +
    `Réponds UNIQUEMENT par un JSON {"confidence": number} entre 0 (produit différent) ` +
    `et 1 (même produit, même variante).\n\n--- PAGE ---\n${pageContent.slice(0, 6000)}`
  )
}

/** Lit la confiance d'une réponse LLM, bornée à [0,1]. 0 si illisible. */
export function parseMatchVerdict(text: string): number {
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return 0
  try {
    const n = Number((JSON.parse(m[0]) as { confidence?: unknown }).confidence)
    if (Number.isNaN(n)) return 0
    return Math.max(0, Math.min(1, n))
  } catch { return 0 }
}
```

- [ ] **Step 4: Lancer → succès**

Run: `npx vitest run src/features/priceWatch/core.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/priceWatch/core.ts src/features/priceWatch/core.test.ts
git commit -m "feat(veille): prompt + parsing validation LLM"
```

---

## Task 5: Chemins Firestore & hooks CRUD

**Files:**
- Create: `src/features/priceWatch/paths.ts`
- Create: `src/features/priceWatch/usePriceWatch.ts`

> Pas de test unitaire ici (couche Firebase, couverte par smoke test en Task 11). Vérification = `npx tsc -b`.

- [ ] **Step 1: Écrire les chemins**

Create `src/features/priceWatch/paths.ts`:

```typescript
// src/features/priceWatch/paths.ts
// Chemins Firestore du module Veille tarifaire. matchKey = `${productId}__${siteId}`.
export const watchDoc = (uid: string, watchId: string) => `users/${uid}/priceWatch/${watchId}`
export const productsCol = (uid: string, watchId: string) => `${watchDoc(uid, watchId)}/products`
export const sitesCol = (uid: string, watchId: string) => `${watchDoc(uid, watchId)}/sites`
export const matchesCol = (uid: string, watchId: string) => `${watchDoc(uid, watchId)}/matches`
export const historyCol = (uid: string, watchId: string) => `${watchDoc(uid, watchId)}/history`
export const matchKey = (productId: string, siteId: string) => `${productId}__${siteId}`
export const HISTORY_MAX = 30
export const DEFAULT_WATCH_ID = 'veille-1'
export const MATCH_THRESHOLD = 0.7
```

- [ ] **Step 2: Écrire les hooks CRUD**

Create `src/features/priceWatch/usePriceWatch.ts`:

```typescript
// src/features/priceWatch/usePriceWatch.ts
// Hooks CRUD du module Veille tarifaire (accès Firestore via features/, convention projet).
import { useEffect, useState, useCallback } from 'react'
import {
  collection, doc, onSnapshot, setDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import { productsCol, sitesCol, matchesCol, matchKey, DEFAULT_WATCH_ID } from './paths'
import type { TrackedProduct, CompetitorSite, PriceMatch, MatchStatus } from './types'

function useCollection<T extends { id: string }>(path: (uid: string, w: string) => string): T[] {
  const uid = useAuthStore((s) => s.user?.uid)
  const [items, setItems] = useState<T[]>([])
  useEffect(() => {
    if (!uid) { setItems([]); return }
    const ref = collection(db, path(uid, DEFAULT_WATCH_ID))
    return onSnapshot(
      ref,
      (snap) => setItems(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as T[]),
      () => setItems([]), // handler d'erreur : règles/null safe (cf. mémoire onSnapshot)
    )
  }, [uid, path])
  return items
}

export function useTrackedProducts(): TrackedProduct[] { return useCollection<TrackedProduct>(productsCol) }
export function useCompetitorSites(): CompetitorSite[] { return useCollection<CompetitorSite>(sitesCol) }
export function usePriceMatches(): PriceMatch[] {
  const uid = useAuthStore((s) => s.user?.uid)
  const [items, setItems] = useState<PriceMatch[]>([])
  useEffect(() => {
    if (!uid) { setItems([]); return }
    const ref = collection(db, matchesCol(uid, DEFAULT_WATCH_ID))
    return onSnapshot(
      ref,
      (snap) => setItems(snap.docs.map((d) => d.data() as PriceMatch)),
      () => setItems([]),
    )
  }, [uid])
  return items
}

export function usePriceWatchMutations() {
  const uid = useAuthStore((s) => s.user?.uid)
  const saveProduct = useCallback(async (p: TrackedProduct) => {
    if (!uid) return
    await setDoc(doc(db, productsCol(uid, DEFAULT_WATCH_ID), p.id), { ...p, updatedAt: serverTimestamp() })
  }, [uid])
  const deleteProduct = useCallback(async (id: string) => {
    if (!uid) return
    await deleteDoc(doc(db, productsCol(uid, DEFAULT_WATCH_ID), id))
  }, [uid])
  const saveSite = useCallback(async (s: CompetitorSite) => {
    if (!uid) return
    await setDoc(doc(db, sitesCol(uid, DEFAULT_WATCH_ID), s.id), { ...s, updatedAt: serverTimestamp() })
  }, [uid])
  const deleteSite = useCallback(async (id: string) => {
    if (!uid) return
    await deleteDoc(doc(db, sitesCol(uid, DEFAULT_WATCH_ID), id))
  }, [uid])
  const setMatchStatus = useCallback(async (productId: string, siteId: string, status: MatchStatus) => {
    if (!uid) return
    await setDoc(
      doc(db, matchesCol(uid, DEFAULT_WATCH_ID), matchKey(productId, siteId)),
      { productId, siteId, status, updatedAt: Date.now() },
      { merge: true },
    )
  }, [uid])
  return { saveProduct, deleteProduct, saveSite, deleteSite, setMatchStatus }
}
```

- [ ] **Step 3: Vérifier les types**

Run: `npx tsc -b`
Expected: aucune erreur.

- [ ] **Step 4: Commit**

```bash
git add src/features/priceWatch/paths.ts src/features/priceWatch/usePriceWatch.ts
git commit -m "feat(veille): chemins Firestore + hooks CRUD"
```

---

## Task 6: Orchestrateur client du pipeline

**Files:**
- Create: `src/features/priceWatch/runPriceWatch.ts`

> La logique pure est déjà testée (Tasks 1-4). Ce module câble les briques I/O ; vérification = `npx tsc -b` + smoke test (Task 11).

- [ ] **Step 1: Écrire l'orchestrateur**

Create `src/features/priceWatch/runPriceWatch.ts`:

```typescript
// src/features/priceWatch/runPriceWatch.ts
// Orchestrateur CLIENT du pipeline de veille tarifaire : découverte → scrape →
// validation LLM → diff/positionnement → alertes. Réutilise gatherWebContext
// (recherche) et enrichRow (scrape champs). Persiste matchs + historique.
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import {
  relationalKey, buildPatternUrl, discoveryQueries, pickCandidate,
  parsePrice, pushHistory, evaluate, buildMatchPrompt, parseMatchVerdict,
} from './core'
import { matchesCol, historyCol, matchKey, HISTORY_MAX, MATCH_THRESHOLD } from './paths'
import type { TrackedProduct, CompetitorSite, PriceMatch, HistoryPoint, PriceWatchAlert } from './types'

export interface RunDeps {
  uid: string
  watchId: string
  thresholdPct: number
  products: TrackedProduct[]
  sites: CompetitorSite[]
  log: (msg: string) => void
  signal?: AbortSignal
}

/** Découvre l'URL d'un produit sur un site : pattern → recherche web. */
async function discover(product: TrackedProduct, site: CompetitorSite): Promise<string | null> {
  const patternUrl = buildPatternUrl(site.urlPattern, product)
  if (patternUrl) return patternUrl
  const { gatherWebContext } = await import('@/features/scraping/webContext')
  for (const query of discoveryQueries(site.domain, product)) {
    const ctx = await gatherWebContext({ searchQuery: query, maxResults: 5, readPages: 0 })
    const url = pickCandidate(ctx.results, site.domain)
    if (url) return url
  }
  return null
}

/** Scrape prix (+ contenu) d'une URL via le moteur PIM. */
async function scrape(url: string, signal?: AbortSignal): Promise<{ price: number; content: string }> {
  const { enrichRow } = await import('@/features/excel/ai-enrichment/enrichRow')
  const result = await enrichRow({ url, targetFields: ['price', 'name', 'brand'], signal })
  return { price: parsePrice(result.fields.price), content: JSON.stringify(result.fields) }
}

export async function runPriceWatch(deps: RunDeps): Promise<PriceWatchAlert[]> {
  const { uid, watchId, thresholdPct, products, sites, log } = deps
  const alerts: PriceWatchAlert[] = []
  for (const product of products) {
    for (const site of sites) {
      if (deps.signal?.aborted) return alerts
      const key = matchKey(product.id, site.id)
      const matchRef = doc(db, matchesCol(uid, watchId), key)
      const matchSnap = await getDoc(matchRef)
      const prev = matchSnap.data() as PriceMatch | undefined
      if (prev?.status === 'rejected' || prev?.status === 'pending') continue

      // 1. URL : épinglée sinon découverte
      let url = prev?.url
      let confidence = prev?.confidence ?? 0
      if (!url) {
        const found = await discover(product, site)
        if (!found) { log(`Aucune page trouvée : ${product.name} @ ${site.domain}`); continue }
        url = found
      }

      // 2. Scrape
      let priceContent: { price: number; content: string }
      try { priceContent = await scrape(url, deps.signal) }
      catch (e) { log(`Scrape échoué ${url} : ${String(e)}`); continue }
      if (Number.isNaN(priceContent.price)) { log(`Prix illisible : ${url}`); continue }

      // 3. Validation LLM si pas encore épinglé/confirmé
      if (!prev?.url || (prev.status !== 'auto' && prev.status !== 'confirmed')) {
        const { llmComplete } = await import('@/features/ai/llmComplete')
        const verdict = parseMatchVerdict(await llmComplete(buildMatchPrompt(product, priceContent.content)))
        confidence = verdict
        const status: PriceMatch['status'] = verdict >= MATCH_THRESHOLD ? 'auto' : 'pending'
        await setDoc(matchRef, {
          productId: product.id, siteId: site.id, url, confidence: verdict, status,
          lastPrice: priceContent.price, lastDiscoveredAt: Date.now(), updatedAt: Date.now(),
        } satisfies PriceMatch, { merge: true })
        if (status === 'pending') { log(`À confirmer (${verdict}) : ${product.name} @ ${site.domain}`); continue }
      }

      // 4. Historique + alertes
      const histRef = doc(db, historyCol(uid, watchId), key)
      const history = ((await getDoc(histRef)).data()?.values ?? []) as HistoryPoint[]
      const previousPrice = history.length ? history[history.length - 1].price : undefined
      const point: HistoryPoint = { price: priceContent.price, at: Date.now() }
      await setDoc(histRef, { values: pushHistory(history, point, HISTORY_MAX) })
      await setDoc(matchRef, { lastPrice: priceContent.price, confidence, updatedAt: Date.now() }, { merge: true })
      alerts.push(...evaluate(product, site, priceContent.price, previousPrice, thresholdPct))
    }
  }
  return alerts
}
```

> **Dépendance à vérifier :** ce module suppose un helper `llmComplete(prompt): Promise<string>` sous `@/features/ai/llmComplete`. Avant d'implémenter, vérifier le helper LLM existant (chercher `callLlm`/`llmRouter` côté client) et adapter l'import/signature en conséquence. S'il n'existe pas de wrapper « prompt → texte » côté client, en ajouter un fin au-dessus de `llmRouter` (hors périmètre de ce fichier, à créer dans la même task si nécessaire).

- [ ] **Step 2: Vérifier les types**

Run: `npx tsc -b`
Expected: aucune erreur (corriger l'import LLM selon le helper réel).

- [ ] **Step 3: Commit**

```bash
git add src/features/priceWatch/runPriceWatch.ts
git commit -m "feat(veille): orchestrateur client du pipeline"
```

---

## Task 7: Node client `price-watch-track`

**Files:**
- Create: `src/features/workflows/registry/priceWatchTrackNode.ts`
- Modify: `src/features/workflows/registry/builtin.ts`

- [ ] **Step 1: Écrire le node client**

Create `src/features/workflows/registry/priceWatchTrackNode.ts`:

```typescript
// src/features/workflows/registry/priceWatchTrackNode.ts
// Node « Veille tarifaire » : exécute un suivi enregistré (catalogue + sites
// Firestore) → découverte/scrape/validation/diff → port `changes` (alertes) si
// variations/positionnement. Implémentation CLIENT (aperçu éditeur) ; jumeau
// serveur dans functions/.../priceWatchTrack.ts pour le Cron headless.
import { TrendingUpDown } from 'lucide-react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import type { ExcelSheet } from '@/features/excel/types'
import { useAuthStore } from '@/stores/auth.store'
import { runPriceWatch } from '@/features/priceWatch/runPriceWatch'
import { productsCol, sitesCol, DEFAULT_WATCH_ID } from '@/features/priceWatch/paths'
import type { TrackedProduct, CompetitorSite, PriceWatchAlert } from '@/features/priceWatch/types'

interface TrackConfig { watchId: string; thresholdPct: number }

function alertsToSheet(alerts: PriceWatchAlert[]): ExcelSheet {
  return {
    name: 'Alertes veille tarifaire',
    columns: [
      { key: 'product', label: 'Produit', fieldType: 'text', detectedType: 'text', isPrimary: true, width: 200 },
      { key: 'domain', label: 'Site', fieldType: 'text', detectedType: 'text', isPrimary: false, width: 160 },
      { key: 'kind', label: 'Type', fieldType: 'text', detectedType: 'text', isPrimary: false, width: 140 },
      { key: 'message', label: 'Détail', fieldType: 'text', detectedType: 'text', isPrimary: false, width: 320 },
    ],
    rows: alerts.map((a, i) => ({
      _id: `alert_${i}`, product: a.productName, domain: a.domain, kind: a.kind, message: a.message,
    })),
    taxonomy: [],
  }
}

const priceWatchTrackNode: NodeSpec<TrackConfig, Record<string, never>, { changes?: ExcelSheet; all: ExcelSheet }> = {
  type: 'price-watch-track',
  category: 'logic',
  label: 'Veille tarifaire',
  description:
    "Exécute un suivi tarifaire enregistré (catalogue + concurrents) : retrouve chaque produit chez les concurrents, compare les prix, et n'émet « changes » que s'il y a des alertes (positionnement / variation).",
  icon: TrendingUpDown,
  inputs: [],
  outputs: [
    { name: 'changes', type: 'sheet' },
    { name: 'all', type: 'sheet' },
  ],
  configSchema: [
    { name: 'watchId', kind: 'text', label: 'Identifiant du suivi', help: 'Suivi configuré dans le module Veille tarifaire.' },
    { name: 'thresholdPct', kind: 'number', label: 'Seuil de variation (%)', help: '0 = signaler tout changement.' },
  ],
  defaultConfig: { watchId: DEFAULT_WATCH_ID, thresholdPct: 0 },
  runtime: 'client',
  run: async (ctx, config) => {
    const uid = useAuthStore.getState().user?.uid
    if (!uid) throw new Error('Utilisateur non connecté.')
    const watchId = (config.watchId || DEFAULT_WATCH_ID).trim()
    const [productsSnap, sitesSnap] = await Promise.all([
      getDocs(collection(db, productsCol(uid, watchId))),
      getDocs(collection(db, sitesCol(uid, watchId))),
    ])
    const products = productsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as TrackedProduct[]
    const sites = sitesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as CompetitorSite[]
    if (products.length === 0 || sites.length === 0) {
      ctx.log('warn', 'Catalogue ou sites vides — rien à surveiller.')
      return { all: alertsToSheet([]) }
    }
    const alerts = await runPriceWatch({
      uid, watchId, thresholdPct: Math.max(0, config.thresholdPct), products, sites,
      log: (m) => ctx.log('info', m), signal: ctx.signal,
    })
    const all = alertsToSheet(alerts)
    if (alerts.length === 0) {
      ctx.log('info', 'Aucune alerte.')
      return { all }
    }
    ctx.log('info', `${alerts.length} alerte(s) — port « changes » émis.`)
    return { changes: all, all }
  },
}

nodeRegistry.register(priceWatchTrackNode)
```

- [ ] **Step 2: Enregistrer le node dans builtin**

Modify `src/features/workflows/registry/builtin.ts` — ajouter l'import près des autres nodes logic (chercher la ligne `import './priceWatchNode'` ou la section logic et ajouter en dessous) :

```typescript
import './priceWatchTrackNode'
```

- [ ] **Step 3: Vérifier les types**

Run: `npx tsc -b`
Expected: aucune erreur.

- [ ] **Step 4: Commit**

```bash
git add src/features/workflows/registry/priceWatchTrackNode.ts src/features/workflows/registry/builtin.ts
git commit -m "feat(veille): node client price-watch-track"
```

---

## Task 8: Node serveur `price-watch-track` (headless / Cron)

**Files:**
- Create: `functions/src/workflow/nodes/priceWatchTrack.ts`
- Create: `functions/src/workflow/nodes/priceWatchTrack.test.ts`
- Modify: `functions/src/workflow/nodes/index.ts`

> Convention wire-compatible : la logique pure de `core.ts` est **dupliquée** ici (les projets `src/` et `functions/src/` ne se partagent pas le code), exactement comme `parsePrice`/`diffPriceRows` dans `priceWatch.ts`.

- [ ] **Step 1: Écrire le test (échouant) de la logique dupliquée**

Create `functions/src/workflow/nodes/priceWatchTrack.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { relationalKey, buildPatternUrl, discoveryQueries, pickCandidate, evaluate } from './priceWatchTrack'

describe('serveur — logique veille tarifaire (wire-compatible client)', () => {
  it('relationalKey SKU→EAN→nom', () => {
    expect(relationalKey({ id: 'p', name: 'X', brand: 'A', sku: 'S' }).kind).toBe('sku')
    expect(relationalKey({ id: 'p', name: 'X', brand: 'A', ean: 'E' }).kind).toBe('ean')
    expect(relationalKey({ id: 'p', name: 'X', brand: 'A' }).value).toBe('A X')
  })
  it('buildPatternUrl substitue/encode', () => {
    expect(buildPatternUrl('https://s.com/{sku}', { id: 'p', name: 'X', sku: 'S1' })).toBe('https://s.com/S1')
    expect(buildPatternUrl('https://s.com/{sku}', { id: 'p', name: 'X' })).toBeNull()
  })
  it('discoveryQueries scope domaine', () => {
    expect(discoveryQueries('e.com', { id: 'p', name: 'X', brand: 'A', sku: 'S' })[0]).toBe('site:e.com S')
  })
  it('pickCandidate garde le domaine', () => {
    expect(pickCandidate([{ url: 'https://e.com/x' }], 'e.com')).toBe('https://e.com/x')
  })
  it('evaluate positionnement + variation', () => {
    expect(evaluate({ id: 'p', name: 'X', myPrice: 100 }, { id: 's', domain: 'e.com' }, 90, undefined, 0)
      .some((a) => a.kind === 'positioning')).toBe(true)
    expect(evaluate({ id: 'p', name: 'X' }, { id: 's', domain: 'e.com' }, 120, 100, 10)
      .some((a) => a.kind === 'competitor-variation')).toBe(true)
  })
})
```

- [ ] **Step 2: Lancer → échec**

Run: `cd functions && npx vitest run src/workflow/nodes/priceWatchTrack.test.ts`
Expected: FAIL — module absent.

- [ ] **Step 3: Implémenter le node serveur**

Create `functions/src/workflow/nodes/priceWatchTrack.ts`:

```typescript
// functions/src/workflow/nodes/priceWatchTrack.ts
// Jumeau SERVEUR (headless) du node price-watch-track — wire-compatible avec le
// node client. Logique pure dupliquée depuis src/features/priceWatch/core.ts
// (les projets client/serveur ne partagent pas le code, cf. parsePrice).
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { registerServerNode } from '../registry'
import { jinaRead, jinaSearch } from '../jina'
import { callLlm, parseLlmJson } from '../llm'

interface Product { id: string; sku?: string; ean?: string; name: string; brand?: string; myPrice?: number }
interface Site { id: string; domain: string; urlPattern?: string }
interface Alert { kind: string; productName: string; domain: string; message: string }

const HISTORY_MAX = 30
const MATCH_THRESHOLD = 0.7

export function relationalKey(p: Product): { kind: 'sku' | 'ean' | 'name'; value: string } {
  if (p.sku?.trim()) return { kind: 'sku', value: p.sku.trim() }
  if (p.ean?.trim()) return { kind: 'ean', value: p.ean.trim() }
  return { kind: 'name', value: [p.brand, p.name].filter(Boolean).join(' ').trim() }
}

export function buildPatternUrl(pattern: string | undefined, p: Product): string | null {
  if (!pattern?.trim()) return null
  const values: Record<string, string | undefined> = { sku: p.sku, ean: p.ean, name: p.name }
  let missing = false
  const url = pattern.replace(/\{(sku|ean|name)\}/g, (_m, k: string) => {
    const v = values[k]
    if (!v?.trim()) { missing = true; return '' }
    return encodeURIComponent(v.trim())
  })
  return missing ? null : url
}

export function discoveryQueries(domain: string, p: Product): string[] {
  const queries: string[] = []
  if (p.sku?.trim()) queries.push(`site:${domain} ${p.sku.trim()}`)
  else if (p.ean?.trim()) queries.push(`site:${domain} ${p.ean.trim()}`)
  const nameQuery = [p.brand, p.name].filter(Boolean).join(' ').trim()
  if (nameQuery) queries.push(`site:${domain} ${nameQuery}`)
  return queries
}

export function pickCandidate(results: { url: string }[], domain: string): string | null {
  const d = domain.replace(/^www\./, '')
  const hit = results.find((r) => {
    try { return new URL(r.url).hostname.replace(/^www\./, '').endsWith(d) } catch { return false }
  })
  return hit?.url ?? null
}

function parsePrice(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v !== 'string') return NaN
  const cleaned = v.replace(/[\s€$£]/g, '').replace(',', '.').replace(/[^0-9.+-]/g, '')
  return cleaned ? parseFloat(cleaned) : NaN
}

export function evaluate(
  product: { id: string; name: string; myPrice?: number },
  site: { id: string; domain: string },
  competitorPrice: number,
  previousPrice: number | undefined,
  thresholdPct: number,
): Alert[] {
  const alerts: Alert[] = []
  if (product.myPrice != null && competitorPrice < product.myPrice) {
    alerts.push({ kind: 'positioning', productName: product.name, domain: site.domain,
      message: `${product.name} : ${site.domain} à ${competitorPrice} € < votre prix ${product.myPrice} €` })
  }
  if (previousPrice != null && previousPrice !== competitorPrice) {
    const deltaPct = previousPrice === 0 ? 100 : Math.abs((competitorPrice - previousPrice) / previousPrice) * 100
    if (deltaPct >= thresholdPct) {
      alerts.push({ kind: 'competitor-variation', productName: product.name, domain: site.domain,
        message: `${product.name} : ${site.domain} ${previousPrice} € → ${competitorPrice} €` })
    }
  }
  return alerts
}

function alertsToSheet(alerts: Alert[]) {
  return {
    name: 'Alertes veille tarifaire',
    columns: [
      { key: 'product', label: 'Produit' }, { key: 'domain', label: 'Site' },
      { key: 'kind', label: 'Type' }, { key: 'message', label: 'Détail' },
    ],
    rows: alerts.map((a, i) => ({ _id: `alert_${i}`, product: a.productName, domain: a.domain, kind: a.kind, message: a.message })),
  }
}

registerServerNode({
  type: 'price-watch-track',
  run: async (ctx, config) => {
    const watchId = String(config.watchId || 'veille-1').trim().replace(/[/#?[\]]/g, '_')
    const thresholdPct = Math.max(0, Number(config.thresholdPct) || 0)
    const fs = getFirestore()
    const base = `users/${ctx.uid}/priceWatch/${watchId}`
    const [productsSnap, sitesSnap] = await Promise.all([
      fs.collection(`${base}/products`).get(),
      fs.collection(`${base}/sites`).get(),
    ])
    const products = productsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Product[]
    const sites = sitesSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Site[]
    if (products.length === 0 || sites.length === 0) {
      ctx.log('warn', 'Catalogue ou sites vides — rien à surveiller.')
      return { all: alertsToSheet([]) }
    }

    const alerts: Alert[] = []
    for (const product of products) {
      for (const site of sites) {
        if (ctx.signal.aborted) break
        const key = `${product.id}__${site.id}`
        const matchRef = fs.doc(`${base}/matches/${key}`)
        const prev = (await matchRef.get()).data() as
          | { url?: string; status?: string; confidence?: number } | undefined
        if (prev?.status === 'rejected' || prev?.status === 'pending') continue

        let url = prev?.url ?? buildPatternUrl(site.urlPattern, product) ?? undefined
        if (!url) {
          for (const q of discoveryQueries(site.domain, product)) {
            const results = await jinaSearch(ctx.uid, q)
            const found = pickCandidate(results, site.domain)
            if (found) { url = found; break }
          }
        }
        if (!url) { ctx.log('info', `Aucune page : ${product.name} @ ${site.domain}`); continue }

        let page: { title: string; content: string }
        try { page = await jinaRead(ctx.uid, url) } catch (e) { ctx.log('error', `Read échoué ${url}: ${String(e)}`); continue }
        const extractPrompt =
          `Extrait le prix de cette page. Réponds UNIQUEMENT {"price": "..."}.\n\n${page.content.slice(0, 8000)}`
        const extracted = parseLlmJson<{ price?: unknown }>((await callLlm(ctx.uid, extractPrompt)).text)
        const price = parsePrice(extracted?.price)
        if (Number.isNaN(price)) { ctx.log('info', `Prix illisible : ${url}`); continue }

        if (!prev?.url || (prev.status !== 'auto' && prev.status !== 'confirmed')) {
          const matchPrompt =
            `Cette page décrit-elle EXACTEMENT : nom="${product.name}", marque="${product.brand ?? ''}", ` +
            `sku="${product.sku ?? ''}", ean="${product.ean ?? ''}" ? Réponds UNIQUEMENT {"confidence": 0..1}.\n\n` +
            `${page.content.slice(0, 6000)}`
          const verdict = Math.max(0, Math.min(1,
            Number(parseLlmJson<{ confidence?: unknown }>((await callLlm(ctx.uid, matchPrompt)).text)?.confidence) || 0))
          const status = verdict >= MATCH_THRESHOLD ? 'auto' : 'pending'
          await matchRef.set({ productId: product.id, siteId: site.id, url, confidence: verdict, status,
            lastPrice: price, lastDiscoveredAt: Date.now(), updatedAt: FieldValue.serverTimestamp() }, { merge: true })
          if (status === 'pending') { ctx.log('info', `À confirmer (${verdict}) : ${product.name} @ ${site.domain}`); continue }
        }

        const histRef = fs.doc(`${base}/history/${key}`)
        const history = ((await histRef.get()).data()?.values ?? []) as { price: number; at: number }[]
        const previousPrice = history.length ? history[history.length - 1].price : undefined
        const nextHistory = [...history, { price, at: Date.now() }].slice(-HISTORY_MAX)
        await histRef.set({ values: nextHistory })
        await matchRef.set({ lastPrice: price, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
        alerts.push(...evaluate(product, site, price, previousPrice, thresholdPct))
      }
    }

    const all = alertsToSheet(alerts)
    if (alerts.length === 0) { ctx.log('info', 'Aucune alerte.'); return { all } }
    ctx.log('info', `${alerts.length} alerte(s) — port « changes » émis.`)
    return { changes: all, all }
  },
})
```

- [ ] **Step 4: Enregistrer le node serveur**

Modify `functions/src/workflow/nodes/index.ts` — ajouter sous `import './priceWatch'` :

```typescript
import './priceWatchTrack'
```

(Ne PAS ajouter `price-watch-track` à `SERVER_UNSUPPORTED` : il doit tourner côté serveur.)

- [ ] **Step 5: Lancer le test → succès**

Run: `cd functions && npx vitest run src/workflow/nodes/priceWatchTrack.test.ts`
Expected: PASS.

- [ ] **Step 6: Vérifier les types serveur**

Run: `cd functions && npm run build` (ou `npx tsc -b` selon la config functions)
Expected: aucune erreur.

- [ ] **Step 7: Commit**

```bash
git add functions/src/workflow/nodes/priceWatchTrack.ts functions/src/workflow/nodes/priceWatchTrack.test.ts functions/src/workflow/nodes/index.ts
git commit -m "feat(veille): node serveur price-watch-track (headless/cron)"
```

---

## Task 9: Permission RBAC + section de navigation

**Files:**
- Modify: `src/features/access/permissions.ts`
- Modify: `src/features/navigation/modules.ts`

- [ ] **Step 1: Ajouter la permission**

Modify `src/features/access/permissions.ts` — ajouter près de `workflows.view` :

```typescript
  { key: 'priceWatch.view', module: 'Veille tarifaire', label: 'Voir la veille tarifaire' },
```

- [ ] **Step 2: Ajouter la section**

Modify `src/features/navigation/modules.ts` :

2a. Étendre le type `Section` :

```typescript
export type Section =
  | 'blank' | 'import' | 'library' | 'images' | 'data' | 'chat' | 'settings'
  | 'taxonomies' | 'scraping-templates' | 'scraping-hub' | 'workflows'
  | 'hyperframes' | 'telegram' | 'access' | 'price-watch'
```

2b. Ajouter l'item (après `workflows`, importer `TrendingUpDown` depuis `lucide-react` en tête de fichier) :

```typescript
  { id: 'price-watch', icon: TrendingUpDown, label: 'Veille tarifaire', accent: 'text-orange-400', activeBg: 'bg-orange-500/[0.1]', activeText: 'text-orange-300' },
```

2c. Ajouter le gate de permission dans `SECTION_PERMISSION` :

```typescript
  'price-watch': 'priceWatch.view',
```

- [ ] **Step 3: Vérifier les types**

Run: `npx tsc -b`
Expected: aucune erreur.

- [ ] **Step 4: Commit**

```bash
git add src/features/access/permissions.ts src/features/navigation/modules.ts
git commit -m "feat(veille): permission RBAC + entrée de navigation"
```

---

## Task 10: Panneau module — onglets Catalogue / Sites / Comparatif

**Files:**
- Create: `src/features/priceWatch/PriceWatchPanel.tsx`
- Create: `src/features/priceWatch/components/CatalogTab.tsx`
- Create: `src/features/priceWatch/components/SitesTab.tsx`
- Create: `src/features/priceWatch/components/ComparisonTab.tsx`
- Modify: `src/pages/DashboardPage.tsx`

> Composants ≤ 150 lignes (convention). Pas de logique métier : tout passe par les hooks de Task 5. Theming par tokens (`bg-surface`, `text-white`…).

- [ ] **Step 1: CatalogTab — liste + ajout depuis PIM ou manuel**

Create `src/features/priceWatch/components/CatalogTab.tsx`:

```tsx
// src/features/priceWatch/components/CatalogTab.tsx
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTrackedProducts, usePriceWatchMutations } from '../usePriceWatch'
import type { TrackedProduct } from '../types'

export function CatalogTab() {
  const products = useTrackedProducts()
  const { saveProduct, deleteProduct } = usePriceWatchMutations()
  const [draft, setDraft] = useState<Partial<TrackedProduct>>({})

  const add = async () => {
    if (!draft.name?.trim()) return
    await saveProduct({ id: crypto.randomUUID(), name: draft.name.trim(), sku: draft.sku, ean: draft.ean, brand: draft.brand, myPrice: draft.myPrice })
    setDraft({})
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Input placeholder="Nom *" value={draft.name ?? ''} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="w-40" />
        <Input placeholder="Marque" value={draft.brand ?? ''} onChange={(e) => setDraft({ ...draft, brand: e.target.value })} className="w-32" />
        <Input placeholder="SKU" value={draft.sku ?? ''} onChange={(e) => setDraft({ ...draft, sku: e.target.value })} className="w-28" />
        <Input placeholder="EAN" value={draft.ean ?? ''} onChange={(e) => setDraft({ ...draft, ean: e.target.value })} className="w-32" />
        <Input placeholder="Mon prix" type="number" value={draft.myPrice ?? ''} onChange={(e) => setDraft({ ...draft, myPrice: Number(e.target.value) })} className="w-28" />
        <Button onClick={add}>Ajouter</Button>
      </div>
      <ul className="divide-y divide-white/10 rounded-md bg-surface">
        {products.map((p) => (
          <li key={p.id} className="flex items-center justify-between px-3 py-2 text-sm">
            <span>{[p.brand, p.name].filter(Boolean).join(' ')} {p.sku && `· ${p.sku}`} {p.myPrice != null && `· ${p.myPrice} €`}</span>
            <Button variant="ghost" size="sm" onClick={() => deleteProduct(p.id)}>Supprimer</Button>
          </li>
        ))}
        {products.length === 0 && <li className="px-3 py-6 text-center text-sm text-white/50">Aucun produit surveillé.</li>}
      </ul>
    </div>
  )
}
```

> **Import PIM** (« choisir une feuille » et mapper les colonnes) : ajouter un bouton « Importer depuis le PIM » qui ouvre une sélection de feuille via le store PIM existant. Repérer le hook de listage des feuilles (chercher `useSheets`/store PIM) et brancher `saveProduct` par ligne. Si l'API PIM n'est pas évidente, livrer d'abord la saisie manuelle (ci-dessus) et traiter l'import PIM dans un commit suivant de cette task.

- [ ] **Step 2: SitesTab — domaine + pattern d'URL**

Create `src/features/priceWatch/components/SitesTab.tsx`:

```tsx
// src/features/priceWatch/components/SitesTab.tsx
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCompetitorSites, usePriceWatchMutations } from '../usePriceWatch'
import type { CompetitorSite } from '../types'

export function SitesTab() {
  const sites = useCompetitorSites()
  const { saveSite, deleteSite } = usePriceWatchMutations()
  const [draft, setDraft] = useState<Partial<CompetitorSite>>({})

  const add = async () => {
    if (!draft.domain?.trim()) return
    await saveSite({ id: crypto.randomUUID(), domain: draft.domain.trim().replace(/^https?:\/\//, ''), urlPattern: draft.urlPattern?.trim() || undefined })
    setDraft({})
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Input placeholder="Domaine (exemple.com) *" value={draft.domain ?? ''} onChange={(e) => setDraft({ ...draft, domain: e.target.value })} className="w-48" />
        <Input placeholder="Pattern d'URL (https://…/p/{sku})" value={draft.urlPattern ?? ''} onChange={(e) => setDraft({ ...draft, urlPattern: e.target.value })} className="w-72" />
        <Button onClick={add}>Ajouter</Button>
      </div>
      <ul className="divide-y divide-white/10 rounded-md bg-surface">
        {sites.map((s) => (
          <li key={s.id} className="flex items-center justify-between px-3 py-2 text-sm">
            <span>{s.domain}{s.urlPattern && <span className="text-white/50"> · {s.urlPattern}</span>}</span>
            <Button variant="ghost" size="sm" onClick={() => deleteSite(s.id)}>Supprimer</Button>
          </li>
        ))}
        {sites.length === 0 && <li className="px-3 py-6 text-center text-sm text-white/50">Aucun site concurrent.</li>}
      </ul>
    </div>
  )
}
```

- [ ] **Step 3: ComparisonTab — tableau + file « à confirmer »**

Create `src/features/priceWatch/components/ComparisonTab.tsx`:

```tsx
// src/features/priceWatch/components/ComparisonTab.tsx
import { Button } from '@/components/ui/button'
import { useTrackedProducts, useCompetitorSites, usePriceMatches, usePriceWatchMutations } from '../usePriceWatch'

export function ComparisonTab() {
  const products = useTrackedProducts()
  const sites = useCompetitorSites()
  const matches = usePriceMatches()
  const { setMatchStatus } = usePriceWatchMutations()
  const byKey = new Map(matches.map((m) => [`${m.productId}__${m.siteId}`, m]))
  const pending = matches.filter((m) => m.status === 'pending')

  return (
    <div className="space-y-6">
      {pending.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-white">À confirmer ({pending.length})</h3>
          <ul className="divide-y divide-white/10 rounded-md bg-surface">
            {pending.map((m) => {
              const p = products.find((x) => x.id === m.productId)
              const s = sites.find((x) => x.id === m.siteId)
              return (
                <li key={`${m.productId}__${m.siteId}`} className="flex items-center justify-between px-3 py-2 text-sm">
                  <a href={m.url} target="_blank" rel="noreferrer" className="truncate text-white/80 underline">{p?.name} @ {s?.domain} ({Math.round(m.confidence * 100)}%)</a>
                  <span className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setMatchStatus(m.productId, m.siteId, 'confirmed')}>Confirmer</Button>
                    <Button size="sm" variant="ghost" onClick={() => setMatchStatus(m.productId, m.siteId, 'rejected')}>Rejeter</Button>
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      )}
      <section>
        <h3 className="mb-2 text-sm font-semibold text-white">Comparatif</h3>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-white/50"><th className="py-1">Produit</th><th>Mon prix</th>{sites.map((s) => <th key={s.id}>{s.domain}</th>)}</tr></thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-t border-white/10">
                <td className="py-1">{p.name}</td>
                <td>{p.myPrice != null ? `${p.myPrice} €` : '—'}</td>
                {sites.map((s) => {
                  const m = byKey.get(`${p.id}__${s.id}`)
                  const cheaper = m?.lastPrice != null && p.myPrice != null && m.lastPrice < p.myPrice
                  return <td key={s.id} className={cheaper ? 'text-red-400' : ''}>{m?.lastPrice != null ? `${m.lastPrice} €` : '—'}</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
```

- [ ] **Step 4: PriceWatchPanel — conteneur à onglets**

Create `src/features/priceWatch/PriceWatchPanel.tsx`:

```tsx
// src/features/priceWatch/PriceWatchPanel.tsx
import { useState } from 'react'
import { CatalogTab } from './components/CatalogTab'
import { SitesTab } from './components/SitesTab'
import { ComparisonTab } from './components/ComparisonTab'

const TABS = [
  { id: 'catalog', label: 'Catalogue' },
  { id: 'sites', label: 'Sites' },
  { id: 'comparison', label: 'Comparatif' },
] as const
type TabId = (typeof TABS)[number]['id']

export function PriceWatchPanel() {
  const [tab, setTab] = useState<TabId>('catalog')
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Veille tarifaire</h1>
        <p className="text-sm text-white/50">Surveillez les prix de vos produits chez vos concurrents.</p>
      </div>
      <div className="flex gap-1 border-b border-white/10">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm ${tab === t.id ? 'border-b-2 border-[#6366f1] text-white' : 'text-white/50'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'catalog' && <CatalogTab />}
      {tab === 'sites' && <SitesTab />}
      {tab === 'comparison' && <ComparisonTab />}
    </div>
  )
}
```

- [ ] **Step 5: Brancher dans DashboardPage**

Modify `src/pages/DashboardPage.tsx` :

5a. Ajouter le lazy import près des autres (~ligne 40) :

```typescript
const PriceWatchPanel = lazy(() => import('@/features/priceWatch/PriceWatchPanel').then((m) => ({ default: m.PriceWatchPanel })))
```

5b. Ajouter la branche de rendu dans la chaîne ternaire (après la branche `workflows`, ~ligne 503), en suivant le même wrapping `Suspense`/conteneur que les sections voisines :

```tsx
      ) : activeSection === 'price-watch' && canSee('price-watch') ? (
        <PriceWatchPanel />
```

> Reproduire **exactement** le wrapper utilisé par la branche `workflows` voisine (mêmes balises `Suspense`/`div` de mise en page) pour rester cohérent.

- [ ] **Step 6: Vérifier les types + lint**

Run: `npx tsc -b && npm run lint`
Expected: aucune erreur de type ; lint sans erreur bloquante.

- [ ] **Step 7: Commit**

```bash
git add src/features/priceWatch/PriceWatchPanel.tsx src/features/priceWatch/components/ src/pages/DashboardPage.tsx
git commit -m "feat(veille): panneau module (catalogue / sites / comparatif)"
```

---

## Task 11: Vérification d'ensemble + déploiement

**Files:** aucun nouveau — vérification globale.

- [ ] **Step 1: Build complet (types + bundle)**

Run: `npm run build`
Expected: succès (`tsc -b` + `vite build`).

- [ ] **Step 2: Suite de tests**

Run: `npm run test:run`
Expected: tous les tests passent (dont `src/features/priceWatch/core.test.ts`).

- [ ] **Step 3: Build functions**

Run: `cd functions && npm run build && npx vitest run`
Expected: succès + tests serveur OK.

- [ ] **Step 4: Code mort**

Run: `npx knip`
Expected: exit 0 (sinon traiter le vrai code mort signalé).

- [ ] **Step 5: Smoke test manuel (utilisateur)**

1. `npm run dev`, se connecter.
2. Ouvrir « Veille tarifaire » dans la sidebar.
3. Ajouter 1-2 produits (avec SKU ou Nom+Marque) + 1-2 sites concurrents.
4. Dans Workflows : `Cron → Veille tarifaire → Envoyer via Telegram`, lancer un run manuel.
5. Vérifier : premier run = pas d'alerte ; matchs douteux dans « À confirmer » ; après confirmation, l'URL est épinglée ; un 2ᵉ run après changement de prix émet une alerte.

- [ ] **Step 6: Déploiement (convention projet)**

```bash
firebase deploy --only hosting,functions
```

- [ ] **Step 7: Commit final (si ajustements)**

```bash
git add -A
git commit -m "chore(veille): vérifications build/tests + ajustements smoke test"
```

---

## Self-Review — couverture du spec

- §5 Modèle de données → Tasks 5, 8 (chemins + persistance client/serveur). ✓
- §6 Pipeline (clé relationnelle, cascade pattern→recherche, scrape, validation LLM, diff/positionnement, épinglage, ring buffer) → Tasks 1-4 (pur), 6 (client), 8 (serveur). ✓
- §7 Forme : module page → Tasks 9, 10 ; node pont client+serveur → Tasks 7, 8. ✓
- §8 Phases : ce plan = **v1** uniquement (CSV/dispo/historique-graphe/moteur-de-site/nouveau-concurrent = v2/v3, hors périmètre). ✓
- §9 Cas limites (sans SKU/EAN, anti-bot, premier relevé, URL morte→pending, prix illisible) → couverts par `core.ts` + gardes de l'orchestrateur. ✓ (« URL morte → pending » : la re-découverte sur 404 est gérée par le repli `!url` lorsque le scrape échoue ; à confirmer au smoke test.)
- §10 Tests → Tasks 1-4 (Vitest pur), 8 (wire-compat serveur), 11 (smoke). ✓

**Points laissés explicitement à vérifier pendant l'exécution** (pas des placeholders, mais des dépendances à confirmer dans le code existant) :
1. Helper LLM client (`llmComplete` vs `llmRouter`) — Task 6.
2. API de listage des feuilles PIM pour l'import catalogue — Task 10 Step 1.
3. Wrapper de mise en page exact de la branche `workflows` dans `DashboardPage` — Task 10 Step 5.
