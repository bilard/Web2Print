# Mapping explicite balise → colonne (data-merge) — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à l'utilisateur de mapper explicitement chaque balise du design à une colonne de la base, consulté en priorité par la fusion (repli sur le devinage actuel), persisté avec le design.

**Architecture:** Un `fieldMap: Record<balise, columnKey>` dans `useMergeStore`. `getRowValue` (mergeEngine) le consulte avant tout devinage ; le mapping est filé via `resolveText`/`remapStyles`/`evaluateFormula`/`resolveBinding`. UI : un sélecteur de colonne par balise dans le panneau Données. Persistance : champ Firestore `mergeFieldMap` (jumeau de `mergeFormulas`).

**Tech Stack:** TypeScript strict, Zustand, React, Vitest, Firestore.

## Global Constraints

- TypeScript strict, pas d'`any` nu (sauf cast `(o as any).data` existant). `npx tsc -b` clean ; `npm run build` OK ; `npx knip` exit 0.
- **Ne jamais modifier** `src/components/ui/**`, `src/lib/firebase/config.ts`, `public/fonts/`.
- **Non-régression du merge** : sans `fieldMap`, le comportement (devinage par nom) reste **strictement inchangé**. `fieldMap` est un paramètre **optionnel** partout (pas de rupture de signature).
- Théming par tokens (`bg-white/5`, `border-white/10`, `text-white/*`) ; pas d'hex sombre en dur.
- Identité d'une colonne = `column.key` (le `label` peut changer). Les valeurs de `MergeRow` sont indexées par `column.key`.
- Pas de test de composant React (convention projet) → UI validée par `tsc -b` + `build` + gate manuel.

---

### Task 1 : `fieldMap` dans le moteur de résolution (mergeEngine)

**Files:**
- Modify: `src/features/merge/mergeEngine.ts`
- Test: `src/features/merge/mergeEngine.fieldmap.test.ts`

**Interfaces:**
- Produces (signatures étendues, `fieldMap?` en dernier paramètre, optionnel) :
  - `getRowValue(row, variable, columns?, fieldMap?: Record<string,string>)`
  - `resolveText(template, row, formulas?, hideLineIfEmpty?, formulaConfigs?, columns?, fieldMap?)`
  - `evaluateFormula(formula, row, columns?, fieldMap?)`
  - `remapStyles(template, styles, row, formulas?, hideLineIfEmpty?, formulaConfigs?, columns?, fieldMap?)`
  - `resolveBinding(columnKey, row, columns?, fieldMap?)`
  - `variableMatchesColumn(variable, columns, fieldMap?)`

- [ ] **Step 1: Write the failing test**

```typescript
// src/features/merge/mergeEngine.fieldmap.test.ts
import { describe, it, expect } from 'vitest'
import { getRowValue, resolveText, variableMatchesColumn } from './mergeEngine'
import type { MergeColumn, MergeRow } from '@/stores/merge.store'

const COLS: MergeColumn[] = [
  { key: 'col_offre', label: 'Offre complémentaire', fieldType: 'text' },
  { key: 'col_lib', label: 'Désignation', fieldType: 'text' },
]
const ROW: MergeRow = { _id: 'r1', col_offre: '+55g GRATUIT', col_lib: 'Parure de lit' }

describe('fieldMap (mapping explicite balise→colonne)', () => {
  it('getRowValue : fieldMap a priorité absolue', () => {
    // sans mapping : aucune colonne ne matche "Free_complement" → undefined (devinage échoue)
    expect((getRowValue as any)(ROW, 'Free_complement', COLS)).toBeUndefined()
    // avec mapping explicite → valeur de la colonne mappée
    expect((getRowValue as any)(ROW, 'Free_complement', COLS, { Free_complement: 'col_offre' }))
      .toBe('+55g GRATUIT')
  })
  it('resolveText utilise le fieldMap', () => {
    const out = (resolveText as any)('{{Free_complement}}', ROW, undefined, undefined, undefined, COLS,
      { Free_complement: 'col_offre' })
    expect(out).toBe('+55g GRATUIT')
  })
  it('variableMatchesColumn reconnaît une balise mappée vers une colonne existante', () => {
    expect((variableMatchesColumn as any)('Free_complement', COLS)).toBe(false)
    expect((variableMatchesColumn as any)('Free_complement', COLS, { Free_complement: 'col_offre' }))
      .toBe(true)
  })
  it('repli : balise non mappée garde le devinage par label', () => {
    expect((getRowValue as any)(ROW, 'Désignation', COLS, { Free_complement: 'col_offre' }))
      .toBe('Parure de lit')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/features/merge/mergeEngine.fieldmap.test.ts`
