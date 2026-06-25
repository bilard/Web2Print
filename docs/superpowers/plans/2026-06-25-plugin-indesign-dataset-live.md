# Plugin InDesign ↔ dataSet Web2Print (live, round-trip) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à un plugin InDesign (UXP) de se connecter en live à un dataSet Web2Print pour baliser un document avec les champs (balisage XML natif) et prévisualiser une ligne (round-trip).

**Architecture:** Trois unités isolées. (1) Backend : Cloud Function HTTP `pluginApi` en lecture seule, gardée par un token personnel par utilisateur (hash en doc-id Firestore). (2) App Web2Print : section « Token plugin » dans les réglages (génération/révocation, 100 % client via Web Crypto + Firestore). (3) Plugin UXP : panneau qui lit l'API, pose des tags XML natifs InDesign (= `MarkupTag="XMLTag/Champ"` à l'export, déjà relu par `xmlElementStory.ts`), et remplit/restaure le contenu pour l'aperçu.

**Tech Stack:** Firebase Functions v2 (`onRequest`, region `europe-west1`), firebase-admin, TypeScript, Vitest (functions + app), Web Crypto API (génération token côté client), UXP (InDesign v18+) avec manifest v5, esbuild pour bundler le plugin.

## Global Constraints

- Region des Cloud Functions : `europe-west1` (verbatim, comme `workflowWebhook`).
- Functions : tests via `vitest run` ; logique pure isolée dans un module `*Core.ts` testable, handler `onRequest` mince par-dessus (calque `llm/proxyCore.ts` ↔ `llm/llmProxy.ts`).
- App : TypeScript strict, vérif types via `npx tsc -b` (project references — `tsc --noEmit` ne vérifie rien).
- App : ne JAMAIS modifier `src/components/ui/**`, `src/lib/firebase/config.ts`, `public/fonts/`.
- App : théming par tokens (`bg-surface`, `text-white` thémable, `text-[#fff]` blanc vrai) ; accent `#6366f1`.
- Token : format `w2p_<base64url(32 octets aléatoires)>` ; doc-id Firestore = `sha256hex(token)` ; on ne stocke JAMAIS le token en clair, seulement via son hash (= doc-id).
- Collection token : `pluginTokens/{tokenId}` = `{ uid, label, createdAt, lastUsedAt, revoked }`.
- Knip : baseline exit 0 — un symbole utilisé seulement dans son fichier ne doit PAS être exporté.
- Répondre/commenter en français.

## File Structure

**Backend (functions/)**
- `functions/src/plugin/pluginApiCore.ts` — logique pure (hash token, parsing de route, projection datasets/colonnes/ligne). Testable.
- `functions/src/plugin/pluginApiCore.test.ts` — tests Vitest du core.
- `functions/src/plugin/pluginApi.ts` — handler `onRequest` (admin SDK : auth par token, lecture Firestore, réponse JSON).
- `functions/src/index.ts` — ajout de l'export `pluginApi` (modif).

**Règles**
- `firestore.rules` — ajout du bloc `match /pluginTokens/{tokenId}` (modif).

**App Web2Print (src/)**
- `src/features/plugin-token/pluginTokenCrypto.ts` — génération token + sha256 hex (Web Crypto). Pur, testable.
- `src/features/plugin-token/pluginTokenCrypto.test.ts` — tests Vitest.
- `src/features/plugin-token/usePluginTokens.ts` — hook Firestore (create/list/revoke).
- `src/features/plugin-token/PluginTokenSection.tsx` — UI section réglages.
- `src/components/shared/SettingsPanel.tsx` — insertion de `<PluginTokenSection />` dans l'onglet Connecteurs (modif).

**Plugin UXP (indesign-plugin/)**
- `indesign-plugin/manifest.json` — manifeste UXP v5 (host InDesign, panneau, permission réseau).
- `indesign-plugin/package.json` — scripts esbuild + vitest.
- `indesign-plugin/src/lib/client.ts` — client API pur (build URL, mappers de réponse). Testable.
- `indesign-plugin/src/lib/client.test.ts` — tests Vitest.
- `indesign-plugin/src/lib/slug.ts` — slugify nom de champ → nom de tag XML valide. Pur, testable.
- `indesign-plugin/src/lib/slug.test.ts` — tests.
- `indesign-plugin/src/idml/tagging.ts` — pose de tags XML natifs (DOM InDesign). Smoke test.
- `indesign-plugin/src/idml/preview.ts` — remplir/restaurer le contenu pour l'aperçu. Smoke test.
- `indesign-plugin/src/panel.ts` — câblage UI ↔ client ↔ idml.
- `indesign-plugin/index.html` — markup du panneau.
- `indesign-plugin/SMOKE.md` — checklist de smoke test manuel.

---

## Task 1 : Core pur de `pluginApi` (hash, route, projections)

**Files:**
- Create: `functions/src/plugin/pluginApiCore.ts`
- Test: `functions/src/plugin/pluginApiCore.test.ts`

**Interfaces:**
- Consumes: rien (logique pure).
- Produces:
  - `hashToken(token: string): string` (sha256 hex)
  - `parseRoute(path: string): Route` où `type Route = { kind: 'list' } | { kind: 'columns'; docId: string } | { kind: 'row'; docId: string } | { kind: 'unknown' }`
  - `type DatasetSummary = { docId: string; fileName: string; sheetCount: number; rowCount: number }`
  - `type ColumnInfo = { key: string; label: string; fieldType: string }`
  - `type ValueEntry = { key: string; label: string; value: string }`
  - `type RowResult = { rowIndex: number; total: number; values: ValueEntry[] }`
  - `projectDataset(docId: string, data: Record<string, unknown>): DatasetSummary`
  - `firstSheetColumns(sheets: Sheet[]): ColumnInfo[]`
  - `projectRow(sheets: Sheet[], i: number): RowResult` (clamp `i` dans `[0, total-1]` ; `total = 0` ⇒ `values: []`)
  - `type Sheet = { columns: Array<{ key: string; label: string; fieldType?: string }>; rows: Array<Record<string, unknown>> }`

- [ ] **Step 1: Écrire les tests d'abord**

