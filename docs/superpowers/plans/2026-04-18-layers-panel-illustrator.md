# Refonte panneau Calques (Illustrator) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refondre le panneau Calques pour atteindre la parité ergonomique avec Illustrator : recherche, verrouillage, renommage, cible de sélection, swatch de couleur, drag inter-groupes, auto-noms `<Type>`.

**Architecture:** Split de `LayersPanel` en sous-composants ciblés sous `src/components/panels/layers/`. Extensions de `useLayers` + nouveaux utils purs testables. Aucun changement de schéma de persistance Firestore.

**Tech Stack:** React 18, TypeScript strict, Fabric.js v6, Zustand, @dnd-kit v6, Tailwind v3, Vitest (jsdom), Lucide React.

**Spec source :** `docs/superpowers/specs/2026-04-18-layers-panel-illustrator-design.md`.

---

## Conventions

- Fichiers ≤ 150 lignes (règle `CLAUDE.md`).
- Tous les tests utilisent Vitest (`describe/it/expect` depuis `vitest`).
- Tests pour utilitaires purs uniquement. Les méthodes `useLayers` couplées à `globalFabricCanvas` sont validées en browser.
- Dark mode : fond `#0f0f0f`, surfaces `#1a1a1a`, accent `#6366f1`.
- Chaque tâche se termine par un commit dédié.
- Après chaque tâche, lancer `npm run typecheck` (ou équivalent projet) avant commit.

---

## File Structure

**Créés :**

```
src/features/editor/
  getAutoName.ts                mapping type → <Rectangle>, etc.
  getAutoName.test.ts
  getDisplayName.ts             résolveur nom : merge-label > name > auto
  getDisplayName.test.ts
  getLayerSwatchColor.ts        couleur du swatch selon fillType
  getLayerSwatchColor.test.ts
  useLayerFilter.ts             filtrage recherche + préservation ancêtres
  useLayerFilter.test.ts

src/components/panels/layers/
  LayerRow.tsx                  une ligne de calque
  LayerRowControls.tsx          œil / cadenas / cible / supprimer
  LayerNameInput.tsx            édition inline du nom
  LayerSwatch.tsx               swatch couleur + icône type
  LayerTree.tsx                 rendu récursif avec profondeur
  LayerSearchBar.tsx            input recherche debounced
```

**Modifiés :**

```
src/components/panels/LayersPanel.tsx   orchestration réduite
src/features/editor/useLayers.ts        +lockLayer, +renameLayer, +moveLayerToGroup, +toggleSelectionTarget
src/features/editor/useAddObject.ts     retirer noms par défaut (name: '')
```

---

## Task 1 : `getAutoName` utility

**Files:**
- Create: `src/features/editor/getAutoName.ts`
- Test: `src/features/editor/getAutoName.test.ts`

- [ ] **Step 1 : écrire le test qui échoue**

Contenu `src/features/editor/getAutoName.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { getAutoName } from './getAutoName'

describe('getAutoName', () => {
  it('retourne le nom auto en français avec chevrons pour chaque type', () => {
    expect(getAutoName('rect')).toBe('<Rectangle>')
    expect(getAutoName('ellipse')).toBe('<Ellipse>')
    expect(getAutoName('path')).toBe('<Tracé>')
    expect(getAutoName('line')).toBe('<Ligne>')
    expect(getAutoName('text')).toBe('<Texte>')
    expect(getAutoName('image')).toBe('<Image>')
    expect(getAutoName('group')).toBe('<Groupe>')
    expect(getAutoName('polygon')).toBe('<Polygone>')
    expect(getAutoName('triangle')).toBe('<Triangle>')
    expect(getAutoName('star')).toBe('<Étoile>')
    expect(getAutoName('arrow')).toBe('<Flèche>')
    expect(getAutoName('hexagon')).toBe('<Hexagone>')
    expect(getAutoName('diamond')).toBe('<Losange>')
    expect(getAutoName('callout')).toBe('<Bulle>')
  })

  it('retombe sur <Calque> pour un type inconnu', () => {
    expect(getAutoName('unknown' as never)).toBe('<Calque>')
  })
})
```

- [ ] **Step 2 : run test — doit échouer**

```bash
npx vitest run src/features/editor/getAutoName.test.ts
```

Expected : FAIL (module not found).

- [ ] **Step 3 : implémentation minimale**

Contenu `src/features/editor/getAutoName.ts` :

```ts
import type { CanvasObjectProps } from '@/stores/editor.store'

const MAP: Record<CanvasObjectProps['type'], string> = {
  rect: '<Rectangle>',
  ellipse: '<Ellipse>',
  path: '<Tracé>',
  line: '<Ligne>',
  text: '<Texte>',
  image: '<Image>',
  group: '<Groupe>',
  polygon: '<Polygone>',
  triangle: '<Triangle>',
  star: '<Étoile>',
  arrow: '<Flèche>',
  hexagon: '<Hexagone>',
  diamond: '<Losange>',
  callout: '<Bulle>',
}

export function getAutoName(type: CanvasObjectProps['type']): string {
  return MAP[type] ?? '<Calque>'
}
```

- [ ] **Step 4 : run test — doit passer**

```bash
npx vitest run src/features/editor/getAutoName.test.ts
```

Expected : PASS (2 tests).

- [ ] **Step 5 : commit**

```bash
git add src/features/editor/getAutoName.ts src/features/editor/getAutoName.test.ts
git commit -m "feat(layers): add getAutoName utility for type-based layer names

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2 : `getDisplayName` utility

Résout le nom affiché : clé merge → label de colonne ; nom non vide → tel quel ; sinon → auto-nom.

**Files:**
- Create: `src/features/editor/getDisplayName.ts`
- Test: `src/features/editor/getDisplayName.test.ts`

- [ ] **Step 1 : écrire le test qui échoue**

Contenu `src/features/editor/getDisplayName.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { getDisplayName } from './getDisplayName'
import type { CanvasObjectProps } from '@/stores/editor.store'

function make(partial: Partial<CanvasObjectProps> = {}): CanvasObjectProps {
  return {
    id: 'x', type: 'rect', name: '', visible: true, locked: false,
    x: 0, y: 0, width: 10, height: 10,
    fill: '#000', stroke: '', strokeWidth: 0, opacity: 1, angle: 0,
    flipX: false, flipY: false,
    ...partial,
  }
}

describe('getDisplayName', () => {
  it('utilise le label de colonne merge si le nom matche une clé', () => {
    const obj = make({ type: 'text', name: 'productTitle' })
    const columns = [{ key: 'productTitle', label: 'Titre du produit' }]
    expect(getDisplayName(obj, columns)).toBe('Titre du produit')
  })

  it('retourne le nom tel quel si non vide et non clé merge', () => {
    const obj = make({ type: 'rect', name: 'Mon rect' })
    expect(getDisplayName(obj, [])).toBe('Mon rect')
  })

  it('retourne l\'auto-nom si le nom est vide', () => {
    const obj = make({ type: 'ellipse', name: '' })
    expect(getDisplayName(obj, [])).toBe('<Ellipse>')
  })

  it('retourne l\'auto-nom pour un groupe sans nom', () => {
    const obj = make({ type: 'group', name: '' })
    expect(getDisplayName(obj, [])).toBe('<Groupe>')
  })
})
```

- [ ] **Step 2 : run test — doit échouer**

```bash
npx vitest run src/features/editor/getDisplayName.test.ts
```

Expected : FAIL.

- [ ] **Step 3 : implémentation**

Contenu `src/features/editor/getDisplayName.ts` :

```ts
import type { CanvasObjectProps } from '@/stores/editor.store'
import { getAutoName } from './getAutoName'

export function getDisplayName(
  obj: CanvasObjectProps,
  columns: { key: string; label: string }[],
): string {
  if (obj.name) {
    const col = columns.find((c) => c.key === obj.name)
    if (col) return col.label
    return obj.name
  }
  return getAutoName(obj.type)
}
```

- [ ] **Step 4 : run test — doit passer**

```bash
npx vitest run src/features/editor/getDisplayName.test.ts
```

Expected : PASS (4 tests).

- [ ] **Step 5 : commit**

```bash
git add src/features/editor/getDisplayName.ts src/features/editor/getDisplayName.test.ts
git commit -m "feat(layers): add getDisplayName resolver (merge-label > name > auto)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3 : Câbler `getDisplayName` + retirer noms par défaut