Expected: FAIL (fieldMap ignoré → `getRowValue` retourne undefined même avec mapping).

- [ ] **Step 3: Implémenter**

3a. `getRowValue` — consulter `fieldMap` EN PREMIER :
```typescript
function getRowValue(
  row: MergeRow,
  variable: string,
  columns?: MergeColumn[],
  fieldMap?: Record<string, string>,
): unknown {
  const mappedKey = fieldMap?.[variable]
  if (mappedKey) return row[mappedKey]   // mapping explicite prioritaire
  if (row[variable] !== undefined) return row[variable]
  // … reste inchangé (label exact / fuzzy / aliases) …
}
```

3b. Propager `fieldMap` (param optionnel ajouté en fin de signature) dans `resolveText`,
`evaluateFormula`, `remapStyles`, `resolveBinding` — et le passer à chaque appel interne de
`getRowValue` (et `evaluateFormula` aux appels de `resolveText`/`remapStyles`). N'ajouter le
paramètre qu'en fin de liste pour ne casser aucun appelant existant.

3c. `variableMatchesColumn` — une balise mappée vers une colonne existante est « liée » :
```typescript
export function variableMatchesColumn(
  variable: string, columns: MergeColumn[], fieldMap?: Record<string, string>,
): boolean {
  const mappedKey = fieldMap?.[variable]
  if (mappedKey && columns.some((c) => c.key === mappedKey)) return true
  // … reste inchangé …
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/features/merge/mergeEngine.fieldmap.test.ts`
Expected: PASS.

Run: `npm run test:run -- src/features/merge`
Expected: PASS (non-régression — les appels sans fieldMap inchangés).

Run: `npx tsc -b`
Expected: aucune erreur (params optionnels).

- [ ] **Step 5: Commit**

```bash
git add src/features/merge/mergeEngine.ts src/features/merge/mergeEngine.fieldmap.test.ts
git commit -m "feat(merge): fieldMap prioritaire dans getRowValue + propagation moteur"
```

---

### Task 2 : `fieldMap` dans le store de merge

**Files:**
- Modify: `src/stores/merge.store.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `useMergeStore` expose `fieldMap: Record<string,string>` + `setFieldMap(field: string, columnKey: string): void`.

- [ ] **Step 1: Ajouter l'état (pattern `formulas`)**

Dans l'interface `MergeState`, près de `formulas` :
```typescript
  // Mapping explicite balise → column.key (priorité sur le devinage)
  fieldMap: Record<string, string>
  setFieldMap: (field: string, columnKey: string) => void
```
Init (près de `formulas: {}`) : `fieldMap: {},`.
Action :
```typescript
  setFieldMap: (field, columnKey) => set((s) => {
    const next = { ...s.fieldMap }
    if (!columnKey) delete next[field]
    else next[field] = columnKey
    return { fieldMap: next }
  }),
```
Inclure `fieldMap: {}` dans le `reset()`/disconnect existant (chercher où `formulas: {}` est remis à zéro et faire de même).

- [ ] **Step 2: Vérifier**

Run: `npx tsc -b`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/stores/merge.store.ts
git commit -m "feat(merge): fieldMap dans le store (mapping balise→colonne)"
```

---

### Task 3 : `applyRow` lit et passe `fieldMap` + re-merge à son changement

**Files:**
- Modify: `src/features/merge/useDataMerge.ts`

**Interfaces:**
- Consumes: `fieldMap` (Task 2), signatures étendues (Task 1).

- [ ] **Step 1: Lire `fieldMap` et le passer**

Dans `applyRow` (~ligne 423), étendre la destructuration du store :
```typescript
const { formulas, hideLineIfEmpty, formulaConfigs, columns, fieldMap } = useMergeStore.getState()
```
Passer `fieldMap` aux appels :
- `resolveText(tmpl, row, formulas, hideLineIfEmpty, formulaConfigs, columns, fieldMap)` (~429)
- `remapStyles(tmpl, tStyles, row, formulas, hideLineIfEmpty, formulaConfigs, columns, fieldMap)` (~434)
- `resolveBinding(columnKey, row, storeColumns, fieldMap)` (~466)

- [ ] **Step 2: Re-merge quand `fieldMap` change**

