# Module Visuels Promo Retail — V1 Print — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un module qui produit des visuels promotionnels Retail imprimables (affiche, encart, étiquette rayon) à partir d'un dataset sélectionné, via un moteur hybride (templates curés + plan généré par IA) rempli par la fusion de données, exportable par lot.

**Architecture:** Une couche `features/retail-promo/` pure et fine **par-dessus** le moteur existant. Les valeurs promo (prix, remise calculée, lot, validité) sont pré-calculées en **colonnes synthétiques `promo_*`** ajoutées aux rows ; les blocs promo posent des Textbox `{{promo_*}}` + des `ConditionalRule` sur `obj.data`. La fusion (`useDataMerge.applyRow`) et l'applier de règles (`applyConditionalRulesForRow`) existants font le rendu par ligne, **sans modification**. Templates curés et plan IA partagent un format unique `PromoLayout`, instancié en objets Fabric par une seule fonction.

**Tech Stack:** React 18, TypeScript strict (ES2022), Fabric.js v7, Zustand v4, React Query v5, Firebase, Vitest. Réutilise `features/merge`, `features/export`, moteur de règles conditionnelles, `features/navigation`, `features/access`.

## Global Constraints

- Composants `PascalCase.tsx` ≤ **150 lignes** ; hooks `useCamelCase.ts` ; stores `camelCase.store.ts`.
- TS strict, **pas d'`any`** ; props typées explicitement.
- Vérification types : **`npx tsc -b`** (project references — `tsc --noEmit` ne vérifie rien). Lint : `npm run lint`. Tests : `npm run test:run`. Code mort : `npx knip` (baseline **exit 0**).
- Théming par tokens : `bg-surface`/`bg-surface-2`/`bg-well`, `white` = avant-plan thémable, `text-[#fff]` = blanc vrai. Accent `#6366f1`.
- Couleurs programmatiques (Fabric) : lire `useThemeStore().resolvedTheme`.
- Réponses/commentaires en **français**.
- Un symbole utilisé seulement dans son fichier ne doit **pas** être exporté (knip) ; les blocs s'enregistrent par effet de bord.
- Fin de chantier complet → commit master puis `npm run build` + `firebase deploy --only hosting` (pas à chaque tâche unitaire de ce plan).
- Périmètre **V1-Print uniquement** : pas de raster IA, pas de web/animé, aucun nouveau format d'export hors extension dpi/marques du batch.

---

## Structure de fichiers (nouveau dossier `src/features/retail-promo/`)

| Fichier | Responsabilité | Tâche |
|---|---|---|
| `promoTypes.ts` | Types : `PromoMechanism`, `PromoFields`, `PromoFieldKey`, `PromoLayout`, `PlacedBlock`, `PromoBlockId` | 1 |
| `priceParse.ts` | `parsePrice`, `formatPrice`, `computeMechanism` (pur) | 1 |
| `promoMapping.ts` | `defaultPromoFieldMap`, `extractPromoFields` (pur) | 2 |
| `augmentRows.ts` | `augmentRowsWithPromo` → colonnes/valeurs synthétiques `promo_*` (pur) | 3 |
| `promoPlan.ts` | `validatePromoPlan`, `repairPromoPlan`, `promoPlanJsonSchema` (pur) | 4 |
| `blocks/types.ts` | `PromoBlockDef`, `BlockBuildCtx` | 5 |
| `blocks/*.ts` (8 fichiers) | 1 bloc/fichier, enregistrement par effet de bord | 5 |
| `blocks/registry.ts` | `registerPromoBlock`, `getPromoBlock`, `listPromoBlocks`, `initPromoBlocks` | 5 |
| `templates.ts` | `CURATED_TEMPLATES: PromoLayout[]`, `nearestTemplate(format)` | 6 |
| `instantiateLayout.ts` | `instantiatePromoLayout(canvas, layout)` → objets Fabric | 7 |
| `useGeneratePromoPlan.ts` | brief → LLM → `PromoLayout` validé/réparé | 8 |
| `useRetailPromoSource.ts` | sélection source (PIM/Excel/manuel) → `{columns, rows}` | 11 |
| `retailPromo.store.ts` | état du parcours (source, layout, fieldMap, étape) | 11 |
| `RetailPromoPage.tsx` + `steps/*.tsx` | UI 4 étapes (≤150 l. chacun) | 11 |

Fichiers existants modifiés : `useBatchExport.ts` (tâche 9) ; `navigation/modules.ts`, `access/permissions.ts`, `help/helpContext.ts`, `pages/DashboardPage.tsx` (tâche 10).

---

## Interfaces partagées (référence)

Définies en tâche 1, consommées partout :

```ts
// promoTypes.ts
export type PromoMechanism = 'simple' | 'remise' | 'lot' | 'pack'

export interface PromoFields {
  name: string
  image: string | null
  brand: string
  ref: string
  ean: string
  oldPrice: number | null
  newPrice: number | null
  currency: string            // ISO, défaut 'EUR'
  unit: string                // ex '/kg' ; '' si aucun
  mechanism: PromoMechanism
  remisePct: number | null    // calculé
  remiseMontant: number | null// calculé
  lotQty: number | null
  lotOffert: number | null
  lotPrice: number | null
  validFrom: string | null
  validTo: string | null
  mentions: string
  enseigne: string
  badges: string[]
}

export type PromoFieldKey = keyof PromoFields

export type PromoBlockId =
  | 'prix-barre' | 'badge-remise' | 'bandeau-lot' | 'bandeau-validite'
  | 'mentions' | 'badge-statut' | 'cadre-photo' | 'accroche'

export interface PlacedBlock {
  blockId: PromoBlockId
  xPct: number; yPct: number; wPct: number; hPct: number   // [0..1] de la page
  palette?: { primary?: string; accent?: string; text?: string }
  fontFamily?: string
}

export interface PromoLayout {
  id: string
  label: string
  width: number; height: number   // px (1px = 1/72 in)
  background: string               // hex
  blocks: PlacedBlock[]
}
```

Rappels du codebase réutilisés (signatures vérifiées) :
- `useMergeStore` (`src/stores/merge.store.ts`) : `MergeColumn {key,label,fieldType,aliases?}`, `MergeRow {_id,[k]:unknown}`, `DataSourceRef {excelDocId,sheetIndex,fileName}`, action `connect(source, columns, rows)`.
- `getRowValue(row, variable, columns?, fieldMap?)` (`src/features/merge/mergeEngine.ts:22`).
- `ConditionalRule {id,field,operator,value?,action}`, `RuleOperator` inclut `'gt'|'lt'|'gte'|'lte'|'eq'|'neq'|'isEmpty'|'isNotEmpty'`, `RuleActionType` inclut `'hide'|'show'` (`src/features/.../conditionalRules.ts:18,57,107`). L'applier runtime `applyConditionalRulesForRow(canvas,row,columns?,fieldMap?)` lit `obj.data.conditionalRules`.
- `useDataMerge()` retourne `{connectSource(source), applyRow(row), setCurrentRow, nextRow, prevRow, isConnected, rows, columns, ...}` ; canvas cible = singleton `globalFabricCanvas`.
- `useBatchExport()` → `{exportBatch(config), cancel, isExporting, progress, total}` avec `BatchExportConfig {format:'pdf'|'pptx'|'png', mode:'multi-page'|'zip', rangeStart, rangeEnd, fileNamePattern}`.
- `exportPngBlob(canvas, dpi)` (`useExportPng.ts:13`), `exportPdfBlob(canvas, opts)` (`useExportPdf.ts:49`, `opts.withPrintMarks`, `canvasWidth`, `canvasHeight`, `bleedMm`, `multiplier`).
- `useCreateProject().mutateAsync({title,canvasWidth,canvasHeight,canvasBg,...})` → `{id,...}` (`src/features/projects/useCreateProject.ts:78`).
- `globalFabricCanvas` (`@/features/editor/CanvasContainer`), `syncToStore(canvas)` (`src/features/editor/useAddObject.ts:167`).
- Clés enrichies : prix = `ai_pricing`, images = `ai_images` (`' | '`-séparé), aliases via `ENRICHMENT_ALIASES`. Type `Pricing {ttc?,ht?,original?,discount?{amount?,percent?},currency,validUntil?}` (`src/features/excel/ai-enrichment/types.ts:43`).

---

## Task 1: Types promo + parsing/calcul prix

**Files:**
- Create: `src/features/retail-promo/promoTypes.ts`
- Create: `src/features/retail-promo/priceParse.ts`
- Test: `src/features/retail-promo/priceParse.test.ts`

**Interfaces:**
- Produces: tous les types de la section « Interfaces partagées » + `parsePrice(value: unknown): number | null`, `formatPrice(n: number, currency: string): string`, `computeMechanism(input: { oldPrice: number|null; newPrice: number|null; lotQty: number|null; lotOffert: number|null; lotPrice: number|null }): { mechanism: PromoMechanism; remisePct: number|null; remiseMontant: number|null }`.

- [ ] **Step 1: Écrire `promoTypes.ts`** — coller exactement les types de la section « Interfaces partagées ». (Pas de logique, pas de test.)

- [ ] **Step 2: Écrire le test d'échec** `priceParse.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { parsePrice, formatPrice, computeMechanism } from './priceParse'

describe('parsePrice', () => {
  it('parse les formats FR avec devise/espaces/virgule', () => {
    expect(parsePrice('12,99 €')).toBe(12.99)
    expect(parsePrice('1 299,00')).toBe(1299)
    expect(parsePrice('19.90')).toBe(19.9)
    expect(parsePrice(7)).toBe(7)
  })
  it('renvoie null si non numérique', () => {
    expect(parsePrice('')).toBeNull()
    expect(parsePrice('Prix sur demande')).toBeNull()
    expect(parsePrice(null)).toBeNull()
  })
})