**Files:**
- Modify: `src/components/panels/LayersPanel.tsx` (remplacer `resolveDisplayName` par `getDisplayName`)
- Modify: `src/features/editor/useAddObject.ts` (lignes 125, 237, 243, 250, 255, 261, 266, 271, 276, 281, 286)

- [ ] **Step 1 : modifier `LayersPanel.tsx`** — supprimer la fonction locale `resolveDisplayName` (lignes 28-32), importer et utiliser `getDisplayName` à la place.

Remplacer dans `src/components/panels/LayersPanel.tsx` :

```ts
/** Résout le nom d'affichage d'un objet : si le nom est une clé de colonne merge, affiche le label */
function resolveDisplayName(name: string, columns: { key: string; label: string }[]): string {
  const col = columns.find((c) => c.key === name)
  return col ? col.label : name
}
```

par :

```ts
import { getDisplayName } from '@/features/editor/getDisplayName'
```

(import à ajouter en haut du fichier)

Puis à la ligne où on fait ` const displayName = resolveDisplayName(obj.name, columns)` (dans `LayerTree` ~ligne 156) remplacer par :

```ts
const displayName = getDisplayName(obj, columns)
```

- [ ] **Step 2 : modifier `useAddObject.ts` ligne 125** pour que la valeur par défaut soit `''` au lieu de `Calque ${index + 1}`.

Remplacer :

```ts
    name: d.name ?? `Calque ${index + 1}`,
```

par :

```ts
    name: d.name ?? '',
```

- [ ] **Step 3 : retirer les noms par défaut dans les blocs de création `useAddObject.ts`**.

Remplacer les 10 lignes listées (lignes 237, 243, 250, 255, 261, 266, 271, 276, 281, 286) :

```ts
// Ligne 237
data: { id, type: 'rect', name: 'Rectangle' },
// Ligne 243
data: { id, type: 'ellipse', name: 'Ellipse' },
// Ligne 250
data: { id, type: 'text', name: 'Texte' },
// Ligne 255
data: { id, type: 'line', name: 'Ligne' },
// Ligne 261
data: { id, type: 'triangle', name: 'Triangle' },
// Ligne 266
;(p as any).data = { id, type: 'star', name: 'Étoile' }
// Ligne 271
;(p as any).data = { id, type: 'arrow', name: 'Flèche' }
// Ligne 276
;(p as any).data = { id, type: 'hexagon', name: 'Hexagone' }
// Ligne 281
;(p as any).data = { id, type: 'diamond', name: 'Losange' }
// Ligne 286
;(p as any).data = { id, type: 'callout', name: 'Bulle' }
```

par (retirer `name: '…'` dans chaque bloc) :

```ts
data: { id, type: 'rect' },
data: { id, type: 'ellipse' },
data: { id, type: 'text' },
data: { id, type: 'line' },
data: { id, type: 'triangle' },
;(p as any).data = { id, type: 'star' }
;(p as any).data = { id, type: 'arrow' }
;(p as any).data = { id, type: 'hexagon' }
;(p as any).data = { id, type: 'diamond' }
;(p as any).data = { id, type: 'callout' }
```

- [ ] **Step 4 : typecheck + lancer le dev server et vérifier visuellement**

```bash
npm run typecheck  # ou: npx tsc --noEmit
```

Expected : 0 erreur.

```bash
npm run dev
```

Puis dans le navigateur : ouvrir un projet, créer un rectangle, vérifier que le panneau Calques affiche `<Rectangle>` en italique (ou en texte normal pour l'instant — l'italique sera ajouté à la task 6).

- [ ] **Step 5 : commit**

```bash
git add src/components/panels/LayersPanel.tsx src/features/editor/useAddObject.ts
git commit -m "refactor(layers): use getDisplayName + drop default object names

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4 : Extraire `LayerRow` dans un sous-composant

Refactor pur, aucun changement de comportement.

**Files:**
- Create: `src/components/panels/layers/LayerRow.tsx`
- Modify: `src/components/panels/LayersPanel.tsx` (supprimer `LayerItem` local, importer `LayerRow`)

- [ ] **Step 1 : créer `LayerRow.tsx`**

Contenu `src/components/panels/layers/LayerRow.tsx` (copier la logique actuelle de `LayerItem` dans `LayersPanel.tsx` lignes 34-133, en renommant `LayerItem` → `LayerRow`) :

```tsx
import {
  Eye, EyeOff, Trash2, GripVertical, Square, Circle, Type,
  Image as ImageIcon, Minus, ChevronRight, ChevronDown, Layers,
} from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useLayers } from '@/features/editor/useLayers'
import type { CanvasObjectProps } from '@/stores/editor.store'
import type { TextSegment } from '@/features/editor/useTextSegments'

const typeIcons: Partial<Record<CanvasObjectProps['type'], React.ComponentType<{ className?: string }>>> = {
  rect: Square, ellipse: Circle, text: Type, image: ImageIcon,
  path: Square, line: Minus, group: Layers, polygon: Square, triangle: Square,
}

interface Props {
  obj: CanvasObjectProps
  displayName: string
  isSelected: boolean
  segments: TextSegment[] | null
  expanded: boolean
  onToggleExpand: () => void
  depth?: number
  isDraggable?: boolean
}

export function LayerRow({
  obj, displayName, isSelected, segments, expanded, onToggleExpand,
  depth = 0, isDraggable = true,
}: Props) {
  const { selectLayer, deleteLayer, toggleVisibility } = useLayers()
  const sortable = useSortable({ id: obj.id, disabled: !isDraggable })
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = sortable
  const Icon = typeIcons[obj.type] ?? Square
  const isGroup = obj.type === 'group'
  const hasMixedStyles = !isGroup && segments !== null && (segments.length > 1 || segments.some((s) => s.isPlaceholder))
  const isExpandable = isGroup || hasMixedStyles
  const paddingLeft = 8 + depth * 14

  const style = isDraggable ? {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  } : {}

  return (
    <div
      ref={isDraggable ? setNodeRef : undefined}
      style={{ ...style, paddingLeft, paddingRight: 8 }}
      onClick={() => selectLayer(obj.id)}
      className={`flex items-center gap-1.5 py-1.5 cursor-pointer transition-colors group ${
        isSelected
          ? 'bg-indigo-500/20 border-l-2 border-indigo-500'
          : 'hover:bg-white/5 border-l-2 border-transparent'
      }`}
    >
      {isDraggable ? (
        <button
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="p-0.5 text-white/20 hover:text-white/50 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-all shrink-0"
        >
          <GripVertical className="w-3 h-3" />
        </button>
      ) : (
        <div className="w-4 shrink-0" />
      )}

      {isExpandable ? (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleExpand() }}
          className="p-0.5 text-white/30 hover:text-white/70 transition-colors shrink-0"
          title={expanded ? 'Réduire' : 'Développer'}
        >
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </button>
      ) : (
        <div className="w-4 shrink-0" />
      )}

      <Icon className={`w-3.5 h-3.5 shrink-0 ${isGroup ? 'text-indigo-400/70' : 'text-white/40'}`} />
      <span className={`text-xs truncate flex-1 ${isGroup ? 'text-white/90 font-medium' : 'text-white/70'}`}>
        {displayName}
      </span>

      {hasMixedStyles && (
        <span className="text-[9px] text-indigo-400/60 shrink-0 font-medium">Aa</span>
      )}

      <button
        onClick={(e) => { e.stopPropagation(); toggleVisibility(obj.id) }}
        className="p-0.5 text-white/20 hover:text-white/60 opacity-0 group-hover:opacity-100 transition-all shrink-0"
        title={obj.visible ? 'Masquer' : 'Afficher'}
      >
        {obj.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3 text-white/20" />}
      </button>

      <button
        onClick={(e) => { e.stopPropagation(); deleteLayer(obj.id) }}
        className="p-0.5 text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all shrink-0"
        title="Supprimer"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  )
}
```

- [ ] **Step 2 : modifier `LayersPanel.tsx`** — retirer le composant local `LayerItem` et son bloc d'icônes `typeIcons`, puis importer `LayerRow`. Remplacer `<LayerItem ... />` par `<LayerRow ... />` dans `LayerTree`.

En haut de `src/components/panels/LayersPanel.tsx`, retirer les imports Lucide inutiles (`Eye, EyeOff, Trash2, GripVertical, Square, Circle, Type, ImageIcon, Minus, ChevronRight, ChevronDown`) et les imports dnd-kit utilisés uniquement dans LayerItem (`useSortable`, `CSS`). Garder : `Layers` (pas utilisé — retirer aussi), `DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent`, `SortableContext, verticalListSortingStrategy, arrayMove`.

Ajouter :

```ts
import { LayerRow } from './layers/LayerRow'
```

Supprimer le bloc `const typeIcons` et la fonction `LayerItem` (lignes 23-133 de l'original).

Dans `LayerTree`, remplacer :

```tsx
<LayerItem
  obj={obj}
  ...
