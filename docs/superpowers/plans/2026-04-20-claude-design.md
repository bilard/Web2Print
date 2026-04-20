# Claude Design — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à l'utilisateur de demander à Claude de générer affiches / flyers / POS / PLV directement dans le canvas Web2Print, avec rendu SVG print-ready (300 DPI, fonds perdus et traits de coupe optionnels à la InDesign).

**Architecture:** Claude Opus 4.6 génère un SVG vectoriel strictement conforme à un schéma Zod (tool-use forcé via le `llmRouter.ts` existant), le SVG est assaini, parsé via `parseSvgToFabric` existant puis injecté sur le canvas Fabric. Un nouveau module print (`features/print/`) gère les conversions mm/px à 300 DPI et le rendu des traits de coupe / hirondelles / zone de sécurité comme objets Fabric non-sélectionnables sur un calque dédié. Une UI type InDesign permet de basculer fonds perdus on/off et d'afficher / masquer les repères.

**Tech Stack:** TypeScript strict, React 18, Zustand v4, Fabric.js v6, Zod, Vitest, Tailwind v3, shadcn/ui, Claude Opus 4.6 via `llmRouter`

**Portée exclue (phase 2) :**
- Remplacement automatique des `image-slot` via Nano Banana (le placeholder sera rendu comme rect neutre, remplaçable manuellement par le DAM existant)
- Export print direct (PDF avec traits de coupe embarqués) — l'export existant sera étendu dans un plan séparé
- Cache de générations Firestore (chaque `/design` est one-shot dans ce plan)

---

## Glossaire technique print

| Terme | Définition | Valeur standard |
|---|---|---|
| DPI | Dots per inch — densité de points print | 300 pour offset |
| Fond perdu (bleed) | Débord qui sera coupé à la finition | 3 mm tout autour |
| Trait de coupe (crop mark) | Repère noir aux 4 coins indiquant où couper | 5 mm longueur, à 3 mm du bord |
| Hirondelles | Autre nom des traits de coupe, ou repères colorimétriques centrés | — |
| Zone de sécurité (safe area) | Marge interne où placer les éléments critiques | 5 mm du bord final |
| Format fini | Dimensions après coupe | ex. A4 = 210×297 mm |
| Format à imprimer | Format fini + fond perdu | A4 + bleed = 216×303 mm |

**Conversion mm → px @ 300 DPI :**
`px = mm × 300 / 25.4 ≈ mm × 11.811`

---

## File Structure

**Créés :**
```
src/features/print/
├── dimensions.ts                  # mm/inch/px conversions + format presets
├── dimensions.test.ts
├── printMarks.ts                  # génération d'objets Fabric pour traits de coupe + bleed
├── printMarks.test.ts
└── PRINT_FORMATS.ts               # catalogue A4/A3/flyer/POS/custom

src/features/ai-design/
├── designSchema.ts                # Zod schema + JSON schema pour Claude
├── designPrompt.ts                # builder de prompt système + user
├── designPrompt.test.ts
├── sanitizeSvg.ts                 # nettoyage sécurité du SVG renvoyé par Claude
├── sanitizeSvg.test.ts
├── fontsValidator.ts              # vérifie que les fonts référencées sont disponibles
├── fontsValidator.test.ts
├── useGenerateDesign.ts           # hook React : orchestration complète
├── DesignPromptPanel.tsx          # panneau gauche : prompt + format + bouton Générer
├── FormatSelector.tsx             # select de formats + custom
├── PrintSettingsPanel.tsx         # toggle bleed + crop marks + DPI
└── types.ts                       # types partagés (DesignFormat, BleedConfig…)
```

**Modifiés :**
```
src/stores/ui.store.ts                      # ajout dpi, bleed, showPrintMarks + setters
src/features/ai/llmRouter.ts                # ajout tâche 'design.generate'
src/features/editor/CanvasContainer.tsx     # hook de re-render des marks quand dimensions/bleed changent
src/app/App.tsx                             # mount du DesignPromptPanel dans la sidebar gauche
```

---

## Part A — Print infrastructure (fondations)

### Task 1 : Conversions dimensions & catalogue de formats

**Files:**
- Create: `src/features/print/dimensions.ts`
- Create: `src/features/print/dimensions.test.ts`
- Create: `src/features/print/PRINT_FORMATS.ts`

- [ ] **Step 1.1 : Écrire le test pour les conversions mm/px à 300 DPI**

`src/features/print/dimensions.test.ts` :

```typescript
import { describe, it, expect } from 'vitest'
import { mmToPx, pxToMm, inchToPx, pxToInch } from './dimensions'

describe('dimensions @ 300 DPI', () => {
  it('convertit A4 largeur (210 mm) en pixels', () => {
    expect(mmToPx(210, 300)).toBeCloseTo(2480.31, 1)
  })

  it('convertit A4 hauteur (297 mm) en pixels', () => {
    expect(mmToPx(297, 300)).toBeCloseTo(3507.87, 1)
  })

  it('pxToMm inverse exactement mmToPx', () => {
    const mm = 210
    expect(pxToMm(mmToPx(mm, 300), 300)).toBeCloseTo(mm, 5)
  })

  it('convertit 1 pouce en 300 px à 300 DPI', () => {
    expect(inchToPx(1, 300)).toBe(300)
  })

  it('convertit 300 px en 1 pouce à 300 DPI', () => {
    expect(pxToInch(300, 300)).toBe(1)
  })

  it('gère DPI écran standard (96)', () => {
    expect(mmToPx(25.4, 96)).toBeCloseTo(96, 5)
  })

  it('rejette DPI ≤ 0', () => {
    expect(() => mmToPx(100, 0)).toThrow(/DPI/)
    expect(() => mmToPx(100, -1)).toThrow(/DPI/)
  })
})
```

- [ ] **Step 1.2 : Lancer le test pour vérifier qu'il échoue**

```bash
npx vitest run src/features/print/dimensions.test.ts
```

Expected: FAIL — `Cannot find module './dimensions'`

- [ ] **Step 1.3 : Implémenter `dimensions.ts`**

`src/features/print/dimensions.ts` :

```typescript
/**
 * Conversions d'unités print.
 * Standard : 1 pouce = 25.4 mm. À 300 DPI → 300 px/pouce → ~11.811 px/mm.
 */

const MM_PER_INCH = 25.4

function assertDpi(dpi: number): void {
  if (!Number.isFinite(dpi) || dpi <= 0) {
    throw new Error(`DPI invalide : ${dpi}. Doit être > 0.`)
  }
}

export function mmToPx(mm: number, dpi: number): number {
  assertDpi(dpi)
  return (mm * dpi) / MM_PER_INCH
}

export function pxToMm(px: number, dpi: number): number {
  assertDpi(dpi)
  return (px * MM_PER_INCH) / dpi
}

export function inchToPx(inch: number, dpi: number): number {
  assertDpi(dpi)
  return inch * dpi
}

export function pxToInch(px: number, dpi: number): number {
  assertDpi(dpi)
  return px / dpi
}
```

- [ ] **Step 1.4 : Vérifier que les tests passent**

```bash
npx vitest run src/features/print/dimensions.test.ts
```

Expected: PASS (7 tests)

- [ ] **Step 1.5 : Écrire le catalogue de formats**

`src/features/print/PRINT_FORMATS.ts` :

```typescript
export interface PrintFormat {
  id: string
  label: string
  widthMm: number
  heightMm: number
  category: 'paper' | 'flyer' | 'poster' | 'pos' | 'custom'
}

export const PRINT_FORMATS: PrintFormat[] = [
  // Papiers standards
  { id: 'a3',     label: 'A3 (297 × 420 mm)',  widthMm: 297, heightMm: 420, category: 'paper' },
  { id: 'a4',     label: 'A4 (210 × 297 mm)',  widthMm: 210, heightMm: 297, category: 'paper' },
  { id: 'a5',     label: 'A5 (148 × 210 mm)',  widthMm: 148, heightMm: 210, category: 'paper' },
  { id: 'a6',     label: 'A6 (105 × 148 mm)',  widthMm: 105, heightMm: 148, category: 'paper' },

  // Flyers
  { id: 'flyer-dl',     label: 'Flyer DL (99 × 210 mm)',      widthMm: 99,  heightMm: 210, category: 'flyer' },
  { id: 'flyer-square', label: 'Flyer carré (148 × 148 mm)',  widthMm: 148, heightMm: 148, category: 'flyer' },

  // Affiches
  { id: 'affiche-40x60', label: 'Affiche 40 × 60 cm', widthMm: 400, heightMm: 600, category: 'poster' },
  { id: 'affiche-60x80', label: 'Affiche 60 × 80 cm', widthMm: 600, heightMm: 800, category: 'poster' },

  // POS / PLV
  { id: 'pos-a6-counter',  label: 'PLV comptoir A6',         widthMm: 105, heightMm: 148, category: 'pos' },
  { id: 'pos-shelf-talker', label: 'Réglette de rayon',      widthMm: 200, heightMm: 40,  category: 'pos' },
  { id: 'pos-wobbler',     label: 'Stop-rayon wobbler',      widthMm: 80,  heightMm: 80,  category: 'pos' },
]

export const DEFAULT_FORMAT_ID = 'a4'

export function getFormatById(id: string): PrintFormat | undefined {
  return PRINT_FORMATS.find((f) => f.id === id)
}
```

- [ ] **Step 1.6 : Commit**