```ts
// functions/src/plugin/pluginApiCore.test.ts
import { describe, it, expect } from 'vitest'
import {
  hashToken, parseRoute, projectDataset, firstSheetColumns, projectRow,
} from './pluginApiCore'

describe('hashToken', () => {
  it('est déterministe et en hex sha256 (64 chars)', () => {
    const h = hashToken('w2p_abc')
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(hashToken('w2p_abc')).toBe(h)
  })
  it('diffère pour des tokens différents', () => {
    expect(hashToken('w2p_a')).not.toBe(hashToken('w2p_b'))
  })
})

describe('parseRoute', () => {
  it('liste', () => expect(parseRoute('/datasets')).toEqual({ kind: 'list' }))
  it('colonnes', () => expect(parseRoute('/datasets/abc')).toEqual({ kind: 'columns', docId: 'abc' }))
  it('ligne', () => expect(parseRoute('/datasets/abc/row')).toEqual({ kind: 'row', docId: 'abc' }))
  it('tolère un slash final', () => expect(parseRoute('/datasets/')).toEqual({ kind: 'list' }))
  it('inconnu', () => expect(parseRoute('/nope')).toEqual({ kind: 'unknown' }))
})

describe('projectDataset', () => {
  it('projette les métadonnées', () => {
    expect(projectDataset('d1', { fileName: 'Catalogue', sheetCount: 2, totalRows: 120 }))
      .toEqual({ docId: 'd1', fileName: 'Catalogue', sheetCount: 2, rowCount: 120 })
  })
  it('tolère les champs manquants', () => {
    expect(projectDataset('d1', {})).toEqual({ docId: 'd1', fileName: 'd1', sheetCount: 0, rowCount: 0 })
  })
})

const sheets = [{
  columns: [
    { key: 'ref', label: 'Référence', fieldType: 'text' },
    { key: 'prix', label: 'Prix', fieldType: 'currency' },
  ],
  rows: [
    { _id: 'r0', ref: 'A-1', prix: 9.9 },
    { _id: 'r1', ref: 'B-2', prix: null },
  ],
}]

describe('firstSheetColumns', () => {
  it('mappe key/label/fieldType de la 1re feuille', () => {
    expect(firstSheetColumns(sheets)).toEqual([
      { key: 'ref', label: 'Référence', fieldType: 'text' },
      { key: 'prix', label: 'Prix', fieldType: 'currency' },
    ])
  })
  it('feuilles vides → []', () => expect(firstSheetColumns([])).toEqual([]))
})

describe('projectRow', () => {
  it('résout les valeurs par colonne, en string', () => {
    expect(projectRow(sheets, 0)).toEqual({
      rowIndex: 0, total: 2,
      values: [
        { key: 'ref', label: 'Référence', value: 'A-1' },
        { key: 'prix', label: 'Prix', value: '9.9' },
      ],
    })
  })
  it('null/undefined → chaîne vide', () => {
    expect(projectRow(sheets, 1).values[1]).toEqual({ key: 'prix', label: 'Prix', value: '' })
  })
  it('clamp l’index hors borne', () => {
    expect(projectRow(sheets, 99).rowIndex).toBe(1)
    expect(projectRow(sheets, -5).rowIndex).toBe(0)
  })
  it('aucune ligne → values vide', () => {
    expect(projectRow([{ columns: sheets[0].columns, rows: [] }], 0))
      .toEqual({ rowIndex: 0, total: 0, values: [] })
  })
})
```

- [ ] **Step 2: Lancer les tests, vérifier qu'ils échouent**

Run: `cd functions && npx vitest run src/plugin/pluginApiCore.test.ts`
Expected: FAIL — `Cannot find module './pluginApiCore'`.

- [ ] **Step 3: Implémenter le core**

```ts
// functions/src/plugin/pluginApiCore.ts
import { createHash } from 'node:crypto'

export type Route =
  | { kind: 'list' }
  | { kind: 'columns'; docId: string }
  | { kind: 'row'; docId: string }
  | { kind: 'unknown' }

export interface DatasetSummary { docId: string; fileName: string; sheetCount: number; rowCount: number }
export interface ColumnInfo { key: string; label: string; fieldType: string }
export interface ValueEntry { key: string; label: string; value: string }
export interface RowResult { rowIndex: number; total: number; values: ValueEntry[] }
export interface Sheet {
  columns: Array<{ key: string; label: string; fieldType?: string }>
  rows: Array<Record<string, unknown>>
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function parseRoute(path: string): Route {
  const parts = path.split('/').filter(Boolean) // "/datasets/abc/row" → ["datasets","abc","row"]
  if (parts[0] !== 'datasets') return { kind: 'unknown' }
  if (parts.length === 1) return { kind: 'list' }
  const docId = parts[1]
  if (parts.length === 2) return { kind: 'columns', docId }
  if (parts.length === 3 && parts[2] === 'row') return { kind: 'row', docId }
  return { kind: 'unknown' }
}

export function projectDataset(docId: string, data: Record<string, unknown>): DatasetSummary {
  return {
    docId,
    fileName: typeof data.fileName === 'string' ? data.fileName : docId,
    sheetCount: typeof data.sheetCount === 'number' ? data.sheetCount : 0,
    rowCount: typeof data.totalRows === 'number' ? data.totalRows : 0,
  }
}

export function firstSheetColumns(sheets: Sheet[]): ColumnInfo[] {
  const cols = sheets[0]?.columns ?? []
  return cols.map((c) => ({ key: c.key, label: c.label, fieldType: c.fieldType ?? 'text' }))
}

export function projectRow(sheets: Sheet[], i: number): RowResult {
  const sheet = sheets[0]
  const rows = sheet?.rows ?? []
  const total = rows.length
  if (total === 0) return { rowIndex: 0, total: 0, values: [] }
  const rowIndex = Math.max(0, Math.min(i, total - 1))
  const row = rows[rowIndex]
  const values: ValueEntry[] = (sheet?.columns ?? []).map((c) => {
    const raw = row[c.key]
    return { key: c.key, label: c.label, value: raw === undefined || raw === null ? '' : String(raw) }
  })
  return { rowIndex, total, values }
}
```

- [ ] **Step 4: Lancer les tests, vérifier qu'ils passent**

Run: `cd functions && npx vitest run src/plugin/pluginApiCore.test.ts`
Expected: PASS (tous).

- [ ] **Step 5: Commit**

```bash
git add functions/src/plugin/pluginApiCore.ts functions/src/plugin/pluginApiCore.test.ts
git commit -m "feat(plugin-api): core pur (hash token, route, projection dataset/colonnes/ligne)"
```

---

## Task 2 : Handler HTTP `pluginApi` (auth token + lecture Firestore)

**Files:**
- Create: `functions/src/plugin/pluginApi.ts`
- Modify: `functions/src/index.ts` (ajout export)

**Interfaces:**
- Consumes: tout le core de Task 1 (`hashToken`, `parseRoute`, `projectDataset`, `firstSheetColumns`, `projectRow`).
- Produces: `export const pluginApi` (Cloud Function `onRequest`).
- Contrat HTTP (base `https://europe-west1-web2print-6fe5a.cloudfunctions.net/pluginApi`) :
  - Header obligatoire `Authorization: Bearer w2p_…`
  - `GET /datasets` → `{ datasets: DatasetSummary[] }`
  - `GET /datasets/:docId` → `{ columns: ColumnInfo[] }`
  - `GET /datasets/:docId/row?i=N` → `RowResult`
  - 401 si token absent/invalide/révoqué ; 404 si docId pas au `uid` ; 405 si pas GET.

- [ ] **Step 1: Implémenter le handler**

> Note : pas de test unitaire sur le handler `onRequest` lui-même (I/O Firestore/admin) ; la logique testable est isolée dans le core (Task 1). Vérification = build TS + smoke à la Task 8. C'est le pattern `proxyCore.ts` (testé) ↔ `llmProxy.ts` (mince).

