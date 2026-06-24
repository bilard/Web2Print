# Connecteurs de champs IDML (Phase B) — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre visible « ce bloc ↔ quel champ » pour les blocs balisés IDML (qui portent `data.mergeFields: string[]` et parfois `data.ecImageField: string`), via 4 affichages : panneau de droite, tooltip au survol, badge permanent (toggle), liste globale.

**Architecture:** Tout est alimenté par `data.mergeFields`/`data.ecImageField` déjà posés à l'import (Phase A). Additif, ne touche ni le parser, ni le merge, ni la persistance. Overlays canvas en React (pattern `TransformBadge` : `getBoundingRect` + `viewportTransform`), pas d'objets Fabric ajoutés. Marche **même sans source data connectée**.

**Tech Stack:** React + Zustand (`ui.store`, `editor.store`), Fabric.js (lecture seule), Tailwind par tokens, Lucide.

## Global Constraints

- TypeScript strict, pas d'`any` nu (caster les accès `data` non typés via `(o as any).data` comme le code existant). `npx tsc -b` clean ; `npm run build` OK ; `npx knip` exit 0.
- **Ne jamais modifier** `src/components/ui/**`, `src/lib/firebase/config.ts`, `public/fonts/`.
- Théming par tokens : `bg-surface`, `bg-well`, `border-white/10`, `text-white/*` ; blanc vrai sur fond coloré = `text-[#fff]` ; accent `#6366f1` (classe `bg-accent`/`text-indigo-400` selon l'existant) ; pas d'hex sombre en dur.
- Pas de test unitaire de composant (convention projet : aucun test de composant React) → validation par `tsc -b` + `npm run build`.
- Accès profond à l'objet sélectionné (les blocs vivent souvent dans des groupes) : `collectObjectsDeep(canvas.getObjects()).find((o) => (o as any).data?.id === id)` — JAMAIS `canvas.getObjects().find(...)` (shallow).
- Lecture des champs : `const fields = ((o as any).data?.mergeFields as string[] | undefined) ?? []` ; `const img = (o as any).data?.ecImageField as string | undefined`.

---

### Task 1 : Toggle d'affichage des connecteurs (store + bouton)

**Files:**
- Modify: `src/stores/ui.store.ts`
- Modify: `src/components/panels/EditorFooter.tsx`

**Interfaces:**
- Produces: `useUIStore` expose `showMergeBadges: boolean` (défaut `true`) + `setShowMergeBadges(v: boolean): void` (pattern identique à `gridVisible`/`setGridVisible`).

- [ ] **Step 1: Ajouter l'état au store**

Dans `src/stores/ui.store.ts`, à l'interface `UIState` (près de `gridVisible: boolean`) :

```typescript
  showMergeBadges: boolean
```
et près de `setGridVisible` :
```typescript
  setShowMergeBadges: (v: boolean) => void
```
Dans `create<UIState>((set) => ({ … }))`, init (près de `gridVisible: false`) :
```typescript
  showMergeBadges: true,
```
et action (près de `setGridVisible`) :
```typescript
  setShowMergeBadges: (showMergeBadges) => set({ showMergeBadges }),
```

- [ ] **Step 2: Ajouter le bouton dans le footer**

Dans `src/components/panels/EditorFooter.tsx`, ajouter `Link2` à l'import `lucide-react`, lire le store, et ajouter le bouton après celui de « Snap » (même style que les boutons Grid/Snap existants) :

```tsx
const showMergeBadges = useUIStore((s) => s.showMergeBadges)
const setShowMergeBadges = useUIStore((s) => s.setShowMergeBadges)
```
```tsx
<button
  onClick={() => setShowMergeBadges(!showMergeBadges)}
  title="Afficher les connecteurs de champs IDML"
  aria-pressed={showMergeBadges}
  className={`p-1 rounded transition-colors ${showMergeBadges ? 'text-indigo-400 bg-indigo-500/10' : 'text-white/30 hover:text-white hover:bg-white/10'}`}
>
  <Link2 className="w-3.5 h-3.5" />
</button>
```

- [ ] **Step 3: Vérifier**

Run: `npx tsc -b` ; `npm run build`
Expected: clean + build OK.

- [ ] **Step 4: Commit**

```bash
git add src/stores/ui.store.ts src/components/panels/EditorFooter.tsx
git commit -m "feat(editor): toggle d'affichage des connecteurs IDML (showMergeBadges)"
```

---

### Task 2 : Section « Connecteurs IDML » dans le panneau de droite

Répond directement à « où je vois le lien » : sélectionner un bloc → voir son/ses champ(s).

**Files:**
- Create: `src/components/panels/MergeConnectorSection.tsx`
- Modify: `src/components/panels/PropertiesPanel.tsx`

**Interfaces:**
- Consumes: `globalFabricCanvas` (`@/features/editor/CanvasContainer`), `collectObjectsDeep` (`@/features/editor/deepObjects`), `selectedObjectId` (`useEditorStore`).
- Produces: `export function MergeConnectorSection({ selectedObjectId }: { selectedObjectId: string | null }): JSX.Element | null`.

- [ ] **Step 1: Créer le composant**

```tsx
// src/components/panels/MergeConnectorSection.tsx
import { Link2 } from 'lucide-react'
import { globalFabricCanvas } from '@/features/editor/CanvasContainer'
import { collectObjectsDeep } from '@/features/editor/deepObjects'

export function MergeConnectorSection({ selectedObjectId }: { selectedObjectId: string | null }) {
  const canvas = globalFabricCanvas
  if (!canvas || !selectedObjectId) return null
  const obj = collectObjectsDeep(canvas.getObjects()).find((o) => (o as any).data?.id === selectedObjectId)
  if (!obj) return null
  const fields = ((obj as any).data?.mergeFields as string[] | undefined) ?? []
  const imageField = (obj as any).data?.ecImageField as string | undefined
  if (fields.length === 0 && !imageField) return null

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold text-white/40 uppercase tracking-wider">
        <Link2 className="w-3 h-3" /> Connecteur IDML
      </div>
      <div className="flex flex-col gap-1">
        {fields.map((f) => (
          <div key={f} className="flex items-center gap-2 text-[12px] text-white/80 bg-well rounded px-2 py-1">
            <span className="text-indigo-400">▸</span> {f}
          </div>
        ))}
        {imageField && (
          <div className="flex items-center gap-2 text-[12px] text-white/80 bg-well rounded px-2 py-1">
            <span className="text-indigo-400">▸</span> {imageField} <span className="text-white/40">(image)</span>
          </div>
        )}
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Monter dans PropertiesPanel**

Dans `src/components/panels/PropertiesPanel.tsx`, importer le composant et le rendre juste avant la section « Arranger » (toujours visible, tout type d'objet). Récupérer `selectedObjectId` depuis le store déjà lu dans le composant :

```tsx
import { MergeConnectorSection } from './MergeConnectorSection'
```
```tsx
<MergeConnectorSection selectedObjectId={selectedObjectId} />
{/* …la <Section title="Arranger"> existante suit… */}
```

> Si `selectedObjectId` n'est pas déjà dans le scope, le lire :
> `const selectedObjectId = useEditorStore((s) => s.selectedObjectId)` (déjà utilisé dans ce fichier).

- [ ] **Step 3: Vérifier**

Run: `npx tsc -b` ; `npm run build`
Expected: clean + build OK.

- [ ] **Step 4: Commit**

```bash
git add src/components/panels/MergeConnectorSection.tsx src/components/panels/PropertiesPanel.tsx
git commit -m "feat(panels): section Connecteur IDML (champ lié au bloc sélectionné)"
```

---

### Task 3 : Overlay canvas — tooltip au survol + badges permanents

Un seul composant : si `showMergeBadges` → un badge discret sur **chaque** bloc balisé ; et au survol d'un bloc balisé → un tooltip détaillé (toujours, indépendamment du toggle).

**Files:**
- Create: `src/components/canvas/MergeConnectorOverlay.tsx`
- Modify: `src/features/editor/CanvasContainer.tsx` (montage, près de `<TransformBadge … />`)

**Interfaces:**
- Consumes: `canvas` (Fabric `Canvas | null`, = `canvasReady`), `useUIStore` (`showMergeBadges`).
- Produces: `export function MergeConnectorOverlay({ canvas }: { canvas: Canvas | null }): JSX.Element | null`.

- [ ] **Step 1: Créer le composant**

```tsx
// src/components/canvas/MergeConnectorOverlay.tsx
import { useEffect, useState } from 'react'
import type { Canvas, FabricObject } from 'fabric'
import { useUIStore } from '@/stores/ui.store'
import { collectObjectsDeep } from '@/features/editor/deepObjects'

function fieldsOf(o: FabricObject): string[] {
  const f = ((o as any).data?.mergeFields as string[] | undefined) ?? []
  const img = (o as any).data?.ecImageField as string | undefined
  return img ? [...f, `${img} (image)`] : f
}
function screenPos(canvas: Canvas, o: FabricObject) {
  const rect = o.getBoundingRect()
  const vt = canvas.viewportTransform ?? [1, 0, 0, 1, 0, 0]
  const zoom = canvas.getZoom()
  return { x: (rect.left + rect.width / 2) * zoom + vt[4], top: rect.top * zoom + vt[5] }
}

export function MergeConnectorOverlay({ canvas }: { canvas: Canvas | null }) {
  const showMergeBadges = useUIStore((s) => s.showMergeBadges)
  const [hovered, setHovered] = useState<FabricObject | null>(null)
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!canvas) return
    const over = (e: { target?: FabricObject }) => { if (e.target && fieldsOf(e.target).length) setHovered(e.target) }
    const out = () => setHovered(null)
    const redraw = () => setTick((n) => n + 1)
    canvas.on('mouse:over', over)
    canvas.on('mouse:out', out)
    canvas.on('after:render', redraw) // suit pan/zoom/déplacement
    return () => { canvas.off('mouse:over', over); canvas.off('mouse:out', out); canvas.off('after:render', redraw) }
  }, [canvas])

  if (!canvas) return null
  const tagged = showMergeBadges
    ? collectObjectsDeep(canvas.getObjects()).filter((o) => fieldsOf(o).length > 0)
    : []

  return (
    <>
      {tagged.map((o) => {
        const p = screenPos(canvas, o)
        const f = fieldsOf(o)
        return (
          <div key={(o as any).data?.id ?? Math.random()} className="absolute z-20 -translate-x-1/2 pointer-events-none"
            style={{ left: p.x, top: p.top - 8 }}>
            <span className="px-1.5 py-0.5 rounded bg-indigo-600/80 text-[#fff] text-[9px] whitespace-nowrap shadow">
              {f.length > 1 ? `${f.length} champs` : f[0]}
            </span>
          </div>
        )
      })}
      {hovered && (() => {
        const p = screenPos(canvas, hovered)
        return (
          <div className="absolute z-30 -translate-x-1/2 pointer-events-none" style={{ left: p.x, top: p.top - 26 }}>
            <span className="px-2 py-1 rounded-md bg-indigo-700 text-[#fff] text-[11px] whitespace-nowrap shadow-lg">
              {fieldsOf(hovered).join(' · ')}
            </span>
          </div>
        )
      })()}
    </>
  )
}
```

- [ ] **Step 2: Monter dans CanvasContainer**

Dans `src/features/editor/CanvasContainer.tsx`, près de `<TransformBadge canvas={canvasReady} />` :

```tsx
import { MergeConnectorOverlay } from '@/components/canvas/MergeConnectorOverlay'
```
```tsx
<TransformBadge canvas={canvasReady} />
<MergeConnectorOverlay canvas={canvasReady} />
```

- [ ] **Step 3: Vérifier**

Run: `npx tsc -b` ; `npm run build`
Expected: clean + build OK.

- [ ] **Step 4: Commit**

```bash
git add src/components/canvas/MergeConnectorOverlay.tsx src/features/editor/CanvasContainer.tsx
git commit -m "feat(canvas): badges + tooltip des connecteurs IDML (toggle/survol)"
```

---

### Task 4 : Liste globale des blocs balisés (panneau Données)

Complémentaire à « LIAISONS ACTIVES » (qui est connecté-only et basée sur `templateText`) : liste **tous** les blocs portant `data.mergeFields`/`ecImageField`, même déconnecté ; clic → sélectionne le bloc.

**Files:**
- Create: `src/features/merge/TaggedBlocksList.tsx`
- Modify: `src/features/merge/DataMergePanel.tsx` (montage, près de la section liaisons)

**Interfaces:**
- Consumes: `globalFabricCanvas`, `collectObjectsDeep`, `useEditorStore` (`setSelectedObjectId`).
- Produces: `export function TaggedBlocksList(): JSX.Element | null`.

- [ ] **Step 1: Créer le composant**

```tsx
// src/features/merge/TaggedBlocksList.tsx
import { Link2 } from 'lucide-react'
import { globalFabricCanvas } from '@/features/editor/CanvasContainer'
import { collectObjectsDeep } from '@/features/editor/deepObjects'
import { useEditorStore } from '@/stores/editor.store'