```bash
git add src/features/print/dimensions.ts src/features/print/dimensions.test.ts src/features/print/PRINT_FORMATS.ts
git commit -m "feat(print): add mm/px conversions @ 300 DPI + format catalog"
```

---

### Task 2 : Extension du UI store pour l'état print

**Files:**
- Modify: `src/stores/ui.store.ts`

- [ ] **Step 2.1 : Ajouter les types et champs dans `UIState`**

Ouvrir `src/stores/ui.store.ts:8-44` et ajouter dans l'interface `UIState`, juste après `canvasBgImage: string | null` :

```typescript
  // --- Print ---
  dpi: number
  bleedMm: number
  showPrintMarks: boolean
  showSafeArea: boolean
  setDpi: (dpi: number) => void
  setBleedMm: (mm: number) => void
  setShowPrintMarks: (v: boolean) => void
  setShowSafeArea: (v: boolean) => void
```

- [ ] **Step 2.2 : Ajouter les valeurs par défaut et setters**

Dans le `create<UIState>(...)` (`src/stores/ui.store.ts:55-112`), juste avant `activeTool: 'select'`, ajouter :

```typescript
  // --- Print defaults ---
  dpi: 300,
  bleedMm: 0,
  showPrintMarks: false,
  showSafeArea: false,
  setDpi: (dpi) => set({ dpi: Math.max(72, Math.min(600, dpi)) }),
  setBleedMm: (bleedMm) => set({ bleedMm: Math.max(0, Math.min(10, bleedMm)) }),
  setShowPrintMarks: (showPrintMarks) => set({ showPrintMarks }),
  setShowSafeArea: (showSafeArea) => set({ showSafeArea }),
```

**Rationale des clamps :**
- DPI 72–600 : en dessous de 72 c'est illisible en print, au-dessus de 600 les perfs Fabric souffrent.
- Bleed 0–10 mm : 0 = pas de fond perdu, 3 mm standard offset, 5 mm standard numérique, 10 mm grand format.

- [ ] **Step 2.3 : Vérifier que le typecheck passe**

```bash
npx tsc --noEmit
```

Expected: PASS (pas d'erreur TS).

- [ ] **Step 2.4 : Commit**

```bash
git add src/stores/ui.store.ts
git commit -m "feat(print): add dpi/bleed/showPrintMarks state to UI store"
```

---

### Task 3 : Génération des repères d'impression (traits de coupe + bleed + safe area)

**Files:**
- Create: `src/features/print/printMarks.ts`
- Create: `src/features/print/printMarks.test.ts`

Cette tâche produit des objets Fabric non-sélectionnables, non-exportables par défaut, taggés via `data.isPrintMark` pour pouvoir les retrouver/supprimer/toggler.

- [ ] **Step 3.1 : Écrire les tests pour positions et marquage**

`src/features/print/printMarks.test.ts` :

```typescript
import { describe, it, expect } from 'vitest'
import { buildPrintMarks } from './printMarks'
import { Rect, Line } from 'fabric'

describe('buildPrintMarks', () => {
  const baseOpts = {
    canvasWidthPx: 2480,   // A4 à 300 DPI
    canvasHeightPx: 3508,
    bleedPx: 35.4,         // 3 mm à 300 DPI
    cropMarkLengthPx: 59,  // 5 mm à 300 DPI
    cropMarkOffsetPx: 35.4, // traits commencent au bord du bleed
    safeAreaPx: 59,        // 5 mm à 300 DPI
    showPrintMarks: true,
    showSafeArea: true,
  }

  it('retourne 0 objet si rien n\'est visible', () => {
    const objs = buildPrintMarks({ ...baseOpts, showPrintMarks: false, showSafeArea: false })
    expect(objs).toEqual([])
  })

  it('marque tous les objets avec data.isPrintMark', () => {
    const objs = buildPrintMarks(baseOpts)
    expect(objs.length).toBeGreaterThan(0)
    for (const o of objs) {
      expect((o as any).data?.isPrintMark).toBe(true)
      expect(o.selectable).toBe(false)
      expect(o.evented).toBe(false)
      expect((o as any).excludeFromExport).toBe(true)
    }
  })

  it('dessine un rect de fond perdu englobant si bleed > 0', () => {
    const objs = buildPrintMarks(baseOpts)
    const bleedRect = objs.find((o) => (o as any).data?.markType === 'bleed-rect')
    expect(bleedRect).toBeInstanceOf(Rect)
    expect(bleedRect!.left).toBeCloseTo(-baseOpts.bleedPx, 1)
    expect(bleedRect!.top).toBeCloseTo(-baseOpts.bleedPx, 1)
  })

  it('dessine 8 traits de coupe (2 par coin × 4 coins)', () => {
    const objs = buildPrintMarks(baseOpts)
    const cropLines = objs.filter((o) => (o as any).data?.markType === 'crop-mark')
    expect(cropLines).toHaveLength(8)
    for (const l of cropLines) {
      expect(l).toBeInstanceOf(Line)
    }
  })

  it('dessine un rect de zone de sécurité si showSafeArea', () => {
    const objs = buildPrintMarks(baseOpts)
    const safe = objs.find((o) => (o as any).data?.markType === 'safe-area')
    expect(safe).toBeInstanceOf(Rect)
    expect(safe!.left).toBeCloseTo(baseOpts.safeAreaPx, 1)
    expect(safe!.top).toBeCloseTo(baseOpts.safeAreaPx, 1)
  })

  it('n\'émet pas de bleed-rect si bleedPx === 0', () => {
    const objs = buildPrintMarks({ ...baseOpts, bleedPx: 0 })
    expect(objs.find((o) => (o as any).data?.markType === 'bleed-rect')).toBeUndefined()
    expect(objs.find((o) => (o as any).data?.markType === 'crop-mark')).toBeUndefined()
  })
})
```

- [ ] **Step 3.2 : Lancer les tests pour vérifier qu'ils échouent**

```bash
npx vitest run src/features/print/printMarks.test.ts
```

Expected: FAIL — `Cannot find module './printMarks'`

- [ ] **Step 3.3 : Implémenter `printMarks.ts`**

`src/features/print/printMarks.ts` :

```typescript
import { Rect, Line, type FabricObject } from 'fabric'

export interface PrintMarksOptions {
  canvasWidthPx: number
  canvasHeightPx: number
  bleedPx: number
  cropMarkLengthPx: number
  cropMarkOffsetPx: number
  safeAreaPx: number
  showPrintMarks: boolean
  showSafeArea: boolean
}

type MarkType = 'bleed-rect' | 'crop-mark' | 'safe-area'

function tag(obj: FabricObject, markType: MarkType): FabricObject {
  const o = obj as FabricObject & { data?: Record<string, unknown>; excludeFromExport?: boolean }
  o.data = { ...(o.data ?? {}), isPrintMark: true, markType }
  o.selectable = false
  o.evented = false
  o.hoverCursor = 'default'
  o.excludeFromExport = true
  return obj
}

function makeBleedRect(w: number, h: number, bleed: number): FabricObject {
  const r = new Rect({
    left: -bleed,
    top: -bleed,
    width: w + bleed * 2,
    height: h + bleed * 2,
    fill: 'transparent',
    stroke: '#ff3b30',
    strokeWidth: 1,
    strokeDashArray: [6, 4],
  })
  return tag(r, 'bleed-rect')
}

function makeCropMarks(w: number, h: number, bleed: number, length: number): FabricObject[] {
  // Les traits partent de l'extérieur du bleed et pointent VERS le coin fini (0,0 / w,0 / 0,h / w,h).
  // À chaque coin : un trait horizontal + un trait vertical.
  const color = '#000000'
  const sw = 0.5
  const offset = bleed // démarre au bord du bleed
  const lines: FabricObject[] = []

  // Coin haut-gauche : horizontal vers la gauche, vertical vers le haut
  lines.push(new Line([-offset - length, 0, -offset, 0], { stroke: color, strokeWidth: sw }))
  lines.push(new Line([0, -offset - length, 0, -offset], { stroke: color, strokeWidth: sw }))

  // Coin haut-droit
  lines.push(new Line([w + offset, 0, w + offset + length, 0], { stroke: color, strokeWidth: sw }))
  lines.push(new Line([w, -offset - length, w, -offset], { stroke: color, strokeWidth: sw }))

  // Coin bas-gauche
  lines.push(new Line([-offset - length, h, -offset, h], { stroke: color, strokeWidth: sw }))
  lines.push(new Line([0, h + offset, 0, h + offset + length], { stroke: color, strokeWidth: sw }))

  // Coin bas-droit
  lines.push(new Line([w + offset, h, w + offset + length, h], { stroke: color, strokeWidth: sw }))
  lines.push(new Line([w, h + offset, w, h + offset + length], { stroke: color, strokeWidth: sw }))

  return lines.map((l) => tag(l, 'crop-mark'))
}

function makeSafeArea(w: number, h: number, margin: number): FabricObject {
  const r = new Rect({
    left: margin,
    top: margin,
    width: w - margin * 2,
    height: h - margin * 2,
    fill: 'transparent',
    stroke: '#34c759',
    strokeWidth: 1,
    strokeDashArray: [4, 3],
  })
  return tag(r, 'safe-area')
}

export function buildPrintMarks(opts: PrintMarksOptions): FabricObject[] {
  const objs: FabricObject[] = []

  if (opts.showPrintMarks && opts.bleedPx > 0) {
    objs.push(makeBleedRect(opts.canvasWidthPx, opts.canvasHeightPx, opts.bleedPx))
    objs.push(
      ...makeCropMarks(opts.canvasWidthPx, opts.canvasHeightPx, opts.bleedPx, opts.cropMarkLengthPx),
    )
  }

  if (opts.showSafeArea && opts.safeAreaPx > 0) {
    objs.push(makeSafeArea(opts.canvasWidthPx, opts.canvasHeightPx, opts.safeAreaPx))
  }

  return objs
}
```

- [ ] **Step 3.4 : Vérifier que les tests passent**

```bash
npx vitest run src/features/print/printMarks.test.ts
```

Expected: PASS (6 tests)

- [ ] **Step 3.5 : Commit**

```bash
git add src/features/print/printMarks.ts src/features/print/printMarks.test.ts
git commit -m "feat(print): render bleed box, crop marks and safe area as Fabric overlays"
```

---

### Task 4 : Intégration des repères dans le CanvasContainer

**Files:**
- Modify: `src/features/editor/CanvasContainer.tsx`

- [ ] **Step 4.1 : Lire le fichier existant**

```bash
```

Ouvrir `src/features/editor/CanvasContainer.tsx` pour repérer :
- L'emplacement où `globalFabricCanvas` est créé
- Comment les objets sont ajoutés (pour comprendre la z-order)
- L'endroit où `useUIStore` est déjà consommé

- [ ] **Step 4.2 : Écrire un hook local pour synchroniser les marks avec le store**

Ajouter dans `src/features/editor/CanvasContainer.tsx`, juste après les imports, la fonction suivante. Ne pas dupliquer les imports déjà présents :

```typescript
// Ajouts d'imports (à fusionner avec les imports existants) :
import { buildPrintMarks } from '@/features/print/printMarks'
import { mmToPx } from '@/features/print/dimensions'
```

Puis à l'intérieur du composant `CanvasContainer`, après le `useEffect` qui initialise Fabric (ou en dernier si l'init est simple), ajouter :