```ts
// functions/src/plugin/pluginApi.ts
// API HTTP lecture seule pour le plugin InDesign. Auth = token personnel
// (Bearer w2p_…). On ne stocke que le hash du token (doc-id de pluginTokens).
import { onRequest } from 'firebase-functions/v2/https'
import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import {
  hashToken, parseRoute, projectDataset, firstSheetColumns, projectRow, type Sheet,
} from './pluginApiCore'

if (!getApps().length) initializeApp()

function bearer(req: { header(n: string): string | undefined }): string | null {
  const h = req.header('Authorization') ?? ''
  const m = h.match(/^Bearer\s+(.+)$/i)
  return m ? m[1].trim() : null
}

async function loadSheets(db: FirebaseFirestore.Firestore, uid: string, docId: string): Promise<Sheet[] | null> {
  const meta = await db.doc(`excel_data/${docId}`).get()
  if (!meta.exists || meta.data()?.userId !== uid) return null // garde-fou propriété
  const inline = meta.data()?.sheets
  if (typeof inline === 'string') return JSON.parse(inline) as Sheet[]
  const payload = await db.doc(`excel_data_payload/${docId}`).get()
  if (!payload.exists) return null
  return JSON.parse(payload.data()?.json ?? '[]') as Sheet[]
}

export const pluginApi = onRequest(
  { region: 'europe-west1', timeoutSeconds: 30, memory: '256MiB', maxInstances: 5, cors: true },
  async (req, res) => {
    if (req.method !== 'GET') { res.status(405).json({ error: 'GET attendu' }); return }

    const token = bearer(req)
    if (!token) { res.status(401).json({ error: 'Token manquant' }); return }

    const db = getFirestore()
    const tokRef = db.doc(`pluginTokens/${hashToken(token)}`)
    const tok = await tokRef.get()
    const data = tok.data()
    if (!tok.exists || !data?.uid || data.revoked === true) {
      res.status(401).json({ error: 'Token invalide ou révoqué' }); return
    }
    const uid = data.uid as string
    // best-effort, ne bloque pas la réponse
    tokRef.update({ lastUsedAt: FieldValue.serverTimestamp() }).catch(() => {})

    const route = parseRoute(req.path)
    try {
      if (route.kind === 'list') {
        const snap = await db.collection('excel_data').where('userId', '==', uid).get()
        const datasets = snap.docs.map((d) => projectDataset(d.id, d.data()))
        res.status(200).json({ datasets }); return
      }
      if (route.kind === 'columns') {
        const sheets = await loadSheets(db, uid, route.docId)
        if (!sheets) { res.status(404).json({ error: 'Dataset introuvable' }); return }
        res.status(200).json({ columns: firstSheetColumns(sheets) }); return
      }
      if (route.kind === 'row') {
        const sheets = await loadSheets(db, uid, route.docId)
        if (!sheets) { res.status(404).json({ error: 'Dataset introuvable' }); return }
        const i = Number.parseInt(String(req.query.i ?? '0'), 10) || 0
        res.status(200).json(projectRow(sheets, i)); return
      }
      res.status(404).json({ error: 'Route inconnue' })
    } catch (err) {
      console.error('pluginApi: erreur', { path: req.path, err })
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
    }
  },
)
```

- [ ] **Step 2: Exporter la fonction**

Modifier `functions/src/index.ts`, ajouter après la ligne `export { workflowWebhook } ...` (ligne 42) :

```ts
// --- Plugin InDesign : API lecture seule (token personnel) ---
export { pluginApi } from './plugin/pluginApi'
```

- [ ] **Step 3: Vérifier le build TypeScript des functions**

Run: `cd functions && npm run build`
Expected: compile sans erreur (génère `lib/`).

- [ ] **Step 4: Commit**

```bash
git add functions/src/plugin/pluginApi.ts functions/src/index.ts
git commit -m "feat(plugin-api): handler HTTP onRequest (auth token, lecture datasets/colonnes/ligne)"
```

---

## Task 3 : Règle Firestore `pluginTokens`

**Files:**
- Modify: `firestore.rules`

**Interfaces:**
- Consumes: helper `isAuthenticated()` existant (firestore.rules:8).
- Produces: collection `pluginTokens` lisible/écrivable par son propriétaire uniquement. (Le handler `pluginApi` passe par l'admin SDK et n'est pas soumis aux règles ; ces règles servent la génération/listing/révocation côté client.)

- [ ] **Step 1: Ajouter le bloc de règles**

Dans `firestore.rules`, à l'intérieur de `match /databases/{database}/documents {`, ajouter (après le bloc `match /users/{uid} { … }`) :

```
    // Tokens du plugin InDesign : créés/listés/révoqués par leur propriétaire.
    // Le doc-id est le sha256 du token ; on ne stocke jamais le token en clair.
    match /pluginTokens/{tokenId} {
      allow read, delete: if isAuthenticated() && resource.data.uid == request.auth.uid;
      allow create: if isAuthenticated() && request.resource.data.uid == request.auth.uid;
      allow update: if isAuthenticated() && resource.data.uid == request.auth.uid
                    && request.resource.data.uid == request.auth.uid;
    }
```

- [ ] **Step 2: Vérifier la syntaxe des règles (compilation à sec)**

Run: `npx firebase deploy --only firestore:rules --dry-run` (ou `firebase` si le binaire global est présent)
Expected: « compiled successfully » / pas d'erreur de syntaxe. Si la CLI Firebase n'est pas installée, vérifier visuellement l'équilibrage des accolades et passer.

- [ ] **Step 3: Commit**

```bash
git add firestore.rules
git commit -m "feat(plugin-api): règle Firestore pluginTokens (propriétaire only)"
```

---

## Task 4 : Crypto token côté app (génération + hash)

**Files:**
- Create: `src/features/plugin-token/pluginTokenCrypto.ts`
- Test: `src/features/plugin-token/pluginTokenCrypto.test.ts`

**Interfaces:**
- Consumes: Web Crypto (`crypto.getRandomValues`, `crypto.subtle.digest`) — dispo en jsdom/vitest et navigateur.
- Produces:
  - `generatePluginToken(): string` — `w2p_` + 32 octets aléatoires base64url.
  - `sha256Hex(input: string): Promise<string>` — hex (DOIT matcher `hashToken` côté functions, même algo sha256).

- [ ] **Step 1: Écrire les tests**