Repérer l'abonnement/`useEffect` du hook qui déclenche `applyRow` sur `currentRowIndex`/`formulas`.
Ajouter `fieldMap` à ses dépendances (lire `const fieldMap = useMergeStore((s) => s.fieldMap)` dans
le hook si pas déjà, et l'inclure dans le tableau de dépendances de l'effet qui ré-applique la
ligne courante) — pour que modifier le mapping rafraîchisse le rendu immédiatement.

- [ ] **Step 3: Vérifier**

Run: `npx tsc -b`
Expected: clean.

Run: `npm run test:run -- src/features/merge`
Expected: PASS (non-régression).

- [ ] **Step 4: Commit**

```bash
git add src/features/merge/useDataMerge.ts
git commit -m "feat(merge): applyRow consomme fieldMap + re-merge à son changement"
```

---

### Task 4 : UI « Mapping des champs » (panneau Données)

**Files:**
- Create: `src/features/merge/FieldMappingEditor.tsx`
- Modify: `src/features/merge/DataMergePanel.tsx` (montage)

**Interfaces:**
- Consumes: `useMergeStore` (`columns`, `fieldMap`, `setFieldMap`, `isConnected`), `globalFabricCanvas`, `collectObjectsDeep`, `variableMatchesColumn`.
- Produces: `export function FieldMappingEditor(): JSX.Element | null`.

- [ ] **Step 1: Créer le composant**

```tsx
// src/features/merge/FieldMappingEditor.tsx
import { useMergeStore } from '@/stores/merge.store'
import { useShallow } from 'zustand/react/shallow'
import { globalFabricCanvas } from '@/features/editor/CanvasContainer'
import { collectObjectsDeep } from '@/features/editor/deepObjects'
import { variableMatchesColumn } from './mergeEngine'

function collectDesignFields(): string[] {
  const canvas = globalFabricCanvas
  if (!canvas) return []
  const set = new Set<string>()
  for (const o of collectObjectsDeep(canvas.getObjects())) {
    const fields = (o as any).data?.mergeFields as string[] | undefined
    fields?.forEach((f) => set.add(f))
    const tmpl = (o as any).data?.templateText as string | undefined
    const txt = tmpl ?? ((o as any).text as string | undefined) ?? ''
    for (const m of txt.matchAll(/\{\{([^}]+)\}\}/g)) set.add(m[1])
  }
  return Array.from(set)
}

export function FieldMappingEditor() {
  const { columns, fieldMap, setFieldMap, isConnected } = useMergeStore(
    useShallow((s) => ({ columns: s.columns, fieldMap: s.fieldMap, setFieldMap: s.setFieldMap, isConnected: s.isConnected })),
  )
  if (!isConnected) return null
  const fields = collectDesignFields()
  if (fields.length === 0) return null

  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[10px] font-semibold text-white/40 uppercase tracking-wider px-1">
        Mapping des champs
      </div>
      {fields.map((field) => {
        const resolved = variableMatchesColumn(field, columns, fieldMap)
        return (
          <div key={field} className="flex items-center gap-2 px-1">
            <span className={`text-[11px] w-2 ${resolved ? 'text-emerald-400' : 'text-amber-400'}`}>
              {resolved ? '✓' : '⚠'}
            </span>
            <span className="text-[12px] text-white/80 flex-1 truncate" title={field}>{field}</span>
            <select
              value={fieldMap[field] ?? ''}
              onChange={(e) => setFieldMap(field, e.target.value)}
              className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-[11px] text-white"
            >
              <option value="">— auto (devinette) —</option>
              {columns.map((col) => (
                <option key={col.key} value={col.key}>{col.label}</option>
              ))}
            </select>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Monter dans DataMergePanel**

Dans `src/features/merge/DataMergePanel.tsx`, importer et rendre `<FieldMappingEditor />` près de
`<TaggedBlocksList />` (la section « Blocs balisés IDML ») :
```tsx
import { FieldMappingEditor } from './FieldMappingEditor'
```
```tsx
<TaggedBlocksList />
<FieldMappingEditor />
```

- [ ] **Step 3: Vérifier**

Run: `npx tsc -b` ; `npm run build`
Expected: clean + build OK.

- [ ] **Step 4: Commit**

```bash
git add src/features/merge/FieldMappingEditor.tsx src/features/merge/DataMergePanel.tsx
git commit -m "feat(merge): UI « Mapping des champs » (sélecteur colonne par balise)"
```

---

### Task 5 : Persistance de `fieldMap`

**Files:**
- Modify: `src/features/editor/useAutoSave.ts`
- Modify: `src/features/editor/useLoadCanvas.ts`

**Interfaces:**
- Consumes: `useMergeStore` (`fieldMap`, `setFieldMap`).

- [ ] **Step 1: Sauvegarde (useAutoSave)**

Près de `mergeFormulas` (~ligne 270), ajouter au `updateDoc` :
```typescript
  mergeFieldMap: Object.keys(useMergeStore.getState().fieldMap).length > 0
    ? JSON.stringify(useMergeStore.getState().fieldMap) : null,