describe('formatPrice', () => {
  it('formate en FR avec symbole', () => {
    expect(formatPrice(12.9, 'EUR')).toBe('12,90 €')
    expect(formatPrice(1299, 'EUR')).toBe('1 299,00 €')
  })
})

describe('computeMechanism', () => {
  it('remise = pourcentage + montant arrondis', () => {
    expect(computeMechanism({ oldPrice: 100, newPrice: 75, lotQty: null, lotOffert: null, lotPrice: null }))
      .toEqual({ mechanism: 'remise', remisePct: 25, remiseMontant: 25 })
  })
  it('lot quand lotQty/lotOffert présents', () => {
    expect(computeMechanism({ oldPrice: null, newPrice: 5, lotQty: 2, lotOffert: 1, lotPrice: null }).mechanism).toBe('lot')
  })
  it('pack quand lotPrice présent sans offert', () => {
    expect(computeMechanism({ oldPrice: null, newPrice: 5, lotQty: 2, lotOffert: null, lotPrice: 9 }).mechanism).toBe('pack')
  })
  it('simple quand pas de remise ni lot', () => {
    expect(computeMechanism({ oldPrice: null, newPrice: 5, lotQty: null, lotOffert: null, lotPrice: null }).mechanism).toBe('simple')
  })
  it('pas de remise si new >= old', () => {
    expect(computeMechanism({ oldPrice: 10, newPrice: 12, lotQty: null, lotOffert: null, lotPrice: null }).remisePct).toBeNull()
  })
})
```

- [ ] **Step 3: Lancer le test (échec attendu)**

Run: `npm run test:run -- src/features/retail-promo/priceParse.test.ts`
Expected: FAIL (`parsePrice is not a function` / module introuvable).

- [ ] **Step 4: Implémenter `priceParse.ts`**

```ts
import type { PromoMechanism } from './promoTypes'