```typescript
const dpi = useUIStore((s) => s.dpi)
const bleedMm = useUIStore((s) => s.bleedMm)
const showPrintMarks = useUIStore((s) => s.showPrintMarks)
const showSafeArea = useUIStore((s) => s.showSafeArea)
const canvasWidth = useUIStore((s) => s.canvasWidth)
const canvasHeight = useUIStore((s) => s.canvasHeight)

useEffect(() => {
  const canvas = globalFabricCanvas
  if (!canvas) return

  // Supprime tous les anciens marks
  const old = canvas.getObjects().filter((o: any) => o.data?.isPrintMark === true)
  for (const o of old) canvas.remove(o)

  const marks = buildPrintMarks({
    canvasWidthPx: canvasWidth,
    canvasHeightPx: canvasHeight,
    bleedPx: mmToPx(bleedMm, dpi),
    cropMarkLengthPx: mmToPx(5, dpi),
    cropMarkOffsetPx: mmToPx(bleedMm, dpi),
    safeAreaPx: mmToPx(5, dpi),
    showPrintMarks,
    showSafeArea,
  })

  for (const m of marks) canvas.add(m)

  // Repère toujours au-dessus des objets édités
  for (const m of marks) canvas.bringObjectToFront(m)

  canvas.requestRenderAll()
}, [canvasWidth, canvasHeight, dpi, bleedMm, showPrintMarks, showSafeArea])
```

- [ ] **Step 4.3 : Exclure les print-marks de `syncToStore`**

Ouvrir `src/features/editor/useAddObject.ts` (fonction `syncToStore`, à repérer via grep). Ajouter un filtre qui ignore les objets `data.isPrintMark === true` pour ne pas les sérialiser dans le store éditeur.

Grep pour localiser :

```bash
```

Utiliser la recherche Grep tool avec pattern `syncToStore` dans `src/features/editor/useAddObject.ts`. Trouver la boucle qui parcourt `canvas.getObjects()` et ajouter en tête de boucle :

```typescript
if ((obj as any).data?.isPrintMark) continue
```

- [ ] **Step 4.4 : Test manuel rapide**

```bash
npm run dev
```

Dans l'app :
1. Ouvrir les DevTools console
2. `useUIStore.getState().setBleedMm(3); useUIStore.getState().setShowPrintMarks(true)`
3. Vérifier qu'un rectangle rouge pointillé apparaît autour du canvas avec 8 petits traits noirs aux coins
4. `useUIStore.getState().setShowSafeArea(true)` → rect vert pointillé intérieur
5. `useUIStore.getState().setShowPrintMarks(false)` → tout disparaît sauf la safe area

Si un de ces comportements est KO, stop et debug avant de continuer.

- [ ] **Step 4.5 : Commit**

```bash
git add src/features/editor/CanvasContainer.tsx src/features/editor/useAddObject.ts
git commit -m "feat(print): render print marks on canvas from UI store state"
```

---

## Part B — SVG generation pipeline

### Task 5 : Sanitization du SVG renvoyé par Claude

Claude produit du SVG que l'on va injecter dans le DOM via `parseSvgToFabric` (qui appelle `loadSVGFromString` de Fabric, lui-même parseur DOM). Toute injection de `<script>`, `on*`, `xlink:href` vers un protocole non autorisé, `<foreignObject>`, etc. doit être retirée.

**Files:**
- Create: `src/features/ai-design/sanitizeSvg.ts`
- Create: `src/features/ai-design/sanitizeSvg.test.ts`

- [ ] **Step 5.1 : Écrire les tests**

`src/features/ai-design/sanitizeSvg.test.ts` :

```typescript
import { describe, it, expect } from 'vitest'
import { sanitizeSvg } from './sanitizeSvg'

describe('sanitizeSvg', () => {
  it('retire les <script>', () => {
    const dirty = `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect/></svg>`
    const clean = sanitizeSvg(dirty)
    expect(clean).not.toContain('<script')
    expect(clean).toContain('<rect')
  })

  it('retire les attributs on*', () => {
    const dirty = `<svg xmlns="http://www.w3.org/2000/svg"><rect onclick="foo()" onload="bar()"/></svg>`
    const clean = sanitizeSvg(dirty)
    expect(clean).not.toMatch(/onclick|onload/)
  })

  it('retire <foreignObject>', () => {
    const dirty = `<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><iframe/></foreignObject></svg>`
    const clean = sanitizeSvg(dirty)
    expect(clean).not.toContain('foreignObject')
    expect(clean).not.toContain('iframe')
  })

  it('rejette href javascript:', () => {
    const dirty = `<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><rect/></a></svg>`
    const clean = sanitizeSvg(dirty)
    expect(clean).not.toContain('javascript:')
  })

  it('rejette xlink:href javascript:', () => {
    const dirty = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><image xlink:href="javascript:alert(1)"/></svg>`
    const clean = sanitizeSvg(dirty)
    expect(clean).not.toContain('javascript:')
  })

  it('conserve data: URIs sur <image>', () => {
    const dirty = `<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/png;base64,iVBOR"/></svg>`
    const clean = sanitizeSvg(dirty)
    expect(clean).toContain('data:image/png;base64,iVBOR')
  })

  it('conserve placeholder: URIs (protocole custom pour image-slots)', () => {
    const dirty = `<svg xmlns="http://www.w3.org/2000/svg"><image href="placeholder:hero"/></svg>`
    const clean = sanitizeSvg(dirty)
    expect(clean).toContain('placeholder:hero')
  })

  it('throw si le SVG est invalide', () => {
    expect(() => sanitizeSvg('not svg at all')).toThrow(/SVG/)
  })

  it('throw si pas de balise racine <svg>', () => {
    expect(() => sanitizeSvg('<div></div>')).toThrow(/svg/i)
  })
})
```

- [ ] **Step 5.2 : Lancer les tests**

```bash
npx vitest run src/features/ai-design/sanitizeSvg.test.ts
```

Expected: FAIL — module introuvable.

- [ ] **Step 5.3 : Implémenter `sanitizeSvg.ts`**

`src/features/ai-design/sanitizeSvg.ts` :

```typescript
/**
 * Assainit un SVG reçu d'un LLM avant injection dans le DOM / parser Fabric.
 *
 * Stratégie conservative :
 *  - Parse DOM via DOMParser (browser-native, même contexte que Fabric)
 *  - Whitelist de tags SVG autorisés
 *  - Whitelist d'attributs (tout `on*` retiré, `style` retiré, `class` conservée)
 *  - Whitelist de protocoles pour `href` / `xlink:href` : data:, placeholder:, # (ancre interne)
 */

const ALLOWED_TAGS = new Set([
  'svg', 'g', 'defs', 'title', 'desc',
  'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path',
  'text', 'tspan', 'textPath',
  'image',
  'linearGradient', 'radialGradient', 'stop',
  'pattern', 'mask', 'clipPath', 'filter',
  'feGaussianBlur', 'feOffset', 'feMerge', 'feMergeNode', 'feFlood',
  'feComposite', 'feColorMatrix', 'feBlend', 'feDropShadow',
  'use', 'symbol', 'marker',
])