```ts
// src/features/plugin-token/pluginTokenCrypto.test.ts
import { describe, it, expect } from 'vitest'
import { generatePluginToken, sha256Hex } from './pluginTokenCrypto'

describe('generatePluginToken', () => {
  it('préfixe w2p_ et base64url (pas de +/= )', () => {
    const t = generatePluginToken()
    expect(t.startsWith('w2p_')).toBe(true)
    expect(t.slice(4)).toMatch(/^[A-Za-z0-9_-]+$/)
  })
  it('est aléatoire (deux appels diffèrent)', () => {
    expect(generatePluginToken()).not.toBe(generatePluginToken())
  })
})

describe('sha256Hex', () => {
  it('hash sha256 connu de "abc"', async () => {
    expect(await sha256Hex('abc'))
      .toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
  it('64 chars hex', async () => {
    expect(await sha256Hex('w2p_xyz')).toMatch(/^[0-9a-f]{64}$/)
  })
})
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `npx vitest run src/features/plugin-token/pluginTokenCrypto.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Implémenter**

```ts
// src/features/plugin-token/pluginTokenCrypto.ts

/** Génère un token plugin : "w2p_" + 32 octets aléatoires en base64url. */
export function generatePluginToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  const b64 = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `w2p_${b64}`
}

/** sha256 → hex. DOIT correspondre à hashToken() côté Cloud Function. */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}
```

- [ ] **Step 4: Lancer, vérifier le passage**

Run: `npx vitest run src/features/plugin-token/pluginTokenCrypto.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/plugin-token/pluginTokenCrypto.ts src/features/plugin-token/pluginTokenCrypto.test.ts
git commit -m "feat(plugin-token): génération token + sha256 hex (parité serveur)"
```

---

## Task 5 : Hook Firestore `usePluginTokens`

**Files:**
- Create: `src/features/plugin-token/usePluginTokens.ts`

**Interfaces:**
- Consumes: `generatePluginToken`, `sha256Hex` (Task 4) ; `db`, `auth` de `@/lib/firebase/config` ; Firestore SDK (`doc`, `setDoc`, `collection`, `query`, `where`, `getDocs`, `updateDoc`, `serverTimestamp`).
- Produces:
  - `type PluginToken = { id: string; label: string; createdAt: Date | null; lastUsedAt: Date | null; revoked: boolean }`
  - `usePluginTokens(): { createToken(label: string): Promise<string | null>; listTokens(): Promise<PluginToken[]>; revokeToken(id: string): Promise<void> }`
  - `createToken` renvoie le token EN CLAIR (à afficher une seule fois) ; il n'est jamais relisible ensuite.

- [ ] **Step 1: Implémenter le hook**

```ts
// src/features/plugin-token/usePluginTokens.ts
import { doc, setDoc, collection, query, where, getDocs, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db, auth } from '@/lib/firebase/config'
import { generatePluginToken, sha256Hex } from './pluginTokenCrypto'

const COLLECTION = 'pluginTokens'

export interface PluginToken {
  id: string
  label: string
  createdAt: Date | null
  lastUsedAt: Date | null
  revoked: boolean
}

export function usePluginTokens() {
  /** Crée un token, persiste son hash (= doc-id) et renvoie le token EN CLAIR. */
  const createToken = async (label: string): Promise<string | null> => {
    const user = auth.currentUser
    if (!user) return null
    const token = generatePluginToken()
    const id = await sha256Hex(token)
    await setDoc(doc(db, COLLECTION, id), {
      uid: user.uid,
      label: label.trim() || 'Plugin InDesign',
      createdAt: serverTimestamp(),
      lastUsedAt: null,
      revoked: false,
    })
    return token
  }

  const listTokens = async (): Promise<PluginToken[]> => {
    const user = auth.currentUser
    if (!user) return []
    const snap = await getDocs(query(collection(db, COLLECTION), where('uid', '==', user.uid)))
    return snap.docs
      .map((d) => {
        const x = d.data()
        return {
          id: d.id,
          label: x.label ?? '',
          createdAt: x.createdAt?.toDate?.() ?? null,
          lastUsedAt: x.lastUsedAt?.toDate?.() ?? null,
          revoked: x.revoked === true,
        }
      })
      .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
  }

  const revokeToken = async (id: string): Promise<void> => {
    const user = auth.currentUser
    if (!user) return
    await updateDoc(doc(db, COLLECTION, id), { revoked: true })
  }

  return { createToken, listTokens, revokeToken }
}
```

- [ ] **Step 2: Vérifier les types**

