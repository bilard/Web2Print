# Correspondance des champs éditable + champs libres — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner à l'utilisateur, dans Catalogue studio ET Création studio, (1) une UI éditable pour corriger quelle colonne source alimente chaque champ de fiche, et (2) la possibilité d'ajouter des champs libres (colonnes riches) affichés en valeurs seules sur la fiche.

**Architecture :** Les deux modules partagent la couche `src/features/retail-promo/` (`promoMapping`, `promoTypes`, `extractPromoFields`). La capacité « champs libres » est construite UNE fois dans cette couche (type `CustomFieldMap`, `PromoFields.extra`), puis chaque module la rend à sa façon (`ProductCell` / `RetailPromoCard`). Catalogue reçoit en plus une UI de mapping (absente aujourd'hui) et un mécanisme d'overrides qui remplace l'écrasement automatique du `fieldMap`.

**Tech Stack :** React 18, TypeScript strict, Zustand v4, Vitest, Firestore. Vérif types via `npx tsc -b` (project references — `tsc --noEmit` ne vérifie rien).

## Global Constraints

- TypeScript strict, pas d'`any`, props typées explicitement. Vérif : **`npx tsc -b`** (jamais `tsc --noEmit`).
- UI en **français**, orthographe accentuée correcte.
- Thème par tokens : `bg-surface`/`bg-surface-2`/`bg-well`/`text-white`/`text-muted-foreground` ; blanc véritable = `text-[#fff]` (jamais `text-white` pour du blanc sur fond coloré). Accent `#6366f1` / indigo-600.
- Composants ≤ 150 lignes ; pas de logique métier dans l'UI.
- Firestore rejette tout le doc si un champ vaut `undefined` → passer par `stripUndefined` à la frontière (déjà en place dans `catalogsApi`/`promosApi`).
- Après CHAQUE phase (2, 3, 4) : `npx tsc -b` + `npm run test:run` + `npm run lint` + `npx knip` (baseline exit 0) verts, puis commit master, puis `npm run build` + `firebase deploy --only hosting`, puis smoke live (recharger avec `?fresh=N` pour contourner le cache de bundle).
- Convention rendu retail : cf. skill `retail-card-conventions`.

---

## Phase 1 — Socle commun (retail-promo)

Aucun changement visible ; prépare le type et l'extraction partagés.

### Task 1 : Type `CustomFieldMap` + `PromoFields.extra`

**Files:**
- Modify: `src/features/retail-promo/promoTypes.ts`

**Interfaces:**
- Produces : `CustomField = { id: string; label: string; column: string }`, `CustomFieldMap = CustomField[]`, `PromoFields.extra?: Record<string, string>`.

- [ ] **Step 1 : Ajouter le type et le champ**

Dans `promoTypes.ts`, après l'interface `PromoFields` (ligne 27, avant la `}` finale) ajouter le champ `extra`, puis après `export type PromoFieldKey = keyof PromoFields` ajouter les types custom :

```ts
export interface PromoFields {
  // … champs existants inchangés …
  badges: string[]
  /** Champs libres mappés par l'utilisateur (id de champ → valeur lue dans la ligne). */
  extra?: Record<string, string>
}

export type PromoFieldKey = keyof PromoFields

/** Un champ libre : colonne source arbitraire nommée par l'utilisateur. `label` = repère d'éditeur, NON rendu sur la fiche. */
export interface CustomField {
  id: string
  label: string
  column: string
}
export type CustomFieldMap = CustomField[]
```

- [ ] **Step 2 : Vérifier les types**

Run : `npx tsc -b`
Expected : PASS (aucune erreur — `extra` optionnel n'oblige rien).

- [ ] **Step 3 : Commit**

```bash
git add src/features/retail-promo/promoTypes.ts
git commit -m "feat(promo): type CustomFieldMap + PromoFields.extra (socle champs libres)"
```

### Task 2 : `extractPromoFields` peuple `extra` depuis les champs libres

**Files:**
- Modify: `src/features/retail-promo/promoMapping.ts:103-139`
- Test: `src/features/retail-promo/promoMapping.test.ts`

**Interfaces:**
- Consumes : `CustomFieldMap` (Task 1).
- Produces : `extractPromoFields(row, columns, fieldMap, customFields?: CustomFieldMap): PromoFields` — 4e param optionnel, rétro-compatible ; remplit `extra` (valeurs vides omises).

- [ ] **Step 1 : Écrire le test qui échoue**

Ajouter à `src/features/retail-promo/promoMapping.test.ts` :

```ts
import { extractPromoFields } from './promoMapping'
import type { MergeColumn, MergeRow } from '@/stores/merge.store'

test('extractPromoFields peuple extra depuis customFields (vides omises)', () => {
  const columns: MergeColumn[] = [
    { key: 'c_norm', label: 'Normes' } as MergeColumn,
    { key: 'c_colis', label: 'Colis' } as MergeColumn,
    { key: 'c_vide', label: 'SEO' } as MergeColumn,
  ]
  const row: MergeRow = { _id: 'r1', c_norm: 'EN 388', c_colis: '6', c_vide: '' } as unknown as MergeRow
  const f = extractPromoFields(row, columns, {}, [
    { id: 'normes', label: 'Normes', column: 'c_norm' },
    { id: 'colis', label: 'Colis', column: 'c_colis' },
    { id: 'seo', label: 'SEO', column: 'c_vide' },
  ])
  expect(f.extra).toEqual({ normes: 'EN 388', colis: '6' })
})

test('extractPromoFields sans customFields → extra vide (rétro-compat)', () => {
  const columns: MergeColumn[] = [{ key: 'c', label: 'Nom' } as MergeColumn]
  const row: MergeRow = { _id: 'r1', c: 'X' } as unknown as MergeRow
  expect(extractPromoFields(row, columns, { name: 'c' }).extra).toEqual({})
})
```

- [ ] **Step 2 : Lancer le test → échec**

Run : `npm run test:run -- src/features/retail-promo/promoMapping.test.ts`
Expected : FAIL (`extractPromoFields` n'accepte pas de 4e argument ; `extra` undefined).

- [ ] **Step 3 : Implémenter**

Dans `promoMapping.ts`, modifier la signature et la fin de `extractPromoFields` :

```ts
export function extractPromoFields(
  row: MergeRow,
  columns: MergeColumn[],
  fieldMap: Partial<Record<PromoFieldKey, string>>,
  customFields: CustomFieldMap = [],
): PromoFields {
  // … début inchangé (imagesRaw … computeMechanism) …
  const extra: Record<string, string> = {}
  for (const cf of customFields) {
    const v = str(row, columns, cf.column).trim()
    if (v) extra[cf.id] = v
  }
  return {
    // … champs existants inchangés …
    badges: [],
    extra,
  }
}
```

Et ajouter l'import du type en tête de fichier :

```ts
import type { PromoFields, PromoFieldKey, CustomFieldMap } from './promoTypes'
```

- [ ] **Step 4 : Lancer le test → succès**

Run : `npm run test:run -- src/features/retail-promo/promoMapping.test.ts`
Expected : PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/features/retail-promo/promoMapping.ts src/features/retail-promo/promoMapping.test.ts
git commit -m "feat(promo): extractPromoFields peuple extra depuis les champs libres"
```

### Task 3 : `toCardData` expose `details` + champs désync

**Files:**
- Modify: `src/features/retail-promo/promoCardData.ts`
- Modify: `src/features/retail-promo/RetailPromoCard.tsx:7-20` (interface `RetailCardData`)
- Test: `src/features/retail-promo/promoCardData.test.ts` (créer)

**Interfaces:**
- Consumes : `PromoFields.extra`, `CustomFieldMap`.
- Produces : `RetailCardData` gagne `ean?`, `unit?`, `mentions?`, `enseigne?`, `details: string[]` ; `toCardData(f, euroSep?, customFields?: CustomFieldMap): RetailCardData`.

- [ ] **Step 1 : Étendre `RetailCardData`**

Dans `RetailPromoCard.tsx`, interface `RetailCardData` (lignes 7-20), ajouter avant la `}` :

```ts
export interface RetailCardData {
  // … champs existants …
  imageUrl?: string
  ean?: string
  unit?: string
  mentions?: string
  enseigne?: string
  /** Champs libres, valeurs seules (sans label), ordre = customFields. */
  details: string[]
}
```

- [ ] **Step 2 : Écrire le test qui échoue**

Créer `src/features/retail-promo/promoCardData.test.ts` :

```ts
import { test, expect } from 'vitest'
import { toCardData } from './promoCardData'
import type { PromoFields } from './promoTypes'

const base: PromoFields = {
  name: 'X', image: null, brand: '', ref: '', ean: '', oldPrice: null, newPrice: null,
  currency: 'EUR', unit: '', description: '', category: '', unitPrice: '', promoLabel: '',
  mechanism: 'simple', remisePct: null, remiseMontant: null, lotQty: null, lotOffert: null,
  lotPrice: null, validFrom: null, validTo: null, mentions: '', enseigne: '', badges: [],
  extra: { normes: 'EN 388', colis: '6' },
}

test('toCardData : details ordonné par customFields, valeurs seules', () => {
  const d = toCardData({ ...base }, {}, [
    { id: 'colis', label: 'Colis', column: 'c' },
    { id: 'normes', label: 'Normes', column: 'n' },
    { id: 'absent', label: 'SEO', column: 's' },
  ])
  expect(d.details).toEqual(['6', 'EN 388'])
})

test('toCardData expose ean/unit/mentions/enseigne', () => {
  const d = toCardData({ ...base, ean: '123', unit: '/kg', mentions: 'M', enseigne: 'E' }, {}, [])
  expect([d.ean, d.unit, d.mentions, d.enseigne]).toEqual(['123', '/kg', 'M', 'E'])
})
```

- [ ] **Step 3 : Lancer le test → échec**

Run : `npm run test:run -- src/features/retail-promo/promoCardData.test.ts`
Expected : FAIL (`toCardData` a 2 params ; `details` absent).

- [ ] **Step 4 : Implémenter `toCardData`**

Dans `promoCardData.ts`, remplacer la fonction :

```ts
import type { PromoFields, CustomFieldMap } from './promoTypes'

export function toCardData(
  f: PromoFields,
  euroSep: { now?: boolean; was?: boolean } = {},
  customFields: CustomFieldMap = [],
): RetailCardData {
  return {
    name: f.name,
    brand: f.brand || undefined,
    ref: f.ref || undefined,
    category: f.category || undefined,
    description: f.description || undefined,
    priceNow: f.newPrice != null ? formatPrice(f.newPrice, f.currency, euroSep.now) : '—',
    priceWas: f.oldPrice != null ? formatPrice(f.oldPrice, f.currency, euroSep.was) : undefined,
    unitPrice: f.unitPrice || undefined,
    remiseLabel: computeRemiseLabel(f),
    validite: validText(f),
    imageUrl: f.image ?? undefined,
    ean: f.ean || undefined,
    unit: f.unit || undefined,
    mentions: f.mentions || undefined,
    enseigne: f.enseigne || undefined,
    details: customFields.map((cf) => f.extra?.[cf.id]).filter((v): v is string => !!v && !!v.trim()),
  }
}
```

- [ ] **Step 5 : Lancer le test → succès + tsc**

Run : `npm run test:run -- src/features/retail-promo/promoCardData.test.ts && npx tsc -b`
Expected : PASS (tsc : `details` requis → toute construction littérale de `RetailCardData` doit le fournir ; ici seul `toCardData` en construit).

- [ ] **Step 6 : Commit**

```bash
git add src/features/retail-promo/promoCardData.ts src/features/retail-promo/promoCardData.test.ts src/features/retail-promo/RetailPromoCard.tsx
git commit -m "feat(promo): toCardData expose details + ean/unit/mentions/enseigne"
```

---

## Phase 2 — Catalogue : mapping éditable + fin de l'écrasement auto

À la fin de la phase : commit + deploy + smoke (corriger un mapping, rouvrir le catalogue, vérifier que le choix survit).

### Task 4 : Store & doc — `fieldMapOverrides` + `customFields`

**Files:**
- Modify: `src/features/catalog/catalogTypes.ts:238-253` (`CatalogDoc`)
- Modify: `src/stores/catalog.store.ts`
- Modify: `src/features/catalog/catalogsApi.ts:15-21` (`newCatalogDoc`)
- Modify: `src/features/catalog/useCatalogSource.ts:15-22`
- Modify: `src/pages/CatalogBuilderPage.tsx:59-69`
- Test: `src/stores/catalog.store.test.ts`

**Interfaces:**
- Consumes : `defaultPromoFieldMap`, `CustomFieldMap`.
- Produces : store `fieldMapOverrides: Partial<Record<PromoFieldKey, string>>`, `customFields: CustomFieldMap`, `setFieldMapOverride(key: PromoFieldKey, column: string | null)`, `setCustomFields(map: CustomFieldMap)`. `fieldMap` (effectif) = `{ ...defaultPromoFieldMap(rawColumns), ...fieldMapOverrides }`.

- [ ] **Step 1 : `CatalogDoc` gagne les deux champs**

Dans `catalogTypes.ts`, ajouter à `CatalogDoc` (après `fieldMap`, ligne 247), et importer `CustomFieldMap` :

```ts
import type { PromoFieldKey, CustomFieldMap } from '@/features/retail-promo/promoTypes'
// …
  fieldMap: Partial<Record<PromoFieldKey, string>>
  /** Choix MANUELS de correspondance (survivent au re-devinage). */
  fieldMapOverrides: Partial<Record<PromoFieldKey, string>>
  /** Champs libres affichés en zone « détails » de la fiche. */
  customFields: CustomFieldMap
```

- [ ] **Step 2 : `newCatalogDoc` + `loadCatalog` (défauts rétro-compatibles)**

Dans `catalogsApi.ts:16-20`, ajouter les défauts (`loadCatalog` spread déjà `newCatalogDoc('')` en base → les anciens docs héritent des valeurs vides) :

```ts
  return {
    id: '', name, sourceRef: null, selectedRowIds: [], levelKeys: {}, treeEdits: EMPTY_TREE_EDITS,
    prompt: '', plan: null, fieldMap: {}, fieldMapOverrides: {}, customFields: [], format: CATALOG_FORMAT_PRESETS[0].format,
    coverImageUrl: null, backCoverImageUrl: null, pageOrder: [],
  }
```

- [ ] **Step 3 : Store — état, setters, hydrate/toDoc/partialize**

Dans `catalog.store.ts` :

1. Import en tête : `import { defaultPromoFieldMap } from '@/features/retail-promo/promoMapping'` et `import type { PromoFieldKey } from '@/features/retail-promo/promoTypes'` (déjà présent) + `import type { CustomFieldMap } from '@/features/retail-promo/promoTypes'`.
2. Interface `CatalogState` : ajouter après `fieldMap` (ligne 23) :

```ts
  fieldMapOverrides: Partial<Record<PromoFieldKey, string>>
  customFields: CustomFieldMap
```

3. Déclarations de setters (près de `setFieldMap`, ligne 53) :

```ts
  setFieldMap: (map: Partial<Record<PromoFieldKey, string>>) => void
  setFieldMapOverride: (key: PromoFieldKey, column: string | null) => void
  setCustomFields: (map: CustomFieldMap) => void
```

4. `defaultState` (ligne 74) : ajouter

```ts
  fieldMapOverrides: {} as Partial<Record<PromoFieldKey, string>>,
  customFields: [] as CustomFieldMap,
```

5. `hydrate` (ligne 107-115) : ajouter `fieldMapOverrides: doc.fieldMapOverrides, customFields: doc.customFields,` au `set({...})`.
6. `toDoc` (ligne 118-123) : ajouter `fieldMapOverrides: s.fieldMapOverrides, customFields: s.customFields,`.
7. Implémentation des setters (près de la ligne 161) :

```ts
  setFieldMap: (fieldMap) => set({ fieldMap }),
  setFieldMapOverride: (key, column) => set((s) => {
    const fieldMapOverrides = { ...s.fieldMapOverrides }
    if (column) fieldMapOverrides[key] = column
    else delete fieldMapOverrides[key]
    const fieldMap = { ...defaultPromoFieldMap(s.rawColumns), ...fieldMapOverrides }
    return { fieldMapOverrides, fieldMap }
  }),
  setCustomFields: (customFields) => set({ customFields }),
```

8. `partialize` (ligne 171-177) : ajouter `fieldMapOverrides: s.fieldMapOverrides, customFields: s.customFields,`.

- [ ] **Step 4 : `useCatalogSource` — reset overrides à la (re)connexion**

Dans `useCatalogSource.ts:15-22`, `applyConnectedSource`, après `s.setFieldMap(defaultPromoFieldMap(columns))` ajouter (nouvelle source = repartir du devinage pur) :

```ts
  s.setFieldMap(defaultPromoFieldMap(columns))
  s.setFieldMapOverride && s.setCustomFields([])
  useCatalogStore.setState({ fieldMapOverrides: {} })
```

(Note : `setFieldMapOverride &&` n'est pas appelé — on remet directement l'état via `setState` pour vider overrides, et `setCustomFields([])` vide les champs libres.)

Version propre à écrire :

```ts
  s.setFieldMap(defaultPromoFieldMap(columns))
  useCatalogStore.setState({ fieldMapOverrides: {} })
  s.setCustomFields([])
```

- [ ] **Step 5 : `CatalogBuilderPage` — remplacer l'écrasement par le merge overrides**

Dans `CatalogBuilderPage.tsx:59-69`, remplacer le bloc de re-dérivation :

```ts
      if (cancelled) return
      // Le devinage s'améliore au fil des versions ; on RE-DÉRIVE, mais les
      // choix MANUELS (fieldMapOverrides) l'emportent et survivent → un mapping
      // corrigé par l'utilisateur n'est jamais écrasé.
      const cur = useCatalogStore.getState()
      if (cur.rawColumns.length > 0) {
        const eff = { ...defaultPromoFieldMap(cur.rawColumns), ...cur.fieldMapOverrides }
        if (JSON.stringify(eff) !== JSON.stringify(cur.fieldMap)) cur.setFieldMap(eff)
      }
```

- [ ] **Step 6 : Test store — override survit au re-boot simulé**

Ajouter à `src/stores/catalog.store.test.ts` (créer si absent, avec les imports habituels du fichier de tests store) :

```ts
import { useCatalogStore } from './catalog.store'
import type { MergeColumn } from './merge.store'

test('setFieldMapOverride : le choix manuel prime et survit au re-devinage', () => {
  const columns: MergeColumn[] = [
    { key: 'p_barre', label: 'Prix barré' } as MergeColumn,
    { key: 'p_promo', label: 'Prix promo' } as MergeColumn,
    { key: 'p_autre', label: 'PVC' } as MergeColumn,
  ]
  useCatalogStore.setState({ rawColumns: columns, fieldMapOverrides: {}, fieldMap: {} })
  // L'utilisateur force le prix barré sur « PVC »
  useCatalogStore.getState().setFieldMapOverride('oldPrice', 'p_autre')
  expect(useCatalogStore.getState().fieldMap.oldPrice).toBe('p_autre')
  // Re-dérivation (comme au boot) : l'override tient
  const s = useCatalogStore.getState()
  const eff = { ...s.fieldMap, oldPrice: undefined, ...s.fieldMapOverrides }
  expect(eff.oldPrice).toBe('p_autre')
  // Retour à « Auto »
  useCatalogStore.getState().setFieldMapOverride('oldPrice', null)
  expect(useCatalogStore.getState().fieldMapOverrides.oldPrice).toBeUndefined()
})
```

- [ ] **Step 7 : Tests + types**

Run : `npm run test:run -- src/stores/catalog.store.test.ts && npx tsc -b`
Expected : PASS.

- [ ] **Step 8 : Commit**

```bash
git add src/features/catalog/catalogTypes.ts src/stores/catalog.store.ts src/stores/catalog.store.test.ts src/features/catalog/catalogsApi.ts src/features/catalog/useCatalogSource.ts src/pages/CatalogBuilderPage.tsx
git commit -m "feat(catalog): fieldMapOverrides (choix manuel prime) + état customFields"
```

### Task 5 : Composant partagé `CustomFieldsEditor`

**Files:**
- Create: `src/features/retail-promo/components/CustomFieldsEditor.tsx`

**Interfaces:**
- Consumes : `CustomFieldMap`, `MergeColumn`.
- Produces : `<CustomFieldsEditor customFields columns onChange />` — liste éditable (nom + colonne + suppr) + bouton d'ajout. `id` = slug du label, unicité par suffixe.

- [ ] **Step 1 : Créer le composant**

```tsx
// src/features/retail-promo/components/CustomFieldsEditor.tsx
// Éditeur de champs libres partagé (Catalogue studio + Création studio) : chaque
// ligne mappe une colonne source arbitraire, nommée par l'utilisateur (le nom sert
// de repère — seules les VALEURS sont affichées sur la fiche, en zone « détails »).
import { Plus, Trash2 } from 'lucide-react'
import type { MergeColumn } from '@/stores/merge.store'
import type { CustomField, CustomFieldMap } from '../promoTypes'

interface Props {
  customFields: CustomFieldMap
  columns: MergeColumn[]
  onChange: (next: CustomFieldMap) => void
}

function slugify(label: string, taken: Set<string>): string {
  const base = (label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'champ')
  let id = base, i = 2
  while (taken.has(id)) { id = `${base}-${i}`; i++ }
  return id
}

export function CustomFieldsEditor({ customFields, columns, onChange }: Props) {
  const update = (idx: number, patch: Partial<CustomField>) =>
    onChange(customFields.map((cf, i) => (i === idx ? { ...cf, ...patch } : cf)))
  const remove = (idx: number) => onChange(customFields.filter((_, i) => i !== idx))
  const add = () => {
    const taken = new Set(customFields.map((c) => c.id))
    onChange([...customFields, { id: slugify('champ', taken), label: '', column: '' }])
  }

  return (
    <div className="space-y-2">
      {customFields.map((cf, idx) => (
        <div key={cf.id} className="flex items-center gap-2">
          <input value={cf.label} onChange={(e) => update(idx, { label: e.target.value })} placeholder="Nom du champ"
            className="w-32 px-2 py-1.5 rounded-md bg-surface-2 text-sm text-white outline-none focus:ring-1 focus:ring-indigo-600" />
          <select value={cf.column} onChange={(e) => update(idx, { column: e.target.value })}
            className="flex-1 px-2 py-1.5 rounded-md bg-well border border-white/10 text-white text-sm outline-none focus:border-[#6366f1] [&>option]:bg-neutral-900">
            <option value="">(choisir une colonne)</option>
            {columns.map((c) => <option key={c.key} value={c.key}>{c.label || c.key}</option>)}
          </select>
          <button type="button" onClick={() => remove(idx)} title="Supprimer"
            className="p-1.5 rounded-md text-muted-foreground hover:text-white hover:bg-surface-2">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button type="button" onClick={add}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-muted-foreground hover:text-white hover:bg-surface-2">
        <Plus className="w-3.5 h-3.5" /> Ajouter un champ
      </button>
    </div>
  )
}
```

- [ ] **Step 2 : Types + knip**

Run : `npx tsc -b && npx knip`
Expected : tsc PASS ; knip peut lister `CustomFieldsEditor` comme inutilisé TANT qu'aucun module ne l'importe — c'est attendu ici, il sera consommé Task 6 et Task 11. Ne pas committer seul si knip bloque ; enchaîner Task 6 avant le commit knip-propre. (Committer le composant avec la Task 6.)

### Task 6 : Catalogue — carte « Correspondance des champs » (slots + champs libres)

**Files:**
- Create: `src/features/catalog/components/steps/StepFieldMapping.tsx`
- Modify: `src/features/catalog/components/steps/StepStructure.tsx`

**Interfaces:**
- Consumes : store (`fieldMap`, `setFieldMapOverride`, `customFields`, `setCustomFields`, `rawColumns`), `CustomFieldsEditor`.
- Produces : carte affichée dans l'étape Structure.

- [ ] **Step 1 : Créer `StepFieldMapping`**

```tsx
// src/features/catalog/components/steps/StepFieldMapping.tsx
// Carte « Correspondance des champs » de l'étape Structure : associe chaque champ
// de FICHE (nom/image/prix…) à une colonne source, et gère les champs libres.
// Le devinage reste le défaut ; un choix ici pose un override qui prime et survit.
import { Link2 } from 'lucide-react'
import { useCatalogStore } from '@/stores/catalog.store'
import type { PromoFieldKey } from '@/features/retail-promo/promoTypes'
import { CustomFieldsEditor } from '@/features/retail-promo/components/CustomFieldsEditor'

const FIELDS: { key: PromoFieldKey; label: string }[] = [
  { key: 'name', label: 'Nom' },
  { key: 'image', label: 'Image' },
  { key: 'newPrice', label: 'Prix' },
  { key: 'oldPrice', label: 'Prix barré' },
  { key: 'brand', label: 'Marque' },
  { key: 'ref', label: 'Référence' },
  { key: 'unit', label: 'Unité' },
  { key: 'description', label: 'Description' },
]

const selectClass = 'w-full px-3 py-1.5 rounded-md bg-surface-2 text-sm text-white outline-none focus:ring-1 focus:ring-indigo-600'

export function StepFieldMapping() {
  const rawColumns = useCatalogStore((s) => s.rawColumns)
  const fieldMap = useCatalogStore((s) => s.fieldMap)
  const overrides = useCatalogStore((s) => s.fieldMapOverrides)
  const setFieldMapOverride = useCatalogStore((s) => s.setFieldMapOverride)
  const customFields = useCatalogStore((s) => s.customFields)
  const setCustomFields = useCatalogStore((s) => s.setCustomFields)

  return (
    <section className="rounded-lg border border-border bg-surface p-4 space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
        <Link2 className="w-4 h-4 text-indigo-400" /> Correspondance des champs
      </h2>
      <p className="text-xs text-muted-foreground">Les champs sont devinés automatiquement ; corrigez une colonne au besoin (votre choix est conservé).</p>
      <div className="grid grid-cols-2 gap-3">
        {FIELDS.map(({ key, label }) => (
          <div key={key} className="space-y-1">
            <label className="flex items-center justify-between text-xs text-muted-foreground">
              {label}
              {overrides[key] && (
                <button type="button" onClick={() => setFieldMapOverride(key, null)} className="text-[10px] text-indigo-400 hover:text-indigo-300">Auto</button>
              )}
            </label>
            <select value={fieldMap[key] ?? ''} onChange={(e) => setFieldMapOverride(key, e.target.value || null)} className={selectClass}>
              <option value="">(non mappé)</option>
              {rawColumns.map((c) => <option key={c.key} value={c.key}>{c.label || c.key}</option>)}
            </select>
          </div>
        ))}
      </div>
      <div className="pt-1">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Champs supplémentaires</div>
        <CustomFieldsEditor customFields={customFields} columns={rawColumns} onChange={setCustomFields} />
      </div>
    </section>
  )
}
```

- [ ] **Step 2 : Brancher dans `StepStructure`**

Dans `StepStructure.tsx`, importer et insérer la carte sous la grille Mapping niveaux / Format (après la `</div>` fermant `grid ... lg:grid-cols-[3fr_2fr]`, ligne 125, avant la section Arborescence) :

```tsx
import { StepFieldMapping } from './StepFieldMapping'
// …
        </div>{/* fin grid Mapping niveaux / Format */}

        <StepFieldMapping />

        <section className="rounded-lg border border-border bg-surface p-4 space-y-3">
          {/* Arborescence … inchangé … */}
```

- [ ] **Step 3 : Types + lint + knip**

Run : `npx tsc -b && npm run lint && npx knip`
Expected : PASS (knip : `CustomFieldsEditor` et `StepFieldMapping` désormais consommés côté catalogue).

- [ ] **Step 4 : Commit**

```bash
git add src/features/retail-promo/components/CustomFieldsEditor.tsx src/features/catalog/components/steps/StepFieldMapping.tsx src/features/catalog/components/steps/StepStructure.tsx
git commit -m "feat(catalog): carte Correspondance des champs (mapping éditable + champs libres)"
```

- [ ] **Step 5 : Phase 2 — build + deploy + smoke**

```bash
npx tsc -b && npm run test:run && npm run lint && npx knip
npm run build && firebase deploy --only hosting
```
Smoke live (`?fresh=1`) : ouvrir un catalogue → étape Structure → carte « Correspondance des champs » visible ; changer « Prix barré » sur une autre colonne → revenir/rouvrir → le choix tient (n'est plus écrasé).

---

## Phase 3 — Catalogue : rendu des champs libres (zone « Détails »)

### Task 7 : `customFields` dans le contexte de rendu → `details`

**Files:**
- Modify: `src/features/catalog/components/pages/catalogCss.ts:17-29` (`CatalogRenderCtx`)
- Modify: `src/features/catalog/useCatalogPages.ts:50-58`
- Modify: `src/features/catalog/components/pages/ProductGridPage.tsx:64-78`

**Interfaces:**
- Consumes : store `customFields`, `extractPromoFields` (4e param).
- Produces : `CatalogRenderCtx.customFields: CustomFieldMap` ; `ProductGridPage` calcule `details: string[]` et le passe à `ProductCell`.

- [ ] **Step 1 : `CatalogRenderCtx` gagne `customFields`**

Dans `catalogCss.ts`, importer `CustomFieldMap` et ajouter au contexte :

```ts
import type { PromoFieldKey, CustomFieldMap } from '@/features/retail-promo/promoTypes'
// … interface CatalogRenderCtx …
  fieldMap: Partial<Record<PromoFieldKey, string>>
  customFields: CustomFieldMap
```

- [ ] **Step 2 : `useCatalogPages` alimente `customFields`**

Dans `useCatalogPages.ts`, ajouter au littéral `ctx` (ligne 50-55) `customFields: s.customFields,` et à la liste de dépendances du `useMemo` (ligne 58) `s.customFields`.

- [ ] **Step 3 : `ProductGridPage` calcule et passe `details`**

Dans `ProductGridPage.tsx`, remplacer le corps du `.map(slots)` (lignes 64-78) :

```tsx
      {slots.map((slot) => {
        const style = { gridColumn: `${slot.col} / span ${slot.colSpan}`, gridRow: `${cssRowOf[slot.row]} / span ${slot.rowSpan}` }
        const row = ctx.rowsById.get(slot.rowId)
        if (!row) return <div key={slot.rowId} className="cat-cell" style={style} />
        const horizontal = slot.rowSpan === 1 && (slot.colSpan >= 2 || grid >= 6)
        const fields = extractPromoFields(row, ctx.columns, ctx.fieldMap, ctx.customFields)
        const details = ctx.customFields.map((cf) => fields.extra?.[cf.id]).filter((v): v is string => !!v && !!v.trim())
        return (
          <ProductCell key={slot.rowId} fields={fields}
            featured={slot.featured} size={slotSize(slot, grid)} details={details}
            horizontal={horizontal} cardStyle={ctx.plan.cardStyle} style={style} />
        )
      })}
```

- [ ] **Step 4 : Types**

Run : `npx tsc -b`
Expected : FAIL sur `ProductCell` (`details` prop inconnue) + tout littéral `CatalogRenderCtx` sans `customFields`. Les corriger Task 8 (ProductCell) et vérifier les autres construction de ctx (grep `CatalogRenderCtx = {` → seul `useCatalogPages`). Si un test/harness construit un ctx, ajouter `customFields: []`.

- [ ] **Step 5 : Commit (avec Task 8, car tsc rouge seul)** — voir Task 8 Step 6.

### Task 8 : `ProductCell` rend la zone « détails » + réglages Style des fiches

**Files:**
- Modify: `src/features/catalog/components/pages/ProductCell.tsx`
- Modify: `src/features/catalog/catalogTypes.ts` (`CatalogCardStyle`, `DEFAULT_CARD_STYLE`)
- Modify: `src/features/catalog/components/pages/catalogCss.ts` (`cardStyleVars`, `CATALOG_CSS`)
- Modify: `src/features/catalog/components/steps/CardStyleTypo.tsx`
- Modify: `src/features/catalog/components/steps/CardStyleCard.tsx` (`VISIBILITY`)

**Interfaces:**
- Consumes : `details: string[]`, `CatalogCardStyle` (`showDetails`, `detailsScale`, `detailsFont`).
- Produces : `.cat-cell-details` rendu ; var `--cat-s-details` / `--cat-font-details`.

- [ ] **Step 1 : `CatalogCardStyle` + défauts**

Dans `catalogTypes.ts`, ajouter à `CatalogCardStyle` : `detailsScale: number` (près des autres `*Scale`), `detailsFont: string` (près des `*Font`), `showDetails: boolean` (près des `show*`). Dans `DEFAULT_CARD_STYLE` : `detailsScale: 1`, `detailsFont: ''`, `showDetails: true` (ajouter aux lignes correspondantes 130/131/137).

- [ ] **Step 2 : `cardStyleVars` émet les variables**

Dans `catalogCss.ts`, `cardStyleVars` (retour), ajouter :

```ts
    '--cat-s-details': s.detailsScale !== 1 ? String(s.detailsScale) : undefined,
    '--cat-font-details': font(s.detailsFont),
```

- [ ] **Step 3 : CSS `.cat-cell-details`**

Dans `CATALOG_CSS`, après `.cat-cell-desc {…}` (ligne 182) ajouter :

```css
.cat-cell-details { display:flex; flex-direction:column; gap:1px; margin-top:4px;
  font-family:var(--cat-font-details,var(--cat-font-b)); font-size:calc(9px * var(--cat-s-details,1) * ${F});
  opacity:.6; line-height:1.3; }
.cat-cell-details span { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
```

- [ ] **Step 4 : `ProductCell` — prop + rendu**

Dans `ProductCell.tsx` : ajouter `details?: string[]` à `Props`, l'extraire, étendre le type de `show` avec `'showDetails'`, et rendre après la description (ligne 57) :

```tsx
interface Props {
  fields: PromoFields
  featured: boolean
  kicker?: string
  size: CellSize
  details?: string[]
  horizontal?: boolean
  cardStyle?: CatalogCardStyle
  style?: React.CSSProperties
}

export function ProductCell({ fields: f, featured, kicker, size, details, horizontal, cardStyle, style }: Props) {
  // …
  const show = (key: 'showDesc' | 'showRef' | 'showUnit' | 'showSticker' | 'showKicker' | 'showPromo' | 'showVedette' | 'showDetails') => cardStyle?.[key] ?? true
  // … dans .cat-cell-body, après la ligne description :
        {f.description && show('showDesc') && <span className="cat-cell-desc">{f.description}</span>}
        {details && details.length > 0 && show('showDetails') && (
          <div className="cat-cell-details">{details.map((d, i) => <span key={i}>{d}</span>)}</div>
        )}
```

- [ ] **Step 5 : UI Style des fiches — échelle/police + toggle**

Dans `CardStyleTypo.tsx` : ajouter `'detailsScale'` à `ScaleKey`, `'detailsFont'` à `FontKey`, et une entrée `FIELDS` : `{ scale: 'detailsScale', font: 'detailsFont', label: 'Détails' }`.
Dans `CardStyleCard.tsx` : ajouter à `VISIBILITY` (et au type `Pick<…>`) `{ key: 'showDetails', label: 'Détails' }`.

- [ ] **Step 6 : Types + tests + commit (Tasks 7+8)**

Run : `npx tsc -b && npm run test:run && npm run lint && npx knip`
Expected : PASS. Si `catalogCss.test.ts` fait un `toEqual` strict sur `cardStyleVars`, ajouter les deux nouvelles clés attendues (valeur `undefined` au défaut) au cas testé.

```bash
git add src/features/catalog/components/pages/catalogCss.ts src/features/catalog/useCatalogPages.ts src/features/catalog/components/pages/ProductGridPage.tsx src/features/catalog/components/pages/ProductCell.tsx src/features/catalog/catalogTypes.ts src/features/catalog/components/steps/CardStyleTypo.tsx src/features/catalog/components/steps/CardStyleCard.tsx
git commit -m "feat(catalog): rendu zone Détails (champs libres) + réglages Style des fiches"
```

- [ ] **Step 7 : Phase 3 — build + deploy + smoke**

```bash
npm run build && firebase deploy --only hosting
```
Smoke (`?fresh=2`) : ajouter un champ libre (ex. « Normes ») en étape Structure → étape Aperçu → la valeur apparaît en petit sous la description ; décocher « Détails » dans Style des fiches → disparaît.

---

## Phase 4 — Création studio : champs libres (bloc « Détails ») + désync

### Task 9 : Store retail — `customFields`

**Files:**
- Modify: `src/features/retail-promo/retailPromo.store.ts`

**Interfaces:**
- Produces : store `customFields: CustomFieldMap`, `setCustomFields(map)`, persisté.

- [ ] **Step 1 : État + setter + partialize**

Dans `retailPromo.store.ts` :
1. Import : `import type { CustomFieldMap } from './promoTypes'` (compléter l'import existant `PromoFieldKey`).
2. `RetailPromoState` : ajouter `customFields: CustomFieldMap` (après `fieldMap`, ligne 12) et `setCustomFields: (map: CustomFieldMap) => void` (après `setFieldMap`, ligne 22).
3. `defaultState` : `customFields: [] as CustomFieldMap,` (après `fieldMap`, ligne 42).
4. Implémentation : `setCustomFields: (customFields) => set({ customFields }),` (après `setFieldMap`, ligne 62).
5. `partialize` : ajouter `customFields: s.customFields,` (ligne 97).

- [ ] **Step 2 : Types + commit**

Run : `npx tsc -b`
```bash
git add src/features/retail-promo/retailPromo.store.ts
git commit -m "feat(promo): store retail — état customFields persisté"
```

### Task 10 : `RetailPromoCard` — bloc « Détails » + affichage désync

**Files:**
- Modify: `src/features/retail-promo/RetailPromoCard.tsx`
- Modify: `src/features/retail-promo/PromoLayersPanel.tsx:20-22`

**Interfaces:**
- Consumes : `RetailCardData` (`details`, `ean`, `unit`, `mentions`, `enseigne`).
- Produces : id de bloc `'details'` dans `PromoBlockId` ; rendu `.rp-details` ; brand ligne + ean, unité près du prix, pied = enseigne/validité/mentions.

- [ ] **Step 1 : Union `PromoBlockId` + bloc sélectionnable**

Dans `RetailPromoCard.tsx` :
- `PromoBlockId` (lignes 26-29) : ajouter `| 'details'`.
- `DECO_BLOCKS` (ligne 118) : `['header', 'image', 'badge', 'price', 'details']` (le bloc Détails devient sélectionnable/déplaçable/stylable comme un bloc entier).

- [ ] **Step 2 : CSS `.rp-details`**

Dans `PROMO_CSS`, après `.rp-desc {…}` (ligne 173) ajouter :

```css
.rp-details { background:#f8fafc; color:#334155; padding:12px 40px; display:flex; flex-direction:column; gap:3px;
  font-size:14px; line-height:1.3; border-top:1px solid #e2e8f0; }
.rp-detail { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
```

- [ ] **Step 3 : Rendu — brand+ean, détails, unité, pied**

Dans le JSX de `RetailPromoCard` :
- Ligne brand (462-464) : condition et contenu incluent `ean` :

```tsx
          {(data.brand || data.ref || data.ean) && (
            <div ref={setEl('brand')} className="rp-brand" style={blk('brand', es('brand'))} {...drag('brand')} {...editProps('brand')}>{[data.brand, data.ref, data.ean].filter(Boolean).join(' · ')}</div>
          )}
```

- Après `</div>` du bloc `.rp-product` (ligne 477), insérer le bloc détails :

```tsx
        {!config.hidden?.details && data.details.length > 0 && (
          <div ref={setEl('details')} className="rp-details" style={blk('details', bg('details'))} {...drag('details')}>
            {data.details.map((d, i) => <div key={i} className="rp-detail">{d}</div>)}
          </div>
        )}
```

- Prix : afficher l'unité de vente après le montant (ligne 484-486) :

```tsx
          <div ref={setEl('priceNow')} className="rp-now" style={blk('priceNow', { fontSize: priceFontSize, ...es('priceNow') })} {...drag('priceNow')}>
            {amount}{cur && <span className="rp-cur">{cur}</span>}{data.unit && <span className="rp-cur">{data.unit}</span>}
          </div>
```

- Pied (ligne 488) : combiner enseigne / validité / mentions :

```tsx
        {config.showFooter && <div ref={setEl('footer')} className="rp-foot" style={blk('footer', es('footer'))} {...drag('footer')} {...editProps('footer')}>{[data.enseigne, data.validite, data.mentions].filter(Boolean).join(' — ')}</div>}
```

- [ ] **Step 4 : `PromoLayersPanel` — entrée « Détails »**

Dans `PromoLayersPanel.tsx`, `TREE` (après le nœud `footer`, ligne 29) ajouter :

```tsx
  { id: 'details', label: 'Détails (champs libres)', isText: false, icon: 'block' },
```

Vérifier que `blockValue('details')` (ligne 56) a un cas ou un défaut ; si `blockValue` switch sans défaut, ajouter `case 'details': return ''`.

- [ ] **Step 5 : Types + lint + commit**

Run : `npx tsc -b && npm run lint`
```bash
git add src/features/retail-promo/RetailPromoCard.tsx src/features/retail-promo/PromoLayersPanel.tsx
git commit -m "feat(promo): carte — bloc Détails (champs libres) + affichage ean/unité/mentions/enseigne"
```

### Task 11 : Câblage — StepMapping, StepRender, persistance

**Files:**
- Modify: `src/features/retail-promo/steps/StepMapping.tsx`
- Modify: `src/features/retail-promo/steps/StepRender.tsx:90-92,189`
- Modify: `src/features/retail-promo/promosApi.ts`
- Modify: `src/features/retail-promo/PromoSavedList.tsx:13,22-30`

**Interfaces:**
- Consumes : `CustomFieldsEditor`, store `customFields`, `toCardData`/`extractPromoFields` (customFields), `savePromo`/`loadPromoPayload`.
- Produces : section « Champs supplémentaires » dans le mapping ; cartes rendues avec détails ; `customFields` persisté dans la fiche.

- [ ] **Step 1 : `StepMapping` — section champs libres**

Dans `StepMapping.tsx` : lire `customFields`/`setCustomFields` du store, importer `CustomFieldsEditor`, et insérer sous la liste des slots (après la `</div>` fermant `flex flex-col gap-2`, ligne 54) :

```tsx
  const { rawColumns, fieldMap, setFieldMap, setStep, customFields, setCustomFields } = useRetailPromoStore()
  // …
      </div>{/* fin liste des slots */}

      <div>
        <div className="text-xs font-semibold text-white/70 uppercase tracking-wide mb-2">Champs supplémentaires</div>
        <CustomFieldsEditor customFields={customFields} columns={rawColumns} onChange={setCustomFields} />
      </div>
```

- [ ] **Step 2 : `StepRender` — passer `customFields` à l'extraction et à la carte**

Dans `StepRender.tsx` : ajouter `customFields` au destructure (ligne 90) et le passer (ligne 92) :

```tsx
  const { rawColumns, rawRows, fieldMap, customFields, config, sourceRef, setSource, currentIndex, setCurrentIndex, imgOverride, setImgOverrideAt, textOverride, setTextOverrideAt, setConfig, setStep, selectedKey, setSelectedKey, setElementStyle } = useRetailPromoStore()
  const euroSep = { now: config.styles?.priceNow?.euroSep, was: config.styles?.priceWas?.euroSep }
  const cards = rawRows.map((r) => toCardData(extractPromoFields(r, rawColumns, fieldMap, customFields), euroSep, customFields))
```

Et à l'appel `savePromo` (ligne 189) ajouter `customFields` :

```tsx
      await savePromo({ name, sourceRef, fieldMap, customFields, config, columns: rawColumns, rows: rawRows, imgOverride, textOverride, thumbnail }, existing?.id)
```

- [ ] **Step 3 : `promosApi` — persister `customFields`**

Dans `promosApi.ts` :
- Import : `import type { PromoFieldKey, CustomFieldMap } from './promoTypes'`.
- `SavedPromoMeta` : ajouter `customFields: CustomFieldMap`.
- `SavePromoInput` : ajouter `customFields: CustomFieldMap`.
- Dans `savePromo`, ajouter au `stripUndefined({...})` : `customFields: input.customFields,`.
- Dans le lecteur de méta (`listPromos`) : mapper `customFields: (d.data().customFields ?? []) as CustomFieldMap`.

- [ ] **Step 4 : `PromoSavedList` — restaurer `customFields`**

Dans `PromoSavedList.tsx` : ajouter `setCustomFields` au destructure (ligne 13) et l'appeler à l'ouverture (après `setFieldMap(p.fieldMap)`, ligne 25) :

```tsx
  const { setSource, setFieldMap, setConfig, setStep, setImgOverride, setTextOverride, setCurrentIndex, setCustomFields } = useRetailPromoStore()
  // …
      setFieldMap(p.fieldMap)
      setCustomFields(p.customFields ?? [])
```

- [ ] **Step 5 : Types + tests + lint + knip**

Run : `npx tsc -b && npm run test:run && npm run lint && npx knip`
Expected : PASS.

- [ ] **Step 6 : Commit + Phase 4 build/deploy/smoke**

```bash
git add src/features/retail-promo/steps/StepMapping.tsx src/features/retail-promo/steps/StepRender.tsx src/features/retail-promo/promosApi.ts src/features/retail-promo/PromoSavedList.tsx
git commit -m "feat(promo): mapping champs libres (Création studio) + persistance fiche"
npm run build && firebase deploy --only hosting
```
Smoke (`?fresh=3`) : Création studio → étape Correspondance → ajouter un champ « Normes » → étape Aperçu → bloc « Détails » sous la photo avec la valeur ; vérifier unité/mentions affichées ; enregistrer la fiche → « Mes promos » → Ouvrir → les champs libres reviennent.

---

## Self-Review

**Spec coverage :**
- Socle commun (extra + extractPromoFields + toCardData) → Tasks 1-3. ✔
- Catalogue mapping éditable + fin écrasement → Tasks 4, 6. ✔
- Catalogue champs libres rendu → Tasks 7, 8. ✔
- Création champs libres (bloc Détails groupé) → Tasks 9, 10, 11. ✔
- Désync Création (ean/unit/mentions/enseigne affichés) → Tasks 3, 10. ✔
- Composant partagé `CustomFieldsEditor` → Task 5. ✔
- Persistance (doc catalogue + fiche promo) → Tasks 4, 11. ✔
- Tests moteurs → Tasks 2, 3, 4. ✔

**Type consistency :** `CustomField`/`CustomFieldMap`/`PromoFields.extra` (Task 1) réutilisés partout ; `extractPromoFields(...customFields?)` (Task 2) ↔ appels Tasks 7, 11 ; `toCardData(f, euroSep?, customFields?)` (Task 3) ↔ appel Task 11 ; `RetailCardData.details` (Task 3) ↔ rendu Task 10 ; `setFieldMapOverride`/`setCustomFields` (Task 4) ↔ UI Task 6 ; `CatalogRenderCtx.customFields` (Task 7) ↔ `ProductCell details` (Task 8) ; `PromoBlockId 'details'` (Task 10) ↔ `PromoLayersPanel` (Task 10). Cohérent.

**Placeholder scan :** aucun TBD/TODO ; code réel à chaque étape. Le seul point « à vérifier » est le défaut de `blockValue('details')` (Task 10 Step 4) et un éventuel `toEqual` strict de `catalogCss.test.ts` (Task 8 Step 6) — traités par une instruction explicite.
