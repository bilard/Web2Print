# Module DAM (Digital Asset Management) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un module DAM avec recherche stock images (Pexels + Unsplash), favoris/collections partagés, et intégration dans le Dashboard et l'éditeur canvas.

**Architecture:** Cloud Functions proxy les APIs Pexels/Unsplash (clés sécurisées côté serveur). Le frontend consomme ces functions via un store Zustand dédié. Le module s'intègre comme nouvelle section Dashboard et comme onglet Stock dans NanoBanaPanel.

**Tech Stack:** React 18, TypeScript, Zustand, Firebase Cloud Functions (Node 20), Firestore, Firebase Storage, Pexels API, Unsplash API, Tailwind, Lucide React

---

## File Structure

### New Files — Frontend

| File | Responsibility |
|------|---------------|
| `src/features/dam/types.ts` | Types DamImage, DamCollection, DamFilters, DamFavorite |
| `src/stores/dam.store.ts` | État global : query, filtres, résultats, pagination, onglets, lightbox |
| `src/features/dam/hooks/useDamSearch.ts` | Hook recherche texte via Cloud Function |
| `src/features/dam/hooks/useDamAutocomplete.ts` | Suggestions autocomplétion (récents + populaires) |
| `src/features/dam/hooks/useDamSearchByImage.ts` | Recherche par image similaire |
| `src/features/dam/hooks/useDamFavorites.ts` | CRUD favoris Firestore |
| `src/features/dam/hooks/useDamCollections.ts` | CRUD collections Firestore |
| `src/features/dam/hooks/useDamCanvasInsert.ts` | Insertion image sur canvas Fabric.js |
| `src/features/dam/components/DamPage.tsx` | Page complète DAM (section Dashboard) |
| `src/features/dam/components/DamSidebar.tsx` | Sidebar filtres (source, orientation, couleur, catégories) |
| `src/features/dam/components/DamSearchBar.tsx` | Barre de recherche avec autocomplétion dropdown |
| `src/features/dam/components/DamImageGrid.tsx` | Grille masonry résultats + scroll infini |
| `src/features/dam/components/DamImageCard.tsx` | Card image avec actions hover (favori, collection, download) |
| `src/features/dam/components/DamLightbox.tsx` | Prévisualisation plein écran + métadonnées photographe |
| `src/features/dam/components/DamCollections.tsx` | Gestion collections (liste, créer, renommer, supprimer) |
| `src/features/dam/components/DamFavorites.tsx` | Grille des favoris |
| `src/features/dam/components/DamRecentImages.tsx` | Historique images récentes |
| `src/features/dam/components/DamSearchByImage.tsx` | Zone upload image pour recherche similarité |
| `src/features/dam/components/DamStockTab.tsx` | Version compacte pour NanoBanaPanel (300px) |

### New Files — Backend (Cloud Functions)

| File | Responsibility |
|------|---------------|
| `functions/src/dam/searchImages.ts` | Proxy Pexels+Unsplash, fusion, déduplication, cache |
| `functions/src/dam/searchSimilar.ts` | Recherche par image similaire via Pexels |
| `functions/src/dam/autocomplete.ts` | Suggestions recherche populaires |
| `functions/src/dam/types.ts` | Types partagés backend |
| `functions/src/dam/pexelsClient.ts` | Client HTTP Pexels avec gestion rate limit |
| `functions/src/dam/unsplashClient.ts` | Client HTTP Unsplash avec gestion rate limit |

### Modified Files

| File | Change |
|------|--------|
| `functions/src/index.ts` | Exporter les 3 nouvelles Cloud Functions |
| `functions/package.json` | Ajouter `node-fetch` si absent |
| `src/features/nanobana/NanoBanaPanel.tsx` | Ajouter onglet "Stock" (4e tab) |
| `src/features/nanobana/types.ts` | Étendre `NanoBanaTab` avec `'stock'` |
| `src/stores/nanobana.store.ts` | Aucun changement nécessaire (tab géré par type union) |
| `src/components/panels/ToolBar.tsx` | Ajouter bouton Image avec dropdown 4 options |
| `src/pages/DashboardPage.tsx` | Ajouter section "images" dans sidebar + rendu DamPage |
| `firestore.rules` | Ajouter règles pour `dam_assets`, `dam_collections`, `dam_favorites` |
| `storage.rules` | Ajouter règles pour `dam/` |

---

## Task 1: Types et store DAM

**Files:**
- Create: `src/features/dam/types.ts`
- Create: `src/stores/dam.store.ts`

- [ ] **Step 1: Créer les types DAM**

```typescript
// src/features/dam/types.ts

export interface DamImage {
  id: string
  sourceProvider: 'pexels' | 'unsplash'
  sourceId: string
  sourceUrl: string
  thumbnailUrl: string
  previewUrl: string
  fullUrl: string
  width: number
  height: number
  photographer: string
  photographerUrl: string
  description: string
  tags: string[]
  color: string
  orientation: 'landscape' | 'portrait' | 'square'
}

export interface DamFilters {
  source: 'all' | 'pexels' | 'unsplash'
  orientation: 'all' | 'landscape' | 'portrait' | 'square'
  color: string | null
  category: string | null
  sortBy: 'relevant' | 'latest' | 'popular'
}

export interface DamCollection {
  id: string
  name: string
  description: string
  coverAssetId: string | null
  ownerId: string
  sharedWith: string[]
  visibility: 'private' | 'shared'
  assetIds: string[]
  createdAt: number
  updatedAt: number
}

export interface DamFavorite {
  userId: string
  assetId: string
  createdAt: number
}

export type DamTab = 'stock' | 'my-images' | 'favorites' | 'collections' | 'recent'

export const DAM_CATEGORIES = [
  { id: 'business', label: 'Business', icon: '🏢' },
  { id: 'nature', label: 'Nature', icon: '🌿' },
  { id: 'technology', label: 'Technologie', icon: '💻' },
  { id: 'food', label: 'Food', icon: '🍕' },
  { id: 'sport', label: 'Sport', icon: '🏃' },
  { id: 'travel', label: 'Voyage', icon: '✈️' },
  { id: 'people', label: 'Personnes', icon: '👤' },
  { id: 'art', label: 'Art', icon: '🎨' },
] as const

export const DAM_COLORS = [
  { value: 'red', hex: '#ef4444' },
  { value: 'orange', hex: '#f97316' },
  { value: 'yellow', hex: '#eab308' },
  { value: 'green', hex: '#22c55e' },
  { value: 'blue', hex: '#3b82f6' },
  { value: 'purple', hex: '#8b5cf6' },
  { value: 'pink', hex: '#ec4899' },
  { value: 'white', hex: '#ffffff' },
  { value: 'gray', hex: '#6b7280' },
  { value: 'black', hex: '#111111' },
] as const

export interface DamSearchResponse {
  images: DamImage[]
  totalResults: number
  hasMore: boolean
  nextPage: number
}
```

- [ ] **Step 2: Créer le store Zustand**

```typescript
// src/stores/dam.store.ts
import { create } from 'zustand'
import type { DamImage, DamFilters, DamTab } from '../features/dam/types'

interface DamState {
  query: string
  filters: DamFilters
  results: DamImage[]
  loading: boolean
  hasMore: boolean
  page: number
  totalResults: number

  suggestions: string[]
  recentSearches: string[]

  activeTab: DamTab
  lightboxImage: DamImage | null
  selectedCollection: string | null

  setQuery: (q: string) => void
  setFilters: (f: Partial<DamFilters>) => void
  setResults: (images: DamImage[], totalResults: number, hasMore: boolean) => void
  appendResults: (images: DamImage[], hasMore: boolean) => void
  setLoading: (loading: boolean) => void
  setPage: (page: number) => void
  setSuggestions: (suggestions: string[]) => void
  addRecentSearch: (term: string) => void
  setActiveTab: (tab: DamTab) => void
  openLightbox: (image: DamImage) => void
  closeLightbox: () => void
  setSelectedCollection: (id: string | null) => void
  reset: () => void
}

const DEFAULT_FILTERS: DamFilters = {
  source: 'all',
  orientation: 'all',
  color: null,
  category: null,
  sortBy: 'relevant',
}

const loadRecentSearches = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem('dam_recent_searches') || '[]')
  } catch {
    return []
  }
}

export const useDamStore = create<DamState>((set, get) => ({
  query: '',
  filters: DEFAULT_FILTERS,
  results: [],
  loading: false,
  hasMore: false,
  page: 1,
  totalResults: 0,

  suggestions: [],
  recentSearches: loadRecentSearches(),

  activeTab: 'stock',
  lightboxImage: null,
  selectedCollection: null,

  setQuery: (query) => set({ query }),
  setFilters: (partial) => set((s) => ({ filters: { ...s.filters, ...partial }, page: 1 })),
  setResults: (results, totalResults, hasMore) => set({ results, totalResults, hasMore }),
  appendResults: (images, hasMore) =>
    set((s) => ({ results: [...s.results, ...images], hasMore })),
  setLoading: (loading) => set({ loading }),
  setPage: (page) => set({ page }),
  setSuggestions: (suggestions) => set({ suggestions }),
  addRecentSearch: (term) => {
    const trimmed = term.trim()
    if (!trimmed) return
    const current = get().recentSearches.filter((s) => s !== trimmed)
    const updated = [trimmed, ...current].slice(0, 20)
    localStorage.setItem('dam_recent_searches', JSON.stringify(updated))
    set({ recentSearches: updated })
  },
  setActiveTab: (activeTab) => set({ activeTab }),
  openLightbox: (image) => set({ lightboxImage: image }),
  closeLightbox: () => set({ lightboxImage: null }),
  setSelectedCollection: (selectedCollection) => set({ selectedCollection }),
  reset: () =>
    set({
      query: '',
      filters: DEFAULT_FILTERS,
      results: [],
      loading: false,
      hasMore: false,
      page: 1,
      totalResults: 0,
      suggestions: [],
    }),
}))
```