/>
```

par :

```tsx
<LayerRow
  obj={obj}
  ...
/>
```

(mêmes props)

- [ ] **Step 3 : typecheck + test visuel**

```bash
npm run typecheck
```

Expected : 0 erreur.

```bash
npm run dev
```

Vérifier dans le navigateur : panneau Calques fonctionne comme avant (sélection, drag, visibilité, suppression, expand).

- [ ] **Step 4 : commit**

```bash
git add src/components/panels/layers/LayerRow.tsx src/components/panels/LayersPanel.tsx
git commit -m "refactor(layers): extract LayerRow into its own component

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5 : Extraire `LayerTree` dans un sous-composant

Refactor pur.

**Files:**
- Create: `src/components/panels/layers/LayerTree.tsx`
- Modify: `src/components/panels/LayersPanel.tsx`

- [ ] **Step 1 : créer `LayerTree.tsx`**

Contenu `src/components/panels/layers/LayerTree.tsx` :

```tsx
import { LayerRow } from './LayerRow'
import { TextSegmentRow } from '../TextSegmentRow'
import { getDisplayName } from '@/features/editor/getDisplayName'
import type { CanvasObjectProps } from '@/stores/editor.store'
import type { TextSegment } from '@/features/editor/useTextSegments'

interface Props {
  objects: CanvasObjectProps[]
  selectedObjectId: string | null
  columns: { key: string; label: string }[]
  textSegments: Record<string, TextSegment[]>
  expandedIds: Set<string>
  onToggleExpand: (id: string) => void
  depth?: number
  isDraggable?: boolean
}

export function LayerTree({
  objects, selectedObjectId, columns, textSegments,
  expandedIds, onToggleExpand, depth = 0, isDraggable = true,
}: Props) {
  return (
    <>
      {objects.map((obj) => {
        const segments = textSegments[obj.id] ?? null
        const expanded = expandedIds.has(obj.id)
        const isGroup = obj.type === 'group'
        const displayName = getDisplayName(obj, columns)

        return (
          <div key={obj.id}>
            <LayerRow
              obj={obj}
              displayName={displayName}
              isSelected={obj.id === selectedObjectId}
              segments={segments}
              expanded={expanded}
              onToggleExpand={() => onToggleExpand(obj.id)}
              depth={depth}
              isDraggable={isDraggable}
            />

            {isGroup && expanded && obj.children && obj.children.length > 0 && (
              <div className="border-l border-white/10 ml-5">
                <LayerTree
                  objects={[...obj.children].reverse()}
                  selectedObjectId={selectedObjectId}
                  columns={columns}
                  textSegments={textSegments}
                  expandedIds={expandedIds}
                  onToggleExpand={onToggleExpand}
                  depth={depth + 1}
                  isDraggable={false}
                />
              </div>
            )}

            {!isGroup && expanded && segments && segments.map((seg, i) => (
              <TextSegmentRow key={i} segment={seg} index={i} objectId={obj.id} />
            ))}
          </div>
        )
      })}
    </>
  )
}
```

- [ ] **Step 2 : modifier `LayersPanel.tsx`** — retirer le composant local `LayerTree` et son type `LayerTreeProps`, importer depuis `./layers/LayerTree`.

Ajouter :

```ts
import { LayerTree } from './layers/LayerTree'
```

Retirer le composant local `LayerTree` (les ~50 lignes existantes) et le type `LayerTreeProps`. Dans le JSX du `LayersPanel` principal, utiliser `<LayerTree … />` inchangé.

Également retirer `import { TextSegmentRow }` et `import { getDisplayName }` de `LayersPanel.tsx` s'ils ne sont plus utilisés après extraction.

- [ ] **Step 3 : typecheck + test visuel**

```bash
npm run typecheck
```

```bash
npm run dev
```

Vérifier : groupes s'expandent correctement, segments de texte s'affichent.

- [ ] **Step 4 : commit**

```bash
git add src/components/panels/layers/LayerTree.tsx src/components/panels/LayersPanel.tsx
git commit -m "refactor(layers): extract LayerTree into its own component

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6 : `getLayerSwatchColor` + composant `LayerSwatch` + auto-nom en italique

Ajoute la vignette couleur+icône et rend les auto-noms en italique.

**Files:**
- Create: `src/features/editor/getLayerSwatchColor.ts`
- Test: `src/features/editor/getLayerSwatchColor.test.ts`
- Create: `src/components/panels/layers/LayerSwatch.tsx`
- Modify: `src/components/panels/layers/LayerRow.tsx`

- [ ] **Step 1 : test `getLayerSwatchColor`**

Contenu `src/features/editor/getLayerSwatchColor.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { getLayerSwatchColor } from './getLayerSwatchColor'
import type { CanvasObjectProps } from '@/stores/editor.store'

function make(partial: Partial<CanvasObjectProps> = {}): CanvasObjectProps {
  return {
    id: 'x', type: 'rect', name: '', visible: true, locked: false,
    x: 0, y: 0, width: 10, height: 10,
    fill: '#ff0000', stroke: '', strokeWidth: 0, opacity: 1, angle: 0,
    flipX: false, flipY: false,
    ...partial,
  }
}

describe('getLayerSwatchColor', () => {
  it('retourne fill pour fillType solid', () => {
    const o = make({ fillType: 'solid', fill: '#123456' })
    expect(getLayerSwatchColor(o)).toEqual({ kind: 'solid', color: '#123456' })
  })

  it('retourne fill pour fillType manquant (défaut solid)', () => {
    const o = make({ fill: '#abcdef' })
    expect(getLayerSwatchColor(o)).toEqual({ kind: 'solid', color: '#abcdef' })
  })

  it('retourne le 1er stop pour fillType gradient', () => {
    const o = make({
      fillType: 'gradient',
      gradient: { type: 'linear', angle: 0, stops: [{ offset: 0, color: '#111' }, { offset: 1, color: '#222' }] },
    })
    expect(getLayerSwatchColor(o)).toEqual({ kind: 'solid', color: '#111' })
  })

  it('retourne "image" pour fillType image', () => {
    const o = make({ fillType: 'image' })
    expect(getLayerSwatchColor(o)).toEqual({ kind: 'image' })
  })

  it('retourne "none" pour fillType none', () => {
    const o = make({ fillType: 'none' })
    expect(getLayerSwatchColor(o)).toEqual({ kind: 'none' })
  })

  it('retourne "group" pour un groupe', () => {
    const o = make({ type: 'group' })
    expect(getLayerSwatchColor(o)).toEqual({ kind: 'group' })
  })
})
```

- [ ] **Step 2 : run test — doit échouer**

```bash
npx vitest run src/features/editor/getLayerSwatchColor.test.ts
```

Expected : FAIL.

- [ ] **Step 3 : implémentation**

Contenu `src/features/editor/getLayerSwatchColor.ts` :

```ts
import type { CanvasObjectProps } from '@/stores/editor.store'