const ALLOWED_HREF_PROTOCOLS = /^(data:|placeholder:|#)/i

function isSafeHref(value: string): boolean {
  if (!value) return false
  return ALLOWED_HREF_PROTOCOLS.test(value.trim())
}

function sanitizeElement(el: Element): void {
  // Clone children list avant mutation (removeChild invalide l'itération live)
  const children = Array.from(el.children)
  for (const child of children) {
    if (!ALLOWED_TAGS.has(child.tagName.toLowerCase())) {
      child.remove()
      continue
    }
    sanitizeElement(child)
  }

  // Nettoyage attributs
  const attrs = Array.from(el.attributes)
  for (const attr of attrs) {
    const name = attr.name.toLowerCase()
    const value = attr.value

    if (name.startsWith('on')) {
      el.removeAttribute(attr.name)
      continue
    }

    if (name === 'href' || name === 'xlink:href') {
      if (!isSafeHref(value)) {
        el.removeAttribute(attr.name)
      }
      continue
    }

    // style inline peut porter url() vers javascript — on retire par précaution
    if (name === 'style' && /javascript:|expression\s*\(/i.test(value)) {
      el.removeAttribute(attr.name)
    }
  }
}

export function sanitizeSvg(svgText: string): string {
  if (typeof svgText !== 'string' || !svgText.trim()) {
    throw new Error('SVG vide ou invalide')
  }

  const parser = new DOMParser()
  const doc = parser.parseFromString(svgText, 'image/svg+xml')

  const parserError = doc.querySelector('parsererror')
  if (parserError) {
    throw new Error(`SVG malformé : ${parserError.textContent?.slice(0, 200) ?? 'inconnu'}`)
  }

  const root = doc.documentElement
  if (!root || root.tagName.toLowerCase() !== 'svg') {
    throw new Error('Racine du document n\'est pas <svg>')
  }

  sanitizeElement(root)

  return new XMLSerializer().serializeToString(doc)
}
```

- [ ] **Step 5.4 : Vérifier que les tests passent**

```bash
npx vitest run src/features/ai-design/sanitizeSvg.test.ts
```

Expected: PASS (9 tests)

- [ ] **Step 5.5 : Commit**

```bash
git add src/features/ai-design/sanitizeSvg.ts src/features/ai-design/sanitizeSvg.test.ts
git commit -m "feat(ai-design): add SVG sanitizer with tag/attr/href whitelists"
```

---

### Task 6 : Schéma Zod de sortie Claude + types partagés

**Files:**
- Create: `src/features/ai-design/designSchema.ts`
- Create: `src/features/ai-design/types.ts`

- [ ] **Step 6.1 : Écrire les types partagés**

`src/features/ai-design/types.ts` :

```typescript
export type DesignStyle = 'corporate' | 'minimaliste' | 'bold' | 'elegant' | 'playful' | 'retro'

export interface DesignRequest {
  prompt: string
  formatId: string          // id d'un PRINT_FORMAT, ou 'custom'
  customWidthMm?: number    // si formatId === 'custom'
  customHeightMm?: number
  style: DesignStyle
  includeBleed: boolean
  palette?: string[]        // hex codes optionnels imposés par l'utilisateur
}

export interface ImageSlot {
  id: string
  role: string             // 'hero' | 'background' | 'product' …
  promptSuggestion: string // ce que l'utilisateur peut envoyer à Nano Banana plus tard
}

export interface DesignResult {
  svg: string              // SVG complet, viewBox en unités internes du design
  widthMm: number          // largeur fini
  heightMm: number         // hauteur finie
  bleedMm: number          // 0 si pas demandé
  palette: string[]        // palette effectivement utilisée
  fontsUsed: string[]      // liste des font-family référencées
  slots: ImageSlot[]       // slots image détectés, à remplir via DAM/Nano Banana
  rationale: string        // courte note explicative du LLM sur les choix de design
}
```

- [ ] **Step 6.2 : Écrire le schéma Zod + JSON schema pour Claude**

`src/features/ai-design/designSchema.ts` :

```typescript
import { z } from 'zod'

export const ImageSlotSchema = z.object({
  id: z.string().min(1),
  role: z.string().min(1),
  promptSuggestion: z.string().min(1),
})

export const DesignResultSchema = z.object({
  svg: z.string().min(20).refine((s) => s.includes('<svg'), {
    message: 'Le champ svg doit contenir une balise <svg>',
  }),
  widthMm: z.number().positive().max(2000),
  heightMm: z.number().positive().max(2000),
  bleedMm: z.number().min(0).max(10),
  palette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(1).max(8),
  fontsUsed: z.array(z.string()).max(4),
  slots: z.array(ImageSlotSchema).max(8),
  rationale: z.string().min(10).max(500),
})

// Note : le type `DesignResult` est défini dans `./types.ts` comme interface
// consumer-facing. Le schéma Zod ci-dessus doit rester structurellement
// compatible avec cette interface (voir la vérification de parité dans
// useGenerateDesign.ts via le cast `as unknown as z.ZodSchema<DesignResult>`).

/**
 * JSON Schema équivalent, format attendu par Claude tool-use (`input_schema`).
 * Version manuelle car zod-to-json-schema n'est pas installé et l'ajouter
 * pour ce seul usage serait une dépendance de trop.
 */
export const DesignResultJsonSchema = {
  type: 'object',
  required: ['svg', 'widthMm', 'heightMm', 'bleedMm', 'palette', 'fontsUsed', 'slots', 'rationale'],
  properties: {
    svg: {
      type: 'string',
      description:
        'SVG complet et valide. Doit inclure <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 W H"> où W et H sont en millimètres. Pas de <script>, pas d\'handlers onXxx. Les slots images sont des <image href="placeholder:<id>"/>.',
    },
    widthMm:  { type: 'number', description: 'Largeur fini (après coupe), en mm' },
    heightMm: { type: 'number', description: 'Hauteur finie (après coupe), en mm' },
    bleedMm:  { type: 'number', description: 'Fond perdu appliqué, en mm. 0 si non demandé.' },
    palette: {
      type: 'array',
      description: 'Couleurs hex (#RRGGBB) effectivement utilisées dans le design, 1 à 8 entrées.',
      items: { type: 'string' },
    },
    fontsUsed: {
      type: 'array',
      description: 'Familles de polices référencées dans le SVG (doit être un sous-ensemble de la liste fournie)',
      items: { type: 'string' },
    },
    slots: {
      type: 'array',
      description: 'Emplacements image dans le design (un slot par <image href="placeholder:ID"/>).',
      items: {
        type: 'object',
        required: ['id', 'role', 'promptSuggestion'],
        properties: {
          id:   { type: 'string', description: 'Identifiant unique du slot, correspond à placeholder:<id> dans le SVG' },
          role: { type: 'string', description: 'Rôle du slot : hero, background, product, logo…' },
          promptSuggestion: {
            type: 'string',
            description: 'Description courte pour guider une future génération d\'image',
          },
        },
      },
    },
    rationale: {
      type: 'string',
      description: 'Justification concise (1-3 phrases) des choix de composition, hiérarchie et palette',
    },
  },
} as const
```

- [ ] **Step 6.3 : Vérifier que le typecheck passe**

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6.4 : Commit**

```bash
git add src/features/ai-design/types.ts src/features/ai-design/designSchema.ts
git commit -m "feat(ai-design): define Zod schema + JSON schema for Claude output"
```

---

### Task 7 : Builder de prompt (système + user)

**Files:**
- Create: `src/features/ai-design/designPrompt.ts`
- Create: `src/features/ai-design/designPrompt.test.ts`

Le prompt système encode toutes les contraintes print : unités, bleed, fonts disponibles, rôles sémantiques à attribuer, palette, etc.

- [ ] **Step 7.1 : Écrire les tests**

`src/features/ai-design/designPrompt.test.ts` :

```typescript
import { describe, it, expect } from 'vitest'
import { buildDesignPrompt } from './designPrompt'

describe('buildDesignPrompt', () => {
  const base = {
    userPrompt: 'Affiche promo -30% soldes été',
    widthMm: 420,
    heightMm: 594,
    formatLabel: 'A2 portrait',
    style: 'bold' as const,
    includeBleed: true,
    bleedMm: 3,
    availableFonts: ['Inter', 'Montserrat', 'Playfair Display'],
    palette: ['#ff6b35', '#1a1a1a'],
  }

  it('inclut le prompt utilisateur', () => {
    const p = buildDesignPrompt(base)
    expect(p).toContain('Affiche promo -30% soldes été')
  })

  it('inclut les dimensions en mm', () => {
    const p = buildDesignPrompt(base)
    expect(p).toContain('420')
    expect(p).toContain('594')
  })

  it('mentionne le bleed quand includeBleed=true', () => {
    const p = buildDesignPrompt(base)
    expect(p).toMatch(/fond perdu.*3\s*mm/i)
  })

  it('ne mentionne PAS de bleed quand includeBleed=false', () => {
    const p = buildDesignPrompt({ ...base, includeBleed: false })
    expect(p).not.toMatch(/fond perdu/i)
  })

  it('liste explicitement les fonts autorisées', () => {
    const p = buildDesignPrompt(base)
    expect(p).toContain('Inter')
    expect(p).toContain('Montserrat')
    expect(p).toContain('Playfair Display')
  })

  it('impose la palette si fournie', () => {
    const p = buildDesignPrompt(base)
    expect(p).toContain('#ff6b35')
    expect(p).toContain('#1a1a1a')
  })

  it('n\'impose pas de palette si omise', () => {
    const p = buildDesignPrompt({ ...base, palette: undefined })
    expect(p.toLowerCase()).toContain('libre')
  })

  it('documente les data-role attendus', () => {
    const p = buildDesignPrompt(base)
    expect(p).toContain('data-role')
    expect(p).toMatch(/title|headline/)
    expect(p).toMatch(/image-slot/)
  })

  it('inclut le style demandé', () => {
    const p = buildDesignPrompt(base)
    expect(p.toLowerCase()).toContain('bold')
  })
})
```

- [ ] **Step 7.2 : Lancer les tests**

```bash
npx vitest run src/features/ai-design/designPrompt.test.ts
```

Expected: FAIL — module introuvable.

- [ ] **Step 7.3 : Implémenter `designPrompt.ts`**

`src/features/ai-design/designPrompt.ts` :

```typescript
import type { DesignStyle } from './types'

export interface BuildDesignPromptArgs {
  userPrompt: string
  widthMm: number
  heightMm: number
  formatLabel: string
  style: DesignStyle
  includeBleed: boolean
  bleedMm: number
  availableFonts: string[]
  palette?: string[]
}

const STYLE_DESCRIPTIONS: Record<DesignStyle, string> = {
  corporate:    'sobre, professionnel, grille stricte, typographies sans-serif modernes',
  minimaliste:  'beaucoup de blanc, un seul accent coloré, typographie simple',
  bold:         'fort contraste, typographies grasses et grandes, couleurs saturées',
  elegant:      'sophistiqué, typographie serif fine, espacements généreux',
  playful:      'formes organiques, couleurs vives, composition dynamique, ludique',
  retro:        'palette vintage, typographies display, textures',
}

export function buildDesignPrompt(args: BuildDesignPromptArgs): string {
  const bleedLine = args.includeBleed
    ? `- **Fond perdu (bleed)** : ${args.bleedMm} mm à prévoir. Les éléments de fond (images, aplats de couleur) doivent déborder de ${args.bleedMm} mm au-delà du format fini pour éviter les bandes blanches à la coupe. Le viewBox doit inclure ce débord (viewBox="${-args.bleedMm} ${-args.bleedMm} ${args.widthMm + 2 * args.bleedMm} ${args.heightMm + 2 * args.bleedMm}").`
    : `- **Pas de fond perdu** : le viewBox correspond exactement au format fini (viewBox="0 0 ${args.widthMm} ${args.heightMm}").`

  const paletteLine = args.palette && args.palette.length > 0
    ? `- **Palette imposée** : utilise EXCLUSIVEMENT ces couleurs (hex) : ${args.palette.join(', ')}. Tu peux les mélanger mais pas en ajouter d'autres.`
    : `- **Palette libre** : choisis une palette de 2 à 5 couleurs cohérente avec le style "${args.style}" et le ton du message.`

  return `Tu es un directeur artistique senior spécialisé en impression (offset 300 DPI, affichage, PLV). Tu produis des designs **print-ready** en SVG vectoriel.

## Brief utilisateur
${args.userPrompt}

## Contraintes techniques ABSOLUES
- **Format** : ${args.formatLabel}, soit ${args.widthMm} × ${args.heightMm} mm (format fini après coupe).
- **Unités SVG** : millimètres. Ton viewBox est en mm, pas en pixels. Exemple : viewBox="0 0 210 297" pour un A4.
${bleedLine}
- **Zone de sécurité** : ne place aucun texte ni élément critique à moins de 5 mm du bord fini (risque de coupe).
- **Typographies autorisées** (tu ne peux référencer QUE celles-ci dans font-family) :
  ${args.availableFonts.map((f) => `  • ${f}`).join('\n')}
  Utilise maximum 2 familles différentes. Privilégie fontWeight="700" pour les titres, "400" pour le body.
${paletteLine}
- **Style demandé** : ${args.style} — ${STYLE_DESCRIPTIONS[args.style]}.

## Structure SVG attendue
Chaque élément visuel doit porter un attribut **\`data-role\`** parmi :
- \`background\`  — aplats ou images de fond
- \`title\`       — titre principal (headline)
- \`subtitle\`    — sur/sous-titre, accroche secondaire
- \`body\`        — corps de texte, paragraphes
- \`cta\`         — call-to-action (bouton, mention "Acheter", etc.)
- \`accent\`      — décoration graphique (formes, traits, motifs)
- \`image-slot\`  — emplacement d'image à remplir plus tard
- \`logo-slot\`   — emplacement logo client
- \`price\`       — mention de prix si applicable

## Slots images
Quand tu veux une image photographique (produit, lifestyle…), **NE génère PAS de raster** — place à la place :
\`<image href="placeholder:<id-unique>" x="..." y="..." width="..." height="..." data-role="image-slot" preserveAspectRatio="xMidYMid slice"/>\`

Puis dans le champ JSON \`slots\`, donne pour chaque placeholder son id, son rôle ("hero", "product"…) et une description en 1 phrase que l'utilisateur pourra envoyer à un générateur d'images.

## Règles SVG
- \`<svg xmlns="http://www.w3.org/2000/svg" viewBox="...">\` obligatoire
- Pas de \`<script>\`, pas d'handlers \`on*\`, pas de \`<foreignObject>\`
- \`font-family\` sans guillemets imbriqués : \`font-family="Inter"\` et non \`font-family="'Inter'"\`
- Textes multilignes via \`<tspan x="..." dy="...">\` dans un \`<text>\`
- Couleurs en hex \`#RRGGBB\` (pas de named colors comme "red")
- Pas d'URLs externes : toutes les images sont des \`placeholder:\` ou des \`data:\` URIs

Produis maintenant la composition complète via l'outil \`emit_response\`. Sois décisif sur la hiérarchie visuelle, ambitieux sur la typographie, et **pense à la lisibilité en impression** (pas de texte < 6pt, pas de traits < 0.25 mm).`
}
```

- [ ] **Step 7.4 : Vérifier que les tests passent**

```bash
npx vitest run src/features/ai-design/designPrompt.test.ts
```

Expected: PASS (9 tests)

- [ ] **Step 7.5 : Commit**

```bash
git add src/features/ai-design/designPrompt.ts src/features/ai-design/designPrompt.test.ts
git commit -m "feat(ai-design): add print-aware prompt builder with data-role semantics"
```

---

### Task 8 : Validateur de fonts (détecte fonts manquantes dans le SVG)

**Files:**
- Create: `src/features/ai-design/fontsValidator.ts`
- Create: `src/features/ai-design/fontsValidator.test.ts`

- [ ] **Step 8.1 : Écrire les tests**

`src/features/ai-design/fontsValidator.test.ts` :

```typescript
import { describe, it, expect } from 'vitest'
import { validateSvgFonts } from './fontsValidator'

describe('validateSvgFonts', () => {
  const allowed = ['Inter', 'Montserrat', 'Playfair Display']

  it('ne détecte aucun problème si toutes les fonts sont autorisées', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><text font-family="Inter">A</text><text font-family="Montserrat">B</text></svg>`
    const res = validateSvgFonts(svg, allowed)
    expect(res.missingFonts).toEqual([])
    expect(res.usedFonts.sort()).toEqual(['Inter', 'Montserrat'])
  })

  it('détecte une font non autorisée', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><text font-family="ComicSans">A</text></svg>`
    const res = validateSvgFonts(svg, allowed)
    expect(res.missingFonts).toContain('ComicSans')
  })

  it('normalise font-family avec guillemets imbriqués', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><text font-family="'Playfair Display'">A</text></svg>`
    const res = validateSvgFonts(svg, allowed)
    expect(res.missingFonts).toEqual([])
    expect(res.usedFonts).toContain('Playfair Display')
  })

  it('gère les font-family avec fallbacks : prend la première', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><text font-family="Inter, sans-serif">A</text></svg>`
    const res = validateSvgFonts(svg, allowed)
    expect(res.missingFonts).toEqual([])
    expect(res.usedFonts).toContain('Inter')
  })

  it('retourne une liste vide si aucune font référencée', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>`
    const res = validateSvgFonts(svg, allowed)
    expect(res.missingFonts).toEqual([])
    expect(res.usedFonts).toEqual([])
  })

  it('dédoublonne les fonts utilisées', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><text font-family="Inter">A</text><text font-family="Inter">B</text></svg>`
    const res = validateSvgFonts(svg, allowed)
    expect(res.usedFonts).toEqual(['Inter'])
  })
})
```

- [ ] **Step 8.2 : Lancer les tests**

```bash
npx vitest run src/features/ai-design/fontsValidator.test.ts
```

Expected: FAIL.

- [ ] **Step 8.3 : Implémenter `fontsValidator.ts`**

`src/features/ai-design/fontsValidator.ts` :

```typescript
export interface FontValidationResult {
  usedFonts: string[]      // uniques, normalisées
  missingFonts: string[]   // usedFonts \ allowedFonts
}