export function TaggedBlocksList() {
  const setSelectedObjectId = useEditorStore((s) => s.setSelectedObjectId)
  const canvas = globalFabricCanvas
  if (!canvas) return null
  const blocks = collectObjectsDeep(canvas.getObjects())
    .map((o) => {
      const fields = ((o as any).data?.mergeFields as string[] | undefined) ?? []
      const img = (o as any).data?.ecImageField as string | undefined
      const all = img ? [...fields, `${img} (image)`] : fields
      return { id: (o as any).data?.id as string | undefined, fields: all }
    })
    .filter((b) => b.id && b.fields.length > 0)
  if (blocks.length === 0) return null

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold text-white/40 uppercase tracking-wider px-1">
        <Link2 className="w-3 h-3" /> Blocs balisés IDML ({blocks.length})
      </div>
      {blocks.map((b) => (
        <button key={b.id} onClick={() => setSelectedObjectId(b.id!)}
          className="flex items-center gap-2 text-left text-[12px] text-white/80 hover:bg-white/5 rounded px-2 py-1">
          <span className="text-indigo-400">▸</span> {b.fields.join(' · ')}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Monter dans DataMergePanel**

Dans `src/features/merge/DataMergePanel.tsx`, importer et rendre `<TaggedBlocksList />` près de la section des liaisons (au-dessus ou en dessous de « LIAISONS ACTIVES »). Confirmer le nom exact du setter de sélection dans `editor.store` (`setSelectedObjectId`) au câblage.

```tsx
import { TaggedBlocksList } from './TaggedBlocksList'
```
```tsx
<TaggedBlocksList />
```

- [ ] **Step 3: Vérifier**

Run: `npx tsc -b` ; `npm run build` ; `npx knip`
Expected: clean, build OK, knip exit 0 (les 4 nouveaux composants sont montés/consommés).

- [ ] **Step 4: Commit**

```bash
git add src/features/merge/TaggedBlocksList.tsx src/features/merge/DataMergePanel.tsx
git commit -m "feat(merge): liste globale des blocs balisés IDML (sélection au clic)"
```

---

## Self-review

- **Couverture spec** (4 connecteurs) : panneau de droite (T2) ✓ ; tooltip survol (T3) ✓ ; badge
  permanent + toggle (T1+T3) ✓ ; liste globale (T4) ✓. Tous alimentés par `data.mergeFields`/
  `ecImageField`, indépendants de la connexion data ✓.
- **Placeholders** : aucun ; code réel pour chaque composant.
- **Cohérence des types** : `showMergeBadges`/`setShowMergeBadges` (T1) consommés par T3 ;
  `MergeConnectorSection` (T2) monté dans PropertiesPanel ; `MergeConnectorOverlay` (T3) monté
  dans CanvasContainer ; `TaggedBlocksList` (T4) dans DataMergePanel. Accès objet via
  `collectObjectsDeep` partout (profondeur groupes).

## Points à vérifier à l'implémentation

- **`setSelectedObjectId`** (T4) : confirmer le nom exact dans `editor.store.ts` (et qu'il
  sélectionne bien l'objet sur le canvas). Si la sélection passe par une autre API
  (`useEditorStore.getState().selectObject(...)`), l'utiliser.
- **`after:render`** (T3) : sert à repositionner les badges au pan/zoom/déplacement. Si trop
  fréquent (perf), remplacer par les events `object:moving`/`mouse:wheel`/`after:render` ciblés.
- **`mouse:over`/`mouse:out`** : events Fabric standard ; `e.target` est l'objet survolé. Le
  survol d'un objet dans un groupe peut cibler le groupe — vérifier que `fieldsOf` lit le bon
  niveau (le groupe ou l'enfant). Si nécessaire, descendre via `collectObjectsDeep` au hover.
- **`bg-accent`/`text-indigo-400`** : utiliser la classe d'accent réellement disponible dans le
  projet (cf. tailwind.config) ; sinon `bg-[#6366f1]`.