export type LayerSwatch =
  | { kind: 'solid'; color: string }
  | { kind: 'image' }
  | { kind: 'none' }
  | { kind: 'group' }

export function getLayerSwatchColor(obj: CanvasObjectProps): LayerSwatch {
  if (obj.type === 'group') return { kind: 'group' }
  const t = obj.fillType ?? 'solid'
  if (t === 'image') return { kind: 'image' }
  if (t === 'none') return { kind: 'none' }
  if (t === 'gradient' && obj.gradient && obj.gradient.stops.length > 0) {
    return { kind: 'solid', color: obj.gradient.stops[0].color }
  }
  return { kind: 'solid', color: obj.fill || '#000000' }
}
```

- [ ] **Step 4 : run test — doit passer**

```bash
npx vitest run src/features/editor/getLayerSwatchColor.test.ts
```

Expected : PASS (6 tests).

- [ ] **Step 5 : créer `LayerSwatch.tsx`**

Contenu `src/components/panels/layers/LayerSwatch.tsx` :

```tsx
import {
  Square, Circle, Type, Image as ImageIcon, Minus, Layers,
} from 'lucide-react'
import { getLayerSwatchColor } from '@/features/editor/getLayerSwatchColor'
import type { CanvasObjectProps } from '@/stores/editor.store'

const typeIcons: Partial<Record<CanvasObjectProps['type'], React.ComponentType<{ className?: string }>>> = {
  rect: Square, ellipse: Circle, text: Type, image: ImageIcon,
  path: Square, line: Minus, group: Layers, polygon: Square, triangle: Square,
}

interface Props {
  obj: CanvasObjectProps
}

export function LayerSwatch({ obj }: Props) {
  const swatch = getLayerSwatchColor(obj)
  const Icon = typeIcons[obj.type] ?? Square

  const bg =
    swatch.kind === 'solid' ? swatch.color :
    swatch.kind === 'group' ? 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)' :
    swatch.kind === 'none' ?
      'linear-gradient(135deg, #fff 0%, #fff 45%, #ef4444 45%, #ef4444 55%, #fff 55%)' :
    'repeating-conic-gradient(#444 0% 25%, #222 0% 50%) 50% / 6px 6px'

  return (
    <div className="relative w-3.5 h-3.5 shrink-0">
      <div
        className="absolute inset-0 rounded-sm border border-white/20"
        style={{ background: bg }}
      />
      <Icon
        className="absolute -right-0.5 -bottom-0.5 w-2.5 h-2.5 text-white/90"
        style={{ filter: 'drop-shadow(0 0 1px rgba(0,0,0,0.8))' }}
      />
    </div>
  )
}
```

- [ ] **Step 6 : intégrer `LayerSwatch` dans `LayerRow` + italique auto-nom**

Dans `src/components/panels/layers/LayerRow.tsx` :

1. Retirer l'import `Square, Circle, Type, Image as ImageIcon, Minus, Layers` de `lucide-react` (conserver `Eye, EyeOff, Trash2, GripVertical, ChevronRight, ChevronDown`).

2. Retirer le bloc `const typeIcons` (il est déplacé dans `LayerSwatch`).

3. Retirer la const `const Icon = typeIcons[obj.type] ?? Square`.

4. Ajouter `import { LayerSwatch } from './LayerSwatch'`.

5. Dans le JSX, remplacer la ligne `<Icon className={...} />` par `<LayerSwatch obj={obj} />`.

6. Remplacer le `<span>` du nom pour détecter auto-nom :

```tsx
<span
  className={`text-xs truncate flex-1 ${isGroup ? 'text-white/90 font-medium' : 'text-white/70'} ${
    !obj.name ? 'italic text-white/50' : ''
  }`}
>
  {displayName}
</span>
```

- [ ] **Step 7 : typecheck + test visuel**

```bash
npm run typecheck
```

```bash
npm run dev
```

Vérifier : les lignes montrent un swatch couleur + icône. Les nouveaux objets affichent `<Rectangle>` en italique.

- [ ] **Step 8 : commit**

```bash
git add src/features/editor/getLayerSwatchColor.ts src/features/editor/getLayerSwatchColor.test.ts src/components/panels/layers/LayerSwatch.tsx src/components/panels/layers/LayerRow.tsx
git commit -m "feat(layers): add color swatch + italic auto-names in rows

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7 : Extraire `LayerRowControls` + contrôles toujours visibles

Sortir œil + supprimer dans un sous-composant et les rendre toujours visibles (pas de hover-only).

**Files:**
- Create: `src/components/panels/layers/LayerRowControls.tsx`
- Modify: `src/components/panels/layers/LayerRow.tsx`

- [ ] **Step 1 : créer `LayerRowControls.tsx`**

Contenu `src/components/panels/layers/LayerRowControls.tsx` :

```tsx
import { Eye, EyeOff, Trash2 } from 'lucide-react'
import { useLayers } from '@/features/editor/useLayers'
import type { CanvasObjectProps } from '@/stores/editor.store'

interface Props {
  obj: CanvasObjectProps
}

export function LayerRowControls({ obj }: Props) {
  const { deleteLayer, toggleVisibility } = useLayers()

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); toggleVisibility(obj.id) }}
        className="p-0.5 text-white/40 hover:text-white/80 transition-colors shrink-0"
        title={obj.visible ? 'Masquer' : 'Afficher'}
      >
        {obj.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3 text-white/20" />}
      </button>

      <button
        onClick={(e) => { e.stopPropagation(); deleteLayer(obj.id) }}
        className="p-0.5 text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all shrink-0"
        title="Supprimer"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </>
  )
}
```

- [ ] **Step 2 : modifier `LayerRow.tsx`** — remplacer les deux boutons (œil + supprimer) par `<LayerRowControls obj={obj} />`.

Dans `src/components/panels/layers/LayerRow.tsx` :

1. Retirer les imports `Eye, EyeOff, Trash2` de `lucide-react` (conserver `GripVertical, ChevronRight, ChevronDown`).

2. Retirer `toggleVisibility` et `deleteLayer` du destructuring : `const { selectLayer } = useLayers()`.

3. Ajouter `import { LayerRowControls } from './LayerRowControls'`.

4. Remplacer les deux boutons existants (œil + supprimer) par :

```tsx
<LayerRowControls obj={obj} />
```

- [ ] **Step 3 : typecheck + test visuel**

```bash
npm run typecheck
```

```bash
npm run dev
```

Vérifier : l'icône œil est maintenant toujours visible ; le bouton supprimer reste hover-only.

- [ ] **Step 4 : commit**

```bash
git add src/components/panels/layers/LayerRowControls.tsx src/components/panels/layers/LayerRow.tsx
git commit -m "refactor(layers): extract LayerRowControls; always show eye icon

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8 : Verrouillage (lock) — méthode `lockLayer` + Fabric flags + UI cadenas

Ajoute la capacité de verrouiller un calque avec bascule des flags Fabric adéquats, et affiche l'icône cadenas.

**Files:**
- Modify: `src/features/editor/useLayers.ts`
- Modify: `src/components/panels/layers/LayerRowControls.tsx`
- Modify: `src/components/panels/layers/LayerRow.tsx`

- [ ] **Step 1 : ajouter `lockLayer` à `useLayers`**

Dans `src/features/editor/useLayers.ts`, ajouter cette méthode avant le `return` de `useLayers` :

```ts
  const lockLayer = useCallback((id: string, locked: boolean) => {
    const canvas = globalFabricCanvas
    if (!canvas) return
    const obj = findById(canvas.getObjects(), id)
    if (!obj) return
    // Si l'objet est en édition texte, on sort du mode édition d'abord
    if ((obj as any).isEditing === true && typeof (obj as any).exitEditing === 'function') {
      ;(obj as any).exitEditing()
    }
    ;(obj as any).data = { ...((obj as any).data ?? {}), locked }
    obj.set({
      selectable: !locked,
      evented: !locked,
      lockMovementX: locked,
      lockMovementY: locked,
      lockScalingX: locked,
      lockScalingY: locked,
      lockRotation: locked,
    })
    if (locked && canvas.getActiveObject() === obj) {
      canvas.discardActiveObject()
    }
    canvas.requestRenderAll()
    syncToStore(canvas)
  }, [])