Run: `npx tsc -b`
Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add src/features/plugin-token/usePluginTokens.ts
git commit -m "feat(plugin-token): hook Firestore create/list/revoke"
```

---

## Task 6 : UI section « Token plugin » + insertion dans les réglages

**Files:**
- Create: `src/features/plugin-token/PluginTokenSection.tsx`
- Modify: `src/components/shared/SettingsPanel.tsx`

**Interfaces:**
- Consumes: `usePluginTokens`, `PluginToken` (Task 5) ; composants `@/components/ui/*` (Button, Input) ; `sonner` (toast) ; icônes `lucide-react`.
- Produces: `export function PluginTokenSection(): JSX.Element`.

- [ ] **Step 1: Écrire le composant**

> Théming par tokens : `bg-surface`, bordures `border-white/10`, texte `text-white` (thémable). Le token affiché une seule fois est dans un encart `bg-well` avec bouton Copier.

```tsx
// src/features/plugin-token/PluginTokenSection.tsx
import { useEffect, useState } from 'react'
import { Plug, Copy, Trash2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { usePluginTokens, type PluginToken } from '@/features/plugin-token/usePluginTokens'

export function PluginTokenSection() {
  const { createToken, listTokens, revokeToken } = usePluginTokens()
  const [tokens, setTokens] = useState<PluginToken[]>([])
  const [label, setLabel] = useState('')
  const [freshToken, setFreshToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = () => { listTokens().then(setTokens) }
  useEffect(() => { refresh() }, [])

  const onCreate = async () => {
    setBusy(true)
    try {
      const t = await createToken(label)
      if (t) { setFreshToken(t); setLabel(''); refresh() }
    } finally { setBusy(false) }
  }

  const onCopy = async (value: string) => {
    await navigator.clipboard.writeText(value)
    toast.success('Token copié')
  }

  const onRevoke = async (id: string) => {
    await revokeToken(id)
    refresh()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium text-white">
        <Plug className="h-4 w-4" /> Token du plugin InDesign
      </div>
      <p className="text-xs text-white/50">
        Génère un token, colle-le une fois dans le panneau Web2Print d'InDesign. Lecture seule de tes dataSets.
      </p>

      <div className="flex gap-2">
        <Input placeholder="Nom (ex : mon poste)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <Button onClick={onCreate} disabled={busy}>Générer</Button>
      </div>

      {freshToken && (
        <div className="rounded-md bg-well p-3 space-y-2">
          <p className="text-xs text-amber-400">Copie ce token maintenant — il ne sera plus affiché.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate text-xs text-white">{freshToken}</code>
            <Button size="sm" variant="ghost" onClick={() => onCopy(freshToken)}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-1">
        {tokens.length === 0 && <p className="text-xs text-white/40">Aucun token.</p>}
        {tokens.map((t) => (
          <div key={t.id} className="flex items-center justify-between rounded bg-surface-2 px-3 py-2 text-xs">
            <div className="min-w-0">
              <span className={t.revoked ? 'text-white/40 line-through' : 'text-white'}>{t.label}</span>
              <span className="ml-2 text-white/40">
                {t.lastUsedAt ? `utilisé ${t.lastUsedAt.toLocaleDateString()}` : 'jamais utilisé'}
              </span>
            </div>
            {!t.revoked && (
              <Button size="sm" variant="ghost" onClick={() => onRevoke(t.id)}>
                <Trash2 className="h-4 w-4 text-red-400" />
              </Button>
            )}
          </div>
        ))}
        <Button size="sm" variant="ghost" onClick={refresh} className="text-white/50">
          <RefreshCw className="h-3 w-3 mr-1" /> Rafraîchir
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Insérer dans l'onglet Connecteurs de `SettingsPanel.tsx`**

Ajouter l'import en tête (avec les autres imports de features) :

```tsx
import { PluginTokenSection } from '@/features/plugin-token/PluginTokenSection'
```

Puis, dans le rendu de l'onglet Connecteurs (à côté de `<GoogleServerConnect />` / connecteurs existants, vers la ligne 425), insérer :

```tsx
        <div className="border-t border-white/10 pt-4 mt-4">
          <PluginTokenSection />
        </div>
```

- [ ] **Step 3: Vérifier les types + lancer l'app**

Run: `npx tsc -b`
Expected: aucune erreur.
Smoke (manuel) : `npm run dev` → Réglages → onglet Connecteurs → la section « Token du plugin InDesign » s'affiche, « Générer » crée et affiche un token, « Rafraîchir » le liste, « Révoquer » le barre.

- [ ] **Step 4: Commit**

```bash
git add src/features/plugin-token/PluginTokenSection.tsx src/components/shared/SettingsPanel.tsx
git commit -m "feat(plugin-token): section réglages (générer/copier/révoquer)"
```

---

## Task 7 : Plugin UXP — scaffolding, client API, slug (modules purs testés)

**Files:**
- Create: `indesign-plugin/package.json`
- Create: `indesign-plugin/manifest.json`
- Create: `indesign-plugin/index.html`
- Create: `indesign-plugin/src/lib/slug.ts`
- Create: `indesign-plugin/src/lib/slug.test.ts`
- Create: `indesign-plugin/src/lib/client.ts`
- Create: `indesign-plugin/src/lib/client.test.ts`

**Interfaces:**
- Produces:
  - `slugifyTag(label: string): string` — nom de tag XML InDesign valide (lettres/chiffres/`_`, ne commence pas par un chiffre).
  - `class PluginClient { constructor(baseUrl: string, token: string); listDatasets(): Promise<DatasetSummary[]>; columns(docId: string): Promise<ColumnInfo[]>; row(docId: string, i: number): Promise<RowResult> }`
  - `buildUrl(baseUrl, path): string` (pur, testé) ; types `DatasetSummary`/`ColumnInfo`/`RowResult` identiques au contrat Task 2.

- [ ] **Step 1: package.json du plugin (esbuild + vitest)**

```json
{
  "name": "web2print-indesign-plugin",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "esbuild src/panel.ts --bundle --format=esm --outfile=dist/panel.js",
    "test": "vitest run"
  },
  "devDependencies": {
    "esbuild": "^0.24.0",
    "vitest": "^4.1.7",
    "typescript": "^5.6.3"
  }
}
```

- [ ] **Step 2: manifest UXP v5**

> `id` à remplacer par un identifiant unique attribué par Adobe au moment de la distribution. `apiVersion: 2`, host InDesign min v18.

```json
{
  "id": "com.ibsstudio.web2print.indesign",
  "name": "Web2Print",
  "version": "0.1.0",
  "main": "index.html",
  "manifestVersion": 5,
  "host": [{ "app": "indesign", "minVersion": "18.0" }],
  "entrypoints": [
    { "type": "panel", "id": "web2printPanel", "label": { "default": "Web2Print" },
      "minimumSize": { "width": 280, "height": 400 } }
  ],
  "requiredPermissions": {
    "network": { "domains": ["https://europe-west1-web2print-6fe5a.cloudfunctions.net"] },
    "clipboard": "read"
  }
}
```

- [ ] **Step 3: index.html (markup du panneau)**

```html
<!DOCTYPE html>
<html>
  <head><meta charset="utf-8" /></head>
  <body style="font-family: sans-serif; padding: 8px;">
    <div id="connect">
      <input id="token" type="password" placeholder="Token w2p_…" style="width:100%" />
      <button id="btnConnect">Connecter</button>
    </div>
    <div id="main" style="display:none">
      <select id="dataset"></select>
      <div id="rowNav">
        <button id="prev">◀</button><span id="rowLabel">0/0</span><button id="next">▶</button>
        <label><input id="preview" type="checkbox" /> Aperçu</label>
      </div>
      <ul id="fields"></ul>
      <button id="restoreAll">Restaurer tout</button>
    </div>
    <script type="module" src="dist/panel.js"></script>
  </body>
</html>
```

- [ ] **Step 4: Écrire les tests des modules purs**

```ts
// indesign-plugin/src/lib/slug.test.ts
import { describe, it, expect } from 'vitest'
import { slugifyTag } from './slug'

describe('slugifyTag', () => {
  it('garde un nom simple', () => expect(slugifyTag('Reference')).toBe('Reference'))
  it('translittère accents et espaces', () => expect(slugifyTag('Référence produit')).toBe('Reference_produit'))
  it('remplace les caractères interdits', () => expect(slugifyTag('Prix (€)')).toBe('Prix_'))
  it('préfixe si commence par un chiffre', () => expect(slugifyTag('2024')).toBe('_2024'))
  it('vide → _', () => expect(slugifyTag('   ')).toBe('_'))
})
```

```ts
// indesign-plugin/src/lib/client.test.ts
import { describe, it, expect, vi } from 'vitest'
import { buildUrl, PluginClient } from './client'

describe('buildUrl', () => {
  it('joint sans double slash', () => {
    expect(buildUrl('https://x/pluginApi', '/datasets')).toBe('https://x/pluginApi/datasets')
    expect(buildUrl('https://x/pluginApi/', '/datasets')).toBe('https://x/pluginApi/datasets')
  })
})

describe('PluginClient', () => {
  it('envoie le Bearer et mappe la liste', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ datasets: [{ docId: 'd1', fileName: 'Cat', sheetCount: 1, rowCount: 3 }] }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const c = new PluginClient('https://x/pluginApi', 'w2p_t')
    const ds = await c.listDatasets()
    expect(ds[0].fileName).toBe('Cat')
    expect(fetchMock).toHaveBeenCalledWith('https://x/pluginApi/datasets',
      expect.objectContaining({ headers: { Authorization: 'Bearer w2p_t' } }))
  })
  it('jette sur réponse non-ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: 'x' }) }))
    await expect(new PluginClient('https://x/pluginApi', 'bad').listDatasets()).rejects.toThrow(/401/)
  })
})
```

- [ ] **Step 5: Lancer, vérifier l'échec**

Run: `cd indesign-plugin && npm install && npx vitest run`
Expected: FAIL — modules `./slug` / `./client` introuvables.

- [ ] **Step 6: Implémenter slug.ts**

```ts
// indesign-plugin/src/lib/slug.ts
/** Convertit un libellé en nom de tag XML InDesign valide (NCName simplifié). */
export function slugifyTag(label: string): string {
  const noAccents = label.normalize('NFD').replace(/[̀-ͯ]/g, '')
  let s = noAccents.replace(/[^A-Za-z0-9_]+/g, '_')
  if (!s || s === '_') return '_'
  if (/^[0-9]/.test(s)) s = `_${s}`
  return s
}
```

- [ ] **Step 7: Implémenter client.ts**

```ts
// indesign-plugin/src/lib/client.ts
export interface DatasetSummary { docId: string; fileName: string; sheetCount: number; rowCount: number }
export interface ColumnInfo { key: string; label: string; fieldType: string }
export interface ValueEntry { key: string; label: string; value: string }
export interface RowResult { rowIndex: number; total: number; values: ValueEntry[] }