function normalizeFontFamily(raw: string): string {
  // "'Playfair Display'" → "Playfair Display"
  // "Inter, sans-serif" → "Inter"
  const first = raw.split(',')[0].trim()
  return first.replace(/^['"]|['"]$/g, '')
}

export function validateSvgFonts(svgText: string, allowedFonts: string[]): FontValidationResult {
  const used = new Set<string>()
  const regex = /font-family\s*=\s*"([^"]+)"|font-family\s*=\s*'([^']+)'/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(svgText)) !== null) {
    const raw = match[1] ?? match[2] ?? ''
    const normalized = normalizeFontFamily(raw)
    if (normalized) used.add(normalized)
  }

  const allowedSet = new Set(allowedFonts)
  const usedFonts = [...used]
  const missingFonts = usedFonts.filter((f) => !allowedSet.has(f))

  return { usedFonts, missingFonts }
}
```

- [ ] **Step 8.4 : Vérifier que les tests passent**

```bash
npx vitest run src/features/ai-design/fontsValidator.test.ts
```

Expected: PASS (6 tests)

- [ ] **Step 8.5 : Commit**

```bash
git add src/features/ai-design/fontsValidator.ts src/features/ai-design/fontsValidator.test.ts
git commit -m "feat(ai-design): detect missing fonts referenced in generated SVG"
```

---

### Task 9 : Intégration au `llmRouter` (nouvelle tâche `design.generate`)

**Files:**
- Modify: `src/features/ai/llmRouter.ts:41-68`

- [ ] **Step 9.1 : Ajouter la tâche au type `LLMTask`**

Dans `src/features/ai/llmRouter.ts:41-47`, étendre l'union :

```typescript
type LLMTask =
  | 'brief.dynamicQuestions'
  | 'brief.cartGeneration'
  | 'brief.deckStructure'
  | 'brief.imagePrompts'
  | 'brief.catalogKeywords'
  | 'product.enrichment'
  | 'design.generate'