```

Puis ajouter `lockLayer` au `return` :

```ts
  return { selectLayer, deleteLayer, toggleVisibility, reorderLayers, lockLayer }
```

- [ ] **Step 2 : modifier `LayerRowControls.tsx`** — ajouter le bouton cadenas.

Contenu complet `src/components/panels/layers/LayerRowControls.tsx` :

```tsx
import { Eye, EyeOff, Trash2, Lock, Unlock } from 'lucide-react'
import { useLayers } from '@/features/editor/useLayers'
import type { CanvasObjectProps } from '@/stores/editor.store'

interface Props {
  obj: CanvasObjectProps
}

export function LayerRowControls({ obj }: Props) {
  const { deleteLayer, toggleVisibility, lockLayer } = useLayers()

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); toggleVisibility(obj.id) }}
        className="p-0.5 text-white/40 hover:text-white/80 transition-colors shrink-0"
        title={obj.visible ? 'Masquer' : 'Afficher'}
      >
        {obj.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3 text-white/20" />}
      </button>

      <button
        onClick={(e) => { e.stopPropagation(); lockLayer(obj.id, !obj.locked) }}
        className={`p-0.5 transition-all shrink-0 ${
          obj.locked
            ? 'text-amber-400/80 hover:text-amber-400'
            : 'text-white/30 hover:text-white/70 opacity-0 group-hover:opacity-100'
        }`}
        title={obj.locked ? 'Déverrouiller' : 'Verrouiller'}
      >
        {obj.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
      </button>

      <button
        onClick={(e) => { e.stopPropagation(); deleteLayer(obj.id) }}
        className="p-0.5 text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all shrink-0"
        title="Supprimer"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </>
  )
}
```

- [ ] **Step 3 : modifier `LayerRow.tsx`** — désactiver le drag + griser la row si `locked`.

Dans `src/components/panels/layers/LayerRow.tsx` :

1. Modifier la ligne `const sortable = useSortable({ id: obj.id, disabled: !isDraggable })` pour également désactiver si verrouillé :

```ts
const sortable = useSortable({ id: obj.id, disabled: !isDraggable || obj.locked })
```

2. Modifier la `className` du conteneur principal pour réduire l'opacité si verrouillé :

```tsx
className={`flex items-center gap-1.5 py-1.5 cursor-pointer transition-colors group ${
  isSelected
    ? 'bg-indigo-500/20 border-l-2 border-indigo-500'
    : 'hover:bg-white/5 border-l-2 border-transparent'
} ${obj.locked ? 'opacity-60' : ''}`}
```

- [ ] **Step 4 : typecheck + test visuel**

```bash
npm run typecheck
```

```bash
npm run dev
```

Vérifier : clic sur l'icône cadenas de survol verrouille la row (icône devient ambre, row grisée, drag impossible, sélection canvas impossible). Re-clic déverrouille.

- [ ] **Step 5 : commit**

```bash
git add src/features/editor/useLayers.ts src/components/panels/layers/LayerRowControls.tsx src/components/panels/layers/LayerRow.tsx
git commit -m "feat(layers): add lock toggle with Fabric flag wiring

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9 : Renommage — `renameLayer` + `LayerNameInput`

Ajoute la méthode de rename et l'input inline déclenché par double-clic.

**Files:**
- Modify: `src/features/editor/useLayers.ts`
- Create: `src/components/panels/layers/LayerNameInput.tsx`
- Modify: `src/components/panels/layers/LayerRow.tsx`

- [ ] **Step 1 : ajouter `renameLayer` à `useLayers`**

Dans `src/features/editor/useLayers.ts`, ajouter avant le `return` :

```ts
  const renameLayer = useCallback((id: string, name: string) => {
    const canvas = globalFabricCanvas
    if (!canvas) return
    const obj = findById(canvas.getObjects(), id)
    if (!obj) return
    ;(obj as any).data = { ...((obj as any).data ?? {}), name }
    syncToStore(canvas)
  }, [])
```

Puis ajouter au `return` :

```ts
  return { selectLayer, deleteLayer, toggleVisibility, reorderLayers, lockLayer, renameLayer }
```

- [ ] **Step 2 : créer `LayerNameInput.tsx`**

Contenu `src/components/panels/layers/LayerNameInput.tsx` :

```tsx
import { useState, useRef, useEffect } from 'react'

interface Props {
  initial: string
  onCommit: (value: string) => void
  onCancel: () => void
}

export function LayerNameInput({ initial, onCommit, onCancel }: Props) {
  const [value, setValue] = useState(initial)
  const ref = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

  return (
    <input
      ref={ref}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onCommit(value.trim())}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          onCommit(value.trim())
        } else if (e.key === 'Escape') {
          e.preventDefault()
          onCancel()
        }
      }}
      onClick={(e) => e.stopPropagation()}
      className="text-xs flex-1 bg-black/40 border border-indigo-500/60 rounded px-1 py-0 text-white/90 outline-none focus:border-indigo-500"
    />
  )
}
```

- [ ] **Step 3 : câbler double-clic dans `LayerRow.tsx`**

Dans `src/components/panels/layers/LayerRow.tsx` :

1. Ajouter en haut : `import { useState } from 'react'` et `import { LayerNameInput } from './LayerNameInput'`.

2. Ajouter `const { selectLayer, renameLayer } = useLayers()` (remplace celui existant si besoin).

3. Ajouter un état local `isEditing` :

```ts
const [isEditing, setIsEditing] = useState(false)
```

4. Remplacer le `<span>` du nom par un conditionnel :

```tsx
{isEditing ? (
  <LayerNameInput
    initial={obj.name}
    onCommit={(v) => { renameLayer(obj.id, v); setIsEditing(false) }}
    onCancel={() => setIsEditing(false)}
  />
) : (
  <span
    onDoubleClick={(e) => { e.stopPropagation(); setIsEditing(true) }}
    className={`text-xs truncate flex-1 ${isGroup ? 'text-white/90 font-medium' : 'text-white/70'} ${
      !obj.name ? 'italic text-white/50' : ''
    }`}
  >
    {displayName}
  </span>
)}
```

- [ ] **Step 4 : typecheck + test visuel**

```bash
npm run typecheck
```

```bash
npm run dev
```

Vérifier : double-clic sur le nom ouvre un input, Enter commit, Esc annule, blur commit. Un commit vide laisse l'auto-nom italique apparaître.

- [ ] **Step 5 : commit**

```bash
git add src/features/editor/useLayers.ts src/components/panels/layers/LayerNameInput.tsx src/components/panels/layers/LayerRow.tsx
git commit -m "feat(layers): add inline rename on double-click

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10 : Cible de sélection (cercle à droite)

Ajoute le cercle `◉`/`○` cliquable qui gère la sélection simple et multi-sélection.

**Files:**
- Modify: `src/features/editor/useLayers.ts`
- Modify: `src/components/panels/layers/LayerRowControls.tsx`

- [ ] **Step 1 : ajouter `toggleSelectionTarget` à `useLayers`**

Dans `src/features/editor/useLayers.ts`, récupérer également `selectedObjectIds` depuis le store :

En haut du hook, remplacer :

```ts
const { setSelectedObjectId, setCanvasObjects } = useEditorStore()
```

par :

```ts
const { setSelectedObjectId, setCanvasObjects, selectedObjectIds, setSelectedObjectIds } = useEditorStore()
```

Puis ajouter la méthode avant le `return` :

```ts
  const toggleSelectionTarget = useCallback((id: string, additive: boolean) => {
    const canvas = globalFabricCanvas
    if (!canvas) return
    if (!additive) {
      selectLayer(id)
      setSelectedObjectIds([id])
      return
    }
    const current = selectedObjectIds ?? []
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    setSelectedObjectIds(next)
    if (next.length === 0) {
      canvas.discardActiveObject()
      setSelectedObjectId(null)
    } else {
      const lastId = next[next.length - 1]
      selectLayer(lastId)
    }
    canvas.requestRenderAll()
  }, [selectLayer, selectedObjectIds, setSelectedObjectIds, setSelectedObjectId])