- [ ] **Step 3: Vérifier la compilation TypeScript**

Run: `npx tsc --noEmit`
Expected: aucune erreur

- [ ] **Step 4: Commit**

```bash
git add src/features/dam/types.ts src/stores/dam.store.ts
git commit -m "feat(dam): add types and Zustand store"
```

---

## Task 2: Cloud Functions — Clients API Pexels et Unsplash

**Files:**
- Create: `functions/src/dam/types.ts`
- Create: `functions/src/dam/pexelsClient.ts`
- Create: `functions/src/dam/unsplashClient.ts`

- [ ] **Step 1: Créer les types backend**

```typescript
// functions/src/dam/types.ts

export interface DamImageResult {
  id: string
  sourceProvider: 'pexels' | 'unsplash'
  sourceId: string
  sourceUrl: string
  thumbnailUrl: string
  previewUrl: string
  fullUrl: string
  width: number
  height: number
  photographer: string
  photographerUrl: string
  description: string
  tags: string[]
  color: string
  orientation: 'landscape' | 'portrait' | 'square'
}

export interface SearchParams {
  query: string
  page: number
  perPage: number
  orientation?: 'landscape' | 'portrait' | 'squarish'
  color?: string
  orderBy?: 'relevant' | 'latest'
}

export interface SearchResult {
  images: DamImageResult[]
  totalResults: number
  hasMore: boolean
}
```

- [ ] **Step 2: Créer le client Pexels**

```typescript
// functions/src/dam/pexelsClient.ts
import { defineString } from 'firebase-functions/params'
import type { DamImageResult, SearchParams, SearchResult } from './types'

const pexelsApiKey = defineString('PEXELS_API_KEY')

const PEXELS_BASE = 'https://api.pexels.com/v1'

function getOrientation(w: number, h: number): 'landscape' | 'portrait' | 'square' {
  const ratio = w / h
  if (ratio > 1.2) return 'landscape'
  if (ratio < 0.8) return 'portrait'
  return 'square'
}

export async function searchPexels(params: SearchParams): Promise<SearchResult> {
  const url = new URL(`${PEXELS_BASE}/search`)
  url.searchParams.set('query', params.query)
  url.searchParams.set('page', String(params.page))
  url.searchParams.set('per_page', String(params.perPage))
  if (params.orientation) url.searchParams.set('orientation', params.orientation)
  if (params.color) url.searchParams.set('color', params.color)

  const res = await fetch(url.toString(), {
    headers: { Authorization: pexelsApiKey.value() },
  })

  if (!res.ok) {
    throw new Error(`Pexels API error: ${res.status} ${res.statusText}`)
  }

  const data = await res.json()

  const images: DamImageResult[] = (data.photos ?? []).map((p: any) => ({
    id: `pexels_${p.id}`,
    sourceProvider: 'pexels' as const,
    sourceId: String(p.id),
    sourceUrl: p.url,
    thumbnailUrl: p.src.small,
    previewUrl: p.src.medium,
    fullUrl: p.src.original,
    width: p.width,
    height: p.height,
    photographer: p.photographer,
    photographerUrl: p.photographer_url,
    description: p.alt || '',
    tags: [],
    color: p.avg_color || '#000000',
    orientation: getOrientation(p.width, p.height),
  }))

  return {
    images,
    totalResults: data.total_results ?? 0,
    hasMore: !!data.next_page,
  }
}

export async function searchPexelsSimilar(imageUrl: string): Promise<SearchResult> {
  // Pexels ne supporte pas directement la recherche par image,
  // on utilise la recherche curated comme fallback pour le MVP
  const res = await fetch(`${PEXELS_BASE}/curated?per_page=30`, {
    headers: { Authorization: pexelsApiKey.value() },
  })

  if (!res.ok) {
    throw new Error(`Pexels API error: ${res.status}`)
  }

  const data = await res.json()
  const images: DamImageResult[] = (data.photos ?? []).map((p: any) => ({
    id: `pexels_${p.id}`,
    sourceProvider: 'pexels' as const,
    sourceId: String(p.id),
    sourceUrl: p.url,
    thumbnailUrl: p.src.small,
    previewUrl: p.src.medium,
    fullUrl: p.src.original,
    width: p.width,
    height: p.height,
    photographer: p.photographer,
    photographerUrl: p.photographer_url,
    description: p.alt || '',
    tags: [],
    color: p.avg_color || '#000000',
    orientation: getOrientation(p.width, p.height),
  }))

  return { images, totalResults: images.length, hasMore: false }
}
```

- [ ] **Step 3: Créer le client Unsplash**

```typescript
// functions/src/dam/unsplashClient.ts
import { defineString } from 'firebase-functions/params'
import type { DamImageResult, SearchParams, SearchResult } from './types'

const unsplashApiKey = defineString('UNSPLASH_ACCESS_KEY')

const UNSPLASH_BASE = 'https://api.unsplash.com'

function getOrientation(w: number, h: number): 'landscape' | 'portrait' | 'square' {
  const ratio = w / h
  if (ratio > 1.2) return 'landscape'
  if (ratio < 0.8) return 'portrait'
  return 'square'
}

export async function searchUnsplash(params: SearchParams): Promise<SearchResult> {
  const url = new URL(`${UNSPLASH_BASE}/search/photos`)
  url.searchParams.set('query', params.query)
  url.searchParams.set('page', String(params.page))
  url.searchParams.set('per_page', String(params.perPage))
  if (params.orientation) url.searchParams.set('orientation', params.orientation)
  if (params.color) url.searchParams.set('color', params.color)
  if (params.orderBy) url.searchParams.set('order_by', params.orderBy)

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Client-ID ${unsplashApiKey.value()}` },
  })

  if (!res.ok) {
    throw new Error(`Unsplash API error: ${res.status} ${res.statusText}`)
  }

  const data = await res.json()

  const images: DamImageResult[] = (data.results ?? []).map((p: any) => ({
    id: `unsplash_${p.id}`,
    sourceProvider: 'unsplash' as const,
    sourceId: p.id,
    sourceUrl: p.links.html,
    thumbnailUrl: p.urls.small,
    previewUrl: p.urls.regular,
    fullUrl: p.urls.full,
    width: p.width,
    height: p.height,
    photographer: p.user.name,
    photographerUrl: p.user.links.html,
    description: p.description || p.alt_description || '',
    tags: (p.tags ?? []).map((t: any) => t.title).filter(Boolean),
    color: p.color || '#000000',
    orientation: getOrientation(p.width, p.height),
  }))

  return {
    images,
    totalResults: data.total ?? 0,
    hasMore: params.page * params.perPage < (data.total ?? 0),
  }
}
```

- [ ] **Step 4: Vérifier la compilation des functions**

Run: `cd functions && npx tsc --noEmit`
Expected: aucune erreur

- [ ] **Step 5: Commit**

```bash
git add functions/src/dam/
git commit -m "feat(dam): add Pexels and Unsplash API clients"
```

---

## Task 3: Cloud Functions — searchImages, searchSimilar, autocomplete

**Files:**
- Create: `functions/src/dam/searchImages.ts`
- Create: `functions/src/dam/searchSimilar.ts`
- Create: `functions/src/dam/autocomplete.ts`
- Modify: `functions/src/index.ts`

- [ ] **Step 1: Créer la function searchImages avec cache**

```typescript
// functions/src/dam/searchImages.ts
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { searchPexels } from './pexelsClient'
import { searchUnsplash } from './unsplashClient'
import type { DamImageResult } from './types'

// Cache en mémoire simple (TTL 5 min)
const cache = new Map<string, { data: any; expires: number }>()
const CACHE_TTL = 5 * 60 * 1000

function getCached<T>(key: string): T | null {
  const entry = cache.get(key)
  if (!entry || Date.now() > entry.expires) {
    cache.delete(key)
    return null
  }
  return entry.data as T
}

function setCache(key: string, data: any): void {
  cache.set(key, { data, expires: Date.now() + CACHE_TTL })
  // Nettoyage si le cache grossit trop
  if (cache.size > 500) {
    const now = Date.now()
    for (const [k, v] of cache) {
      if (now > v.expires) cache.delete(k)
    }
  }
}