```

- [ ] **Step 9.2 : Ajouter la route**

Dans `TASK_ROUTING` (`src/features/ai/llmRouter.ts:61-68`), ajouter la ligne :

```typescript
  'design.generate':        { primary: 'claude', fallback: 'gemini', model: 'claude-opus-4-6' },
```

- [ ] **Step 9.3 : Ajouter la température**

Dans `TASK_TEMPERATURE` (`src/features/ai/llmRouter.ts:71-78`) :

```typescript
  'design.generate':        0.6,
```

Rationale : plus chaud que l'enrichissement produit (déterministe), mais pas trop pour garder une cohérence stylistique exploitable.

- [ ] **Step 9.4 : Augmenter le `max_tokens` pour cette tâche**

Problème : `callClaude` (`src/features/ai/llmRouter.ts:173`) hardcode `max_tokens = 8192`. Pour un SVG complexe c'est juste. On le monte conditionnellement.

Remplacer la ligne `const max_tokens = 8192` (`src/features/ai/llmRouter.ts:188`) par :

```typescript
  const max_tokens = opts.task === 'design.generate' ? 16384 : 8192
```

Et même chose dans le bloc retry (`src/features/ai/llmRouter.ts:257-272`), remplacer `max_tokens: 8192` par `max_tokens`.

- [ ] **Step 9.5 : Vérifier le typecheck**

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 9.6 : Commit**

```bash
git add src/features/ai/llmRouter.ts
git commit -m "feat(llm): route design.generate to Claude Opus 4.6 with 16k tokens"
```

---

### Task 10 : Hook `useGenerateDesign` — orchestration complète

**Files:**
- Create: `src/features/ai-design/useGenerateDesign.ts`

Ce hook enchaîne : validation input → appel LLM → sanitize → validate fonts → convertit mm en px à 300 DPI → redimensionne le canvas → parseSvgToFabric → add sur canvas → syncToStore. Plus gestion d'état loading/error.

- [ ] **Step 10.1 : Implémenter le hook**

`src/features/ai-design/useGenerateDesign.ts` :

```typescript
import { useState, useCallback } from 'react'
import { z } from 'zod'
import { toast } from 'sonner'
import { generateJson } from '@/features/ai/llmRouter'
import { DesignResultSchema, DesignResultJsonSchema } from './designSchema'
import { buildDesignPrompt } from './designPrompt'
import { sanitizeSvg } from './sanitizeSvg'
import { validateSvgFonts } from './fontsValidator'
import type { DesignRequest, DesignResult } from './types'
import { parseSvgToFabric } from '@/features/svg/svgToFabric'
import { globalFabricCanvas, globalFitCanvas } from '@/features/editor/CanvasContainer'
import { syncToStore } from '@/features/editor/useAddObject'
import { useUIStore } from '@/stores/ui.store'
import { getFormatById } from '@/features/print/PRINT_FORMATS'
import { mmToPx } from '@/features/print/dimensions'
import { AVAILABLE_FONTS } from '@/features/assets/useFonts'

type Step = 'idle' | 'generating' | 'sanitizing' | 'rendering' | 'done' | 'error'

interface State {
  step: Step
  progress: string
  error: string | null
  lastResult: DesignResult | null
}

const PROMPT_VERSION = 'design.generate.v1'