```

- [ ] **Step 2: Restauration (useLoadCanvas)**

Près des `restoreMergeData(...)` (~ligne 496), ajouter :
```typescript
restoreMergeData<string>(data.mergeFieldMap, (s, k, v) => s.setFieldMap(k, v))
```
(Vérifier la signature exacte de `restoreMergeData` — type générique de la valeur = `string` ici,
clé = balise, valeur = columnKey.)

- [ ] **Step 3: Vérifier**

Run: `npx tsc -b` ; `npm run build` ; `npx knip`
Expected: clean, build OK, knip exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/features/editor/useAutoSave.ts src/features/editor/useLoadCanvas.ts
git commit -m "feat(merge): persister/restaurer le fieldMap (mergeFieldMap)"
```

---

### Task 6 : Round-trip + suite complète

**Files:**
- Test: `src/features/merge/fieldMapRoundtrip.test.ts`

- [ ] **Step 1: Test round-trip mapping → résolution**

```typescript
// src/features/merge/fieldMapRoundtrip.test.ts
import { describe, it, expect } from 'vitest'
import { resolveText } from './mergeEngine'
import type { MergeColumn, MergeRow } from '@/stores/merge.store'

describe('round-trip fieldMap', () => {
  it('un mapping JSON restauré résout la bonne colonne', () => {
    const cols: MergeColumn[] = [{ key: 'c1', label: 'Offre', fieldType: 'text' }]
    const row: MergeRow = { _id: 'r', c1: '+55g GRATUIT' }
    const fieldMap = JSON.parse(JSON.stringify({ Free_complement: 'c1' })) as Record<string,string>
    expect((resolveText as any)('{{Free_complement}}', row, undefined, undefined, undefined, cols, fieldMap))
      .toBe('+55g GRATUIT')
  })
})
```

- [ ] **Step 2: Vérifier**

Run: `npm run test:run -- src/features/merge/fieldMapRoundtrip.test.ts`
Expected: PASS.

Run: `npm run test:run` ; `npx tsc -b` ; `npx knip`
Expected: suite verte, tsc clean, knip exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/features/merge/fieldMapRoundtrip.test.ts
git commit -m "test(merge): round-trip fieldMap → résolution"
```

---

## Gate de validation manuel (après deploy)

- [ ] Ouvrir le projet, connecter la base → panneau Données → section **« Mapping des champs »**.
- [ ] Mapper `Free_complement` → la bonne colonne → le bloc **se remplit** au merge (✓ vert).
- [ ] Corriger un autre mapping erroné → la valeur change immédiatement.
- [ ] Sauvegarder + recharger → le mapping **persiste** (les sélecteurs gardent leurs colonnes).

## Self-review

- **Couverture spec** : store fieldMap (T2) ✓ ; getRowValue prioritaire + propagation (T1) ✓ ;
  applyRow + re-merge (T3) ✓ ; UI dropdown par balise + ✓/⚠ (T4) ✓ ; persistance save/load (T5) ✓ ;
  repli devinage + non-régression (T1 tests + contrainte) ✓ ; round-trip (T6) ✓.
- **Placeholders** : aucun ; code réel partout.
- **Cohérence des types** : `fieldMap: Record<string,string>` (balise→column.key) identique de T1
  à T6 ; `setFieldMap(field, columnKey)` (T2) consommé par UI (T4) et restore (T5) ; signatures
  `…, columns?, fieldMap?` cohérentes (T1) chez tous les appelants (T3).

## Points à vérifier à l'implémentation

- **`restoreMergeData`** (T5) : confirmer sa signature générique exacte (`<T>(raw, apply)`).
- **Effet de re-merge** (T3) : identifier le bon `useEffect` (celui qui réagit à `currentRowIndex`/
  `formulas`) et y ajouter `fieldMap` — sans créer de boucle (le setFieldMap ne doit pas re-déclencher
  en cascade au-delà d'un re-render).
- **`MergeColumn`/`MergeRow`** importés depuis `@/stores/merge.store` (vérifier le chemin réel).