export const searchImages = onCall(
  { region: 'europe-west1', maxInstances: 10 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentification requise')
    }

    const { query, page = 1, perPage = 15, source = 'all', orientation, color, orderBy } =
      request.data as {
        query: string
        page?: number
        perPage?: number
        source?: 'all' | 'pexels' | 'unsplash'
        orientation?: 'landscape' | 'portrait' | 'squarish'
        color?: string
        orderBy?: 'relevant' | 'latest'
      }

    if (!query || typeof query !== 'string') {
      throw new HttpsError('invalid-argument', 'query est requis')
    }

    const cacheKey = JSON.stringify({ query, page, perPage, source, orientation, color, orderBy })
    const cached = getCached<any>(cacheKey)
    if (cached) return cached

    const params = { query, page, perPage, orientation, color, orderBy }
    const promises: Promise<{ images: DamImageResult[]; totalResults: number; hasMore: boolean }>[] = []

    if (source === 'all' || source === 'pexels') {
      promises.push(searchPexels(params).catch(() => ({ images: [], totalResults: 0, hasMore: false })))
    }
    if (source === 'all' || source === 'unsplash') {
      promises.push(searchUnsplash(params).catch(() => ({ images: [], totalResults: 0, hasMore: false })))
    }

    const results = await Promise.all(promises)

    // Fusion et déduplication (par sourceId pour la même source)
    const seen = new Set<string>()
    const allImages: DamImageResult[] = []
    for (const r of results) {
      for (const img of r.images) {
        const key = `${img.sourceProvider}_${img.sourceId}`
        if (!seen.has(key)) {
          seen.add(key)
          allImages.push(img)
        }
      }
    }

    // Interleave : alterner les sources pour variété
    if (source === 'all' && results.length === 2) {
      const pexelsImgs = allImages.filter((i) => i.sourceProvider === 'pexels')
      const unsplashImgs = allImages.filter((i) => i.sourceProvider === 'unsplash')
      allImages.length = 0
      const maxLen = Math.max(pexelsImgs.length, unsplashImgs.length)
      for (let i = 0; i < maxLen; i++) {
        if (i < pexelsImgs.length) allImages.push(pexelsImgs[i])
        if (i < unsplashImgs.length) allImages.push(unsplashImgs[i])
      }
    }

    const totalResults = results.reduce((sum, r) => sum + r.totalResults, 0)
    const hasMore = results.some((r) => r.hasMore)

    const response = { images: allImages, totalResults, hasMore, nextPage: page + 1 }
    setCache(cacheKey, response)
    return response
  }
)
```

- [ ] **Step 2: Créer la function searchSimilar**

```typescript
// functions/src/dam/searchSimilar.ts
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { searchPexelsSimilar } from './pexelsClient'

export const searchSimilar = onCall(
  { region: 'europe-west1', maxInstances: 5 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentification requise')
    }

    const { imageUrl } = request.data as { imageUrl: string }

    if (!imageUrl || typeof imageUrl !== 'string') {
      throw new HttpsError('invalid-argument', 'imageUrl est requis')
    }

    const result = await searchPexelsSimilar(imageUrl)
    return result
  }
)
```

- [ ] **Step 3: Créer la function autocomplete**

```typescript
// functions/src/dam/autocomplete.ts
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'

export const damAutocomplete = onCall(
  { region: 'europe-west1', maxInstances: 5 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentification requise')
    }

    const { prefix } = request.data as { prefix: string }

    if (!prefix || prefix.length < 2) {
      return { suggestions: [] }
    }

    const lower = prefix.toLowerCase()

    // Recherche dans les termes populaires stockés dans Firestore
    const db = admin.firestore()
    const snap = await db
      .collection('dam_popular_searches')
      .where('term', '>=', lower)
      .where('term', '<=', lower + '\uf8ff')
      .orderBy('term')
      .limit(8)
      .get()

    const suggestions = snap.docs.map((d) => d.data().term as string)
    return { suggestions }
  }
)
```

- [ ] **Step 4: Exporter les functions dans index.ts**

Ajouter à `functions/src/index.ts` :

```typescript
// --- DAM ---
export { searchImages as damSearchImages } from './dam/searchImages'
export { searchSimilar as damSearchSimilar } from './dam/searchSimilar'
export { damAutocomplete } from './dam/autocomplete'
```

- [ ] **Step 5: Vérifier la compilation**

Run: `cd functions && npx tsc --noEmit`
Expected: aucune erreur

- [ ] **Step 6: Commit**

```bash
git add functions/src/dam/ functions/src/index.ts
git commit -m "feat(dam): add Cloud Functions (searchImages, searchSimilar, autocomplete)"
```

---

## Task 4: Règles Firestore et Storage

**Files:**
- Modify: `firestore.rules`
- Modify: `storage.rules`

- [ ] **Step 1: Ajouter les règles Firestore pour le DAM**

Ajouter dans `firestore.rules`, à l'intérieur du bloc `match /databases/{database}/documents` :

```
    // DAM Assets — lecture pour tous les users auth, écriture par le créateur
    match /dam_assets/{assetId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update, delete: if request.auth != null && resource.data.addedBy == request.auth.uid;
    }

    // DAM Collections — lecture si owner ou dans sharedWith, écriture par owner
    match /dam_collections/{collectionId} {
      allow read: if request.auth != null &&
        (resource.data.ownerId == request.auth.uid ||
         request.auth.uid in resource.data.sharedWith ||
         resource.data.visibility == 'shared');
      allow create: if request.auth != null;
      allow update, delete: if request.auth != null && resource.data.ownerId == request.auth.uid;
    }

    // DAM Favorites — chaque user gère ses propres favoris
    match /dam_favorites/{favId} {
      allow read: if request.auth != null && resource.data.userId == request.auth.uid;
      allow create: if request.auth != null && request.resource.data.userId == request.auth.uid;
      allow delete: if request.auth != null && resource.data.userId == request.auth.uid;
    }

    // DAM Popular Searches — lecture seule pour les users auth
    match /dam_popular_searches/{docId} {
      allow read: if request.auth != null;
    }
```

- [ ] **Step 2: Ajouter les règles Storage pour le DAM**

Ajouter dans `storage.rules` :

```
    // DAM images
    match /dam/{assetId}/{allPaths=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null
        && request.resource.size < 20 * 1024 * 1024
        && request.resource.contentType.matches('image/.*');
    }
```

- [ ] **Step 3: Commit**

```bash
git add firestore.rules storage.rules
git commit -m "feat(dam): add Firestore and Storage security rules"
```

---

## Task 5: Hook useDamSearch

**Files:**
- Create: `src/features/dam/hooks/useDamSearch.ts`

- [ ] **Step 1: Créer le hook de recherche**

```typescript
// src/features/dam/hooks/useDamSearch.ts
import { useCallback, useRef } from 'react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../../../lib/firebase/config'
import { useDamStore } from '../../../stores/dam.store'
import type { DamSearchResponse } from '../types'

const searchImagesFn = httpsCallable<any, DamSearchResponse>(functions, 'damSearchImages')