export function useGenerateDesign() {
  const [state, setState] = useState<State>({ step: 'idle', progress: '', error: null, lastResult: null })

  const generate = useCallback(async (req: DesignRequest) => {
    setState({ step: 'generating', progress: 'Envoi du brief à Claude…', error: null, lastResult: null })

    // Résolution du format
    let widthMm: number, heightMm: number, formatLabel: string
    if (req.formatId === 'custom') {
      if (!req.customWidthMm || !req.customHeightMm) {
        setState({ step: 'error', progress: '', error: 'Dimensions custom manquantes', lastResult: null })
        return
      }
      widthMm = req.customWidthMm
      heightMm = req.customHeightMm
      formatLabel = `Custom ${widthMm} × ${heightMm} mm`
    } else {
      const f = getFormatById(req.formatId)
      if (!f) {
        setState({ step: 'error', progress: '', error: `Format inconnu : ${req.formatId}`, lastResult: null })
        return
      }
      widthMm = f.widthMm
      heightMm = f.heightMm
      formatLabel = f.label
    }

    const { bleedMm: storeBleed, dpi } = useUIStore.getState()
    const effectiveBleed = req.includeBleed ? Math.max(storeBleed, 3) : 0

    const availableFonts = AVAILABLE_FONTS.map((f) => f.family)

    const prompt = buildDesignPrompt({
      userPrompt: req.prompt,
      widthMm,
      heightMm,
      formatLabel,
      style: req.style,
      includeBleed: req.includeBleed,
      bleedMm: effectiveBleed,
      availableFonts,
      palette: req.palette,
    })

    let result: DesignResult
    try {
      result = await generateJson<DesignResult>({
        task: 'design.generate',
        prompt,
        schema: DesignResultSchema as unknown as z.ZodSchema<DesignResult>,
        schemaForLLM: DesignResultJsonSchema as unknown as Record<string, unknown>,
        schemaForClaude: DesignResultJsonSchema as unknown as Record<string, unknown>,
        version: PROMPT_VERSION,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setState({ step: 'error', progress: '', error: `Génération LLM échouée : ${msg}`, lastResult: null })
      return
    }

    setState((s) => ({ ...s, step: 'sanitizing', progress: 'Validation du SVG…' }))

    let cleanSvg: string
    try {
      cleanSvg = sanitizeSvg(result.svg)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setState({ step: 'error', progress: '', error: `SVG invalide : ${msg}`, lastResult: null })
      return
    }

    // Validation des fonts
    const fontCheck = validateSvgFonts(cleanSvg, availableFonts)
    if (fontCheck.missingFonts.length > 0) {
      toast.warning(
        `Fonts non disponibles : ${fontCheck.missingFonts.join(', ')}. Remplacées par Inter.`,
      )
      for (const missing of fontCheck.missingFonts) {
        // Remplacement brut mais sûr : on remplace la valeur exacte entre guillemets
        const reDouble = new RegExp(`font-family\\s*=\\s*"${missing}[^"]*"`, 'g')
        const reSingle = new RegExp(`font-family\\s*=\\s*'${missing}[^']*'`, 'g')
        cleanSvg = cleanSvg.replace(reDouble, 'font-family="Inter"').replace(reSingle, 'font-family="Inter"')
      }
    }

    setState((s) => ({ ...s, step: 'rendering', progress: 'Rendu sur le canvas…' }))

    const canvas = globalFabricCanvas
    if (!canvas) {
      setState({ step: 'error', progress: '', error: 'Canvas non initialisé', lastResult: null })
      return
    }

    // Redimensionne le canvas aux dimensions du design (en px à dpi courant)
    const canvasWidthPx = Math.round(mmToPx(widthMm, dpi))
    const canvasHeightPx = Math.round(mmToPx(heightMm, dpi))
    useUIStore.getState().setCanvasSize(canvasWidthPx, canvasHeightPx, '#ffffff')

    // Retire TOUT sauf grid / pageBg / print-marks (ces derniers seront regénérés par l'effet du CanvasContainer)
    const toRemove = canvas.getObjects().filter((o: any) => {
      return !o.data?.isGrid && !o.data?.isPageBg && !o.data?.isPrintMark
    })
    for (const o of toRemove) canvas.remove(o)

    // Parse + add
    try {
      const { objects } = await parseSvgToFabric(cleanSvg)

      // Les objets parsés viennent à l'échelle du viewBox SVG (en mm).
      // On les scale pour qu'ils remplissent le canvas en px.
      const scaleX = canvasWidthPx / widthMm
      const scaleY = canvasHeightPx / heightMm
      for (const obj of objects) {
        obj.left = (obj.left ?? 0) * scaleX
        obj.top = (obj.top ?? 0) * scaleY
        obj.scaleX = (obj.scaleX ?? 1) * scaleX
        obj.scaleY = (obj.scaleY ?? 1) * scaleY
        obj.setCoords()
        canvas.add(obj)
      }

      canvas.requestRenderAll()
      syncToStore(canvas)
      requestAnimationFrame(() => globalFitCanvas?.())
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setState({ step: 'error', progress: '', error: `Parse SVG échoué : ${msg}`, lastResult: null })
      return
    }

    setState({ step: 'done', progress: '', error: null, lastResult: result })
  }, [])

  const reset = useCallback(() => {
    setState({ step: 'idle', progress: '', error: null, lastResult: null })
  }, [])

  return { state, generate, reset }
}
```

- [ ] **Step 10.2 : Vérifier le typecheck**

```bash
npx tsc --noEmit
```

Expected: PASS. Si Zod se plaint du cast `as unknown as z.ZodSchema<DesignResult>`, c'est parce que le schema utilise `.refine()` — le cast est attendu.

- [ ] **Step 10.3 : Commit**

```bash
git add src/features/ai-design/useGenerateDesign.ts
git commit -m "feat(ai-design): add useGenerateDesign hook orchestrating LLM → sanitize → render"
```

---

## Part C — UI components

### Task 11 : Sélecteur de format

**Files:**
- Create: `src/features/ai-design/FormatSelector.tsx`

- [ ] **Step 11.1 : Implémenter le composant**

`src/features/ai-design/FormatSelector.tsx` :

```typescript
import { PRINT_FORMATS, type PrintFormat } from '@/features/print/PRINT_FORMATS'

interface Props {
  formatId: string
  customWidthMm?: number
  customHeightMm?: number
  onChange: (v: { formatId: string; customWidthMm?: number; customHeightMm?: number }) => void
}

const GROUPS: Array<{ category: PrintFormat['category']; label: string }> = [
  { category: 'paper',  label: 'Papier' },
  { category: 'flyer',  label: 'Flyers' },
  { category: 'poster', label: 'Affiches' },
  { category: 'pos',    label: 'PLV / POS' },
]

export function FormatSelector({ formatId, customWidthMm, customHeightMm, onChange }: Props) {
  const isCustom = formatId === 'custom'

  return (
    <div className="space-y-2">
      <label className="text-xs uppercase tracking-wide text-neutral-400">Format</label>
      <select
        value={formatId}
        onChange={(e) => onChange({ formatId: e.target.value, customWidthMm, customHeightMm })}
        className="w-full bg-[#1a1a1a] border border-neutral-800 rounded px-2 py-1.5 text-sm"
      >
        {GROUPS.map((g) => (
          <optgroup key={g.category} label={g.label}>
            {PRINT_FORMATS.filter((f) => f.category === g.category).map((f) => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </optgroup>
        ))}
        <option value="custom">Personnalisé…</option>
      </select>

      {isCustom && (
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div>
            <label className="text-xs text-neutral-400">Largeur (mm)</label>
            <input
              type="number"
              min={10}
              max={2000}
              value={customWidthMm ?? 210}
              onChange={(e) => onChange({ formatId: 'custom', customWidthMm: Number(e.target.value), customHeightMm })}
              className="w-full bg-[#1a1a1a] border border-neutral-800 rounded px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-neutral-400">Hauteur (mm)</label>
            <input
              type="number"
              min={10}
              max={2000}
              value={customHeightMm ?? 297}
              onChange={(e) => onChange({ formatId: 'custom', customWidthMm, customHeightMm: Number(e.target.value) })}
              className="w-full bg-[#1a1a1a] border border-neutral-800 rounded px-2 py-1 text-sm"
            />
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 11.2 : Commit**

```bash
git add src/features/ai-design/FormatSelector.tsx
git commit -m "feat(ai-design): add FormatSelector with grouped presets + custom mm inputs"
```

---

### Task 12 : Panel "Réglages impression" (bleed + marks toggles, style InDesign)

**Files:**
- Create: `src/features/ai-design/PrintSettingsPanel.tsx`

- [ ] **Step 12.1 : Implémenter**

`src/features/ai-design/PrintSettingsPanel.tsx` :

```typescript
import { useUIStore } from '@/stores/ui.store'

export function PrintSettingsPanel() {
  const dpi = useUIStore((s) => s.dpi)
  const bleedMm = useUIStore((s) => s.bleedMm)
  const showPrintMarks = useUIStore((s) => s.showPrintMarks)
  const showSafeArea = useUIStore((s) => s.showSafeArea)
  const setDpi = useUIStore((s) => s.setDpi)
  const setBleedMm = useUIStore((s) => s.setBleedMm)
  const setShowPrintMarks = useUIStore((s) => s.setShowPrintMarks)
  const setShowSafeArea = useUIStore((s) => s.setShowSafeArea)

  return (
    <div className="space-y-4 p-3 bg-[#1a1a1a] border border-neutral-800 rounded">
      <h3 className="text-sm font-medium">Impression</h3>

      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wide text-neutral-400">Résolution (DPI)</label>
        <select
          value={dpi}
          onChange={(e) => setDpi(Number(e.target.value))}
          className="w-full bg-[#0f0f0f] border border-neutral-800 rounded px-2 py-1 text-sm"
        >
          <option value={72}>72 DPI — web</option>
          <option value={150}>150 DPI — numérique léger</option>
          <option value={300}>300 DPI — offset (recommandé)</option>
          <option value={600}>600 DPI — très haute définition</option>
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wide text-neutral-400">
          Fond perdu (bleed) : <span className="text-neutral-200">{bleedMm} mm</span>
        </label>
        <input
          type="range"
          min={0}
          max={10}
          step={1}
          value={bleedMm}
          onChange={(e) => setBleedMm(Number(e.target.value))}
          className="w-full"
        />
        <div className="flex justify-between text-[10px] text-neutral-500">
          <span>Aucun</span>
          <span>3 mm (offset)</span>
          <span>5 mm (numérique)</span>
          <span>10 mm</span>
        </div>
      </div>

      <div className="space-y-2 pt-1 border-t border-neutral-800">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={showPrintMarks}
            onChange={(e) => setShowPrintMarks(e.target.checked)}
            className="accent-indigo-500"
          />
          <span>Afficher traits de coupe & bleed</span>
        </label>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={showSafeArea}
            onChange={(e) => setShowSafeArea(e.target.checked)}
            className="accent-indigo-500"
          />
          <span>Afficher zone de sécurité</span>
        </label>
      </div>

      <p className="text-[11px] text-neutral-500 leading-relaxed">
        Les repères sont purement visuels et n'apparaissent pas dans l'export standard.
        Pour un export avec traits de coupe intégrés, utilisez l'option "Export print" (à venir).
      </p>
    </div>
  )
}
```

- [ ] **Step 12.2 : Commit**

```bash
git add src/features/ai-design/PrintSettingsPanel.tsx
git commit -m "feat(ai-design): add InDesign-style print settings panel (DPI/bleed/marks)"
```

---

### Task 13 : Panel principal "Claude Design"

**Files:**
- Create: `src/features/ai-design/DesignPromptPanel.tsx`

- [ ] **Step 13.1 : Implémenter**

`src/features/ai-design/DesignPromptPanel.tsx` :

```typescript
import { useState } from 'react'
import { Sparkles, Loader2, AlertTriangle } from 'lucide-react'
import { FormatSelector } from './FormatSelector'
import { PrintSettingsPanel } from './PrintSettingsPanel'
import { useGenerateDesign } from './useGenerateDesign'
import type { DesignStyle, DesignRequest } from './types'
import { DEFAULT_FORMAT_ID } from '@/features/print/PRINT_FORMATS'

const STYLES: Array<{ id: DesignStyle; label: string; emoji: string }> = [
  { id: 'corporate',   label: 'Corporate',    emoji: '🏢' },
  { id: 'minimaliste', label: 'Minimaliste',  emoji: '◽' },
  { id: 'bold',        label: 'Bold',         emoji: '💥' },
  { id: 'elegant',     label: 'Élégant',      emoji: '✨' },
  { id: 'playful',     label: 'Playful',      emoji: '🎨' },
  { id: 'retro',       label: 'Rétro',        emoji: '📻' },
]

export function DesignPromptPanel() {
  const [prompt, setPrompt] = useState('')
  const [formatId, setFormatId] = useState(DEFAULT_FORMAT_ID)
  const [customWidthMm, setCustomWidthMm] = useState<number | undefined>()
  const [customHeightMm, setCustomHeightMm] = useState<number | undefined>()
  const [style, setStyle] = useState<DesignStyle>('corporate')
  const [includeBleed, setIncludeBleed] = useState(true)
  const [paletteText, setPaletteText] = useState('')

  const { state, generate } = useGenerateDesign()
  const isRunning = state.step !== 'idle' && state.step !== 'done' && state.step !== 'error'

  const onSubmit = () => {
    if (!prompt.trim() || isRunning) return

    const palette = paletteText
      .split(/[\s,]+/)
      .map((c) => c.trim())
      .filter((c) => /^#[0-9a-fA-F]{6}$/.test(c))

    const req: DesignRequest = {
      prompt: prompt.trim(),
      formatId,
      customWidthMm,
      customHeightMm,
      style,
      includeBleed,
      palette: palette.length > 0 ? palette : undefined,
    }
    generate(req)
  }

  return (
    <div className="flex flex-col gap-4 p-4 w-[320px] bg-[#0f0f0f] text-neutral-200 overflow-y-auto h-full">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-indigo-400" />
        <h2 className="text-sm font-semibold">Claude Design</h2>
      </div>

      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wide text-neutral-400">Votre brief</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ex : Affiche promo soldes d'été -30% pour magasin de chaussures, ambiance bord de mer"
          rows={4}
          className="w-full bg-[#1a1a1a] border border-neutral-800 rounded px-2 py-1.5 text-sm resize-none"
        />
      </div>

      <FormatSelector
        formatId={formatId}
        customWidthMm={customWidthMm}
        customHeightMm={customHeightMm}
        onChange={(v) => {
          setFormatId(v.formatId)
          setCustomWidthMm(v.customWidthMm)
          setCustomHeightMm(v.customHeightMm)
        }}
      />

      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wide text-neutral-400">Style</label>
        <div className="grid grid-cols-3 gap-1.5">
          {STYLES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStyle(s.id)}
              className={`text-xs py-2 rounded border transition-colors ${
                style === s.id
                  ? 'bg-indigo-500/20 border-indigo-500 text-indigo-200'
                  : 'bg-[#1a1a1a] border-neutral-800 hover:border-neutral-700'
              }`}
            >
              <div>{s.emoji}</div>
              <div>{s.label}</div>
            </button>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={includeBleed}
          onChange={(e) => setIncludeBleed(e.target.checked)}
          className="accent-indigo-500"
        />
        <span>Inclure fond perdu (recommandé si impression)</span>
      </label>

      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wide text-neutral-400">Palette (optionnel)</label>
        <input
          type="text"
          value={paletteText}
          onChange={(e) => setPaletteText(e.target.value)}
          placeholder="#ff6b35, #1a1a1a, #ffffff"
          className="w-full bg-[#1a1a1a] border border-neutral-800 rounded px-2 py-1 text-sm font-mono"
        />
        <p className="text-[10px] text-neutral-500">Hex séparés par virgule. Laisser vide = Claude choisit.</p>
      </div>

      <PrintSettingsPanel />

      <button
        type="button"
        onClick={onSubmit}
        disabled={isRunning || !prompt.trim()}
        className="flex items-center justify-center gap-2 py-2 rounded bg-indigo-500 text-white font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-indigo-400 transition-colors"
      >
        {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        {isRunning ? state.progress || 'Génération…' : 'Générer'}
      </button>

      {state.step === 'error' && (
        <div className="flex items-start gap-2 p-2 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-300">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>{state.error}</div>
        </div>
      )}

      {state.step === 'done' && state.lastResult && (
        <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded text-xs text-emerald-300 space-y-1">
          <div className="font-medium">Design prêt sur le canvas</div>
          <div className="text-neutral-400 text-[11px]">{state.lastResult.rationale}</div>
          {state.lastResult.slots.length > 0 && (
            <div className="text-[11px]">
              {state.lastResult.slots.length} slot(s) image à remplir manuellement
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 13.2 : Commit**

```bash
git add src/features/ai-design/DesignPromptPanel.tsx
git commit -m "feat(ai-design): add main Claude Design prompt panel UI"
```

---

### Task 14 : Intégration dans l'App (sidebar gauche)

**Files:**
- Modify: `src/app/App.tsx`
- Modify: `src/stores/ui.store.ts:6` (ajout 'ai-design' à `LeftPanelId`)

- [ ] **Step 14.1 : Étendre `LeftPanelId`**

Dans `src/stores/ui.store.ts:6`, ajouter `'ai-design'` à l'union :

```typescript
type LeftPanelId = 'elements' | 'text' | 'nanobana' | 'shapes' | 'palette' | 'layers' | 'assets' | 'ai-design'
```

- [ ] **Step 14.2 : Mount du panel dans App**

Ouvrir `src/app/App.tsx`, repérer comment les autres panels (ex: 'elements', 'text') sont conditionnellement rendus. Ajouter :

```typescript
import { DesignPromptPanel } from '@/features/ai-design/DesignPromptPanel'
```

Et dans le JSX où les panels gauches sont rendus selon `activeLeftPanel`, ajouter le cas :

```typescript
{activeLeftPanel === 'ai-design' && <DesignPromptPanel />}
```

Dans la barre d'icônes de la sidebar gauche (chercher le bouton 'elements' ou 'text' existant pour le pattern), ajouter :

```typescript
<button
  type="button"
  onClick={() => toggleLeftPanel('ai-design')}
  className={`... [classes existantes du pattern]`}
  title="Claude Design"
>
  <Sparkles className="w-5 h-5" />
</button>
```

(Adapter aux classes/patterns existants du fichier — le composant `DesignPromptPanel` occupe déjà sa largeur de 320px.)

- [ ] **Step 14.3 : Test manuel**

```bash
npm run dev
```

Dans l'app :
1. Vérifier que l'icône Sparkles apparaît dans la sidebar gauche
2. Cliquer dessus → le panel "Claude Design" s'affiche
3. Cliquer à nouveau → le panel se ferme
4. Saisir un brief court ("Flyer ventes privées"), format A5, style bold, cliquer Générer
5. Attendre ~15-30 s (appel Claude) → le canvas doit afficher le design
6. Vérifier que les traits de coupe apparaissent si `showPrintMarks=true` dans le PrintSettingsPanel

Si une erreur "Clé Anthropic absente" apparaît : aller dans Réglages et configurer la clé API.

- [ ] **Step 14.4 : Commit**

```bash
git add src/app/App.tsx src/stores/ui.store.ts
git commit -m "feat(ai-design): mount DesignPromptPanel in left sidebar"
```

---

## Part D — Validation finale

### Task 15 : Vérification complète

- [ ] **Step 15.1 : Tous les tests passent**

```bash
npx vitest run src/features/print src/features/ai-design
```

Expected: tous les fichiers `.test.ts` des tâches 1, 3, 5, 7, 8 en vert (≥ 37 tests au total).

- [ ] **Step 15.2 : Typecheck complet**

```bash
npx tsc --noEmit
```

Expected: 0 erreur.

- [ ] **Step 15.3 : Build production**

```bash
npm run build
```

Expected: PASS. Tolérances : warnings acceptables, erreurs = KO.

- [ ] **Step 15.4 : Checklist manuelle d'acceptation**

Démarrer `npm run dev` et vérifier point par point :

1. [ ] L'icône Claude Design apparaît dans la sidebar gauche
2. [ ] Le panel s'ouvre/se ferme par toggle
3. [ ] Le sélecteur de format propose A4/A3/A5/A6/Flyer DL/Flyer carré/Affiches/POS + custom
4. [ ] Passer en "custom" fait apparaître les inputs largeur/hauteur
5. [ ] Les 6 tuiles de style sont cliquables et une seule active
6. [ ] Le toggle "Inclure fond perdu" change d'état
7. [ ] La palette custom accepte des hex séparés par virgule
8. [ ] Le panel "Réglages impression" montre DPI / bleed slider / toggles marks
9. [ ] Slider bleed 0 → 10 met à jour immédiatement le rectangle rouge autour du canvas si "Afficher traits de coupe" est coché
10. [ ] Toggle "zone de sécurité" affiche/masque le rect vert
11. [ ] Génération A4 style "bold" avec brief simple produit un SVG visible sur le canvas en ~20-30 s
12. [ ] Si Claude référence une font inexistante, un toast `sonner` warning apparaît
13. [ ] Un design généré est éditable : on peut cliquer un texte, le déplacer, le modifier
14. [ ] Une erreur réseau ou d'API affiche le bloc d'erreur rouge dans le panel sans crash

- [ ] **Step 15.5 : Commit final**

Rien à commit si les étapes précédentes sont à jour. Sinon :

```bash
git status
git add <fichiers restants>
git commit -m "chore(ai-design): final cleanup + manual acceptance pass"
```

---

## Récapitulatif

| # | Tâche | Fichiers créés | Fichiers modifiés | Tests |
|---|---|---|---|---|
| 1 | Dimensions & formats | 3 | — | 7 |
| 2 | UI store extension | — | 1 | — |
| 3 | Print marks | 2 | — | 6 |
| 4 | CanvasContainer integration | — | 2 | — |
| 5 | SVG sanitizer | 2 | — | 9 |
| 6 | Design schema | 2 | — | — |
| 7 | Prompt builder | 2 | — | 9 |
| 8 | Fonts validator | 2 | — | 6 |
| 9 | LLM router task | — | 1 | — |
| 10 | Hook useGenerateDesign | 1 | — | — |
| 11 | FormatSelector | 1 | — | — |
| 12 | PrintSettingsPanel | 1 | — | — |
| 13 | DesignPromptPanel | 1 | — | — |
| 14 | App integration | — | 2 | — |
| 15 | Validation finale | — | — | intégration |

**Total : 17 fichiers créés, 6 fichiers modifiés, ~37 tests unitaires.**

---

## Extensions futures (hors de ce plan)

Ces éléments ont été explicitement **exclus** de cette itération et méritent un plan séparé :

1. **Remplissage des image-slots** via Nano Banana (`src/features/briefs/ai/geminiImageClient.ts` existe déjà) — UI flottant sur chaque slot, bouton "Générer une image ici" qui consomme `promptSuggestion`.
2. **Export print PDF** avec traits de coupe embarqués et conversion CMYK — nécessite `pdf-lib` avec un composeur spécifique et une conversion RGB→CMYK approximée.
3. **Cache Firestore des générations** pour permettre régénération / variations sans re-consommer de tokens.
4. **Variations et A/B** : générer 3 designs à partir du même brief (parallel dispatch via `superpowers:dispatching-parallel-agents`).
5. **Brand kit** : passer automatiquement la palette + fonts du client courant (si un brand kit existe dans Firestore) dans le prompt.