/** Parse un prix FR tolérant : devise, espaces (incl. insécables), virgule décimale. */
export function parsePrice(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const cleaned = value
    .replace(/[\s  ]/g, '')
    .replace(/[€$£]/g, '')
    .replace(',', '.')
    .replace(/[^0-9.\-]/g, '')
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

const SYMBOLS: Record<string, string> = { EUR: '€', USD: '$', GBP: '£' }

export function formatPrice(n: number, currency: string): string {
  const body = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
  const sym = SYMBOLS[currency] ?? currency
  return `${body} ${sym}`
}

export function computeMechanism(input: {
  oldPrice: number | null; newPrice: number | null
  lotQty: number | null; lotOffert: number | null; lotPrice: number | null
}): { mechanism: PromoMechanism; remisePct: number | null; remiseMontant: number | null } {
  const { oldPrice, newPrice, lotQty, lotOffert, lotPrice } = input
  let remisePct: number | null = null
  let remiseMontant: number | null = null
  if (oldPrice != null && newPrice != null && oldPrice > newPrice) {
    remiseMontant = Math.round((oldPrice - newPrice) * 100) / 100
    remisePct = Math.round(((oldPrice - newPrice) / oldPrice) * 100)
  }
  let mechanism: PromoMechanism = 'simple'
  if (lotOffert != null && lotQty != null) mechanism = 'lot'
  else if (lotPrice != null) mechanism = 'pack'
  else if (remisePct != null) mechanism = 'remise'
  return { mechanism, remisePct, remiseMontant }
}
```

- [ ] **Step 5: Lancer le test (succès attendu)**

Run: `npm run test:run -- src/features/retail-promo/priceParse.test.ts`
Expected: PASS (tous les cas).

- [ ] **Step 6: Vérifier types + commit**

```bash
npx tsc -b
git add src/features/retail-promo/promoTypes.ts src/features/retail-promo/priceParse.ts src/features/retail-promo/priceParse.test.ts
git commit -m "feat(retail-promo): types + parsing/calcul prix (parsePrice, computeMechanism)"
```

---

## Task 2: Mappage source → champs promo

**Files:**
- Create: `src/features/retail-promo/promoMapping.ts`
- Test: `src/features/retail-promo/promoMapping.test.ts`

**Interfaces:**
- Consumes: `parsePrice`, `computeMechanism` (T1) ; `getRowValue` (`src/features/merge/mergeEngine.ts:22`) ; `MergeColumn`, `MergeRow` (`src/stores/merge.store.ts`).
- Produces: `defaultPromoFieldMap(columns: MergeColumn[]): Partial<Record<PromoFieldKey, string>>` (champ promo → `column.key`) ; `extractPromoFields(row: MergeRow, columns: MergeColumn[], fieldMap: Partial<Record<PromoFieldKey,string>>): PromoFields`.

- [ ] **Step 1: Écrire le test d'échec** `promoMapping.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { defaultPromoFieldMap, extractPromoFields } from './promoMapping'
import type { MergeColumn, MergeRow } from '@/stores/merge.store'

const cols: MergeColumn[] = [
  { key: 'ai_name', label: 'Nom', fieldType: 'text' },
  { key: 'ai_images', label: 'Images', fieldType: 'image', aliases: ['Image', 'Photo'] },
  { key: 'prix_barre', label: 'Prix barré', fieldType: 'currency' },
  { key: 'prix', label: 'Prix', fieldType: 'currency' },
  { key: 'ean', label: 'EAN', fieldType: 'barcode' },
]

describe('defaultPromoFieldMap', () => {
  it('devine name/image/oldPrice/newPrice/ean depuis labels & aliases', () => {
    const m = defaultPromoFieldMap(cols)
    expect(m.name).toBe('ai_name')
    expect(m.image).toBe('ai_images')
    expect(m.oldPrice).toBe('prix_barre')
    expect(m.newPrice).toBe('prix')
    expect(m.ean).toBe('ean')
  })
})

describe('extractPromoFields', () => {
  it('extrait + calcule la remise, prend la 1re image', () => {
    const row: MergeRow = { _id: '1', ai_name: 'Perceuse', ai_images: 'http://a/1.jpg | http://a/2.jpg', prix_barre: '100 €', prix: '75 €', ean: '123' }
    const f = extractPromoFields(row, cols, defaultPromoFieldMap(cols))
    expect(f.name).toBe('Perceuse')
    expect(f.image).toBe('http://a/1.jpg')
    expect(f.oldPrice).toBe(100)
    expect(f.newPrice).toBe(75)
    expect(f.remisePct).toBe(25)
    expect(f.mechanism).toBe('remise')
  })
  it('champs absents → valeurs neutres, mechanism simple', () => {
    const f = extractPromoFields({ _id: '2', ai_name: 'X', prix: '5 €' }, cols, defaultPromoFieldMap(cols))
    expect(f.oldPrice).toBeNull()
    expect(f.image).toBeNull()
    expect(f.mechanism).toBe('simple')
    expect(f.currency).toBe('EUR')
  })
})
```

- [ ] **Step 2: Lancer le test (échec attendu)**

Run: `npm run test:run -- src/features/retail-promo/promoMapping.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Implémenter `promoMapping.ts`**

```ts
import { getRowValue } from '@/features/merge/mergeEngine'
import type { MergeColumn, MergeRow } from '@/stores/merge.store'
import type { PromoFields, PromoFieldKey } from './promoTypes'
import { parsePrice, computeMechanism } from './priceParse'

/** Indices de devinage : libellés/aliases (en minuscules) qui pointent vers chaque champ promo. */
const GUESS: Partial<Record<PromoFieldKey, string[]>> = {
  name: ['nom', 'name', 'libelle', 'libellé', 'désignation', 'designation', 'ai_name'],
  image: ['image', 'images', 'photo', 'visuel', 'ai_images'],
  brand: ['marque', 'brand', 'ai_brand'],
  ref: ['référence', 'reference', 'ref', 'sku', 'ai_distributor_ref'],
  ean: ['ean', 'gencod', 'code-barres', 'barcode', 'ai_ean'],
  oldPrice: ['prix barré', 'prix barre', 'ancien prix', 'prix public', 'original', 'old price'],
  newPrice: ['prix', 'prix promo', 'tarif', 'price', 'pricing', 'ai_pricing'],
  unit: ['unité', 'unite', 'unit'],
  validFrom: ['du', 'date début', 'valid from', 'valid_from'],
  validTo: ['au', 'date fin', "jusqu'au", 'valid until', 'valid_to'],
  mentions: ['mentions', 'mention légale', 'legal'],
  enseigne: ['enseigne', 'magasin', 'store'],
}

function matchColumn(columns: MergeColumn[], needles: string[]): string | undefined {
  const norm = (s: string) => s.toLowerCase().trim()
  for (const n of needles) {
    const hit = columns.find(
      (c) => norm(c.label) === n || norm(c.key) === n || (c.aliases ?? []).some((a) => norm(a) === n),
    )
    if (hit) return hit.key
  }
  // repli : inclusion partielle sur le label
  for (const n of needles) {
    const hit = columns.find((c) => norm(c.label).includes(n))
    if (hit) return hit.key
  }
  return undefined
}

export function defaultPromoFieldMap(columns: MergeColumn[]): Partial<Record<PromoFieldKey, string>> {
  const map: Partial<Record<PromoFieldKey, string>> = {}
  for (const [field, needles] of Object.entries(GUESS) as [PromoFieldKey, string[]][]) {
    const key = matchColumn(columns, needles)
    if (key) map[field] = key
  }
  return map
}

function str(row: MergeRow, columns: MergeColumn[], key?: string): string {
  if (!key) return ''
  const v = getRowValue(row, key, columns)
  return v == null ? '' : String(v)
}

function num(row: MergeRow, columns: MergeColumn[], key?: string): number | null {
  if (!key) return null
  return parsePrice(getRowValue(row, key, columns))
}

export function extractPromoFields(
  row: MergeRow,
  columns: MergeColumn[],
  fieldMap: Partial<Record<PromoFieldKey, string>>,
): PromoFields {
  const imagesRaw = str(row, columns, fieldMap.image)
  const image = imagesRaw ? (imagesRaw.split('|')[0]?.trim() || null) : null
  const oldPrice = num(row, columns, fieldMap.oldPrice)
  const newPrice = num(row, columns, fieldMap.newPrice)
  const lotQty = num(row, columns, fieldMap.lotQty)
  const lotOffert = num(row, columns, fieldMap.lotOffert)
  const lotPrice = num(row, columns, fieldMap.lotPrice)
  const { mechanism, remisePct, remiseMontant } = computeMechanism({ oldPrice, newPrice, lotQty, lotOffert, lotPrice })
  return {
    name: str(row, columns, fieldMap.name),
    image,
    brand: str(row, columns, fieldMap.brand),
    ref: str(row, columns, fieldMap.ref),
    ean: str(row, columns, fieldMap.ean),
    oldPrice, newPrice,
    currency: 'EUR',
    unit: str(row, columns, fieldMap.unit),
    mechanism, remisePct, remiseMontant,
    lotQty, lotOffert, lotPrice,
    validFrom: str(row, columns, fieldMap.validFrom) || null,
    validTo: str(row, columns, fieldMap.validTo) || null,
    mentions: str(row, columns, fieldMap.mentions),
    enseigne: str(row, columns, fieldMap.enseigne),
    badges: [],
  }
}
```

> Note : `lotQty/lotOffert/lotPrice/brand` n'ont pas de devinage par défaut (rarement en colonne) — ils restent mappables manuellement en tâche 11. `GUESS` ne les contient pas, donc `fieldMap.lotQty` etc. sont `undefined` → `null`. C'est voulu.

- [ ] **Step 4: Lancer le test (succès attendu)**

Run: `npm run test:run -- src/features/retail-promo/promoMapping.test.ts`
Expected: PASS.

- [ ] **Step 5: Vérifier types + commit**

```bash
npx tsc -b
git add src/features/retail-promo/promoMapping.ts src/features/retail-promo/promoMapping.test.ts
git commit -m "feat(retail-promo): mappage source -> champs promo (devinage + extraction)"
```

---

## Task 3: Colonnes synthétiques `promo_*`

**Files:**
- Create: `src/features/retail-promo/augmentRows.ts`
- Test: `src/features/retail-promo/augmentRows.test.ts`

**Interfaces:**
- Consumes: `extractPromoFields` (T2), `formatPrice` (T1), `MergeColumn`, `MergeRow`.
- Produces: `PROMO_COLUMN_KEYS: readonly string[]` ; `augmentRowsWithPromo(columns: MergeColumn[], rows: MergeRow[], fieldMap: Partial<Record<PromoFieldKey,string>>): { columns: MergeColumn[]; rows: MergeRow[] }`. Les blocs (T5) référencent ces clés `promo_*`.

Clés synthétiques produites (numériques pour les règles, chaînes formatées pour l'affichage) :
`promo_name, promo_image, promo_brand, promo_ean, promo_priceNow (str), promo_priceWas (str), promo_newPrice (num), promo_oldPrice (num), promo_remisePct (num), promo_remiseLabel (str ex "-25%"), promo_remiseMontant (num), promo_lotText (str), promo_validText (str), promo_mentions (str), promo_unit (str)`.

- [ ] **Step 1: Écrire le test d'échec** `augmentRows.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { augmentRowsWithPromo, PROMO_COLUMN_KEYS } from './augmentRows'
import { defaultPromoFieldMap } from './promoMapping'
import type { MergeColumn, MergeRow } from '@/stores/merge.store'

const cols: MergeColumn[] = [
  { key: 'ai_name', label: 'Nom', fieldType: 'text' },
  { key: 'prix_barre', label: 'Prix barré', fieldType: 'currency' },
  { key: 'prix', label: 'Prix', fieldType: 'currency' },
]
const rows: MergeRow[] = [{ _id: '1', ai_name: 'Perceuse', prix_barre: '100', prix: '75' }]

describe('augmentRowsWithPromo', () => {
  it('ajoute toutes les colonnes promo_* sans dupliquer', () => {
    const out = augmentRowsWithPromo(cols, rows, defaultPromoFieldMap(cols))
    for (const k of PROMO_COLUMN_KEYS) {
      expect(out.columns.some((c) => c.key === k)).toBe(true)
    }
    expect(out.columns.length).toBe(cols.length + PROMO_COLUMN_KEYS.length)
  })
  it('calcule remise numérique + label + prix formaté', () => {
    const out = augmentRowsWithPromo(cols, rows, defaultPromoFieldMap(cols))
    const r = out.rows[0]
    expect(r.promo_remisePct).toBe(25)
    expect(r.promo_remiseLabel).toBe('-25%')
    expect(r.promo_priceNow).toBe('75,00 €')
    expect(r.promo_priceWas).toBe('100,00 €')
    expect(r.promo_name).toBe('Perceuse')
  })
  it('ne mute pas les rows d’entrée', () => {
    const snap = JSON.stringify(rows)
    augmentRowsWithPromo(cols, rows, defaultPromoFieldMap(cols))
    expect(JSON.stringify(rows)).toBe(snap)
  })
})
```

- [ ] **Step 2: Lancer le test (échec attendu)**

Run: `npm run test:run -- src/features/retail-promo/augmentRows.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implémenter `augmentRows.ts`**

```ts
import type { MergeColumn, MergeRow } from '@/stores/merge.store'
import type { PromoFieldKey } from './promoTypes'
import { extractPromoFields } from './promoMapping'
import { formatPrice } from './priceParse'

export const PROMO_COLUMN_KEYS = [
  'promo_name', 'promo_image', 'promo_brand', 'promo_ean',
  'promo_priceNow', 'promo_priceWas', 'promo_newPrice', 'promo_oldPrice',
  'promo_remisePct', 'promo_remiseLabel', 'promo_remiseMontant',
  'promo_lotText', 'promo_validText', 'promo_mentions', 'promo_unit',
] as const

const PROMO_COLUMNS: MergeColumn[] = PROMO_COLUMN_KEYS.map((key) => ({
  key, label: key, fieldType: key === 'promo_image' ? 'image' : 'text',
}))

function lotText(f: ReturnType<typeof extractPromoFields>): string {
  if (f.mechanism === 'lot' && f.lotQty != null && f.lotOffert != null) return `${f.lotQty}+${f.lotOffert}`
  if (f.mechanism === 'pack' && f.lotQty != null && f.lotPrice != null) return `LES ${f.lotQty} POUR ${formatPrice(f.lotPrice, f.currency)}`
  return ''
}

function validText(f: ReturnType<typeof extractPromoFields>): string {
  if (f.validFrom && f.validTo) return `Du ${f.validFrom} au ${f.validTo}`
  if (f.validTo) return `Jusqu'au ${f.validTo}`
  return ''
}

export function augmentRowsWithPromo(
  columns: MergeColumn[],
  rows: MergeRow[],
  fieldMap: Partial<Record<PromoFieldKey, string>>,
): { columns: MergeColumn[]; rows: MergeRow[] } {
  const newRows = rows.map((row) => {
    const f = extractPromoFields(row, columns, fieldMap)
    return {
      ...row,
      promo_name: f.name,
      promo_image: f.image ?? '',
      promo_brand: f.brand,
      promo_ean: f.ean,
      promo_priceNow: f.newPrice != null ? formatPrice(f.newPrice, f.currency) : '',
      promo_priceWas: f.oldPrice != null ? formatPrice(f.oldPrice, f.currency) : '',
      promo_newPrice: f.newPrice ?? '',
      promo_oldPrice: f.oldPrice ?? '',
      promo_remisePct: f.remisePct ?? '',
      promo_remiseLabel: f.remisePct != null ? `-${f.remisePct}%` : '',
      promo_remiseMontant: f.remiseMontant ?? '',
      promo_lotText: lotText(f),
      promo_validText: validText(f),
      promo_mentions: f.mentions,
      promo_unit: f.unit,
    } as MergeRow
  })
  // évite la double-augmentation si déjà présent
  const hasPromo = columns.some((c) => c.key === 'promo_name')
  const newColumns = hasPromo ? columns : [...columns, ...PROMO_COLUMNS]
  return { columns: newColumns, rows: newRows }
}
```

- [ ] **Step 4: Lancer le test (succès attendu)**

Run: `npm run test:run -- src/features/retail-promo/augmentRows.test.ts`
Expected: PASS.

- [ ] **Step 5: Vérifier types + commit**

```bash
npx tsc -b
git add src/features/retail-promo/augmentRows.ts src/features/retail-promo/augmentRows.test.ts
git commit -m "feat(retail-promo): colonnes synthetiques promo_* (calcul + formatage par ligne)"
```

---

## Task 4: Plan promo — validation & réparation

**Files:**
- Create: `src/features/retail-promo/promoPlan.ts`
- Test: `src/features/retail-promo/promoPlan.test.ts`

**Interfaces:**
- Consumes: `PromoLayout`, `PlacedBlock`, `PromoBlockId` (T1).
- Produces: `PROMO_BLOCK_IDS: readonly PromoBlockId[]` ; `validatePromoPlan(raw: unknown): raw is PromoLayout` (garde structurelle) ; `repairPromoPlan(raw: unknown, fallback: PromoLayout): PromoLayout` (corrige blocs inconnus / % hors borne / blocs absents → repli) ; `promoPlanJsonSchema` (objet JSON-schema pour l'appel LLM, tâche 8).

- [ ] **Step 1: Écrire le test d'échec** `promoPlan.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { validatePromoPlan, repairPromoPlan } from './promoPlan'
import type { PromoLayout } from './promoTypes'

const fallback: PromoLayout = {
  id: 'fb', label: 'Repli', width: 794, height: 1123, background: '#ffffff',
  blocks: [{ blockId: 'cadre-photo', xPct: 0.1, yPct: 0.1, wPct: 0.8, hPct: 0.5 }],
}

describe('validatePromoPlan', () => {
  it('accepte un plan bien formé', () => {
    expect(validatePromoPlan({ ...fallback, blocks: [{ blockId: 'accroche', xPct: 0, yPct: 0, wPct: 1, hPct: 0.2 }] })).toBe(true)
  })
  it('rejette si blocs manquants ou champs absents', () => {
    expect(validatePromoPlan({ id: 'x' })).toBe(false)
    expect(validatePromoPlan(null)).toBe(false)
  })
})

describe('repairPromoPlan', () => {
  it('supprime les blocs inconnus et clamp les %', () => {
    const out = repairPromoPlan(
      { id: 'a', label: 'A', width: 794, height: 1123, background: '#fff', blocks: [
        { blockId: 'inconnu', xPct: 0, yPct: 0, wPct: 1, hPct: 1 },
        { blockId: 'badge-remise', xPct: -1, yPct: 2, wPct: 5, hPct: 0.3 },
      ] },
      fallback,
    )
    expect(out.blocks.every((b) => b.blockId !== 'inconnu')).toBe(true)
    const badge = out.blocks.find((b) => b.blockId === 'badge-remise')!
    expect(badge.xPct).toBeGreaterThanOrEqual(0)
    expect(badge.wPct).toBeLessThanOrEqual(1)
  })
  it('repli complet si plan irrécupérable (aucun bloc valide)', () => {
    const out = repairPromoPlan({ blocks: [{ blockId: 'inconnu', xPct: 0, yPct: 0, wPct: 1, hPct: 1 }] }, fallback)
    expect(out.blocks).toEqual(fallback.blocks)
    expect(out.width).toBe(fallback.width)
  })
})
```

- [ ] **Step 2: Lancer le test (échec attendu)**

Run: `npm run test:run -- src/features/retail-promo/promoPlan.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implémenter `promoPlan.ts`**

```ts
import type { PromoLayout, PlacedBlock, PromoBlockId } from './promoTypes'

export const PROMO_BLOCK_IDS: readonly PromoBlockId[] = [
  'prix-barre', 'badge-remise', 'bandeau-lot', 'bandeau-validite',
  'mentions', 'badge-statut', 'cadre-photo', 'accroche',
]

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

function isPlacedBlock(b: unknown): b is PlacedBlock {
  if (!b || typeof b !== 'object') return false
  const o = b as Record<string, unknown>
  return (
    PROMO_BLOCK_IDS.includes(o.blockId as PromoBlockId) &&
    ['xPct', 'yPct', 'wPct', 'hPct'].every((k) => typeof o[k] === 'number' && Number.isFinite(o[k]))
  )
}

export function validatePromoPlan(raw: unknown): raw is PromoLayout {
  if (!raw || typeof raw !== 'object') return false
  const o = raw as Record<string, unknown>
  return (
    typeof o.width === 'number' && typeof o.height === 'number' &&
    typeof o.background === 'string' &&
    Array.isArray(o.blocks) && o.blocks.length > 0 && o.blocks.every(isPlacedBlock)
  )
}

export function repairPromoPlan(raw: unknown, fallback: PromoLayout): PromoLayout {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const blocks = Array.isArray(o.blocks)
    ? o.blocks.filter(isPlacedBlock).map((b) => ({
        ...b,
        xPct: clamp01(b.xPct), yPct: clamp01(b.yPct),
        wPct: clamp01(b.wPct), hPct: clamp01(b.hPct),
      }))
    : []
  if (blocks.length === 0) return { ...fallback }
  return {
    id: typeof o.id === 'string' ? o.id : fallback.id,
    label: typeof o.label === 'string' ? o.label : fallback.label,
    width: typeof o.width === 'number' ? o.width : fallback.width,
    height: typeof o.height === 'number' ? o.height : fallback.height,
    background: typeof o.background === 'string' ? o.background : fallback.background,
    blocks,
  }
}

/** Schéma JSON pour l'appel LLM (Claude/Gemini structuré) — tâche 8. */
export const promoPlanJsonSchema = {
  type: 'object',
  required: ['blocks'],
  properties: {
    background: { type: 'string', description: 'Couleur de fond hex, ex #ffffff' },
    blocks: {
      type: 'array',
      items: {
        type: 'object',
        required: ['blockId', 'xPct', 'yPct', 'wPct', 'hPct'],
        properties: {
          blockId: { type: 'string', enum: [...PROMO_BLOCK_IDS] },
          xPct: { type: 'number' }, yPct: { type: 'number' },
          wPct: { type: 'number' }, hPct: { type: 'number' },
        },
      },
    },
  },
} as const
```

- [ ] **Step 4: Lancer le test (succès attendu)**

Run: `npm run test:run -- src/features/retail-promo/promoPlan.test.ts`
Expected: PASS.

- [ ] **Step 5: Vérifier types + commit**

```bash
npx tsc -b
git add src/features/retail-promo/promoPlan.ts src/features/retail-promo/promoPlan.test.ts
git commit -m "feat(retail-promo): validation + reparation du plan IA (+ JSON schema)"
```

---

## Task 5: Kit de blocs promo (définitions + règles + build Fabric)

**Files:**
- Create: `src/features/retail-promo/blocks/types.ts`
- Create: `src/features/retail-promo/blocks/registry.ts`
- Create: `src/features/retail-promo/blocks/prixBarre.ts`, `badgeRemise.ts`, `bandeauLot.ts`, `bandeauValidite.ts`, `mentions.ts`, `badgeStatut.ts`, `cadrePhoto.ts`, `accroche.ts`
- Create: `src/features/retail-promo/blocks/index.ts`
- Test: `src/features/retail-promo/blocks/registry.test.ts`

**Interfaces:**
- Consumes: `PromoBlockId` (T1) ; `PROMO_BLOCK_IDS` (T4) ; `ConditionalRule`, `RuleOperator` (`conditionalRules.ts`) ; Fabric (`Textbox`, `Rect`, `Group`, `FabricImage` de `'fabric'`).
- Produces:
  - `blocks/types.ts` : `BlockBuildCtx { x:number; y:number; w:number; h:number; palette: Required<NonNullable<PlacedBlock['palette']>>; fontFamily: string; resolvedTheme: 'light'|'dark' }` ; `PromoBlockDef { id: PromoBlockId; label: string; conditionalRules: ConditionalRule[]; build(ctx: BlockBuildCtx): import('fabric').Object }`.
  - `blocks/registry.ts` : `registerPromoBlock(def: PromoBlockDef): void`, `getPromoBlock(id: PromoBlockId): PromoBlockDef | undefined`, `listPromoBlocks(): PromoBlockDef[]`, `initPromoBlocks(): void` (importe les 8 fichiers → effet de bord).

**Principe** : chaque bloc construit un objet Fabric éditable contenant des **Textbox dont le texte EST le placeholder `{{promo_*}}`** (la fusion capture ce `templateText` à `connectSource` et le résout par ligne) et porte ses `ConditionalRule` dans `data.conditionalRules` (l'applier runtime les lit). Les règles ciblent des colonnes `promo_*` **réelles** (numériques) → la visibilité par ligne fonctionne via le moteur existant.

- [ ] **Step 1: Écrire `blocks/types.ts`**

```ts
import type { Object as FabricObject } from 'fabric'
import type { ConditionalRule } from '@/features/editor/conditionalRules' // ⚠ confirmer le chemin réel à l'implémentation (cf. note)
import type { PromoBlockId, PlacedBlock } from '../promoTypes'

export interface BlockBuildCtx {
  x: number; y: number; w: number; h: number
  palette: Required<NonNullable<PlacedBlock['palette']>>
  fontFamily: string
  resolvedTheme: 'light' | 'dark'
}

export interface PromoBlockDef {
  id: PromoBlockId
  label: string
  conditionalRules: ConditionalRule[]
  build(ctx: BlockBuildCtx): FabricObject
}
```

> ⚠ **À confirmer au début de l'implémentation** : le chemin réel du module de règles conditionnelles (le rapport l'a localisé sous `src/features/...` — exécuter `grep -rl "export interface ConditionalRule" src` et corriger l'import). Idem pour `applyConditionalRulesForRow`.

- [ ] **Step 2: Écrire le test d'échec** `blocks/registry.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { initPromoBlocks, listPromoBlocks, getPromoBlock } from './registry'
import { PROMO_BLOCK_IDS } from '../promoPlan'

describe('registry des blocs promo', () => {
  it('initPromoBlocks enregistre les 8 blocs', () => {
    initPromoBlocks()
    const ids = listPromoBlocks().map((b) => b.id).sort()
    expect(ids).toEqual([...PROMO_BLOCK_IDS].sort())
  })
  it('badge-remise ne s’affiche que si promo_remisePct > 0', () => {
    initPromoBlocks()
    const def = getPromoBlock('badge-remise')!
    const rule = def.conditionalRules.find((r) => r.action.type === 'hide' || r.action.type === 'show')
    expect(rule).toBeTruthy()
    expect(rule!.field).toBe('promo_remisePct')
  })
})
```

- [ ] **Step 3: Lancer le test (échec attendu)**

Run: `npm run test:run -- src/features/retail-promo/blocks/registry.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implémenter `blocks/registry.ts`**

```ts
import type { PromoBlockId } from '../promoTypes'
import type { PromoBlockDef } from './types'

const REGISTRY = new Map<PromoBlockId, PromoBlockDef>()

export function registerPromoBlock(def: PromoBlockDef): void {
  REGISTRY.set(def.id, def)
}
export function getPromoBlock(id: PromoBlockId): PromoBlockDef | undefined {
  return REGISTRY.get(id)
}
export function listPromoBlocks(): PromoBlockDef[] {
  return [...REGISTRY.values()]
}

let inited = false
export function initPromoBlocks(): void {
  if (inited) return
  inited = true
  // effet de bord : chaque import enregistre son bloc
  void import('./prixBarre'); void import('./badgeRemise'); void import('./bandeauLot')
  void import('./bandeauValidite'); void import('./mentions'); void import('./badgeStatut')
  void import('./cadrePhoto'); void import('./accroche')
}
```

> ⚠ Les `import()` dynamiques sont asynchrones. Pour que le test synchrone et l'instanciation voient les blocs immédiatement, **remplacer par des imports statiques** dans `index.ts` qui appellent `registerPromoBlock` au chargement, et faire `initPromoBlocks()` importer `./index`. Implémentation retenue ci-dessous (Step 5) : `index.ts` importe les 8 fichiers statiquement ; `initPromoBlocks` importe `./index` une fois. Adapter `registry.ts` pour `void import('./index')` ou un simple flag — **utiliser la version statique de Step 5**.

- [ ] **Step 5: Écrire `blocks/index.ts` (imports statiques)**

```ts
// L'import de chaque fichier déclenche registerPromoBlock(...) par effet de bord.
import './prixBarre'
import './badgeRemise'
import './bandeauLot'
import './bandeauValidite'
import './mentions'
import './badgeStatut'
import './cadrePhoto'
import './accroche'
```

Et remplacer le corps de `initPromoBlocks` dans `registry.ts` par :

```ts
let inited = false
export function initPromoBlocks(): void {
  if (inited) return
  inited = true
  // import statique synchrone via require-like : on s'appuie sur l'index
  // (les 8 modules s'enregistrent à leur évaluation)
}
```

…et dans `registry.test.ts` ajouter en tête `import '../blocks'` (l'index) AVANT les tests, de sorte que l'évaluation des modules enregistre les blocs. (Le `initPromoBlocks()` devient idempotent/no-op ; il reste appelé par l'app pour garantir l'inclusion dans le bundle.) Mettre à jour le test : remplacer la dépendance à `initPromoBlocks` pour l'enregistrement par l'import d'index.

> Cette mécanique reproduit `reference_workflow_registry_side_effect_init` (registre par effet de bord). L'app appellera `import '@/features/retail-promo/blocks'` au montage de la page (tâche 11).

- [ ] **Step 6: Implémenter les 8 blocs** — un fichier chacun. Exemple complet `badgeRemise.ts` (les autres suivent le même squelette : créer un `Group` Fabric d'objets, `data: { id, type:'promo-block', blockId, conditionalRules }`, Textbox dont `text` = placeholder) :

```ts
import { Group, Rect, Textbox } from 'fabric'
import type { ConditionalRule } from '@/features/editor/conditionalRules' // ⚠ chemin à confirmer (Step 1)
import { registerPromoBlock } from './registry'
import type { PromoBlockDef } from './types'

const rules: ConditionalRule[] = [
  { id: 'badge-remise-visible', field: 'promo_remisePct', operator: 'gt', value: '0', action: { type: 'show' } },
  { id: 'badge-remise-hidden', field: 'promo_remisePct', operator: 'lte', value: '0', action: { type: 'hide' } },
]

const def: PromoBlockDef = {
  id: 'badge-remise',
  label: 'Badge remise (-X%)',
  conditionalRules: rules,
  build({ x, y, w, h, palette }) {
    const r = Math.min(w, h) / 2
    const disc = new Rect({ left: 0, top: 0, width: w, height: h, rx: r, ry: r, fill: palette.accent })
    const label = new Textbox('{{promo_remiseLabel}}', {
      left: 0, top: h * 0.28, width: w, fontSize: h * 0.42, fontWeight: '900',
      textAlign: 'center', fill: '#ffffff', fontFamily: 'Arial Black',
    })
    const g = new Group([disc, label], { left: x, top: y })
    g.set('data', { id: `promo_badge-remise_${Date.now()}`, type: 'promo-block', blockId: 'badge-remise', conditionalRules: rules })
    return g
  },
}
registerPromoBlock(def)
```

Squelettes des 7 autres (mêmes conventions ; texte = placeholder ; `data.conditionalRules` ciblant une colonne `promo_*`) :

| Fichier | Placeholders utilisés | Règles `conditionalRules` (field, operator, value, action) |
|---|---|---|
| `prixBarre.ts` | `{{promo_priceWas}}` (barré, `linethrough:true`) + `{{promo_priceNow}}` | `promo_oldPrice` `isNotEmpty` → `show` ; `promo_oldPrice` `isEmpty` → `hide` (sur le sous-texte barré uniquement → 2 objets, ou bloc entier masqué si pas de newPrice) |
| `bandeauLot.ts` | `{{promo_lotText}}` | `promo_lotText` `isNotEmpty` → `show` ; `isEmpty` → `hide` |
| `bandeauValidite.ts` | `{{promo_validText}}` | `promo_validText` `isNotEmpty` → `show` ; `isEmpty` → `hide` |
| `mentions.ts` | `{{promo_mentions}}` (petit corps) | `promo_mentions` `isNotEmpty` → `show` ; `isEmpty` → `hide` |
| `badgeStatut.ts` | texte fixe « NOUVEAU » (éditable) | aucune règle (placé seulement si choisi) |
| `cadrePhoto.ts` | image liée à `promo_image` (cf. Step 7 ⚠ binding) | `promo_image` `isEmpty` → `setOpacity 0.15` (placeholder visible discret) |
| `accroche.ts` | `{{promo_name}}` (gros titre) | aucune règle |

> Conventions Fabric (rappels mémoire) : Textbox = scaler `fontSize`/`width`, garder `scaleX=1` ; pour le prix barré utiliser deux Textbox (l'un `linethrough`). Couleurs : `#ffffff` = blanc vrai sur fond coloré (jamais token `white`).

- [ ] **Step 7: ⚠ Confirmer le binding image** pour `cadrePhoto.ts`

Lire `src/features/merge/useDataMerge.ts:437-577` (corps de `applyRow`, section images) pour identifier **comment un objet Fabric image est lié à une colonne** (clé exacte sur `obj.data`, ex. `data.binding`, et si une `FabricImage` placeholder est attendue). Implémenter `cadrePhoto.ts` en posant une `FabricImage` (ou un `Rect` placeholder) avec la clé de binding réelle vers `promo_image`. Si le binding image passe par `data.templateText`/`resolveBinding`, suivre ce contrat. Ne pas inventer la clé.

- [ ] **Step 8: Lancer les tests (succès attendu)**

Run: `npm run test:run -- src/features/retail-promo/blocks/registry.test.ts`
Expected: PASS (8 blocs enregistrés, règle badge-remise sur `promo_remisePct`).

- [ ] **Step 9: Vérifier types + knip + commit**

```bash
npx tsc -b && npx knip
git add src/features/retail-promo/blocks
git commit -m "feat(retail-promo): kit de 8 blocs promo (registre par effet de bord + regles conditionnelles)"
```

> knip : les `def` ne sont PAS exportés (seul l'effet `registerPromoBlock` compte) → conforme à la convention « pas d'export intra-fichier ».

---

## Task 6: Templates curés + repli par format

**Files:**
- Create: `src/features/retail-promo/templates.ts`
- Test: `src/features/retail-promo/templates.test.ts`

**Interfaces:**
- Consumes: `PromoLayout` (T1), `PROMO_BLOCK_IDS` (T4).
- Produces: `CURATED_TEMPLATES: PromoLayout[]` (≥ 4 : A4 portrait 794×1123, Encart ½ page 794×561, Étiquette A6 559×397, A3 1123×1587) ; `nearestTemplate(width: number, height: number): PromoLayout` (par ratio le plus proche).

- [ ] **Step 1: Écrire le test d'échec** `templates.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { CURATED_TEMPLATES, nearestTemplate } from './templates'
import { PROMO_BLOCK_IDS } from './promoPlan'

describe('templates curés', () => {
  it('≥ 4 templates, tous valides (blocs connus, % dans [0,1])', () => {
    expect(CURATED_TEMPLATES.length).toBeGreaterThanOrEqual(4)
    for (const t of CURATED_TEMPLATES) {
      expect(t.blocks.length).toBeGreaterThan(0)
      for (const b of t.blocks) {
        expect(PROMO_BLOCK_IDS).toContain(b.blockId)
        for (const p of [b.xPct, b.yPct, b.wPct, b.hPct]) {
          expect(p).toBeGreaterThanOrEqual(0); expect(p).toBeLessThanOrEqual(1)
        }
      }
    }
  })
  it('nearestTemplate choisit par ratio le plus proche', () => {
    const t = nearestTemplate(1080, 1920) // story portrait → le plus proche en ratio
    expect(t).toBeTruthy()
  })
})
```

- [ ] **Step 2: Lancer (échec attendu)** — `npm run test:run -- src/features/retail-promo/templates.test.ts` → FAIL.

- [ ] **Step 3: Implémenter `templates.ts`** (4 layouts complets ; exemple A4 ci-dessous, compléter les 3 autres avec des placements plausibles dans [0,1]) :

```ts
import type { PromoLayout } from './promoTypes'

const A4: PromoLayout = {
  id: 'affiche-a4', label: 'Affiche A4', width: 794, height: 1123, background: '#ffffff',
  blocks: [
    { blockId: 'accroche', xPct: 0.06, yPct: 0.05, wPct: 0.88, hPct: 0.12 },
    { blockId: 'cadre-photo', xPct: 0.12, yPct: 0.20, wPct: 0.76, hPct: 0.40 },
    { blockId: 'prix-barre', xPct: 0.10, yPct: 0.64, wPct: 0.55, hPct: 0.16 },
    { blockId: 'badge-remise', xPct: 0.68, yPct: 0.60, wPct: 0.24, hPct: 0.16 },
    { blockId: 'bandeau-lot', xPct: 0.10, yPct: 0.82, wPct: 0.80, hPct: 0.07 },
    { blockId: 'bandeau-validite', xPct: 0.10, yPct: 0.90, wPct: 0.80, hPct: 0.04 },
    { blockId: 'mentions', xPct: 0.10, yPct: 0.95, wPct: 0.80, hPct: 0.03 },
  ],
}

const ENCART: PromoLayout = {
  id: 'encart-demi', label: 'Encart ½ page', width: 794, height: 561, background: '#ffffff',
  blocks: [
    { blockId: 'cadre-photo', xPct: 0.04, yPct: 0.10, wPct: 0.40, hPct: 0.78 },
    { blockId: 'accroche', xPct: 0.48, yPct: 0.10, wPct: 0.48, hPct: 0.20 },
    { blockId: 'prix-barre', xPct: 0.48, yPct: 0.36, wPct: 0.34, hPct: 0.28 },
    { blockId: 'badge-remise', xPct: 0.82, yPct: 0.34, wPct: 0.14, hPct: 0.24 },
    { blockId: 'bandeau-validite', xPct: 0.48, yPct: 0.70, wPct: 0.48, hPct: 0.08 },
  ],
}

const ETIQUETTE: PromoLayout = {
  id: 'etiquette-a6', label: 'Étiquette rayon A6', width: 559, height: 397, background: '#ffffff',
  blocks: [
    { blockId: 'accroche', xPct: 0.05, yPct: 0.06, wPct: 0.90, hPct: 0.22 },
    { blockId: 'prix-barre', xPct: 0.05, yPct: 0.34, wPct: 0.60, hPct: 0.46 },
    { blockId: 'badge-remise', xPct: 0.66, yPct: 0.34, wPct: 0.30, hPct: 0.34 },
    { blockId: 'mentions', xPct: 0.05, yPct: 0.86, wPct: 0.90, hPct: 0.08 },
  ],
}

const A3: PromoLayout = {
  id: 'affiche-a3', label: 'Affiche A3', width: 1123, height: 1587, background: '#ffffff',
  blocks: [
    { blockId: 'accroche', xPct: 0.06, yPct: 0.05, wPct: 0.88, hPct: 0.12 },
    { blockId: 'cadre-photo', xPct: 0.10, yPct: 0.20, wPct: 0.80, hPct: 0.42 },
    { blockId: 'prix-barre', xPct: 0.10, yPct: 0.66, wPct: 0.55, hPct: 0.16 },
    { blockId: 'badge-remise', xPct: 0.68, yPct: 0.62, wPct: 0.24, hPct: 0.16 },
    { blockId: 'bandeau-lot', xPct: 0.10, yPct: 0.84, wPct: 0.80, hPct: 0.06 },
    { blockId: 'mentions', xPct: 0.10, yPct: 0.94, wPct: 0.80, hPct: 0.03 },
  ],
}

export const CURATED_TEMPLATES: PromoLayout[] = [A4, ENCART, ETIQUETTE, A3]

export function nearestTemplate(width: number, height: number): PromoLayout {
  const target = width / height
  return CURATED_TEMPLATES.reduce((best, t) =>
    Math.abs(t.width / t.height - target) < Math.abs(best.width / best.height - target) ? t : best,
  CURATED_TEMPLATES[0])
}
```

- [ ] **Step 4: Lancer (succès attendu)** — même commande → PASS.

- [ ] **Step 5: Vérifier types + commit**

```bash
npx tsc -b
git add src/features/retail-promo/templates.ts src/features/retail-promo/templates.test.ts
git commit -m "feat(retail-promo): 4 templates curés print + selection par ratio (nearestTemplate)"
```

---

## Task 7: Instanciation d'un `PromoLayout` sur le canvas

**Files:**
- Create: `src/features/retail-promo/instantiateLayout.ts`
- Test: `src/features/retail-promo/instantiateLayout.test.ts` (test de mapping % → px, pur ; le rendu Fabric est vérifié manuellement)

**Interfaces:**
- Consumes: `PromoLayout`, `PlacedBlock` (T1) ; `getPromoBlock` (T5) ; `syncToStore` (`src/features/editor/useAddObject.ts:167`) ; `globalFabricCanvas` (`@/features/editor/CanvasContainer`) ; Fabric `Canvas`.
- Produces: `blockRectPx(block, width, height): { x:number; y:number; w:number; h:number }` (pur) ; `instantiatePromoLayout(canvas: Canvas, layout: PromoLayout, resolvedTheme: 'light'|'dark'): void`.

- [ ] **Step 1: Écrire le test d'échec** `instantiateLayout.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { blockRectPx } from './instantiateLayout'

describe('blockRectPx', () => {
  it('convertit les % en px selon la page', () => {
    expect(blockRectPx({ blockId: 'accroche', xPct: 0.1, yPct: 0.2, wPct: 0.5, hPct: 0.25 }, 800, 1000))
      .toEqual({ x: 80, y: 200, w: 400, h: 250 })
  })
})
```

- [ ] **Step 2: Lancer (échec attendu)** — `npm run test:run -- src/features/retail-promo/instantiateLayout.test.ts` → FAIL.

- [ ] **Step 3: Implémenter `instantiateLayout.ts`**

```ts
import type { Canvas } from 'fabric'
import { syncToStore } from '@/features/editor/useAddObject'
import { getPromoBlock } from './blocks/registry'
import type { PlacedBlock, PromoLayout } from './promoTypes'

export function blockRectPx(b: PlacedBlock, width: number, height: number) {
  return { x: Math.round(b.xPct * width), y: Math.round(b.yPct * height), w: Math.round(b.wPct * width), h: Math.round(b.hPct * height) }
}

const DEFAULT_PALETTE = { primary: '#111827', accent: '#e11d48', text: '#111827' }

export function instantiatePromoLayout(canvas: Canvas, layout: PromoLayout, resolvedTheme: 'light' | 'dark'): void {
  for (const b of layout.blocks) {
    const def = getPromoBlock(b.blockId)
    if (!def) continue // bloc inconnu ignoré (le plan est déjà réparé en amont)
    const { x, y, w, h } = blockRectPx(b, layout.width, layout.height)
    const obj = def.build({
      x, y, w, h,
      palette: { ...DEFAULT_PALETTE, ...(b.palette ?? {}) },
      fontFamily: b.fontFamily ?? 'Arial',
      resolvedTheme,
    })
    canvas.add(obj)
  }
  canvas.requestRenderAll()
  syncToStore(canvas)
}
```

- [ ] **Step 4: Lancer (succès attendu)** — même commande → PASS (`blockRectPx`).

- [ ] **Step 5: Vérification manuelle (rendu Fabric)** — après la tâche 11 (UI), créer une promo via un template curé et confirmer dans l'éditeur que les blocs apparaissent aux bonnes positions et restent éditables (déplaçables, texte modifiable). Noté ici comme dépendance de smoke test, pas bloquant pour le commit.

- [ ] **Step 6: Vérifier types + commit**

```bash
npx tsc -b
git add src/features/retail-promo/instantiateLayout.ts src/features/retail-promo/instantiateLayout.test.ts
git commit -m "feat(retail-promo): instanciation d'un PromoLayout en objets Fabric editables"
```

---

## Task 8: Génération du plan par IA

**Files:**
- Create: `src/features/retail-promo/useGeneratePromoPlan.ts`
- Test: `src/features/retail-promo/promoPlanPrompt.test.ts` (teste la construction du prompt, pur ; l'appel LLM est vérifié manuellement)

**Interfaces:**
- Consumes: `promoPlanJsonSchema`, `repairPromoPlan` (T4) ; `listPromoBlocks` (T5) ; `nearestTemplate` (T6) ; `PromoLayout` (T1).
- Produces: `buildPromoPlanPrompt(args: { brief: string; width: number; height: number; sample: Record<string, unknown>; blocks: { id: string; label: string }[] }): string` (pur) ; `useGeneratePromoPlan()` → `{ generate(args: { brief: string; width: number; height: number; sample: Record<string,unknown> }): Promise<PromoLayout>; isLoading: boolean }`.

- [ ] **Step 1: ⚠ Confirmer l'utilitaire LLM** — lire `src/features/export/useDeclineToPages.ts` et `relayoutMultiFormat.ts` pour récupérer **la fonction exacte qui appelle le modèle** avec un JSON schema (Claude/Gemini structuré) et sa signature (ex. un `callLlmJson(prompt, schema)` ou via `llmProxy`). Réutiliser **cette même fonction** dans `useGeneratePromoPlan`. Ne pas créer un nouveau client LLM.

- [ ] **Step 2: Écrire le test d'échec** `promoPlanPrompt.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { buildPromoPlanPrompt } from './useGeneratePromoPlan'

describe('buildPromoPlanPrompt', () => {
  it('inclut le brief, les dimensions et le catalogue de blocs', () => {
    const p = buildPromoPlanPrompt({
      brief: 'promo -50% éclatante',
      width: 794, height: 1123,
      sample: { promo_name: 'Perceuse', promo_remiseLabel: '-50%' },
      blocks: [{ id: 'badge-remise', label: 'Badge remise' }, { id: 'accroche', label: 'Accroche' }],
    })
    expect(p).toContain('promo -50% éclatante')
    expect(p).toContain('794')
    expect(p).toContain('badge-remise')
    expect(p).toContain('%') // consigne de placement en pourcentage
  })
})
```

- [ ] **Step 3: Lancer (échec attendu)** — `npm run test:run -- src/features/retail-promo/promoPlanPrompt.test.ts` → FAIL.

- [ ] **Step 4: Implémenter `useGeneratePromoPlan.ts`**

```ts
import { useState, useCallback } from 'react'
import { promoPlanJsonSchema, repairPromoPlan } from './promoPlan'
import { listPromoBlocks } from './blocks/registry'
import { nearestTemplate } from './templates'
import type { PromoLayout } from './promoTypes'
// ⚠ Step 1 : importer la vraie fonction LLM JSON repérée dans useDeclineToPages/relayout
import { callLlmJson } from '@/features/export/relayoutMultiFormat' // ← ADAPTER au nom réel confirmé

export function buildPromoPlanPrompt(args: {
  brief: string; width: number; height: number
  sample: Record<string, unknown>; blocks: { id: string; label: string }[]
}): string {
  const cat = args.blocks.map((b) => `- ${b.id} : ${b.label}`).join('\n')
  return [
    `Tu es directeur artistique retail. Compose une affiche promo print ultra-lisible.`,
    `Format de page : ${args.width}×${args.height} px.`,
    `Brief : ${args.brief}`,
    `Produit-échantillon (placeholders disponibles) : ${JSON.stringify(args.sample)}`,
    `Blocs disponibles (utilise uniquement ces blockId) :\n${cat}`,
    `Réponds STRICTEMENT au schéma : un tableau "blocks" où chaque bloc a blockId + xPct,yPct,wPct,hPct exprimés en POURCENTAGE de page dans [0,1]. Hiérarchie : prix et remise dominants, lecture en Z.`,
  ].join('\n\n')
}

export function useGeneratePromoPlan() {
  const [isLoading, setLoading] = useState(false)
  const generate = useCallback(async (args: {
    brief: string; width: number; height: number; sample: Record<string, unknown>
  }): Promise<PromoLayout> => {
    setLoading(true)
    const fallback = nearestTemplate(args.width, args.height)
    try {
      const blocks = listPromoBlocks().map((b) => ({ id: b.id, label: b.label }))
      const prompt = buildPromoPlanPrompt({ ...args, blocks })
      const raw = await callLlmJson(prompt, promoPlanJsonSchema) // ⚠ signature à confirmer (Step 1)
      const merged = { ...fallback, ...(raw as object), width: args.width, height: args.height }
      return repairPromoPlan(merged, fallback)
    } catch {
      return fallback // échec LLM/quota → repli template curé
    } finally {
      setLoading(false)
    }
  }, [])
  return { generate, isLoading }
}
```

- [ ] **Step 5: Lancer (succès attendu)** — `npm run test:run -- src/features/retail-promo/promoPlanPrompt.test.ts` → PASS.

- [ ] **Step 6: Vérification manuelle (appel LLM réel)** — après l'UI (tâche 11), saisir un brief et confirmer qu'un plan éditable est instancié, et qu'un brief absurde retombe sur un template curé sans erreur.

- [ ] **Step 7: Vérifier types + commit**

```bash
npx tsc -b
git add src/features/retail-promo/useGeneratePromoPlan.ts src/features/retail-promo/promoPlanPrompt.test.ts
git commit -m "feat(retail-promo): generateur de plan IA (prompt + appel LLM JSON + repli)"
```

---

## Task 9: Export par lot — dpi + marques de coupe (print)

**Files:**
- Modify: `src/features/merge/useBatchExport.ts` (interface `BatchExportConfig` :13-22 ; branche zip PNG/PDF :116-169 ; multi-page PDF)
- Test: `src/features/merge/batchExportConfig.test.ts`

**Interfaces:**
- Consumes: `exportPngBlob(canvas, dpi)` (`useExportPng.ts:13` — l'exporter si non exporté), `exportPdfBlob(canvas, opts)` (`useExportPdf.ts:49`).
- Produces: `BatchExportConfig` étendu avec `dpi?: 72|150|300` (défaut 150) et `withPrintMarks?: boolean` (défaut false). Comportement : la boucle par ligne utilise `exportPngBlob(canvas, dpi)` pour PNG et `exportPdfBlob(canvas, { canvasWidth, canvasHeight, withPrintMarks, multiplier: dpi/72 })` pour PDF, au lieu de `captureCanvas()` (multiplier figé 2).

- [ ] **Step 1: ⚠ Pré-requis** — rendre `exportPngBlob` / `exportPdfBlob` exportables : vérifier qu'ils sont `export function` dans `useExportPng.ts`/`useExportPdf.ts` ; sinon ajouter `export`. (Le rapport indique `exportPdfBlob` core à `:49` et `exportPngBlob` à `:13` — confirmer le mot-clé `export`.)

- [ ] **Step 2: Écrire le test d'échec** `batchExportConfig.test.ts` (teste le calcul du multiplier depuis dpi, fonction pure extraite)

```ts
import { describe, it, expect } from 'vitest'
import { dpiToMultiplier } from './useBatchExport'

describe('dpiToMultiplier', () => {
  it('72→1, 150→~2.08, 300→~4.17', () => {
    expect(dpiToMultiplier(72)).toBe(1)
    expect(dpiToMultiplier(150)).toBeCloseTo(150 / 72, 5)
    expect(dpiToMultiplier(300)).toBeCloseTo(300 / 72, 5)
  })
  it('défaut 150 si undefined', () => {
    expect(dpiToMultiplier(undefined)).toBeCloseTo(150 / 72, 5)
  })
})
```

- [ ] **Step 3: Lancer (échec attendu)** — `npm run test:run -- src/features/merge/batchExportConfig.test.ts` → FAIL (`dpiToMultiplier` introuvable).

- [ ] **Step 4: Modifier `useBatchExport.ts`**

1. Étendre l'interface (`:13-22`) :
```ts
export interface BatchExportConfig {
  format: ExportFormat
  mode: ExportMode
  rangeStart: number
  rangeEnd: number
  fileNamePattern: string
  dpi?: 72 | 150 | 300        // NEW — défaut 150
  withPrintMarks?: boolean    // NEW — défaut false (PDF uniquement)
}
```
2. Ajouter le helper pur exporté (en tête de fichier) :
```ts
export function dpiToMultiplier(dpi: 72 | 150 | 300 | undefined): number {
  return (dpi ?? 150) / 72
}
```
3. Dans la boucle zip (`:116-169`), remplacer la capture PNG/PDF par les blobs haute résolution :
```ts
// PNG
const blob = await exportPngBlob(globalFabricCanvas!, config.dpi ?? 150)
// PDF (par ligne, page unique)
const blob = await exportPdfBlob(globalFabricCanvas!, {
  canvasWidth, canvasHeight,
  withPrintMarks: config.withPrintMarks ?? false,
  multiplier: dpiToMultiplier(config.dpi),
})
```
Conserver `resolveFileName` + l'ajout au zip. Importer `exportPngBlob`/`exportPdfBlob` et lire `canvasWidth/canvasHeight` depuis `useUIStore` comme déjà fait.

> Le multi-page PDF (`exportMultiPagePdf`) peut rester sur sa logique actuelle pour V1 (marques non requises en multi-page) — ne pas le casser. Documenter ce choix en commentaire.

- [ ] **Step 5: Lancer (succès attendu)** — `npm run test:run -- src/features/merge/batchExportConfig.test.ts` → PASS.

- [ ] **Step 6: Vérifier types + commit**

```bash
npx tsc -b
git add src/features/merge/useBatchExport.ts src/features/merge/batchExportConfig.test.ts src/features/export/useExportPng.ts src/features/export/useExportPdf.ts
git commit -m "feat(merge): export par lot avec dpi (72/150/300) + marques de coupe (PDF)"
```

---

## Task 10: Enregistrement du module (navigation, permission, aide, route)

**Files:**
- Modify: `src/features/navigation/modules.ts` (type `Section` :18 ; `MODULE_ITEMS` ; `SECTION_PERMISSION` :152)
- Modify: `src/features/access/permissions.ts` (`PERMISSIONS` :16-64)
- Modify: `src/features/help/helpContext.ts` (`CONTEXT_TO_ARTICLE` — exhaustif sur `Section` → **obligatoire**)
- Modify: `src/pages/DashboardPage.tsx` (lazy import :39-47 ; branche de rendu dans la chaîne ternaire avant le `:` final)
- Create: `src/features/help/content/retail-promo.tsx` + import dans `src/features/help/content/index.ts`

**Interfaces:**
- Consumes: rien de neuf. Produces: section `'retail-promo'` visible + gatée par `retailPromo.view`.

- [ ] **Step 1: `modules.ts`** — ajouter à la fin de l'union `Section` (`:18-21`) `| 'retail-promo'`, importer une icône (`import { Tag } from 'lucide-react'`), ajouter l'item dans `MODULE_ITEMS` :
```ts
{ id: 'retail-promo', icon: Tag, label: 'Promo Retail', accent: 'text-rose-400', activeBg: 'bg-rose-500/[0.1]', activeText: 'text-rose-300',
  children: [
    { id: 'action:new',  label: 'Créer une promo', intent: 'retail-promo:action:new' },
    { id: 'action:list', label: 'Mes promos',       intent: 'retail-promo:action:list' },
  ],
},
```
et dans `SECTION_PERMISSION` (`:152`) : `'retail-promo': 'retailPromo.view',`.

- [ ] **Step 2: `permissions.ts`** — ajouter dans le tableau `PERMISSIONS` :
```ts
{ key: 'retailPromo.view', module: 'Promo Retail', label: 'Voir le module Promo Retail' },
{ key: 'retailPromo.edit', module: 'Promo Retail', label: 'Créer/éditer des promos retail' },
```
(Racine `retailPromo` cohérente avec `SECTION_PERMISSION`.)

- [ ] **Step 3: `helpContext.ts`** — ajouter la ligne obligatoire dans `CONTEXT_TO_ARTICLE` : `'retail-promo': 'retail-promo',`. (Sinon erreur TS : le Record est exhaustif sur `Section`.)

- [ ] **Step 4: contenu d'aide** — créer `src/features/help/content/retail-promo.tsx` exportant une `HelpSection` (id `'retail-promo'`, suivre la forme d'un fichier voisin, ex. `import-image.tsx`), puis l'importer et l'ajouter au tableau `helpSections` dans `content/index.ts`. Aligner la gate dans `helpAccess.ts` si nécessaire (`'retail-promo': 'retailPromo.view'`).

- [ ] **Step 5: `DashboardPage.tsx`** — lazy import (zone :39-47) :
```ts
const RetailPromoPage = lazy(() => import('@/features/retail-promo/RetailPromoPage').then((m) => ({ default: m.RetailPromoPage })))
```
et insérer la branche de rendu **avant le `: (` final** de la chaîne ternaire (modèle `price-watch` :559-568) :
```tsx
) : activeSection === 'retail-promo' && canSee('retail-promo') ? (
  <div data-tour="section-retail-promo" className="flex-1 overflow-hidden">
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center h-full bg-background">
        <Loader2 className="w-8 h-8 text-rose-500 animate-spin" />
      </div>
    }>
      <RetailPromoPage />
    </Suspense>
  </div>
```

> `RetailPromoPage` est créée en tâche 11. Pour que cette tâche compile seule, créer d'abord un stub minimal `export function RetailPromoPage() { return null }` dans `src/features/retail-promo/RetailPromoPage.tsx` (remplacé en tâche 11).

- [ ] **Step 6: Vérifier types (la vérité ici, c'est `tsc -b`)**

Run: `npx tsc -b`
Expected: exit 0 (notamment `CONTEXT_TO_ARTICLE` exhaustif satisfait).

- [ ] **Step 7: Vérification manuelle** — `npm run dev`, se connecter en owner, vérifier que « Promo Retail » apparaît dans la sidebar et le menu global, et que le clic ouvre la section (stub vide pour l'instant).

- [ ] **Step 8: Commit**

```bash
git add src/features/navigation/modules.ts src/features/access/permissions.ts src/features/help/helpContext.ts src/features/help/content/retail-promo.tsx src/features/help/content/index.ts src/pages/DashboardPage.tsx src/features/retail-promo/RetailPromoPage.tsx
git commit -m "feat(retail-promo): enregistrement du module (nav + permission + aide + route)"
```

---

## Task 11: UI du parcours en 4 étapes

**Files:**
- Create: `src/features/retail-promo/retailPromo.store.ts`
- Create: `src/features/retail-promo/useRetailPromoSource.ts`
- Replace: `src/features/retail-promo/RetailPromoPage.tsx` (≤150 l.)
- Create: `src/features/retail-promo/steps/StepSource.tsx`, `StepTemplate.tsx`, `StepMapping.tsx`, `StepExport.tsx` (≤150 l. chacun)

**Interfaces:**
- Consumes: `useRetailPromoSource` (PIM/Excel/manuel → `{columns, rows}`) ; `defaultPromoFieldMap`, `augmentRowsWithPromo` (T2/T3) ; `CURATED_TEMPLATES`, `nearestTemplate` (T6) ; `useGeneratePromoPlan` (T8) ; `instantiatePromoLayout` (T7) ; `useCreateProject` ; `useDataMerge` ; `useBatchExport` (T9) ; `import '@/features/retail-promo/blocks'` (effet de bord) ; `useModuleIntent('retail-promo', …)`.

Store (Zustand) :
```ts
// retailPromo.store.ts
interface RetailPromoState {
  step: 'source' | 'template' | 'mapping' | 'export'
  columns: MergeColumn[]; rows: MergeRow[]
  fieldMap: Partial<Record<PromoFieldKey, string>>
  layout: PromoLayout | null
  setStep / setData(columns,rows) / setFieldMap / setLayout / reset
}
```

- [ ] **Step 1: `retailPromo.store.ts`** — store Zustand avec l'état ci-dessus (suivre le pattern des stores existants `camelCase.store.ts`).

- [ ] **Step 2: `useRetailPromoSource.ts`** — hook exposant `connectPim(projectId)`, `connectExcel(docId, sheetIndex)`, `setManual(products)`. Réutilise `loadPimMergeData(projectId)` (`pimSource.ts:50`) pour PIM et la lecture Excel existante ; renvoie `{ columns, rows }` bruts (non augmentés). (Pour le manuel : construit `columns`/`rows` au schéma promo minimal depuis une saisie.)

- [ ] **Step 3: `StepSource.tsx`** — 3 cartes (PIM / Excel / manuel). À la sélection : charge `{columns, rows}` via `useRetailPromoSource`, calcule `defaultPromoFieldMap(columns)`, stocke dans le store, passe à `step='template'`.

- [ ] **Step 4: `StepTemplate.tsx`** — galerie `CURATED_TEMPLATES` + bouton « Générer (IA) » (champ brief → `useGeneratePromoPlan().generate({brief, width, height, sample: augmentedRows[0]})`). Au choix : crée un Projet via `useCreateProject.mutateAsync({title, canvasWidth: layout.width, canvasHeight: layout.height, canvasBg: layout.background})`, navigue `/editor/{id}`, et après montage du canvas appelle `instantiatePromoLayout(globalFabricCanvas, layout, resolvedTheme)`. Stocke `layout`, passe à `mapping`.

> ⚠ Timing canvas : l'instanciation doit attendre que `globalFabricCanvas` soit prêt sur la page éditeur. Réutiliser le même point d'accroche que les imports IDML/SVG (`EditorPage.tsx:96-157`) qui posent des objets après init — suivre ce pattern (effet sur disponibilité du canvas), ne pas instancier avant.

- [ ] **Step 5: `StepMapping.tsx`** — tableau éditable champ promo → colonne source (pré-rempli par `defaultPromoFieldMap`, override manuel). Bouton « Aperçu » : `augmentRowsWithPromo(columns, rows, fieldMap)` → `connectSource` (via `useDataMerge`) avec les colonnes/rows augmentées → navigue la 1re ligne (`setCurrentRow(0)`) pour voir le rendu. Passe à `export`.

- [ ] **Step 6: `StepExport.tsx`** — réutilise `useBatchExport().exportBatch({ format: 'pdf'|'png', mode: 'zip', rangeStart: 0, rangeEnd: rows.length-1, fileNamePattern: 'promo_{{promo_name}}', dpi: 300, withPrintMarks: true })`. Affiche `progress/total`, bouton `cancel`.

- [ ] **Step 7: `RetailPromoPage.tsx`** — orchestre les 4 étapes selon `store.step`, monte `import '@/features/retail-promo/blocks'` (effet de bord) + `initPromoBlocks()` au montage, et câble `useModuleIntent('retail-promo', (action) => { if (action==='action:new') store.reset(); ... })`. ≤150 lignes (déléguer aux steps).

- [ ] **Step 8: Vérifier types + lint + knip**

```bash
npx tsc -b && npm run lint && npx knip
```
Expected: tsc exit 0 ; knip exit 0.

- [ ] **Step 9: Vérification manuelle (parcours complet)** — `npm run dev` : Source PIM → template A4 → mapping (remise calculée visible) → aperçu 1er produit (badge -X% masqué si pas de prix barré) → export ZIP PDF 300 dpi. Confirmer l'éditabilité dans l'éditeur.

- [ ] **Step 10: Commit**

```bash
git add src/features/retail-promo
git commit -m "feat(retail-promo): parcours UI 4 etapes (source -> template/IA -> mapping -> export)"
```

---

## Auto-revue (couverture du spec)

- ① Modèle de données promo → T1 (`PromoFields`), T2 (extraction), T3 (colonnes `promo_*`). ✅
- ② Kit de blocs éditables + règles conditionnelles → T5. ✅
- ③ Templates curés 3-4 print → T6. ✅
- ④ Générateur IA de plan (validation/réparation/repli) → T4 + T8. ✅
- ⑤ UI / navigation 4 étapes → T10 (enregistrement) + T11 (parcours). ✅
- ⑥ Export PNG 300 dpi / PDF marques par lot → T9. ✅
- ⑦ Frontières/fichiers `features/retail-promo/` ≤150 l. → respecté (steps T11). ✅
- ⑧ Tests purs (mapping, remise, visibilité, validation/réparation, batch) → T1-T6, T9. ✅
- 3 sources (PIM/Excel/manuel) → T11 (`useRetailPromoSource`). ✅

**Points à confirmer au fil de l'implémentation (marqués ⚠ dans les tâches)** : chemin réel du module `conditionalRules`/`applyConditionalRulesForRow` (T5) ; clé de binding image dans `applyRow` (T5/T7) ; fonction LLM JSON réutilisable (T8) ; mot-clé `export` sur `exportPngBlob`/`exportPdfBlob` (T9) ; point d'accroche disponibilité `globalFabricCanvas` côté éditeur (T11). Aucun n'invente d'API : chacun pointe le fichier:lignes à lire d'abord.