export function useDamSearch() {
  const {
    query,
    filters,
    page,
    loading,
    setResults,
    appendResults,
    setLoading,
    setPage,
    addRecentSearch,
  } = useDamStore()

  const abortRef = useRef(0)

  const search = useCallback(async () => {
    if (!query.trim()) return
    const id = ++abortRef.current
    setLoading(true)

    try {
      const orientationMap: Record<string, string | undefined> = {
        all: undefined,
        landscape: 'landscape',
        portrait: 'portrait',
        square: 'squarish',
      }

      const result = await searchImagesFn({
        query: filters.category ? `${query} ${filters.category}` : query,
        page: 1,
        perPage: 30,
        source: filters.source,
        orientation: orientationMap[filters.orientation],
        color: filters.color ?? undefined,
        orderBy: filters.sortBy === 'latest' ? 'latest' : 'relevant',
      })

      if (id !== abortRef.current) return

      setResults(result.data.images, result.data.totalResults, result.data.hasMore)
      setPage(1)
      addRecentSearch(query)
    } catch (err) {
      console.error('DAM search failed:', err)
      if (id === abortRef.current) {
        setResults([], 0, false)
      }
    } finally {
      if (id === abortRef.current) {
        setLoading(false)
      }
    }
  }, [query, filters, setResults, setLoading, setPage, addRecentSearch])

  const loadMore = useCallback(async () => {
    if (loading) return
    const nextPage = page + 1
    const id = ++abortRef.current
    setLoading(true)

    try {
      const orientationMap: Record<string, string | undefined> = {
        all: undefined,
        landscape: 'landscape',
        portrait: 'portrait',
        square: 'squarish',
      }

      const result = await searchImagesFn({
        query: filters.category ? `${query} ${filters.category}` : query,
        page: nextPage,
        perPage: 30,
        source: filters.source,
        orientation: orientationMap[filters.orientation],
        color: filters.color ?? undefined,
        orderBy: filters.sortBy === 'latest' ? 'latest' : 'relevant',
      })

      if (id !== abortRef.current) return

      appendResults(result.data.images, result.data.hasMore)
      setPage(nextPage)
    } catch (err) {
      console.error('DAM loadMore failed:', err)
    } finally {
      if (id === abortRef.current) {
        setLoading(false)
      }
    }
  }, [query, filters, page, loading, appendResults, setLoading, setPage])

  return { search, loadMore, loading }
}
```

- [ ] **Step 2: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: aucune erreur

- [ ] **Step 3: Commit**

```bash
git add src/features/dam/hooks/useDamSearch.ts
git commit -m "feat(dam): add useDamSearch hook"
```

---

## Task 6: Hooks useDamAutocomplete, useDamSearchByImage, useDamCanvasInsert

**Files:**
- Create: `src/features/dam/hooks/useDamAutocomplete.ts`
- Create: `src/features/dam/hooks/useDamSearchByImage.ts`
- Create: `src/features/dam/hooks/useDamCanvasInsert.ts`

- [ ] **Step 1: Créer useDamAutocomplete**

```typescript
// src/features/dam/hooks/useDamAutocomplete.ts
import { useCallback, useEffect, useRef, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../../../lib/firebase/config'
import { useDamStore } from '../../../stores/dam.store'

const autocompleteFn = httpsCallable<{ prefix: string }, { suggestions: string[] }>(
  functions,
  'damAutocomplete'
)

export function useDamAutocomplete() {
  const { recentSearches } = useDamStore()
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  const fetchSuggestions = useCallback(
    async (prefix: string) => {
      if (prefix.length < 2) {
        setSuggestions(recentSearches.slice(0, 5))
        return
      }

      // D'abord les récents qui matchent
      const localMatches = recentSearches
        .filter((s) => s.toLowerCase().startsWith(prefix.toLowerCase()))
        .slice(0, 3)

      try {
        const result = await autocompleteFn({ prefix })
        const remote = result.data.suggestions.filter((s) => !localMatches.includes(s))
        setSuggestions([...localMatches, ...remote].slice(0, 8))
      } catch {
        setSuggestions(localMatches)
      }
    },
    [recentSearches]
  )

  const onInputChange = useCallback(
    (value: string) => {
      clearTimeout(timerRef.current)
      if (!value.trim()) {
        setSuggestions(recentSearches.slice(0, 5))
        return
      }
      timerRef.current = setTimeout(() => fetchSuggestions(value), 200)
    },
    [fetchSuggestions, recentSearches]
  )

  useEffect(() => () => clearTimeout(timerRef.current), [])

  return { suggestions, open, setOpen, onInputChange }
}
```

- [ ] **Step 2: Créer useDamSearchByImage**

```typescript
// src/features/dam/hooks/useDamSearchByImage.ts
import { useCallback, useState } from 'react'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { httpsCallable } from 'firebase/functions'
import { storage, functions } from '../../../lib/firebase/config'
import { useDamStore } from '../../../stores/dam.store'
import type { DamSearchResponse } from '../types'

const searchSimilarFn = httpsCallable<{ imageUrl: string }, DamSearchResponse>(
  functions,
  'damSearchSimilar'
)

export function useDamSearchByImage() {
  const [uploading, setUploading] = useState(false)
  const { setResults, setLoading } = useDamStore()

  const searchByImage = useCallback(
    async (file: File) => {
      setUploading(true)
      setLoading(true)

      try {
        // Upload temporaire pour obtenir une URL accessible
        const tempRef = ref(storage, `dam/temp/${Date.now()}_${file.name}`)
        await uploadBytes(tempRef, file)
        const imageUrl = await getDownloadURL(tempRef)

        const result = await searchSimilarFn({ imageUrl })
        setResults(result.data.images, result.data.totalResults, result.data.hasMore)
      } catch (err) {
        console.error('Search by image failed:', err)
        setResults([], 0, false)
      } finally {
        setUploading(false)
        setLoading(false)
      }
    },
    [setResults, setLoading]
  )

  return { searchByImage, uploading }
}
```

- [ ] **Step 3: Créer useDamCanvasInsert**

```typescript
// src/features/dam/hooks/useDamCanvasInsert.ts
import { useCallback } from 'react'
import { FabricImage } from 'fabric'
import { globalFabricCanvas } from '../../../features/editor/CanvasContainer'
import { syncToStore } from '../../../features/editor/useAddObject'
import type { DamImage } from '../types'

export function useDamCanvasInsert() {
  const insertOnCanvas = useCallback(async (image: DamImage) => {
    const canvas = globalFabricCanvas
    if (!canvas) return

    try {
      const img = await FabricImage.fromURL(image.previewUrl, { crossOrigin: 'anonymous' })

      // Dimensionner : max 400px de large, proportionnel
      const maxWidth = 400
      if (img.width && img.width > maxWidth) {
        const scale = maxWidth / img.width
        img.scale(scale)
      }

      // Centrer sur le viewport
      const center = canvas.getCenterPoint()
      img.set({
        left: center.x - (img.getScaledWidth() / 2),
        top: center.y - (img.getScaledHeight() / 2),
        data: {
          sourceProvider: image.sourceProvider,
          sourceId: image.sourceId,
          photographer: image.photographer,
          photographerUrl: image.photographerUrl,
        },
      })

      canvas.add(img)
      canvas.setActiveObject(img)
      canvas.requestRenderAll()
      syncToStore(canvas)
    } catch (err) {
      console.error('Failed to insert DAM image on canvas:', err)
    }
  }, [])

  return { insertOnCanvas }
}
```

- [ ] **Step 4: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: aucune erreur

- [ ] **Step 5: Commit**

```bash
git add src/features/dam/hooks/
git commit -m "feat(dam): add autocomplete, search-by-image, and canvas insert hooks"
```

---

## Task 7: Hooks useDamFavorites et useDamCollections

**Files:**
- Create: `src/features/dam/hooks/useDamFavorites.ts`
- Create: `src/features/dam/hooks/useDamCollections.ts`

- [ ] **Step 1: Créer useDamFavorites**

```typescript
// src/features/dam/hooks/useDamFavorites.ts
import { useCallback, useEffect, useState } from 'react'
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../../../lib/firebase/config'
import { useAuthStore } from '../../../stores/auth.store'
import type { DamImage } from '../types'

export function useDamFavorites() {
  const user = useAuthStore((s) => s.user)
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set())
  const [favoriteImages, setFavoriteImages] = useState<DamImage[]>([])
  const [loading, setLoading] = useState(false)

  // Écouter les favoris en temps réel
  useEffect(() => {
    if (!user?.uid) return

    const q = query(
      collection(db, 'dam_favorites'),
      where('userId', '==', user.uid)
    )

    const unsub = onSnapshot(q, (snap) => {
      const ids = new Set<string>()
      snap.docs.forEach((d) => ids.add(d.data().assetId))
      setFavoriteIds(ids)
    })

    return unsub
  }, [user?.uid])

  const toggleFavorite = useCallback(
    async (image: DamImage) => {
      if (!user?.uid) return

      const docId = `${user.uid}_${image.id}`
      const ref = doc(db, 'dam_favorites', docId)

      if (favoriteIds.has(image.id)) {
        await deleteDoc(ref)
      } else {
        // Sauvegarder aussi l'image dans dam_assets si pas encore fait
        const assetRef = doc(db, 'dam_assets', image.id)
        await setDoc(assetRef, {
          sourceProvider: image.sourceProvider,
          sourceId: image.sourceId,
          sourceUrl: image.sourceUrl,
          thumbnailUrl: image.thumbnailUrl,
          previewUrl: image.previewUrl,
          fullUrl: image.fullUrl,
          width: image.width,
          height: image.height,
          photographer: image.photographer,
          photographerUrl: image.photographerUrl,
          description: image.description,
          tags: image.tags,
          color: image.color,
          orientation: image.orientation,
          addedBy: user.uid,
          addedAt: serverTimestamp(),
          usageCount: 0,
        }, { merge: true })

        await setDoc(ref, {
          userId: user.uid,
          assetId: image.id,
          createdAt: serverTimestamp(),
        })
      }
    },
    [user?.uid, favoriteIds]
  )

  const isFavorite = useCallback(
    (imageId: string) => favoriteIds.has(imageId),
    [favoriteIds]
  )

  return { favoriteIds, favoriteImages, loading, toggleFavorite, isFavorite }
}
```

- [ ] **Step 2: Créer useDamCollections**

```typescript
// src/features/dam/hooks/useDamCollections.ts
import { useCallback, useEffect, useState } from 'react'
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../../../lib/firebase/config'
import { useAuthStore } from '../../../stores/auth.store'
import type { DamCollection } from '../types'

export function useDamCollections() {
  const user = useAuthStore((s) => s.user)
  const [collections, setCollections] = useState<DamCollection[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!user?.uid) return
    setLoading(true)

    const q = query(
      collection(db, 'dam_collections'),
      where('ownerId', '==', user.uid)
    )

    const unsub = onSnapshot(q, (snap) => {
      const cols = snap.docs.map((d) => ({ id: d.id, ...d.data() } as DamCollection))
      setCollections(cols)
      setLoading(false)
    })

    return unsub
  }, [user?.uid])

  const createCollection = useCallback(
    async (name: string, description = '') => {
      if (!user?.uid) return null

      const ref = await addDoc(collection(db, 'dam_collections'), {
        name,
        description,
        coverAssetId: null,
        ownerId: user.uid,
        sharedWith: [],
        visibility: 'private',
        assetIds: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })

      return ref.id
    },
    [user?.uid]
  )

  const addToCollection = useCallback(
    async (collectionId: string, assetId: string) => {
      const ref = doc(db, 'dam_collections', collectionId)
      await updateDoc(ref, {
        assetIds: arrayUnion(assetId),
        updatedAt: serverTimestamp(),
      })
    },
    []
  )

  const removeFromCollection = useCallback(
    async (collectionId: string, assetId: string) => {
      const ref = doc(db, 'dam_collections', collectionId)
      await updateDoc(ref, {
        assetIds: arrayRemove(assetId),
        updatedAt: serverTimestamp(),
      })
    },
    []
  )

  const deleteCollection = useCallback(
    async (collectionId: string) => {
      await deleteDoc(doc(db, 'dam_collections', collectionId))
    },
    []
  )

  const renameCollection = useCallback(
    async (collectionId: string, name: string) => {
      await updateDoc(doc(db, 'dam_collections', collectionId), {
        name,
        updatedAt: serverTimestamp(),
      })
    },
    []
  )

  return {
    collections,
    loading,
    createCollection,
    addToCollection,
    removeFromCollection,
    deleteCollection,
    renameCollection,
  }
}
```

- [ ] **Step 3: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: aucune erreur

- [ ] **Step 4: Commit**

```bash
git add src/features/dam/hooks/useDamFavorites.ts src/features/dam/hooks/useDamCollections.ts
git commit -m "feat(dam): add favorites and collections hooks"
```

---

## Task 8: Composants UI — DamSearchBar et DamSidebar

**Files:**
- Create: `src/features/dam/components/DamSearchBar.tsx`
- Create: `src/features/dam/components/DamSidebar.tsx`

- [ ] **Step 1: Créer DamSearchBar avec autocomplétion**

```tsx
// src/features/dam/components/DamSearchBar.tsx
import { useCallback, useRef, useState } from 'react'
import { Search, X, Clock } from 'lucide-react'
import { useDamStore } from '../../../stores/dam.store'
import { useDamSearch } from '../hooks/useDamSearch'
import { useDamAutocomplete } from '../hooks/useDamAutocomplete'

