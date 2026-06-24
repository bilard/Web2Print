# Data-merge : mapping explicite balise → colonne

> Conception — 2026-06-25

## Problème

La fusion associe une balise (`{{Free_complement}}`, issue de `data.mergeFields`/`templateText`) à
une colonne de la base par **devinage de nom** : `getRowValue` (mergeEngine) teste
`row[variable]` → `column.label === variable` → label lowercase → `column.aliases`. Quand la
balise IDML ne correspond à **aucune** colonne (ex. `Free_complement` alors que les colonnes
s'appellent `Univers`, `Famille`, `Marque`…), la valeur est **vide** au merge. L'utilisateur ne
peut pas corriger ce mapping.

## Solution — mapping explicite, prioritaire, persistant

Un dictionnaire **`fieldMap: Record<balise, columnKey>`** que l'utilisateur édite, consulté **en
priorité** par la résolution. Repli sur le devinage actuel si une balise n'est pas mappée
(rétro-compatible). « Lier automatiquement » pré-remplit le mapping.

### 1. Store (`src/stores/merge.store.ts`)
Ajouter, sur le modèle de `formulas` :
- `fieldMap: Record<string, string>` (clé = balise, valeur = `column.key`) — défaut `{}`.
- `setFieldMap(field: string, columnKey: string): void` (si `columnKey === ''` → supprime l'entrée).
- inclure `fieldMap` dans le `reset()`/`disconnect` existant.

### 2. Résolution (`src/features/merge/mergeEngine.ts`)
- `getRowValue(row, variable, columns?, fieldMap?)` : **si** `fieldMap?.[variable]` existe et non
  vide → retourner `row[fieldMap[variable]]` (priorité absolue, avant `row[variable]`). Sinon,
  comportement actuel inchangé.
- Filer `fieldMap` (optionnel) à travers les appelants : `resolveText`, `remapStyles`,
  `evaluateFormula`, `resolveBinding` (signature étendue, paramètre optionnel en fin — pas de
  rupture d'appel).
- `variableMatchesColumn(variable, columns, fieldMap?)` : une balise présente dans `fieldMap`
  (avec une colonne existante) est considérée **liée** (badge ✓).

### 3. Application (`src/features/merge/useDataMerge.ts`)
- `applyRow` lit `fieldMap` du store (`useMergeStore.getState()`) et le passe à `resolveText`/
  `remapStyles`/`resolveBinding`.
- Re-merge quand `fieldMap` change : l'effet qui déclenche `applyRow` doit dépendre aussi de
  `fieldMap` (abonnement store), pour que l'édition du mapping rafraîchisse le rendu immédiatement.

### 4. UI (`src/features/merge/DataMergePanel.tsx`)
Nouvelle section **« Mapping des champs »** (sous « Blocs balisés IDML »), affichée quand une
source est connectée et qu'il existe des balises dans le design :
- **Lister toutes les balises du design** : union de `data.mergeFields` (via `collectObjectsDeep`)
  et des `{{variable}}` des `data.templateText`/`obj.text` (regex), dédupliquée.
- Pour chaque balise : un `<select>` des colonnes (`<option value={col.key}>{col.label}</option>`)
  + option « — auto (devinette) — » (`value=''`) ; valeur courante = `fieldMap[balise] ?? ''`.
  `onChange` → `setFieldMap(balise, value)`. Réutilise le pattern visuel du `BindingEditor`
  existant (mêmes classes).
- Indicateur d'état par balise : ✓ si résolu (mappé OU deviné avec succès), ⚠ si non résolu.

### 5. Persistance
- **Sauvegarde** (`src/features/editor/useAutoSave.ts`) : champ Firestore `mergeFieldMap` =
  `JSON.stringify(fieldMap)` si non vide, sinon `null` (jumeau de `mergeFormulas`).
- **Restauration** (`src/features/editor/useLoadCanvas.ts`) : `restoreMergeData(data.mergeFieldMap,
  (s, k, v) => s.setFieldMap(k, v))` (jumeau de `mergeFormulas`).

## Architecture / unités
- `merge.store.ts` — `fieldMap` + setter (modif).
- `mergeEngine.ts` — `getRowValue`/`resolveText`/`remapStyles`/`evaluateFormula`/`resolveBinding`/
  `variableMatchesColumn` reçoivent `fieldMap` (modif).
- `useDataMerge.ts` — lit+passe `fieldMap`, re-merge à son changement (modif).
- `DataMergePanel.tsx` — section « Mapping des champs » (modif) ; éventuellement un petit
  composant `FieldMappingEditor` extrait pour rester < 150 lignes par fichier.
- `useAutoSave.ts` / `useLoadCanvas.ts` — persistance (modif).

## Tests
- **mergeEngine (Vitest)** : `getRowValue(row, 'Free_complement', columns, { Free_complement:'col_x' })`
  retourne `row['col_x']` ; sans fieldMap → comportement actuel (devinage) inchangé ; `fieldMap`
  vide / clé absente → repli. `resolveText('{{Free_complement}}', row, …, fieldMap)` résout via le
  mapping. `variableMatchesColumn` reconnaît une balise mappée.
- **Persistance (Vitest si testable)** : round-trip `fieldMap` (stringify → restore).
- **UI** : pas de test de composant (convention projet) → validation build + revue + gate manuel.

## Gate de validation manuel
Après deploy : ouvrir le projet, panneau Données → « Mapping des champs » → mapper
`Free_complement` à la bonne colonne → le bloc se remplit au merge ; recharger → le mapping
persiste.

## Hors périmètre
- Mapping par-bloc (deux blocs portant la même balise vers deux colonnes) : le mapping est
  **global par nom de balise** (suffit pour le besoin ; YAGNI).
- Transformation/formatage de la valeur mappée (déjà couvert par les formules existantes).
- Mapping des champs image (`ecImageField`) → reste sur le devinage / bindings d'objet existants.