```

Ajouter au `return` :

```ts
  return { selectLayer, deleteLayer, toggleVisibility, reorderLayers, lockLayer, renameLayer, toggleSelectionTarget }
```

- [ ] **Step 2 : modifier `LayerRowControls.tsx`** — ajouter le cercle cible.

Contenu complet `src/components/panels/layers/LayerRowControls.tsx` :

```tsx
import { Eye, EyeOff, Trash2, Lock, Unlock, Circle, CircleDot } from 'lucide-react'
import { useLayers } from '@/features/editor/useLayers'
import type { CanvasObjectProps } from '@/stores/editor.store'

interface Props {
  obj: CanvasObjectProps
  isSelected: boolean
}

export function LayerRowControls({ obj, isSelected }: Props) {
  const { deleteLayer, toggleVisibility, lockLayer, toggleSelectionTarget } = useLayers()

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); toggleVisibility(obj.id) }}
        className="p-0.5 text-white/40 hover:text-white/80 transition-colors shrink-0"
        title={obj.visible ? 'Masquer' : 'Afficher'}
      >
        {obj.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3 text-white/20" />}
      </button>

      <button
        onClick={(e) => { e.stopPropagation(); lockLayer(obj.id, !obj.locked) }}
        className={`p-0.5 transition-all shrink-0 ${
          obj.locked
            ? 'text-amber-400/80 hover:text-amber-400'
            : 'text-white/30 hover:text-white/70 opacity-0 group-hover:opacity-100'
        }`}
        title={obj.locked ? 'Déverrouiller' : 'Verrouiller'}
      >
        {obj.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
      </button>

      <button
        onClick={(e) => { e.stopPropagation(); toggleSelectionTarget(obj.id, e.shiftKey || e.metaKey || e.ctrlKey) }}
        className={`p-0.5 transition-colors shrink-0 ${isSelected ? 'text-indigo-400' : 'text-white/30 hover:text-white/60'}`}
        title="Cibler / multi-sélectionner (Shift ou Cmd)"
      >
        {isSelected ? <CircleDot className="w-3 h-3" /> : <Circle className="w-3 h-3" />}
      </button>

      <button
        onClick={(e) => { e.stopPropagation(); deleteLayer(obj.id) }}
        className="p-0.5 text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all shrink-0"
        title="Supprimer"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </>
  )
}
```

- [ ] **Step 3 : propager `isSelected` depuis `LayerRow.tsx`**

Dans `src/components/panels/layers/LayerRow.tsx`, remplacer :

```tsx
<LayerRowControls obj={obj} />
```

par :

```tsx
<LayerRowControls obj={obj} isSelected={isSelected} />
```

- [ ] **Step 4 : typecheck + test visuel**

```bash
npm run typecheck
```

```bash
npm run dev
```

Vérifier : cercle plein indigo quand la row est sélectionnée ; clic simple = sélection ; Shift+clic = multi-sélection.

- [ ] **Step 5 : commit**

```bash
git add src/features/editor/useLayers.ts src/components/panels/layers/LayerRowControls.tsx src/components/panels/layers/LayerRow.tsx
git commit -m "feat(layers): add selection target circle with shift/cmd multi-select

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11 : Recherche — `useLayerFilter` + `LayerSearchBar`

Filtre l'arbre par recherche insensible à la casse et aux accents, avec préservation des ancêtres.

**Files:**
- Create: `src/features/editor/useLayerFilter.ts`
- Test: `src/features/editor/useLayerFilter.test.ts`
- Create: `src/components/panels/layers/LayerSearchBar.tsx`
- Modify: `src/components/panels/LayersPanel.tsx`

- [ ] **Step 1 : test `useLayerFilter`**

Contenu `src/features/editor/useLayerFilter.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { filterLayers, normalizeForSearch } from './useLayerFilter'
import type { CanvasObjectProps } from '@/stores/editor.store'

function make(id: string, name: string, type: CanvasObjectProps['type'] = 'rect', children?: CanvasObjectProps[]): CanvasObjectProps {
  return {
    id, type, name, visible: true, locked: false,
    x: 0, y: 0, width: 10, height: 10,
    fill: '#000', stroke: '', strokeWidth: 0, opacity: 1, angle: 0,
    flipX: false, flipY: false,
    ...(children ? { children } : {}),
  }
}

describe('normalizeForSearch', () => {
  it('met en minuscules et retire les accents', () => {
    expect(normalizeForSearch('Étoile')).toBe('etoile')
    expect(normalizeForSearch('Trâcé')).toBe('trace')
  })
})

describe('filterLayers', () => {
  const tree = [
    make('a', 'Titre'),
    make('b', '', 'group', [make('c', 'Enfant étoile'), make('d', 'Autre')]),
    make('e', 'Bannière'),
  ]

  it('retourne l\'arbre complet si query vide', () => {
    const { filtered, forceExpandedIds } = filterLayers(tree, '', [])
    expect(filtered).toEqual(tree)
    expect(forceExpandedIds.size).toBe(0)
  })

  it('filtre par nom, insensible à la casse', () => {
    const { filtered } = filterLayers(tree, 'TITRE', [])
    expect(filtered).toHaveLength(1)
    expect(filtered[0].id).toBe('a')
  })

  it('filtre insensible aux accents', () => {
    const { filtered } = filterLayers(tree, 'banniere', [])
    expect(filtered).toHaveLength(1)
    expect(filtered[0].id).toBe('e')
  })

  it('conserve les ancêtres d\'un enfant matché et force expand', () => {
    const { filtered, forceExpandedIds } = filterLayers(tree, 'étoile', [])
    expect(filtered).toHaveLength(1)
    expect(filtered[0].id).toBe('b')
    expect(filtered[0].children?.map((c) => c.id)).toEqual(['c'])
    expect(forceExpandedIds.has('b')).toBe(true)
  })

  it('utilise le label de colonne merge si le nom est une clé', () => {
    const obj = make('x', 'productTitle')
    const { filtered } = filterLayers([obj], 'titre du produit', [{ key: 'productTitle', label: 'Titre du produit' }])
    expect(filtered).toHaveLength(1)
  })

  it('utilise l\'auto-nom pour matcher un objet sans nom', () => {
    const obj = make('y', '', 'ellipse')
    const { filtered } = filterLayers([obj], 'ellipse', [])
    expect(filtered).toHaveLength(1)
  })
})
```

- [ ] **Step 2 : run test — doit échouer**

```bash
npx vitest run src/features/editor/useLayerFilter.test.ts
```

Expected : FAIL.

- [ ] **Step 3 : implémentation**

Contenu `src/features/editor/useLayerFilter.ts` :

```ts
import { useMemo } from 'react'
import { getDisplayName } from './getDisplayName'
import type { CanvasObjectProps } from '@/stores/editor.store'

export function normalizeForSearch(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

interface FilterResult {
  filtered: CanvasObjectProps[]
  forceExpandedIds: Set<string>
}

export function filterLayers(
  objects: CanvasObjectProps[],
  query: string,
  columns: { key: string; label: string }[],
): FilterResult {
  const q = normalizeForSearch(query.trim())
  if (!q) return { filtered: objects, forceExpandedIds: new Set() }

  const forceExpandedIds = new Set<string>()

  function filterNode(obj: CanvasObjectProps): CanvasObjectProps | null {
    const label = normalizeForSearch(getDisplayName(obj, columns))
    const selfMatch = label.includes(q)
    const filteredChildren = (obj.children ?? [])
      .map(filterNode)
      .filter((c): c is CanvasObjectProps => c !== null)
    if (selfMatch || filteredChildren.length > 0) {
      if (filteredChildren.length > 0) forceExpandedIds.add(obj.id)
      return filteredChildren.length > 0 || obj.children
        ? { ...obj, children: filteredChildren.length > 0 ? filteredChildren : obj.children }
        : obj
    }
    return null
  }

  const filtered = objects.map(filterNode).filter((o): o is CanvasObjectProps => o !== null)
  return { filtered, forceExpandedIds }
}

export function useLayerFilter(
  objects: CanvasObjectProps[],
  query: string,
  columns: { key: string; label: string }[],
): FilterResult {
  return useMemo(() => filterLayers(objects, query, columns), [objects, query, columns])
}
```