export function DamSearchBar() {
  const { query, setQuery } = useDamStore()
  const { search } = useDamSearch()
  const { suggestions, open, setOpen, onInputChange } = useDamAutocomplete()
  const [inputValue, setInputValue] = useState(query)
  const inputRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  const handleChange = useCallback(
    (value: string) => {
      setInputValue(value)
      onInputChange(value)
      setOpen(true)
    },
    [onInputChange, setOpen]
  )

  const handleSubmit = useCallback(
    (term?: string) => {
      const q = term ?? inputValue
      setInputValue(q)
      setQuery(q)
      setOpen(false)
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => search(), 50)
    },
    [inputValue, setQuery, search, setOpen]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleSubmit()
      if (e.key === 'Escape') setOpen(false)
    },
    [handleSubmit, setOpen]
  )

  const handleClear = useCallback(() => {
    setInputValue('')
    setQuery('')
    setOpen(false)
    inputRef.current?.focus()
  }, [setQuery, setOpen])

  return (
    <div className="relative">
      <div className="flex items-center bg-[#111] border border-white/10 rounded-lg h-9 px-3 gap-2 focus-within:border-indigo-500/50">
        <Search className="w-4 h-4 text-white/30 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          placeholder="Rechercher des images..."
          className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 outline-none"
        />
        {inputValue && (
          <button onClick={handleClear} className="text-white/30 hover:text-white/60">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {open && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-[#1a1a1a] border border-white/10 rounded-lg py-1 z-50 shadow-xl">
          {suggestions.map((s) => (
            <button
              key={s}
              onMouseDown={() => handleSubmit(s)}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-white/70 hover:bg-white/5 hover:text-white text-left"
            >
              <Clock className="w-3 h-3 text-white/20" />
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Créer DamSidebar**

```tsx
// src/features/dam/components/DamSidebar.tsx
import { Camera } from 'lucide-react'
import { useDamStore } from '../../../stores/dam.store'
import { DAM_CATEGORIES, DAM_COLORS } from '../types'
import { DamSearchBar } from './DamSearchBar'
import { DamSearchByImage } from './DamSearchByImage'

const SOURCES = [
  { value: 'all' as const, label: 'Toutes' },
  { value: 'pexels' as const, label: 'Pexels' },
  { value: 'unsplash' as const, label: 'Unsplash' },
]

const ORIENTATIONS = [
  { value: 'all' as const, label: 'Tout' },
  { value: 'landscape' as const, label: 'Paysage' },
  { value: 'portrait' as const, label: 'Portrait' },
  { value: 'square' as const, label: 'Carré' },
]

export function DamSidebar() {
  const { filters, setFilters } = useDamStore()

  return (
    <div className="w-[200px] bg-[#141414] border-r border-white/5 p-4 flex flex-col gap-4 overflow-y-auto shrink-0">
      <DamSearchBar />
      <DamSearchByImage />

      {/* Source */}
      <div>
        <div className="text-[9px] text-white/40 uppercase tracking-wider mb-1.5">Source</div>
        <div className="flex flex-wrap gap-1">
          {SOURCES.map((s) => (
            <button
              key={s.value}
              onClick={() => setFilters({ source: s.value })}
              className={`px-2 py-1 rounded text-[10px] transition ${
                filters.source === s.value
                  ? 'bg-indigo-500/20 text-indigo-400'
                  : 'bg-white/5 text-white/50 hover:bg-white/10'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Orientation */}
      <div>
        <div className="text-[9px] text-white/40 uppercase tracking-wider mb-1.5">Orientation</div>
        <div className="flex flex-wrap gap-1">
          {ORIENTATIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => setFilters({ orientation: o.value })}
              className={`px-2 py-1 rounded text-[10px] transition ${
                filters.orientation === o.value
                  ? 'bg-indigo-500/20 text-indigo-400'
                  : 'bg-white/5 text-white/50 hover:bg-white/10'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Couleur */}
      <div>
        <div className="text-[9px] text-white/40 uppercase tracking-wider mb-1.5">Couleur dominante</div>
        <div className="flex flex-wrap gap-1.5">
          {DAM_COLORS.map((c) => (
            <button
              key={c.value}
              onClick={() => setFilters({ color: filters.color === c.value ? null : c.value })}
              className={`w-5 h-5 rounded-full border-2 transition ${
                filters.color === c.value ? 'border-indigo-400 scale-110' : 'border-transparent'
              }`}
              style={{ backgroundColor: c.hex }}
              title={c.value}
            />
          ))}
        </div>
      </div>

      {/* Catégories */}
      <div>
        <div className="text-[9px] text-white/40 uppercase tracking-wider mb-1.5">Catégories</div>
        <div className="flex flex-col gap-0.5">
          {DAM_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() =>
                setFilters({ category: filters.category === cat.id ? null : cat.id })
              }
              className={`flex items-center gap-2 px-1.5 py-1 rounded text-[11px] text-left transition ${
                filters.category === cat.id
                  ? 'bg-indigo-500/20 text-indigo-400'
                  : 'text-white/50 hover:text-white/70 hover:bg-white/5'
              }`}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: aucune erreur

- [ ] **Step 4: Commit**

```bash
git add src/features/dam/components/DamSearchBar.tsx src/features/dam/components/DamSidebar.tsx
git commit -m "feat(dam): add DamSearchBar and DamSidebar components"
```

---

## Task 9: Composants UI — DamImageCard, DamImageGrid, DamSearchByImage

**Files:**
- Create: `src/features/dam/components/DamImageCard.tsx`
- Create: `src/features/dam/components/DamImageGrid.tsx`
- Create: `src/features/dam/components/DamSearchByImage.tsx`

- [ ] **Step 1: Créer DamImageCard**

```tsx
// src/features/dam/components/DamImageCard.tsx
import { Heart, Plus, Download } from 'lucide-react'
import { useDamStore } from '../../../stores/dam.store'
import { useDamFavorites } from '../hooks/useDamFavorites'
import type { DamImage } from '../types'

interface Props {
  image: DamImage
  onAddToCollection?: (image: DamImage) => void
}

export function DamImageCard({ image, onAddToCollection }: Props) {
  const { openLightbox } = useDamStore()
  const { isFavorite, toggleFavorite } = useDamFavorites()
  const fav = isFavorite(image.id)

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', image.previewUrl)
    e.dataTransfer.setData('application/dam-image', JSON.stringify(image))
    e.dataTransfer.effectAllowed = 'copy'
  }

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const a = document.createElement('a')
    a.href = image.fullUrl
    a.target = '_blank'
    a.download = `${image.sourceProvider}_${image.sourceId}.jpg`
    a.click()
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onClick={() => openLightbox(image)}
      className="group relative rounded-md overflow-hidden cursor-pointer bg-white/5"
      style={{ aspectRatio: `${image.width}/${image.height}` }}
    >
      <img
        src={image.thumbnailUrl}
        alt={image.description}
        loading="lazy"
        className="w-full h-full object-cover"
      />

      {/* Overlay hover */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors">
        <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation()
              toggleFavorite(image)
            }}
            className={`p-1 rounded ${fav ? 'bg-red-500/80 text-white' : 'bg-black/60 text-white/80 hover:bg-black/80'}`}
          >
            <Heart className="w-3.5 h-3.5" fill={fav ? 'currentColor' : 'none'} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onAddToCollection?.(image)
            }}
            className="p-1 rounded bg-black/60 text-white/80 hover:bg-black/80"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button onClick={handleDownload} className="p-1 rounded bg-black/60 text-white/80 hover:bg-black/80">
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Badge source */}
        <div className="absolute bottom-1.5 left-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="px-1.5 py-0.5 rounded text-[8px] bg-black/60 text-white/80 capitalize">
            {image.sourceProvider}
          </span>
        </div>

        {/* Photographe */}
        <div className="absolute bottom-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="px-1.5 py-0.5 rounded text-[8px] bg-black/60 text-white/70 truncate max-w-[120px] block">
            {image.photographer}
          </span>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Créer DamImageGrid avec scroll infini**

```tsx
// src/features/dam/components/DamImageGrid.tsx
import { useEffect, useRef } from 'react'
import { Loader2 } from 'lucide-react'
import { useDamStore } from '../../../stores/dam.store'
import { useDamSearch } from '../hooks/useDamSearch'
import { DamImageCard } from './DamImageCard'
import type { DamImage } from '../types'

interface Props {
  onAddToCollection?: (image: DamImage) => void
}

export function DamImageGrid({ onAddToCollection }: Props) {
  const { results, loading, hasMore } = useDamStore()
  const { loadMore } = useDamSearch()
  const sentinelRef = useRef<HTMLDivElement>(null)

  // Intersection Observer pour scroll infini
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          loadMore()
        }
      },
      { threshold: 0.1 }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, loading, loadMore])

  if (!loading && results.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-white/30 text-sm">
        Recherchez des images pour commencer
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-4">
      <div className="columns-4 gap-2 [column-fill:_balance]">
        {results.map((image) => (
          <div key={image.id} className="break-inside-avoid mb-2">
            <DamImageCard image={image} onAddToCollection={onAddToCollection} />
          </div>
        ))}
      </div>

      {/* Sentinel pour scroll infini */}
      <div ref={sentinelRef} className="h-10" />

      {loading && (
        <div className="flex justify-center py-4">
          <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Créer DamSearchByImage**

```tsx
// src/features/dam/components/DamSearchByImage.tsx
import { useCallback, useRef } from 'react'
import { Camera, Loader2 } from 'lucide-react'
import { useDamSearchByImage } from '../hooks/useDamSearchByImage'

export function DamSearchByImage() {
  const { searchByImage, uploading } = useDamSearchByImage()
  const inputRef = useRef<HTMLInputElement>(null)

  const handleClick = useCallback(() => inputRef.current?.click(), [])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) searchByImage(file)
      e.target.value = ''
    },
    [searchByImage]
  )

  return (
    <>
      <input ref={inputRef} type="file" accept="image/*" onChange={handleChange} className="hidden" />
      <button
        onClick={handleClick}
        disabled={uploading}
        className="flex items-center justify-center gap-2 h-12 border border-dashed border-indigo-500/30 rounded-lg text-indigo-400 text-[10px] hover:border-indigo-500/60 hover:bg-indigo-500/5 transition disabled:opacity-50"
      >
        {uploading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Camera className="w-4 h-4" />
        )}
        <span>Chercher par image</span>
      </button>
    </>
  )
}
```

- [ ] **Step 4: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: aucune erreur

- [ ] **Step 5: Commit**

```bash
git add src/features/dam/components/DamImageCard.tsx src/features/dam/components/DamImageGrid.tsx src/features/dam/components/DamSearchByImage.tsx
git commit -m "feat(dam): add DamImageCard, DamImageGrid, and DamSearchByImage"
```

---

## Task 10: Composants UI — DamLightbox

**Files:**
- Create: `src/features/dam/components/DamLightbox.tsx`

- [ ] **Step 1: Créer DamLightbox**

```tsx
// src/features/dam/components/DamLightbox.tsx
import { useEffect } from 'react'
import { X, Heart, Plus, Download, ExternalLink } from 'lucide-react'
import { useDamStore } from '../../../stores/dam.store'
import { useDamFavorites } from '../hooks/useDamFavorites'
import { useDamCanvasInsert } from '../hooks/useDamCanvasInsert'
import type { DamImage } from '../types'

export function DamLightbox() {
  const { lightboxImage, closeLightbox } = useDamStore()
  const { isFavorite, toggleFavorite } = useDamFavorites()
  const { insertOnCanvas } = useDamCanvasInsert()

  useEffect(() => {
    if (!lightboxImage) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [lightboxImage, closeLightbox])

  if (!lightboxImage) return null

  const image = lightboxImage
  const fav = isFavorite(image.id)

  const handleInsert = () => {
    insertOnCanvas(image)
    closeLightbox()
  }

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center"
      onClick={closeLightbox}
    >
      <div
        className="relative max-w-[90vw] max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => toggleFavorite(image)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition ${
                fav
                  ? 'bg-red-500/20 text-red-400'
                  : 'bg-white/10 text-white/70 hover:bg-white/15'
              }`}
            >
              <Heart className="w-4 h-4" fill={fav ? 'currentColor' : 'none'} />
              {fav ? 'Favori' : 'Ajouter aux favoris'}
            </button>
            <button
              onClick={handleInsert}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-indigo-500 text-white hover:bg-indigo-600 transition"
            >
              <Plus className="w-4 h-4" />
              Ajouter au canvas
            </button>
            <a
              href={image.fullUrl}
              target="_blank"
              rel="noopener"
              download
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-white/10 text-white/70 hover:bg-white/15 transition"
            >
              <Download className="w-4 h-4" />
              Télécharger
            </a>
          </div>
          <button onClick={closeLightbox} className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Image */}
        <div className="flex-1 flex items-center justify-center min-h-0 px-4">
          <img
            src={image.previewUrl}
            alt={image.description}
            className="max-w-full max-h-[70vh] object-contain rounded-lg"
          />
        </div>

        {/* Info bar */}
        <div className="flex items-center justify-between px-4 py-3 text-sm">
          <div className="flex items-center gap-2 text-white/50">
            <span className="capitalize font-medium text-white/70">{image.sourceProvider}</span>
            <span>·</span>
            <a
              href={image.photographerUrl}
              target="_blank"
              rel="noopener"
              className="hover:text-white transition flex items-center gap-1"
            >
              {image.photographer}
              <ExternalLink className="w-3 h-3" />
            </a>
            <span>·</span>
            <span>{image.width} × {image.height}</span>
          </div>
          {image.description && (
            <span className="text-white/40 text-xs max-w-[300px] truncate">
              {image.description}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: aucune erreur

- [ ] **Step 3: Commit**

```bash
git add src/features/dam/components/DamLightbox.tsx
git commit -m "feat(dam): add DamLightbox component"
```

---

## Task 11: Composants UI — DamCollections, DamFavorites, DamRecentImages

**Files:**
- Create: `src/features/dam/components/DamCollections.tsx`
- Create: `src/features/dam/components/DamFavorites.tsx`
- Create: `src/features/dam/components/DamRecentImages.tsx`

- [ ] **Step 1: Créer DamCollections**

```tsx
// src/features/dam/components/DamCollections.tsx
import { useState } from 'react'
import { Plus, Trash2, FolderOpen } from 'lucide-react'
import { useDamCollections } from '../hooks/useDamCollections'
import { useDamStore } from '../../../stores/dam.store'

export function DamCollections() {
  const { collections, loading, createCollection, deleteCollection } = useDamCollections()
  const { setSelectedCollection, setActiveTab } = useDamStore()
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  const handleCreate = async () => {
    if (!newName.trim()) return
    await createCollection(newName.trim())
    setNewName('')
    setCreating(false)
  }

  const handleOpenCollection = (id: string) => {
    setSelectedCollection(id)
    setActiveTab('my-images')
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-white/70">Collections</h3>
        <button
          onClick={() => setCreating(true)}
          className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 transition"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {creating && (
        <div className="flex gap-2 mb-4">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="Nom de la collection"
            className="flex-1 bg-[#111] border border-white/10 rounded px-2 py-1.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-indigo-500/50"
          />
          <button onClick={handleCreate} className="px-3 py-1.5 rounded bg-indigo-500 text-white text-sm hover:bg-indigo-600">
            OK
          </button>
          <button onClick={() => setCreating(false)} className="px-2 py-1.5 text-white/40 text-sm hover:text-white/60">
            ✕
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-center text-white/30 text-sm py-8">Chargement...</div>
      ) : collections.length === 0 ? (
        <div className="text-center text-white/30 text-sm py-8">Aucune collection</div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {collections.map((col) => (
            <div
              key={col.id}
              onClick={() => handleOpenCollection(col.id)}
              className="group relative bg-white/5 rounded-lg p-3 cursor-pointer hover:bg-white/10 transition"
            >
              <FolderOpen className="w-8 h-8 text-indigo-400/50 mb-2" />
              <div className="text-sm text-white/70 font-medium truncate">{col.name}</div>
              <div className="text-[10px] text-white/30">{col.assetIds.length} images</div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  deleteCollection(col.id)
                }}
                className="absolute top-2 right-2 p-1 rounded opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-400 hover:bg-red-500/10 transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Créer DamFavorites**

```tsx
// src/features/dam/components/DamFavorites.tsx
import { useEffect, useState } from 'react'
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore'
import { db } from '../../../lib/firebase/config'
import { useAuthStore } from '../../../stores/auth.store'
import { DamImageCard } from './DamImageCard'
import type { DamImage } from '../types'

export function DamFavorites() {
  const user = useAuthStore((s) => s.user)
  const [images, setImages] = useState<DamImage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user?.uid) return

    const load = async () => {
      setLoading(true)
      const q = query(collection(db, 'dam_favorites'), where('userId', '==', user.uid))
      const snap = await getDocs(q)
      const assetIds = snap.docs.map((d) => d.data().assetId)

      const assetPromises = assetIds.map(async (id) => {
        const assetDoc = await getDoc(doc(db, 'dam_assets', id))
        if (!assetDoc.exists()) return null
        return { id: assetDoc.id, ...assetDoc.data() } as DamImage
      })

      const assets = (await Promise.all(assetPromises)).filter(Boolean) as DamImage[]
      setImages(assets)
      setLoading(false)
    }

    load()
  }, [user?.uid])

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-white/30 text-sm">Chargement...</div>
  }

  if (images.length === 0) {
    return <div className="flex-1 flex items-center justify-center text-white/30 text-sm">Aucun favori</div>
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-4">
      <div className="columns-4 gap-2 [column-fill:_balance]">
        {images.map((image) => (
          <div key={image.id} className="break-inside-avoid mb-2">
            <DamImageCard image={image} />
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Créer DamRecentImages**

```tsx
// src/features/dam/components/DamRecentImages.tsx
import { useEffect, useState } from 'react'
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore'
import { db } from '../../../lib/firebase/config'
import { useAuthStore } from '../../../stores/auth.store'
import { DamImageCard } from './DamImageCard'
import type { DamImage } from '../types'

export function DamRecentImages() {
  const user = useAuthStore((s) => s.user)
  const [images, setImages] = useState<DamImage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user?.uid) return

    const load = async () => {
      setLoading(true)
      const q = query(
        collection(db, 'dam_assets'),
        where('addedBy', '==', user.uid),
        orderBy('addedAt', 'desc'),
        limit(60)
      )
      const snap = await getDocs(q)
      const assets = snap.docs.map((d) => ({ id: d.id, ...d.data() } as DamImage))
      setImages(assets)
      setLoading(false)
    }

    load()
  }, [user?.uid])

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-white/30 text-sm">Chargement...</div>
  }

  if (images.length === 0) {
    return <div className="flex-1 flex items-center justify-center text-white/30 text-sm">Aucune image récente</div>
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-4">
      <div className="columns-4 gap-2 [column-fill:_balance]">
        {images.map((image) => (
          <div key={image.id} className="break-inside-avoid mb-2">
            <DamImageCard image={image} />
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: aucune erreur

- [ ] **Step 5: Commit**

```bash
git add src/features/dam/components/DamCollections.tsx src/features/dam/components/DamFavorites.tsx src/features/dam/components/DamRecentImages.tsx
git commit -m "feat(dam): add DamCollections, DamFavorites, and DamRecentImages"
```

---

## Task 12: DamPage — Page complète Dashboard

**Files:**
- Create: `src/features/dam/components/DamPage.tsx`

- [ ] **Step 1: Créer DamPage**

```tsx
// src/features/dam/components/DamPage.tsx
import { useDamStore } from '../../../stores/dam.store'
import { DamSidebar } from './DamSidebar'
import { DamImageGrid } from './DamImageGrid'
import { DamFavorites } from './DamFavorites'
import { DamCollections } from './DamCollections'
import { DamRecentImages } from './DamRecentImages'
import { DamLightbox } from './DamLightbox'
import type { DamTab } from '../types'

const TABS: { id: DamTab; label: string }[] = [
  { id: 'stock', label: 'Stock' },
  { id: 'my-images', label: 'Mes images' },
  { id: 'favorites', label: 'Favoris ❤️' },
  { id: 'collections', label: 'Collections' },
  { id: 'recent', label: 'Récents' },
]

export function DamPage() {
  const { activeTab, setActiveTab, totalResults } = useDamStore()

  return (
    <div className="flex h-full">
      {/* Sidebar filtres — visible seulement sur l'onglet Stock */}
      {activeTab === 'stock' && <DamSidebar />}

      {/* Zone principale */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar : onglets + compteur */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
          <div className="flex">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3.5 py-1.5 text-[11px] transition border-b-2 ${
                  activeTab === tab.id
                    ? 'text-indigo-400 border-indigo-500'
                    : 'text-white/40 border-transparent hover:text-white/60'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {activeTab === 'stock' && totalResults > 0 && (
            <span className="text-[10px] text-white/30">
              {totalResults.toLocaleString()} résultats
            </span>
          )}
        </div>

        {/* Contenu par onglet */}
        {activeTab === 'stock' && <DamImageGrid />}
        {activeTab === 'my-images' && <DamRecentImages />}
        {activeTab === 'favorites' && <DamFavorites />}
        {activeTab === 'collections' && <DamCollections />}
        {activeTab === 'recent' && <DamRecentImages />}
      </div>

      <DamLightbox />
    </div>
  )
}
```

- [ ] **Step 2: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: aucune erreur

- [ ] **Step 3: Commit**

```bash
git add src/features/dam/components/DamPage.tsx
git commit -m "feat(dam): add DamPage (full Dashboard view)"
```

---

## Task 13: Intégration Dashboard — Section "Images"

**Files:**
- Modify: `src/pages/DashboardPage.tsx`

- [ ] **Step 1: Ajouter la section "images" au type Section**

Dans `DashboardPage.tsx`, modifier le type `Section` :

```typescript
// Avant
type Section = 'blank' | 'import' | 'library' | 'data' | 'gdrive' | 'settings' | 'taxonomies'

// Après
type Section = 'blank' | 'import' | 'library' | 'images' | 'data' | 'gdrive' | 'settings' | 'taxonomies'
```

- [ ] **Step 2: Ajouter l'entrée menu "Images"**

Dans le tableau `menuItems`, ajouter après l'entrée `library` :

```typescript
{ id: 'images' as Section, icon: ImageIcon, label: 'Images', accent: 'text-pink-400', activeBg: 'bg-pink-500/[0.1]', activeText: 'text-pink-300' },
```

Ajouter l'import en haut du fichier :

```typescript
import { ImageIcon } from 'lucide-react'
```

- [ ] **Step 3: Ajouter le rendu conditionnel DamPage**

Dans la zone de rendu conditionnelle (où `activeSection` détermine le contenu), ajouter :

```tsx
{activeSection === 'images' && <DamPage />}
```

Ajouter l'import lazy :

```typescript
import { DamPage } from '../features/dam/components/DamPage'
```

- [ ] **Step 4: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: aucune erreur

- [ ] **Step 5: Vérifier visuellement**

Run: `npm run dev`
Vérifier que la section "Images" apparaît dans la sidebar du Dashboard entre "Bibliothèque" et "Données", et que cliquer dessus affiche la page DAM.

- [ ] **Step 6: Commit**

```bash
git add src/pages/DashboardPage.tsx
git commit -m "feat(dam): integrate DAM page into Dashboard sidebar"
```

---

## Task 14: DamStockTab — Onglet compact pour l'éditeur

**Files:**
- Create: `src/features/dam/components/DamStockTab.tsx`

- [ ] **Step 1: Créer DamStockTab (version compacte 300px)**

```tsx
// src/features/dam/components/DamStockTab.tsx
import { useCallback, useEffect, useRef } from 'react'
import { Search, X, Camera, Loader2 } from 'lucide-react'
import { useDamStore } from '../../../stores/dam.store'
import { useDamSearch } from '../hooks/useDamSearch'
import { useDamSearchByImage } from '../hooks/useDamSearchByImage'
import { useDamCanvasInsert } from '../hooks/useDamCanvasInsert'
import { useDamFavorites } from '../hooks/useDamFavorites'
import { Heart } from 'lucide-react'
import type { DamImage } from '../types'

const SOURCES = [
  { value: 'all' as const, label: 'Tout' },
  { value: 'pexels' as const, label: 'Pexels' },
  { value: 'unsplash' as const, label: 'Unsplash' },
]

export function DamStockTab() {
  const { query, setQuery, filters, setFilters, results, loading, hasMore } = useDamStore()
  const { search, loadMore } = useDamSearch()
  const { searchByImage, uploading } = useDamSearchByImage()
  const { insertOnCanvas } = useDamCanvasInsert()
  const { isFavorite, toggleFavorite } = useDamFavorites()
  const inputRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const handleSearch = useCallback(() => {
    if (query.trim()) search()
  }, [query, search])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleSearch()
    },
    [handleSearch]
  )

  // Scroll infini
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) loadMore()
      },
      { threshold: 0.1 }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, loading, loadMore])

  const handleImageClick = (image: DamImage) => {
    insertOnCanvas(image)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-2">
        <div className="flex items-center bg-[#111] border border-white/10 rounded-md h-8 px-2 gap-1.5 focus-within:border-indigo-500/50">
          <Search className="w-3.5 h-3.5 text-white/30" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Rechercher..."
            className="flex-1 bg-transparent text-xs text-white placeholder:text-white/30 outline-none"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-white/30 hover:text-white/60">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Quick filters */}
      <div className="flex gap-1 px-2 pb-2 flex-wrap">
        {SOURCES.map((s) => (
          <button
            key={s.value}
            onClick={() => setFilters({ source: s.value })}
            className={`px-2 py-0.5 rounded-full text-[9px] transition ${
              filters.source === s.value
                ? 'bg-indigo-500/20 text-indigo-400'
                : 'bg-white/5 text-white/40 hover:bg-white/10'
            }`}
          >
            {s.label}
          </button>
        ))}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) searchByImage(f)
          e.target.value = ''
        }} />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="px-2 py-0.5 rounded-full text-[9px] bg-white/5 text-white/40 hover:bg-white/10 transition disabled:opacity-50"
        >
          {uploading ? <Loader2 className="w-3 h-3 animate-spin inline" /> : <Camera className="w-3 h-3 inline" />}
        </button>
      </div>

      {/* Grid compact 3 colonnes */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {!loading && results.length === 0 ? (
          <div className="text-center text-white/20 text-[10px] mt-8">
            Tapez un mot-clé pour chercher
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1">
            {results.map((image) => (
              <div
                key={image.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', image.previewUrl)
                  e.dataTransfer.setData('application/dam-image', JSON.stringify(image))
                }}
                onClick={() => handleImageClick(image)}
                className="group relative aspect-square rounded overflow-hidden cursor-pointer bg-white/5"
              >
                <img src={image.thumbnailUrl} alt={image.description} loading="lazy" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors">
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleFavorite(image) }}
                    className="absolute top-1 right-1 p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Heart className="w-3 h-3" fill={isFavorite(image.id) ? '#ef4444' : 'none'} stroke={isFavorite(image.id) ? '#ef4444' : 'white'} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div ref={sentinelRef} className="h-8" />
        {loading && (
          <div className="flex justify-center py-2">
            <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
          </div>
        )}
      </div>

      <div className="px-2 py-1.5 text-center text-[9px] text-white/20 border-t border-white/5">
        Cliquer ou glisser sur le canvas
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: aucune erreur

- [ ] **Step 3: Commit**

```bash
git add src/features/dam/components/DamStockTab.tsx
git commit -m "feat(dam): add DamStockTab (compact panel for editor)"
```

---

## Task 15: Intégration NanoBanaPanel — Onglet Stock

**Files:**
- Modify: `src/features/nanobana/types.ts`
- Modify: `src/features/nanobana/NanoBanaPanel.tsx`

- [ ] **Step 1: Étendre le type NanoBanaTab**

Dans `src/features/nanobana/types.ts`, modifier :

```typescript
// Avant
export type NanoBanaTab = 'gallery' | 'upload' | 'generate'

// Après
export type NanoBanaTab = 'gallery' | 'upload' | 'generate' | 'stock'
```

- [ ] **Step 2: Ajouter l'onglet Stock dans NanoBanaPanel**

Dans `src/features/nanobana/NanoBanaPanel.tsx`, ajouter l'import :

```typescript
import { DamStockTab } from '../dam/components/DamStockTab'
import { ImageIcon } from 'lucide-react'
```

Ajouter l'entrée dans le tableau `TABS` :

```typescript
{ id: 'stock', icon: ImageIcon, label: 'Stock' },
```

Ajouter le rendu conditionnel dans la section content (après le cas `generate`) :

```tsx
{tab === 'stock' && <DamStockTab />}
```

- [ ] **Step 3: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: aucune erreur

- [ ] **Step 4: Commit**

```bash
git add src/features/nanobana/types.ts src/features/nanobana/NanoBanaPanel.tsx
git commit -m "feat(dam): add Stock tab to NanoBanaPanel"
```

---

## Task 16: ToolBar — Bouton Image avec dropdown

**Files:**
- Modify: `src/components/panels/ToolBar.tsx`

- [ ] **Step 1: Ajouter le bouton Image avec dropdown**

Remplacer le contenu complet de `ToolBar.tsx` :

```tsx
// src/components/panels/ToolBar.tsx
import { useState, useRef, useEffect } from 'react'
import {
  MousePointer2,
  Type,
  Square,
  Circle,
  Minus,
  ImageIcon,
  Search,
  Upload,
  Sparkles,
  FolderOpen,
} from 'lucide-react'
import { useUIStore, type ActiveTool } from '../../stores/ui.store'
import { useEditorStore } from '../../stores/editor.store'
import { useNanoBanaStore } from '../../stores/nanobana.store'
import type { NanoBanaTab } from '../../features/nanobana/types'

const TOOL_SHAPE_MAP: Partial<Record<ActiveTool, string>> = {
  text: 'text',
  rect: 'rect',
  ellipse: 'ellipse',
  line: 'line',
}

const IMAGE_MENU_ITEMS: { id: NanoBanaTab; icon: typeof Search; label: string }[] = [
  { id: 'stock', icon: Search, label: 'Stock images' },
  { id: 'gallery', icon: FolderOpen, label: 'Mes images' },
  { id: 'upload', icon: Upload, label: 'Uploader' },
  { id: 'generate', icon: Sparkles, label: 'Générer (IA)' },
]

function ToolButton({
  tool,
  icon: Icon,
  tooltip,
}: {
  tool: ActiveTool
  icon: React.ComponentType<{ className?: string }>
  tooltip: string
}) {
  const { activeTool, setActiveTool } = useUIStore()
  const addObject = useEditorStore((s) => s.addObject)
  const isActive = activeTool === tool

  const handleClick = () => {
    const shapeType = TOOL_SHAPE_MAP[tool]
    if (shapeType) {
      addObject(shapeType)
      setActiveTool('select')
      return
    }
    setActiveTool(tool)
  }

  return (
    <button
      onClick={handleClick}
      title={tooltip}
      className={`w-8 h-8 flex items-center justify-center rounded transition ${
        isActive ? 'bg-indigo-500/20 text-indigo-400' : 'text-white/40 hover:text-white/70 hover:bg-white/5'
      }`}
    >
      <Icon className="w-4 h-4" />
    </button>
  )
}

function ImageMenuButton() {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const { setRightPanels, rightPanels } = useUIStore()
  const { setTab } = useNanoBanaStore()

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleSelect = (tab: NanoBanaTab) => {
    setTab(tab)
    // Ouvrir le panneau images s'il est collapsed
    const updated = rightPanels.map((p) =>
      p.id === 'images' ? { ...p, collapsed: false } : p
    )
    setRightPanels(updated)
    setOpen(false)
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((prev) => !prev)}
        title="Image (I)"
        className={`w-8 h-8 flex items-center justify-center rounded transition ${
          open ? 'bg-indigo-500/20 text-indigo-400' : 'text-white/40 hover:text-white/70 hover:bg-white/5'
        }`}
      >
        <ImageIcon className="w-4 h-4" />
      </button>

      {open && (
        <div className="absolute left-full top-0 ml-2 bg-[#1a1a1a] border border-white/10 rounded-lg py-1 w-[170px] shadow-xl z-50">
          {IMAGE_MENU_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => handleSelect(item.id)}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-[11px] text-white/70 hover:bg-white/5 hover:text-white transition text-left"
            >
              <item.icon className="w-4 h-4 text-white/40" />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function ToolBar() {
  return (
    <div className="w-11 bg-[#1a1a1a] border-r border-white/10 flex flex-col items-center py-2 gap-0.5 shrink-0">
      {/* Sélection */}
      <ToolButton tool="select" icon={MousePointer2} tooltip="Sélection (V)" />

      <div className="w-6 h-px bg-white/10 my-1" />

      {/* Création */}
      <ToolButton tool="text" icon={Type} tooltip="Texte (T)" />
      <ToolButton tool="rect" icon={Square} tooltip="Rectangle (R)" />
      <ToolButton tool="ellipse" icon={Circle} tooltip="Ellipse (E)" />
      <ToolButton tool="line" icon={Minus} tooltip="Ligne (L)" />

      <div className="w-6 h-px bg-white/10 my-1" />

      {/* Image */}
      <ImageMenuButton />
    </div>
  )
}
```

- [ ] **Step 2: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: aucune erreur

- [ ] **Step 3: Vérifier visuellement**

Run: `npm run dev`
Ouvrir un projet dans l'éditeur. Vérifier :
- Le bouton Image apparaît en bas du toolbar
- Cliquer dessus ouvre un dropdown avec 4 options
- Chaque option ouvre le panneau NanoBana sur le bon onglet

- [ ] **Step 4: Commit**

```bash
git add src/components/panels/ToolBar.tsx
git commit -m "feat(dam): add Image button with dropdown to ToolBar"
```

---

## Task 17: Déploiement Cloud Functions et configuration API keys

**Files:**
- Modify: `functions/package.json` (si besoin)

- [ ] **Step 1: Configurer les clés API Firebase Functions**

Run:
```bash
cd functions
firebase functions:secrets:set PEXELS_API_KEY
# Entrer la clé Pexels quand demandé
firebase functions:secrets:set UNSPLASH_ACCESS_KEY
# Entrer la clé Unsplash quand demandé
```

- [ ] **Step 2: Vérifier la compilation des functions**

Run: `cd functions && npm run build`
Expected: compilation OK, pas d'erreurs

- [ ] **Step 3: Déployer les functions**

Run: `firebase deploy --only functions`
Expected: déploiement réussi des 4 functions (scrapeCatalogForBrief + 3 DAM)

- [ ] **Step 4: Tester la recherche end-to-end**

Run: `npm run dev`
1. Ouvrir le Dashboard → section "Images"
2. Taper "mountain" dans la recherche
3. Vérifier que des résultats apparaissent depuis Pexels et Unsplash
4. Vérifier le scroll infini
5. Tester les filtres (source, orientation, couleur)

- [ ] **Step 5: Commit toutes les modifications restantes**

```bash
git add -A
git commit -m "feat(dam): complete DAM module integration"
```

---

## Résumé des tâches

| # | Tâche | Fichiers | Estimé |
|---|-------|----------|--------|
| 1 | Types et store DAM | 2 create | 5 min |
| 2 | Clients API Pexels/Unsplash | 3 create | 10 min |
| 3 | Cloud Functions (search, similar, autocomplete) | 3 create, 1 modify | 10 min |
| 4 | Règles Firestore/Storage | 2 modify | 3 min |
| 5 | Hook useDamSearch | 1 create | 5 min |
| 6 | Hooks autocomplete, searchByImage, canvasInsert | 3 create | 8 min |
| 7 | Hooks favorites et collections | 2 create | 8 min |
| 8 | DamSearchBar + DamSidebar | 2 create | 8 min |
| 9 | DamImageCard + DamImageGrid + DamSearchByImage | 3 create | 10 min |
| 10 | DamLightbox | 1 create | 5 min |
| 11 | DamCollections + DamFavorites + DamRecentImages | 3 create | 10 min |
| 12 | DamPage (page Dashboard) | 1 create | 5 min |
| 13 | Intégration Dashboard sidebar | 1 modify | 5 min |
| 14 | DamStockTab (panneau éditeur compact) | 1 create | 8 min |
| 15 | Intégration NanoBanaPanel | 2 modify | 3 min |
| 16 | ToolBar bouton Image + dropdown | 1 modify | 8 min |
| 17 | Déploiement + test end-to-end | deploy | 10 min |