export function buildUrl(baseUrl: string, path: string): string {
  return baseUrl.replace(/\/+$/, '') + path
}

export class PluginClient {
  constructor(private baseUrl: string, private token: string) {}

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(buildUrl(this.baseUrl, path), { headers: { Authorization: `Bearer ${this.token}` } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json() as Promise<T>
  }

  async listDatasets(): Promise<DatasetSummary[]> {
    return (await this.get<{ datasets: DatasetSummary[] }>('/datasets')).datasets
  }
  async columns(docId: string): Promise<ColumnInfo[]> {
    return (await this.get<{ columns: ColumnInfo[] }>(`/datasets/${docId}`)).columns
  }
  async row(docId: string, i: number): Promise<RowResult> {
    return this.get<RowResult>(`/datasets/${docId}/row?i=${i}`)
  }
}
```

- [ ] **Step 8: Lancer, vérifier le passage**

Run: `cd indesign-plugin && npx vitest run`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add indesign-plugin/package.json indesign-plugin/manifest.json indesign-plugin/index.html indesign-plugin/src/lib/
git commit -m "feat(idplugin): scaffolding UXP + client API + slug (modules purs testés)"
```

---

## Task 8 : Plugin UXP — balisage XML natif (DOM InDesign)

**Files:**
- Create: `indesign-plugin/src/idml/tagging.ts`

**Interfaces:**
- Consumes: `slugifyTag` (Task 7) ; `require('indesign')` (objet `app`).
- Produces:
  - `ensureTag(doc: any, name: string): any` — récupère/crée un `XMLTag` par nom (slugifié).
  - `applyTagToSelection(name: string): { ok: boolean; message?: string }` — enrobe la sélection courante (texte ou cadre) dans un `XMLElement` lié au tag.
  - `countTaggedByName(doc: any): Record<string, number>` — nombre d'occurrences par nom de tag (pour l'indicateur ✓ ×N et les champs orphelins).

> ⚠️ La couche DOM InDesign ne peut pas être testée en CI (pas de runtime InDesign). Vérification = smoke test (Task 10). Les noms d'API ci-dessous suivent le modèle de scripting InDesign (XMLTags / XMLElements). **Vérifier chaque appel contre la doc UXP InDesign DOM dans l'environnement réel** ; ajuster si un nom diffère (ex. `markup()` vs `xmlElements.add()`).

- [ ] **Step 1: Implémenter tagging.ts**

```ts
// indesign-plugin/src/idml/tagging.ts
import { slugifyTag } from '../lib/slug'

// Le module 'indesign' fournit l'objet app au runtime UXP.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { app } = require('indesign') as { app: any }

/** Récupère le XMLTag par nom (slugifié) ou le crée. */
export function ensureTag(doc: any, name: string): any {
  const tagName = slugifyTag(name)
  const existing = doc.xmlTags.itemByName(tagName)
  if (existing && existing.isValid) return existing
  return doc.xmlTags.add(tagName)
}

/**
 * Enrobe la sélection courante (texte ou cadre image) dans un XMLElement lié
 * au tag. Le root XMLElement (doc.xmlElements[0]) est le parent.
 * Produit, à l'export IDML : <XMLElement MarkupTag="XMLTag/<name>"> que
 * Web2Print relit via xmlElementStory.ts (flatten → {{<name>}}).
 */
export function applyTagToSelection(name: string): { ok: boolean; message?: string } {
  const doc = app.activeDocument
  if (!doc) return { ok: false, message: 'Aucun document ouvert' }
  const sel = app.selection
  if (!sel || sel.length === 0) return { ok: false, message: 'Sélectionne un texte ou un cadre' }

  const tag = ensureTag(doc, name)
  const root = doc.xmlElements.item(0)
  try {
    // root.xmlElements.add(tag, storyContent) — storyContent = sélection texte/cadre
    root.xmlElements.add(tag, sel[0])
    return { ok: true }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}

/** Compte les XMLElement par nom de tag (parcours récursif de l'arbre XML). */
export function countTaggedByName(doc: any): Record<string, number> {
  const counts: Record<string, number> = {}
  const walk = (el: any) => {
    const n = el.xmlElements?.length ?? 0
    for (let i = 0; i < n; i++) {
      const child = el.xmlElements.item(i)
      const tagName = child.markupTag?.name
      if (tagName) counts[tagName] = (counts[tagName] ?? 0) + 1
      walk(child)
    }
  }
  const root = doc.xmlElements?.item(0)
  if (root) walk(root)
  return counts
}
```

- [ ] **Step 2: Vérifier le bundling**

Run: `cd indesign-plugin && npx esbuild src/idml/tagging.ts --bundle --format=esm --external:indesign --outfile=/dev/null`
Expected: bundle OK (le module `indesign` est externe, résolu au runtime).

- [ ] **Step 3: Commit**

```bash
git add indesign-plugin/src/idml/tagging.ts
git commit -m "feat(idplugin): balisage XML natif InDesign (ensureTag/applyTagToSelection/count)"
```

---

## Task 9 : Plugin UXP — aperçu round-trip + câblage panneau

**Files:**
- Create: `indesign-plugin/src/idml/preview.ts`
- Create: `indesign-plugin/src/panel.ts`

**Interfaces:**
- Consumes: `PluginClient`, types (Task 7) ; `applyTagToSelection`, `countTaggedByName`, `ensureTag` (Task 8) ; `require('indesign')`.
- Produces:
  - `applyRowPreview(doc, valuesByTag): void` — pour chaque XMLElement tagué, mémorise le contenu d'origine (s'il ne l'est pas déjà) puis remplace par la valeur de la ligne.
  - `restorePreview(doc): void` — restaure tous les contenus d'origine mémorisés.
  - `restoreAllPlaceholders(doc): void` — filet : re-pose `{{<tag>}}` comme contenu de chaque élément tagué.
  - `panel.ts` : point d'entrée bundlé, câble les events DOM HTML.