- [ ] **Step 4 : run test — doit passer**

```bash
npx vitest run src/features/editor/useLayerFilter.test.ts
```

Expected : PASS (7 tests).

- [ ] **Step 5 : créer `LayerSearchBar.tsx`**

Contenu `src/components/panels/layers/LayerSearchBar.tsx` :

```tsx
import { useEffect, useState } from 'react'
import { Search, X } from 'lucide-react'

interface Props {
  value: string
  onChange: (v: string) => void
}

export function LayerSearchBar({ value, onChange }: Props) {
  const [local, setLocal] = useState(value)

  useEffect(() => {
    const t = setTimeout(() => {
      if (local !== value) onChange(local)
    }, 150)
    return () => clearTimeout(t)
  }, [local, value, onChange])

  useEffect(() => { setLocal(value) }, [value])

  return (
    <div className="relative px-3 py-2">
      <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-3 h-3 text-white/30 pointer-events-none" />
      <input
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder="Rechercher dans les calques"
        className="w-full text-xs bg-black/30 border border-white/10 rounded px-6 py-1 text-white/80 outline-none focus:border-indigo-500/60 placeholder:text-white/25"
      />
      {local && (
        <button
          onClick={() => { setLocal(''); onChange('') }}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-0.5 text-white/30 hover:text-white/60"
          title="Effacer"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 6 : intégrer recherche dans `LayersPanel.tsx`**

Dans `src/components/panels/LayersPanel.tsx` :

1. Ajouter les imports :

```ts
import { LayerSearchBar } from './layers/LayerSearchBar'
import { useLayerFilter } from '@/features/editor/useLayerFilter'
```

2. Ajouter un état de recherche après `const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())` :

```ts
const [searchQuery, setSearchQuery] = useState('')
```

3. Remplacer `const displayOrder = [...canvasObjects].reverse()` par :

```ts
const { filtered, forceExpandedIds } = useLayerFilter(canvasObjects, searchQuery, columns)
const displayOrder = [...filtered].reverse()
const effectiveExpandedIds = new Set([...expandedIds, ...forceExpandedIds])
```

4. Passer `effectiveExpandedIds` à `LayerTree` au lieu de `expandedIds`.

5. Désactiver le drag pendant la recherche en conditionnant le `DndContext` :

Envelopper le `LayerTree` :

```tsx
{searchQuery ? (
  <LayerTree
    objects={displayOrder}
    selectedObjectId={selectedObjectId}
    columns={columns}
    textSegments={textSegments}
    expandedIds={effectiveExpandedIds}
    onToggleExpand={toggleExpand}
    isDraggable={false}
  />
) : (
  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
    <SortableContext items={displayOrder.map((o) => o.id)} strategy={verticalListSortingStrategy}>
      <LayerTree
        objects={displayOrder}
        selectedObjectId={selectedObjectId}
        columns={columns}
        textSegments={textSegments}
        expandedIds={effectiveExpandedIds}
        onToggleExpand={toggleExpand}
      />
    </SortableContext>
  </DndContext>
)}
```

6. Ajouter `<LayerSearchBar value={searchQuery} onChange={setSearchQuery} />` au-dessus du `<p>` qui affiche le compteur de calques.

- [ ] **Step 7 : typecheck + test visuel**

```bash
npm run typecheck
```

```bash
npm run dev
```

Vérifier : taper dans la recherche filtre les calques (test avec accents, majuscules) ; les groupes dont un enfant matche restent expandés ; clear (X) restaure l'arbre complet.

- [ ] **Step 8 : commit**

```bash
git add src/features/editor/useLayerFilter.ts src/features/editor/useLayerFilter.test.ts src/components/panels/layers/LayerSearchBar.tsx src/components/panels/LayersPanel.tsx
git commit -m "feat(layers): add search bar with accent-insensitive filtering

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12 : Drag inter-groupes — `moveLayerToGroup`