> ⚠️ Couche DOM non testable en CI → smoke test (Task 10). La mémorisation du contenu d'origine se fait dans une Map en mémoire du plugin (clé = id de l'élément XML) ; perdue à la fermeture → d'où le filet `restoreAllPlaceholders`.

- [ ] **Step 1: Implémenter preview.ts**

```ts
// indesign-plugin/src/idml/preview.ts
// Mémoire de session : contenu d'origine par élément XML (pour restaurer l'aperçu).
const originalContent = new Map<string, string>()

function eachTaggedElement(doc: any, fn: (el: any, tagName: string) => void) {
  const walk = (el: any) => {
    const n = el.xmlElements?.length ?? 0
    for (let i = 0; i < n; i++) {
      const child = el.xmlElements.item(i)
      const tagName = child.markupTag?.name
      if (tagName) fn(child, tagName)
      walk(child)
    }
  }
  const root = doc.xmlElements?.item(0)
  if (root) walk(root)
}

/** Remplace le contenu de chaque élément tagué par la valeur de la ligne. */
export function applyRowPreview(doc: any, valuesByTag: Record<string, string>): void {
  eachTaggedElement(doc, (el, tagName) => {
    const value = valuesByTag[tagName]
    if (value === undefined) return
    const id = String(el.id)
    if (!originalContent.has(id)) originalContent.set(id, el.contents ?? '')
    el.contents = value
  })
}

/** Restaure le contenu d'origine mémorisé. */
export function restorePreview(doc: any): void {
  eachTaggedElement(doc, (el) => {
    const id = String(el.id)
    if (originalContent.has(id)) {
      el.contents = originalContent.get(id)
      originalContent.delete(id)
    }
  })
}

/** Filet : re-pose {{tag}} comme contenu (utile si la mémoire de session est perdue). */
export function restoreAllPlaceholders(doc: any): void {
  eachTaggedElement(doc, (el, tagName) => { el.contents = `{{${tagName}}}` })
  originalContent.clear()
}
```

- [ ] **Step 2: Implémenter panel.ts (câblage)**

```ts
// indesign-plugin/src/panel.ts
import { PluginClient, type ColumnInfo, type DatasetSummary } from './lib/client'
import { slugifyTag } from './lib/slug'
import { applyTagToSelection, countTaggedByName } from './idml/tagging'
import { applyRowPreview, restorePreview, restoreAllPlaceholders } from './idml/preview'

const { app } = require('indesign') as { app: any }
const BASE_URL = 'https://europe-west1-web2print-6fe5a.cloudfunctions.net/pluginApi'

let client: PluginClient | null = null
let docId = ''
let columns: ColumnInfo[] = []
let rowIndex = 0
let total = 0

const $ = (id: string) => document.getElementById(id) as HTMLElement
const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

async function connect() {
  const token = byId<HTMLInputElement>('token').value.trim()
  if (!token) return
  client = new PluginClient(BASE_URL, token)
  try {
    const datasets = await client.listDatasets()
    fillDatasets(datasets)
    $('connect').style.display = 'none'
    $('main').style.display = 'block'
  } catch (e) {
    alert(`Connexion échouée : ${e instanceof Error ? e.message : e}`)
  }
}

function fillDatasets(datasets: DatasetSummary[]) {
  const sel = byId<HTMLSelectElement>('dataset')
  sel.innerHTML = ''
  for (const d of datasets) {
    const opt = document.createElement('option')
    opt.value = d.docId; opt.textContent = `${d.fileName} (${d.rowCount})`
    sel.appendChild(opt)
  }
  if (datasets[0]) { sel.value = datasets[0].docId; onDatasetChange() }
}

async function onDatasetChange() {
  if (!client) return
  docId = byId<HTMLSelectElement>('dataset').value
  columns = await client.columns(docId)
  rowIndex = 0
  const r = await client.row(docId, 0)
  total = r.total
  renderFields()
  renderRowLabel()
}

function renderFields() {
  const doc = app.activeDocument
  const counts = doc ? countTaggedByName(doc) : {}
  const ul = $('fields'); ul.innerHTML = ''
  for (const c of columns) {
    const tagName = slugifyTag(c.label)
    const li = document.createElement('li')
    const n = counts[tagName] ?? 0
    const badge = n > 0 ? ` ✓${n > 1 ? `×${n}` : ''}` : ''
    const btn = document.createElement('button')
    btn.textContent = `${c.label}${badge}`
    btn.onclick = () => {
      const res = applyTagToSelection(c.label)
      if (!res.ok) alert(res.message)
      renderFields()
    }
    li.appendChild(btn)
    ul.appendChild(li)
  }
}

function renderRowLabel() {
  $('rowLabel').textContent = `${total === 0 ? 0 : rowIndex + 1}/${total}`
}

async function refreshPreview() {
  if (!client) return
  const doc = app.activeDocument
  if (!doc) return
  if (!byId<HTMLInputElement>('preview').checked) { restorePreview(doc); return }
  const r = await client.row(docId, rowIndex)
  rowIndex = r.rowIndex; total = r.total
  const valuesByTag: Record<string, string> = {}
  for (const v of r.values) valuesByTag[slugifyTag(v.label)] = v.value
  applyRowPreview(doc, valuesByTag)
  renderRowLabel()
}

function step(delta: number) {
  if (total === 0) return
  rowIndex = Math.max(0, Math.min(rowIndex + delta, total - 1))
  refreshPreview()
}

byId('btnConnect').addEventListener('click', connect)
byId('dataset').addEventListener('change', onDatasetChange)
byId('prev').addEventListener('click', () => step(-1))
byId('next').addEventListener('click', () => step(1))
byId('preview').addEventListener('change', refreshPreview)
byId('restoreAll').addEventListener('click', () => {
  const doc = app.activeDocument
  if (doc) restoreAllPlaceholders(doc)
})
```

- [ ] **Step 3: Build complet du plugin**