Permet de glisser un objet dans un groupe (ou d'en sortir) en le déposant sur la row du groupe.

**Files:**
- Modify: `src/features/editor/useLayers.ts`
- Modify: `src/components/panels/LayersPanel.tsx`
- Modify: `src/components/panels/layers/LayerRow.tsx`
- Modify: `src/components/panels/layers/LayerTree.tsx`

- [ ] **Step 1 : ajouter `moveLayerToGroup` à `useLayers`**

Dans `src/features/editor/useLayers.ts`, ajouter avant le `return` :

```ts
  const moveLayerToGroup = useCallback((childId: string, groupId: string | null) => {
    const canvas = globalFabricCanvas
    if (!canvas) return
    const allObjs = canvas.getObjects()
    const child = findById(allObjs, childId)
    if (!child) return
    const currentParent = findParentGroup(allObjs, childId)

    // No-op : child déjà dans le groupe cible (ou déjà top-level)
    const currentParentId = currentParent ? (currentParent as any).data?.id ?? null : null
    if (currentParentId === groupId) return

    // Retrait du parent actuel
    if (currentParent) {
      currentParent.remove(child)
      // Cleanup : si le groupe est maintenant vide, le supprimer
      if (currentParent.getObjects().length === 0) {
        canvas.remove(currentParent)
      }
    } else {
      canvas.remove(child)
    }

    // Ajout dans la cible
    if (groupId === null) {
      canvas.add(child)
    } else {
      const targetGroup = findById(allObjs, groupId)
      if (targetGroup && (targetGroup as any).type === 'group') {
        ;(targetGroup as any).add(child)
      } else {
        // Groupe cible introuvable : re-remettre en top-level par sécurité
        canvas.add(child)
      }
    }

    canvas.requestRenderAll()
    syncToStore(canvas)
  }, [])
```

Ajouter au `return` :

```ts
  return { selectLayer, deleteLayer, toggleVisibility, reorderLayers, lockLayer, renameLayer, toggleSelectionTarget, moveLayerToGroup }
```

- [ ] **Step 2 : `LayerRow.tsx` — rendre draggable y compris les enfants, et marquer les groupes comme droppable**

Dans `src/components/panels/layers/LayerRow.tsx` :

1. Importer `useDroppable` :

```ts
import { useSortable } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
```

2. Après le `useSortable`, ajouter un `useDroppable` uniquement pour les groupes :

```ts
const droppable = useDroppable({
  id: `drop-${obj.id}`,
  data: { groupId: obj.id },
  disabled: !isGroup,
})
```

3. Combiner les refs quand la row est un groupe :

```ts
const setCombinedRef = (el: HTMLElement | null) => {
  if (isDraggable) setNodeRef(el)
  if (isGroup) droppable.setNodeRef(el)
}
```

Puis remplacer `ref={isDraggable ? setNodeRef : undefined}` par `ref={setCombinedRef}`.

4. Ajouter un indicateur visuel quand la row est survolée par un drag vers elle :

```tsx
className={`flex items-center gap-1.5 py-1.5 cursor-pointer transition-colors group ${
  isSelected
    ? 'bg-indigo-500/20 border-l-2 border-indigo-500'
    : 'hover:bg-white/5 border-l-2 border-transparent'
} ${obj.locked ? 'opacity-60' : ''} ${droppable.isOver ? 'ring-2 ring-indigo-500/60' : ''}`}
```

- [ ] **Step 3 : `LayerTree.tsx` — activer le drag des enfants**

Dans `src/components/panels/layers/LayerTree.tsx`, remplacer :

```tsx
<LayerTree
  objects={[...obj.children].reverse()}
  selectedObjectId={selectedObjectId}
  columns={columns}
  textSegments={textSegments}
  expandedIds={expandedIds}
  onToggleExpand={onToggleExpand}
  depth={depth + 1}
  isDraggable={false}
/>
```

par :

```tsx
<LayerTree
  objects={[...obj.children].reverse()}
  selectedObjectId={selectedObjectId}
  columns={columns}
  textSegments={textSegments}
  expandedIds={expandedIds}
  onToggleExpand={onToggleExpand}
  depth={depth + 1}
  isDraggable
/>
```

- [ ] **Step 4 : `LayersPanel.tsx` — aplatir l'arbre, ajouter zone de drop racine, handler complet**

Dans `src/components/panels/LayersPanel.tsx` :

1. Ajouter les imports nécessaires en haut :

```ts
import { useDroppable } from '@dnd-kit/core'
import type { CanvasObjectProps } from '@/stores/editor.store'
```

2. Ajouter une fonction locale `collectAllIds` (en dehors du composant) :

```ts
function collectAllIds(objects: CanvasObjectProps[]): string[] {
  const ids: string[] = []
  for (const o of objects) {
    ids.push(o.id)
    if (o.children) ids.push(...collectAllIds(o.children))
  }
  return ids
}
```

3. Ajouter `moveLayerToGroup` au destructuring depuis `useLayers` :

```ts
const { reorderLayers, moveLayerToGroup } = useLayers()
```

4. À l'intérieur du composant `LayersPanel`, après les hooks existants, ajouter une zone droppable racine :

```ts
const rootDroppable = useDroppable({ id: 'drop-root' })
```

5. Modifier `handleDragEnd` :

```ts
const handleDragEnd = (event: DragEndEvent) => {
  const { active, over } = event
  if (!over || active.id === over.id) return

  const overId = String(over.id)
  const activeId = String(active.id)

  // Drop sur la racine (fond du panneau) → sortir du groupe
  if (overId === 'drop-root') {
    moveLayerToGroup(activeId, null)
    return
  }

  // Drop sur un header de groupe
  if (overId.startsWith('drop-')) {
    const groupId = overId.slice(5)
    if (groupId !== activeId) moveLayerToGroup(activeId, groupId)
    return
  }

  // Réordonnancement top-level (si les deux sont top-level)
  const oldIndex = displayOrder.findIndex((o) => o.id === activeId)
  const newIndex = displayOrder.findIndex((o) => o.id === overId)
  if (oldIndex < 0 || newIndex < 0) return  // enfant de groupe ou cible invalide
  const newDisplay = arrayMove(displayOrder, oldIndex, newIndex)
  setCanvasObjects([...newDisplay].reverse())
  reorderLayers(newDisplay.map((o) => o.id))
}
```

6. Passer tous les ids au `SortableContext` (top-level + enfants de groupes) :

```tsx
<SortableContext items={collectAllIds(displayOrder)} strategy={verticalListSortingStrategy}>
```

7. Envelopper le rendu de l'arbre dans un `div` attaché à `rootDroppable.setNodeRef` avec un padding-bottom pour créer une zone cliquable hors des rows. Remplacer le bloc `<SortableContext>...</SortableContext>` (dans la branche `!searchQuery`) par :

```tsx
<div ref={rootDroppable.setNodeRef} className={`pb-12 ${rootDroppable.isOver ? 'bg-white/5' : ''}`}>
  <SortableContext items={collectAllIds(displayOrder)} strategy={verticalListSortingStrategy}>
    <LayerTree
      objects={displayOrder}
      selectedObjectId={selectedObjectId}
      columns={columns}
      textSegments={textSegments}
      expandedIds={effectiveExpandedIds}
      onToggleExpand={toggleExpand}
    />
  </SortableContext>
</div>
```

- [ ] **Step 5 : typecheck + test visuel**

```bash
npm run typecheck
```

```bash
npm run dev
```

Vérifier : glisser un objet top-level sur la row d'un groupe → insère dans le groupe. Glisser un enfant de groupe hors (sur un autre objet top-level) → `arrayMove` dans le nouveau contexte. Glisser un enfant de groupe vers la zone vide sous la liste ne fait rien (attendu). Vider un groupe via drag out supprime le groupe.

Note : il est normal que ce comportement ait des limites (drop uniquement sur header, pas d'insertion entre enfants de groupes différents). C'est volontairement scopé.

- [ ] **Step 6 : commit**

```bash
git add src/features/editor/useLayers.ts src/components/panels/LayersPanel.tsx src/components/panels/layers/LayerRow.tsx src/components/panels/layers/LayerTree.tsx
git commit -m "feat(layers): drag objects into/out of groups via panel

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 13 : Nettoyage de `selectedObjectIds` après mutation

Assure que la multi-sélection reste cohérente quand un objet est supprimé ou déplacé.

**Files:**
- Modify: `src/features/editor/useLayers.ts`

- [ ] **Step 1 : nettoyer `selectedObjectIds` dans `deleteLayer` et `moveLayerToGroup`**

Dans `src/features/editor/useLayers.ts`, modifier `deleteLayer` pour retirer l'id de `selectedObjectIds` :

```ts
const deleteLayer = useCallback((id: string) => {
  const canvas = globalFabricCanvas
  if (!canvas) return
  const allObjs = canvas.getObjects()
  const topLevel = allObjs.find((o) => (o as any).data?.id === id)
  if (topLevel) {
    canvas.remove(topLevel)
    canvas.discardActiveObject()
    canvas.requestRenderAll()
    syncToStore(canvas)
    setSelectedObjectId(null)
    setSelectedObjectIds((selectedObjectIds ?? []).filter((x) => x !== id))
    return
  }
  const parentGroup = findParentGroup(allObjs, id)
  if (parentGroup) {
    const child = parentGroup.getObjects().find((c) => (c as any).data?.id === id)
    if (child) {
      parentGroup.remove(child)
      canvas.requestRenderAll()
      syncToStore(canvas)
      setSelectedObjectIds((selectedObjectIds ?? []).filter((x) => x !== id))
    }
  }
}, [setSelectedObjectId, setSelectedObjectIds, selectedObjectIds])
```

Laisser `moveLayerToGroup` tel quel — `selectedObjectIds` reste valide puisque l'objet existe toujours.

- [ ] **Step 2 : typecheck + test visuel**

```bash
npm run typecheck
```

```bash
npm run dev
```

Vérifier : sélectionner plusieurs objets via Shift+clic sur les cercles cible, puis en supprimer un → la multi-sélection se met à jour correctement.

- [ ] **Step 3 : commit**

```bash
git add src/features/editor/useLayers.ts
git commit -m "fix(layers): prune selectedObjectIds after delete

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 14 : Validation globale

- [ ] **Step 1 : lancer toute la suite de tests**

```bash
npx vitest run src/features/editor/getAutoName.test.ts src/features/editor/getDisplayName.test.ts src/features/editor/getLayerSwatchColor.test.ts src/features/editor/useLayerFilter.test.ts
```

Expected : tous les tests passent.

- [ ] **Step 2 : typecheck complet**

```bash
npm run typecheck
```

Expected : 0 erreur.

- [ ] **Step 3 : build de production**

```bash
npm run build
```

Expected : build OK, pas de nouveau warning.

- [ ] **Step 4 : checklist manuelle en navigateur**

Ouvrir `npm run dev` puis tester dans l'ordre :

- [ ] Créer un rectangle → affiche `<Rectangle>` en italique
- [ ] Double-clic sur le nom → ouvre input, Enter commit, Esc annule
- [ ] Clic cadenas → grise la row, drag canvas impossible
- [ ] Clic cadenas à nouveau → rétablit
- [ ] Masquer un objet via l'œil → objet disparaît sur canvas
- [ ] Shift+clic sur cercle cible → multi-sélection
- [ ] Taper "rec" dans la recherche → ne montre que les rectangles
- [ ] Glisser un objet top-level sur un groupe → l'objet entre dans le groupe
- [ ] Glisser un enfant de groupe hors → remonte en top-level ; groupe vide disparaît
- [ ] Supprimer un objet sélectionné en multi → multi-sélection se met à jour

- [ ] **Step 5 : aucun commit supplémentaire nécessaire ici** — les commits précédents couvrent tout le travail.