Run: `cd indesign-plugin && npm run build`
Expected: génère `dist/panel.js` sans erreur (esbuild résout `indesign` comme externe — ajouter `--external:indesign` au script `build` si l'erreur « Could not resolve 'indesign' » apparaît).

- [ ] **Step 4: Commit**

```bash
git add indesign-plugin/src/idml/preview.ts indesign-plugin/src/panel.ts
git commit -m "feat(idplugin): aperçu round-trip + câblage du panneau"
```

---

## Task 10 : Test round-trip d'intégration + checklist de smoke

**Files:**
- Create: `src/features/idml/__tests__/pluginRoundTrip.test.ts`
- Create: `indesign-plugin/SMOKE.md`

**Interfaces:**
- Consumes: `flattenXmlElementStory` / `extractStoryFields` de `src/features/idml/xmlElementStory.ts` (vérifier le nom exact des exports dans ce fichier avant d'écrire le test).

- [ ] **Step 1: Écrire le test round-trip (anti-régression critique)**

> But : prouver qu'un Story XML contenant un `<XMLElement MarkupTag="XMLTag/Champ">` (ce que le plugin produit à l'export IDML) est bien reconnu par l'import Web2Print et donne `{{Champ}}`. Avant d'écrire, ouvrir `src/features/idml/xmlElementStory.ts` et confirmer la signature exacte (`flattenXmlElementStory(xml: string): string` et `extractStoryFields(xml: string): string[]`) — ajuster l'import si besoin.

```ts
// src/features/idml/__tests__/pluginRoundTrip.test.ts
import { describe, it, expect } from 'vitest'
import { flattenXmlElementStory, extractStoryFields } from '@/features/idml/xmlElementStory'

// Story XML minimal tel que produit par InDesign après balisage par le plugin.
const STORY = `<Story>
  <XMLElement MarkupTag="XMLTag/Reference">
    <ParagraphStyleRange><CharacterStyleRange><Content>A-1</Content></CharacterStyleRange></ParagraphStyleRange>
  </XMLElement>
</Story>`

describe('round-trip plugin → import Web2Print', () => {
  it('un tag XML natif est détecté comme champ', () => {
    expect(extractStoryFields(STORY)).toContain('Reference')
  })
  it('flatten produit le placeholder {{Reference}}', () => {
    expect(flattenXmlElementStory(STORY)).toContain('{{Reference}}')
  })
})
```

- [ ] **Step 2: Lancer le test round-trip**

Run: `npx vitest run src/features/idml/__tests__/pluginRoundTrip.test.ts`
Expected: PASS. Si l'API de `xmlElementStory.ts` diffère (nom de fonction/forme du XML), ajuster le test pour matcher le contrat réel — le fichier est la source de vérité.

- [ ] **Step 3: Écrire la checklist de smoke manuel**

```md
<!-- indesign-plugin/SMOKE.md -->
# Smoke test — Plugin Web2Print pour InDesign

Pré-requis : InDesign v18+, plugin chargé via UDT (UXP Developer Tool), un dataSet
existant dans Web2Print, un token généré (Réglages → Connecteurs → Token plugin).

1. **Connexion** : ouvrir le panneau Web2Print, coller le token, « Connecter ».
   → la liste des dataSets se remplit. (Token invalide → message d'erreur.)
2. **Champs live** : choisir un dataSet → la liste des champs s'affiche.
3. **Balisage** : sélectionner un bloc texte → cliquer un champ → l'indicateur ✓ apparaît.
   Vérifier dans Affichage → Structure que l'élément XML porte le bon tag.
4. **Aperçu ON** : cocher « Aperçu » → le contenu des blocs tagués affiche les
   valeurs de la ligne 1. Naviguer ◀ ▶ → les valeurs changent.
5. **Aperçu OFF** : décocher → le contenu maquette d'origine revient.
6. **Restaurer tout** : cliquer → chaque bloc tagué affiche `{{Champ}}`.
7. **Export round-trip** : Fichier → Exporter → IDML. Importer l'IDML dans Web2Print.
   → les `{{Champ}}` sont détectés et liés aux colonnes du dataSet (fusion OK).
8. **Révocation** : révoquer le token dans Web2Print → re-tenter une action dans le
   plugin → erreur 401 attendue.
```

- [ ] **Step 4: Commit**

```bash
git add src/features/idml/__tests__/pluginRoundTrip.test.ts indesign-plugin/SMOKE.md
git commit -m "test(plugin): round-trip import + checklist smoke InDesign"
```

---

## Task 11 : Vérification globale & déploiement

**Files:** aucun (vérification).

- [ ] **Step 1: Suite de tests complète (app + functions + plugin)**

Run:
```bash
npm run test:run
cd functions && npx vitest run && cd ..
cd indesign-plugin && npx vitest run && cd ..
```
Expected: tout PASS.

- [ ] **Step 2: Types + lint + code mort**

Run:
```bash
npx tsc -b
npm run lint
npx knip
```
Expected: `tsc -b` sans erreur ; lint sans erreur bloquante ; knip exit 0 (sinon, traiter le code mort — ex. un export inutile hors de son fichier).

- [ ] **Step 3: Déploiement (per CLAUDE.md : commit master PUIS build + deploy)**

> Le déploiement de `pluginApi` + des règles relève des Cloud Functions/Firestore, distinct du hosting. À confirmer avec l'utilisateur avant d'exécuter.

Run:
```bash
firebase deploy --only functions:pluginApi,firestore:rules
npm run build && firebase deploy --only hosting   # pour la section réglages côté app
```
Expected: déploiement OK. Noter l'URL finale de `pluginApi` et la reporter dans `indesign-plugin/src/panel.ts` (`BASE_URL`) si elle diffère.

- [ ] **Step 4: Smoke manuel**

Suivre `indesign-plugin/SMOKE.md` de bout en bout.

---

## Self-Review

**Couverture du spec :**
- Token personnel + endpoint HTTP dédié → Tasks 1-3 (core, handler, règles).
- `getRowValue`/cohérence fusion → Task 1 `projectRow` (résolution par colonne `row[key]`, équivalente à `getRowValue` quand on itère les colonnes ; formules/composites = phase 2 comme prévu au spec).
- Liste datasets / colonnes / ligne → contrat Task 2.
- Écran « Token plugin » (générer une fois, révoquer) → Tasks 4-6.
- Balisage XML natif = `MarkupTag="XMLTag/Champ"` → Task 8 + test round-trip Task 10.
- Aperçu round-trip ON/OFF + Restaurer tout → Task 9.
- Erreurs (401/révoqué/hors-ligne/orphelin) → Task 2 (401/404), Task 9 (alert connexion), Task 8/9 (badge ✓ / orphelin via `countTaggedByName`), `restoreAllPlaceholders` (filet mémoire perdue).
- Tests backend émulateur : remplacés par tests du **core pur** (Task 1) + smoke ; les règles Firestore sont vérifiées au smoke (Task 10 §8) — pas de harnais émulateur dédié pour ne pas alourdir, le core couvre la logique.
- Phase 2 (images, écriture, formules) : explicitement hors périmètre, non planifiée.

**Placeholders :** aucun « TBD/TODO » ; tout step de code montre le code.

**Cohérence des types :** `DatasetSummary`/`ColumnInfo`/`ValueEntry`/`RowResult` identiques entre functions (Task 1/2) et plugin (Task 7). `slugifyTag` utilisé de façon cohérente Task 7→9. `hashToken` (functions) et `sha256Hex` (app) calculent le même sha256 → le doc-id correspond.

**Points à vérifier en cours d'implémentation (signalés dans les tasks concernées) :**
- Noms exacts de l'API UXP InDesign DOM (`xmlElements.add` / `markup` / `markupTag.name`) — Task 8/9.
- Signature réelle des exports de `xmlElementStory.ts` — Task 10.
- Emplacement exact d'insertion dans l'onglet Connecteurs de `SettingsPanel.tsx` — Task 6.
