# Image Masks (InDesign-style) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add InDesign-style frame/content image masking to DesignStudio: a clipPath rectangle (the frame) and the bitmap (the content) can be resized independently or together via keyboard modifiers (Shift / Cmd / Cmd+Shift), with a dedicated content-edit mode and a Properties panel section.

**Architecture:** Each `fabric.Image` carries a `clipPath: fabric.Rect` (object-space, centered). A new `useImageMask` hook centralizes: (a) auto-attaching default clipPaths on `object:added`, (b) intercepting `object:scaling` to apply modifier-based behavior, (c) double-click → content-edit mode where dragging repositions the bitmap inside the frame. Persistence piggybacks on Fabric's native `clipPath` serialization (one extra string in the toJSON props list). IDML export already nests `<Image>` in `<Rectangle>` natively, so the clipPath maps directly. PDF/PPTX rasterize as today.

**Tech Stack:** React 18, Fabric.js v6 (`Canvas`, `FabricImage`, `Rect`, `TPointerEventInfo`), Zustand, shadcn/ui (Popover, Switch, Button), Tailwind, Lucide (`HelpCircle`), Sonner (toast pédagogique).

**Spec:** `docs/superpowers/specs/2026-04-06-image-masks-design.md`

---

## File Structure

### New
- `src/features/editor/useImageMask.ts` — central hook : auto-attach clipPath on add, scaling interception, content-edit mode, fit helpers, double-click binding.
- `src/components/panels/ImageMaskSection.tsx` — section "Masque" du `PropertiesPanel` (toggle mode, boutons Fit, champs X/Y/W/H, popover d'aide).

### Modified
- `src/features/editor/useAutoSave.ts` — add `'clipPath'` to the `toObject(...)` props list (line 168).
- `src/features/editor/useLoadCanvas.ts` — in the post-load loop, add a default clipPath to any `FabricImage` that doesn't have one.
- `src/features/editor/CanvasContainer.tsx` — call `useImageMask(fabricRef)`.
- `src/components/panels/PropertiesPanel.tsx` — render `<ImageMaskSection />` when the active object is a `FabricImage`.
- `src/features/idml/idmlExporter.ts` — when emitting an `<Image>`, use the clipPath bounds as the parent `<Rectangle>` PathGeometry, image bounds for the inner image.

---

## Task 1: Persistence — sérialiser le clipPath

**Files:**
- Modify: `src/features/editor/useAutoSave.ts:168`

- [ ] **Step 1: Locate the toObject call**

Read `src/features/editor/useAutoSave.ts` around line 168. Current code:

```ts
const canvasJson = canvas.toObject(['data'])
```

- [ ] **Step 2: Add 'clipPath' to the props list**

Replace with:

```ts
const canvasJson = canvas.toObject(['data', 'clipPath'])
```

Note: Fabric v6 sérialise `clipPath` automatiquement quand son nom apparaît dans la liste des propriétés additionnelles. Pas d'autre changement requis pour le round-trip.

- [ ] **Step 3: Manual smoke check**

Run `npm run dev`. Open a project, add an image (drag from AssetsPanel), save, reload. The image still appears with default position. Console should show no Fabric errors.

- [ ] **Step 4: Commit**

```bash
git add src/features/editor/useAutoSave.ts
git commit -m "feat(editor): persist clipPath on canvas serialization"
```

---

## Task 2: Migration — clipPath par défaut au chargement

**Files:**
- Modify: `src/features/editor/useLoadCanvas.ts` — within the `for (const obj of loadedObjs)` block around line 394 where FabricImages are inspected.

- [ ] **Step 1: Add migration helper at top of file**

Add (after the `import { downloadIdmlFromStorage, ... }` line):

```ts
import { Rect as FabricRect } from 'fabric'

/**
 * Ensure a FabricImage has a clipPath. If absent, attach a Rect covering
 * the image's native bounds (centered, object-space — Fabric v6 convention).
 * Idempotent.
 */
function ensureImageClipPath(img: FabricImage): void {
  if ((img as any).clipPath) return
  const w = (img as any).width ?? 0
  const h = (img as any).height ?? 0
  if (w <= 0 || h <= 0) return
  const rect = new FabricRect({
    left: -w / 2,
    top: -h / 2,
    width: w,
    height: h,
    absolutePositioned: false,
  })
  ;(img as any).clipPath = rect
}
```

Note: `Rect` est déjà importé ligne 2 — utiliser le même `Rect` symbol au lieu de réimporter. Reformuler:

```ts
// Already imported on line 2: Rect
```

Et remplacer `FabricRect` par `Rect` dans la fonction. Ne pas ajouter le `import` supplémentaire.

- [ ] **Step 2: Call the helper in the post-load image loop**

Locate the block around line 394:

```ts
for (const obj of loadedObjs) {
  if (obj instanceof FabricImage) {
    const el = (obj as any)._element || (obj as any).getElement?.()
    const hasContent = el && (el.naturalWidth > 0 || el.width > 0)
    ...
```

Add after the `if (!hasContent) { ... }` reload branch closes (just before `else { console.log(... loaded OK ...) }`), apply migration unconditionally:

```ts
for (const obj of loadedObjs) {
  if (obj instanceof FabricImage) {
    ensureImageClipPath(obj)        // ← NEW
    const el = (obj as any)._element || (obj as any).getElement?.()
    ...
```

Place it as the **first** line inside the `if (obj instanceof FabricImage)` block so reload-replacement images also get the clipPath via Task 4 (object:added listener), and existing images get it here.

- [ ] **Step 3: Verify TypeScript builds**

Run: `npx tsc --noEmit`
Expected: no errors related to `useLoadCanvas.ts`.

- [ ] **Step 4: Manual smoke check**

`npm run dev`, open an existing project that has images. In DevTools console:

```js
globalFabricCanvas.getObjects().filter(o => o.type === 'image').map(o => !!o.clipPath)
```

Expected: tous `true`.

- [ ] **Step 5: Commit**

```bash
git add src/features/editor/useLoadCanvas.ts
git commit -m "feat(editor): migrate images to default clipPath on load"
```

---

## Task 3: Hook squelette — `useImageMask`

**Files:**
- Create: `src/features/editor/useImageMask.ts`

- [ ] **Step 1: Create the file with skeleton + auto-attach on add**

```ts
import { useEffect } from 'react'
import { Canvas, FabricImage, Rect, type TPointerEventInfo, type TPointerEvent } from 'fabric'

/**
 * Attach a default clipPath to a FabricImage if it doesn't have one.
 * Centered, object-space (Fabric v6 convention).
 */
export function ensureImageClipPath(img: FabricImage): void {
  if ((img as any).clipPath) return
  const w = (img as any).width ?? 0
  const h = (img as any).height ?? 0
  if (w <= 0 || h <= 0) return
  ;(img as any).clipPath = new Rect({
    left: -w / 2,
    top: -h / 2,
    width: w,
    height: h,
    absolutePositioned: false,
  })
}

/** Detect platform meta key (⌘ on macOS, Ctrl elsewhere). */
function isMetaKey(e: MouseEvent | TouchEvent): boolean {
  return (e as MouseEvent).metaKey || (e as MouseEvent).ctrlKey
}

export function useImageMask(fabricRef: React.RefObject<Canvas | null>) {
  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return

    // Auto-attach clipPath to any newly added image
    const onAdded = (e: { target?: any }) => {
      const t = e.target
      if (t instanceof FabricImage) ensureImageClipPath(t)
    }
    canvas.on('object:added', onAdded)

    return () => {
      canvas.off('object:added', onAdded)
    }
  }, [fabricRef.current]) // eslint-disable-line react-hooks/exhaustive-deps
}
```

- [ ] **Step 2: Wire into CanvasContainer**

Read `src/features/editor/CanvasContainer.tsx`. Locate the existing hook calls (`useAutoSave`, `useLoadCanvas`, etc.). Add:

```ts
import { useImageMask } from './useImageMask'
// ...
useImageMask(fabricRef)
```

next to the other hook calls.

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Manual check — newly added image has clipPath**

`npm run dev`. Drag an image from AssetsPanel. In DevTools:

```js
globalFabricCanvas.getActiveObject().clipPath
```

Expected: a `Rect` instance with `width` and `height` matching the image's native dims.

- [ ] **Step 5: Commit**

```bash
git add src/features/editor/useImageMask.ts src/features/editor/CanvasContainer.tsx
git commit -m "feat(editor): useImageMask hook auto-attaches clipPath to images"
```

---

## Task 4: Scaling avec modificateurs clavier

**Files:**
- Modify: `src/features/editor/useImageMask.ts`

- [ ] **Step 1: Add scaling state tracker**

In `useImageMask.ts`, add at module scope (above `useImageMask`):

```ts
type ScaleSnapshot = {
  imgW: number
  imgH: number
  imgScaleX: number
  imgScaleY: number
  clipW: number
  clipH: number
  clipLeft: number
  clipTop: number
}

const _scaleSnapshots = new WeakMap<FabricImage, ScaleSnapshot>()
```

- [ ] **Step 2: Add scaling listeners inside the useEffect**

Right after `canvas.on('object:added', onAdded)`, add:

```ts
const onScalingStart = (e: { target?: any }) => {
  const t = e.target
  if (!(t instanceof FabricImage)) return
  const cp = (t as any).clipPath as Rect | undefined
  if (!cp) return
  _scaleSnapshots.set(t, {
    imgW: t.width ?? 0,
    imgH: t.height ?? 0,
    imgScaleX: t.scaleX ?? 1,
    imgScaleY: t.scaleY ?? 1,
    clipW: cp.width ?? 0,
    clipH: cp.height ?? 0,
    clipLeft: cp.left ?? 0,
    clipTop: cp.top ?? 0,
  })
}

const onScaling = (e: TPointerEventInfo<TPointerEvent>) => {
  const t = (e as any).target as FabricImage | undefined
  if (!(t instanceof FabricImage)) return
  const cp = (t as any).clipPath as Rect | undefined
  if (!cp) return
  const snap = _scaleSnapshots.get(t)
  if (!snap) return

  const native = e.e as MouseEvent
  const shift = native.shiftKey
  const meta = isMetaKey(native)

  // currentScale ratio relative to snapshot
  const sx = (t.scaleX ?? 1) / (snap.imgScaleX || 1)
  const sy = (t.scaleY ?? 1) / (snap.imgScaleY || 1)

  if (!shift && !meta) {
    // Frame-only resize: revert image scale, grow clipPath in object space
    t.set({ scaleX: snap.imgScaleX, scaleY: snap.imgScaleY })
    cp.set({
      width: snap.clipW * sx,
      height: snap.clipH * sy,
    })
  } else if (shift && !meta) {
    // Proportional resize of frame + content
    const ratio = Math.max(sx, sy)
    t.set({ scaleX: snap.imgScaleX * ratio, scaleY: snap.imgScaleY * ratio })
    cp.set({ width: snap.clipW, height: snap.clipH }) // clip stays in object space → unchanged
  } else if (meta && !shift) {
    // Free deform of frame + content
    cp.set({ width: snap.clipW, height: snap.clipH })
  } else {
    // meta + shift → proportional (same as shift alone for now)
    const ratio = Math.max(sx, sy)
    t.set({ scaleX: snap.imgScaleX * ratio, scaleY: snap.imgScaleY * ratio })
    cp.set({ width: snap.clipW, height: snap.clipH })
  }

  ;(cp as any).dirty = true
  ;(t as any).dirty = true
}

const onScaled = (e: { target?: any }) => {
  const t = e.target
  if (t instanceof FabricImage) _scaleSnapshots.delete(t)
}

canvas.on('mouse:down', onScalingStart)
canvas.on('object:scaling', onScaling)
canvas.on('object:modified', onScaled)
```

And update the cleanup:

```ts
return () => {
  canvas.off('object:added', onAdded)
  canvas.off('mouse:down', onScalingStart)
  canvas.off('object:scaling', onScaling)
  canvas.off('object:modified', onScaled)
}
```

Note: snapshot is taken on `mouse:down` (always cheap), used only if a scaling event follows. WeakMap auto-cleans.

- [ ] **Step 3: Build check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual test of all 4 modifier combinations**

`npm run dev`. Add an image to canvas.

| Action | Expected |
|---|---|
| Drag corner, no key | Frame shrinks/grows, image stays at original size (reveal/hide pixels) |
| Drag corner + Shift | Frame + image grow proportionally, no distortion |
| Drag corner + Cmd | Frame + image grow freely (deform allowed) |
| Drag corner + Cmd+Shift | Frame + image grow proportionally |

If any case is wrong, debug before continuing.

- [ ] **Step 5: Commit**

```bash
git add src/features/editor/useImageMask.ts
git commit -m "feat(editor): keyboard-modifier scaling for image masks"
```

---

## Task 5: Mode édition de contenu (double-clic + drag interne)

**Files:**
- Modify: `src/features/editor/useImageMask.ts`

- [ ] **Step 1: Add content-mode state**

Add at module scope (next to `_scaleSnapshots`):

```ts
const _contentModeImages = new WeakSet<FabricImage>()
const _contentDragStart = new WeakMap<FabricImage, { x: number; y: number; clipLeft: number; clipTop: number }>()

export function isInContentMode(img: FabricImage): boolean {
  return _contentModeImages.has(img)
}
```

- [ ] **Step 2: Add enter/exit functions**

Add (still module scope, exported):

```ts
export function enterContentMode(img: FabricImage): void {
  if (!(img as any).clipPath) return
  _contentModeImages.add(img)
  ;(img as any).borderColor = '#6366f1'
  ;(img as any).cornerColor = '#6366f1'
  ;(img as any).dirty = true
  img.canvas?.requestRenderAll()
}

export function exitContentMode(img: FabricImage): void {
  _contentModeImages.delete(img)
  ;(img as any).dirty = true
  img.canvas?.requestRenderAll()
}
```

- [ ] **Step 3: Bind double-click + Échap + content drag in the useEffect**

Inside `useEffect`, after the existing listeners, add:

```ts
const onDblClick = (e: { target?: any }) => {
  const t = e.target
  if (t instanceof FabricImage) enterContentMode(t)
}

const onKeyDown = (ev: KeyboardEvent) => {
  if (ev.key !== 'Escape') return
  const active = canvas.getActiveObject()
  if (active instanceof FabricImage && isInContentMode(active)) {
    exitContentMode(active)
  }
}

const onMouseDownContent = (e: TPointerEventInfo<TPointerEvent>) => {
  const t = (e as any).target as FabricImage | undefined
  if (!(t instanceof FabricImage)) return
  if (!isInContentMode(t)) return
  const cp = (t as any).clipPath as Rect | undefined
  if (!cp) return
  const p = canvas.getPointer(e.e)
  _contentDragStart.set(t, {
    x: p.x,
    y: p.y,
    clipLeft: cp.left ?? 0,
    clipTop: cp.top ?? 0,
  })
}

const onMouseMoveContent = (e: TPointerEventInfo<TPointerEvent>) => {
  const active = canvas.getActiveObject()
  if (!(active instanceof FabricImage)) return
  if (!isInContentMode(active)) return
  const start = _contentDragStart.get(active)
  if (!start) return
  const cp = (active as any).clipPath as Rect | undefined
  if (!cp) return
  const p = canvas.getPointer(e.e)
  // Move clipPath in OPPOSITE direction = repositions image inside frame
  cp.set({
    left: start.clipLeft - (p.x - start.x),
    top: start.clipTop - (p.y - start.y),
  })
  ;(active as any).dirty = true
  canvas.requestRenderAll()
}

const onMouseUpContent = () => {
  const active = canvas.getActiveObject()
  if (active instanceof FabricImage) _contentDragStart.delete(active)
}

canvas.on('mouse:dblclick', onDblClick)
canvas.on('mouse:down', onMouseDownContent)
canvas.on('mouse:move', onMouseMoveContent)
canvas.on('mouse:up', onMouseUpContent)
window.addEventListener('keydown', onKeyDown)
```

Update cleanup:

```ts
return () => {
  canvas.off('object:added', onAdded)
  canvas.off('mouse:down', onScalingStart)
  canvas.off('mouse:down', onMouseDownContent)
  canvas.off('mouse:move', onMouseMoveContent)
  canvas.off('mouse:up', onMouseUpContent)
  canvas.off('object:scaling', onScaling)
  canvas.off('object:modified', onScaled)
  canvas.off('mouse:dblclick', onDblClick)
  window.removeEventListener('keydown', onKeyDown)
}
```

Note: in content mode, we move the clipPath instead of the image, because the clipPath is in object-space relative to the image's center. Moving the clip "down-right" visually moves the visible content "up-left" — exactly what InDesign does when you drag the content grabber.

- [ ] **Step 4: Build check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual test**

`npm run dev`. Add an image, shrink the frame (no modifier) so the clipPath is smaller than the bitmap. Double-click the image. Drag inside it. The visible portion of the image should pan within the fixed frame. Press Escape — drag should now move the whole image again.

- [ ] **Step 6: Commit**

```bash
git add src/features/editor/useImageMask.ts
git commit -m "feat(editor): content-edit mode for image masks (double-click + drag)"
```

---

## Task 6: Fit helpers

**Files:**
- Modify: `src/features/editor/useImageMask.ts`

- [ ] **Step 1: Add the two helpers**

At module scope:

```ts
/** Reduce the clipPath to exactly cover the image's natural bounds. */
export function fitFrameToContent(img: FabricImage): void {
  const cp = (img as any).clipPath as Rect | undefined
  if (!cp) return
  const w = img.width ?? 0
  const h = img.height ?? 0
  cp.set({ left: -w / 2, top: -h / 2, width: w, height: h })
  ;(img as any).dirty = true
  img.canvas?.requestRenderAll()
}

/** Scale the image so it fully covers the clipPath, keeping aspect ratio. */
export function fillFrameProportionally(img: FabricImage): void {
  const cp = (img as any).clipPath as Rect | undefined
  if (!cp) return
  const cw = cp.width ?? 0
  const ch = cp.height ?? 0
  const iw = img.width ?? 0
  const ih = img.height ?? 0
  if (cw <= 0 || ch <= 0 || iw <= 0 || ih <= 0) return
  const ratio = Math.max(cw / iw, ch / ih)
  img.set({ scaleX: ratio, scaleY: ratio })
  // Re-center clipPath on image
  cp.set({ left: -iw / 2, top: -ih / 2 })
  ;(img as any).dirty = true
  img.canvas?.requestRenderAll()
}
```

- [ ] **Step 2: Build check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/editor/useImageMask.ts
git commit -m "feat(editor): fit-frame-to-content and fill-frame helpers"
```

---

## Task 7: PropertiesPanel — section "Masque" + popover d'aide

**Files:**
- Create: `src/components/panels/ImageMaskSection.tsx`
- Modify: `src/components/panels/PropertiesPanel.tsx`

- [ ] **Step 1: Create the section component**

```tsx
import { useState } from 'react'
import { FabricImage } from 'fabric'
import { HelpCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  enterContentMode,
  exitContentMode,
  isInContentMode,
  fitFrameToContent,
  fillFrameProportionally,
} from '@/features/editor/useImageMask'

interface Props {
  image: FabricImage
}

export function ImageMaskSection({ image }: Props) {
  const [, force] = useState(0)
  const rerender = () => force((n) => n + 1)
  const cp = (image as any).clipPath as { left: number; top: number; width: number; height: number } | undefined
  const inContent = isInContentMode(image)

  const setClipField = (field: 'left' | 'top' | 'width' | 'height', v: number) => {
    if (!cp) return
    ;(cp as any).set({ [field]: v })
    ;(image as any).dirty = true
    image.canvas?.requestRenderAll()
    rerender()
  }

  return (
    <div className="space-y-3 rounded-md border border-white/10 bg-[#1a1a1a] p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-white/70">Masque</h3>
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="rounded p-1 text-white/60 hover:bg-white/5 hover:text-white"
              aria-label="Aide raccourcis"
            >
              <HelpCircle className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-72 border-white/10 bg-[#1a1a1a] text-white">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/10 text-[#6366f1]">
                  <th className="py-1 text-left">Modificateur</th>
                  <th className="text-left">Cadre</th>
                  <th className="text-left">Image</th>
                  <th className="text-left">Ratio</th>
                </tr>
              </thead>
              <tbody className="text-white/80">
                <tr><td className="py-1">Aucun</td><td>resize</td><td>inchangée</td><td>libre</td></tr>
                <tr><td className="py-1">Shift</td><td>resize</td><td>resize</td><td>proportionnel</td></tr>
                <tr><td className="py-1">Cmd</td><td>resize</td><td>resize</td><td>libre (déforme)</td></tr>
                <tr><td className="py-1">Cmd+Shift</td><td>resize</td><td>resize</td><td>proportionnel</td></tr>
              </tbody>
            </table>
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex items-center justify-between">
        <Label className="text-xs text-white/80">Éditer le contenu</Label>
        <Switch
          checked={inContent}
          onCheckedChange={(v) => {
            if (v) enterContentMode(image)
            else exitContentMode(image)
            rerender()
          }}
        />
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          className="flex-1 text-xs"
          onClick={() => { fitFrameToContent(image); rerender() }}
        >
          Ajuster cadre
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1 text-xs"
          onClick={() => { fillFrameProportionally(image); rerender() }}
        >
          Remplir cadre
        </Button>
      </div>

      {cp && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[10px] text-white/60">X</Label>
            <Input
              type="number"
              value={Math.round(cp.left)}
              onChange={(e) => setClipField('left', Number(e.target.value))}
              className="h-7 text-xs"
            />
          </div>
          <div>
            <Label className="text-[10px] text-white/60">Y</Label>
            <Input
              type="number"
              value={Math.round(cp.top)}
              onChange={(e) => setClipField('top', Number(e.target.value))}
              className="h-7 text-xs"
            />
          </div>
          <div>
            <Label className="text-[10px] text-white/60">L</Label>
            <Input
              type="number"
              value={Math.round(cp.width)}
              onChange={(e) => setClipField('width', Number(e.target.value))}
              className="h-7 text-xs"
            />
          </div>
          <div>
            <Label className="text-[10px] text-white/60">H</Label>
            <Input
              type="number"
              value={Math.round(cp.height)}
              onChange={(e) => setClipField('height', Number(e.target.value))}
              className="h-7 text-xs"
            />
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Wire into PropertiesPanel**

Open `src/components/panels/PropertiesPanel.tsx`. Locate where the active object is determined (search for `getActiveObject` or `selectedObject`). Add:

```tsx
import { FabricImage } from 'fabric'
import { ImageMaskSection } from './ImageMaskSection'
```

In the JSX where image-specific controls are rendered (or at the bottom of the image-type branch), insert:

```tsx
{activeObject instanceof FabricImage && (
  <ImageMaskSection image={activeObject} />
)}
```

If `activeObject` isn't already in scope, retrieve it via `globalFabricCanvas?.getActiveObject()` or the existing pattern in the panel — do not invent a new prop. Read the panel first to find the right hook.

- [ ] **Step 3: Build check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual test**

`npm run dev`, select an image. The "Masque" section appears in PropertiesPanel. Click `?` → popover with the 4-row table appears in dark mode. Toggle "Éditer le contenu" — switch reflects state. Click "Ajuster cadre" — clipPath snaps to image bounds. Click "Remplir cadre" — image scales to cover the clipPath. Edit X/Y/W/H fields — clipPath updates live.

- [ ] **Step 5: Commit**

```bash
git add src/components/panels/ImageMaskSection.tsx src/components/panels/PropertiesPanel.tsx
git commit -m "feat(panels): add image mask section with fit helpers and shortcut help"
```

---

## Task 8: Toast pédagogique au premier scaling

**Files:**
- Modify: `src/features/editor/useImageMask.ts`

- [ ] **Step 1: Add toast trigger inside `onScalingStart`**

Add at top of file:

```ts
import { toast } from 'sonner'

const TIP_KEY = 'ds.tip.maskShortcuts.seen'
function showTipOnce(): void {
  try {
    if (localStorage.getItem(TIP_KEY)) return
    localStorage.setItem(TIP_KEY, '1')
    toast.info('Astuce : Shift pour agrandir sans déformer, Cmd pour déformer, sans modificateur pour ajuster le cadre seul.', {
      duration: 8000,
    })
  } catch { /* ignore */ }
}
```

In `onScalingStart`, after the snapshot is stored:

```ts
const onScalingStart = (e: { target?: any }) => {
  const t = e.target
  if (!(t instanceof FabricImage)) return
  const cp = (t as any).clipPath as Rect | undefined
  if (!cp) return
  _scaleSnapshots.set(t, { /* ... */ })
  showTipOnce()   // ← NEW
}
```

- [ ] **Step 2: Build check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual test**

In DevTools: `localStorage.removeItem('ds.tip.maskShortcuts.seen')`. Reload. Drag an image corner. Toast appears once. Drag again — no toast.

- [ ] **Step 4: Commit**

```bash
git add src/features/editor/useImageMask.ts
git commit -m "feat(editor): one-time tip toast on first image mask scaling"
```

---

## Task 9: IDML export — clipPath → Rectangle parent

**Files:**
- Modify: `src/features/idml/idmlExporter.ts`

- [ ] **Step 1: Read the current image export logic**

Open `src/features/idml/idmlExporter.ts`. Search for where `FabricImage` (or `type === 'image'`) is handled. The IDML structure should already produce a `<Rectangle>` with a child `<Image>`.

- [ ] **Step 2: Use clipPath bounds for the parent Rectangle PathGeometry**

Where the parent Rectangle's bounding box is computed today (currently uses image.left/top/width/height/scaleX/scaleY), replace with:

```ts
const cp = (img as any).clipPath as { left: number; top: number; width: number; height: number } | undefined
const imgScaleX = img.scaleX ?? 1
const imgScaleY = img.scaleY ?? 1
const imgW = (img.width ?? 0) * imgScaleX
const imgH = (img.height ?? 0) * imgScaleY

// Frame (Rectangle) bounds = clipPath in document space
const frameW = cp ? cp.width * imgScaleX : imgW
const frameH = cp ? cp.height * imgScaleY : imgH

// clipPath is centered in object space; convert to top-left in doc space
const cpOffsetX = cp ? (cp.left + (img.width ?? 0) / 2) * imgScaleX : 0
const cpOffsetY = cp ? (cp.top + (img.height ?? 0) / 2) * imgScaleY : 0
const frameLeft = (img.left ?? 0) + cpOffsetX
const frameTop = (img.top ?? 0) + cpOffsetY
```

Use `frameLeft / frameTop / frameW / frameH` for the `<Rectangle>` `PathGeometry`. Use the existing image-bounds (`img.left`, `img.top`, `imgW`, `imgH`) for the inner `<Image>` so the offset between image and frame is preserved.

If the existing function signature differs (e.g., it works in IDML units), adapt the math but keep the same intent: **Rectangle = clipPath in doc space, Image = bitmap bounds in doc space**.

- [ ] **Step 3: Build check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual round-trip test**

`npm run dev`. Open a project with an image, shrink the frame (drag corner without modifier). Export IDML. Open the resulting `.idml` in InDesign (or re-import via the existing IDML import path). The image should appear with a frame smaller than the bitmap, content positioned correctly.

If round-trip via InDesign isn't available, at least open the exported IDML's `Spreads/Spread_*.xml` and verify the `<Rectangle>` `PathGeometry` matches the clipPath bounds (not the full image).

- [ ] **Step 5: Commit**

```bash
git add src/features/idml/idmlExporter.ts
git commit -m "feat(idml): map image clipPath to parent Rectangle bounds on export"
```

---

## Task 10: Final integration check

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: clean build, no TypeScript errors.

- [ ] **Step 2: End-to-end manual scenario**

`npm run dev`. Walk through:

1. Add image → has clipPath ✓
2. Drag corner, no modifier → frame shrinks, image stays ✓
3. Drag corner + Shift → both grow proportionally ✓
4. Drag corner + Cmd → both grow freely ✓
5. Drag corner + Cmd+Shift → both grow proportionally ✓
6. Double-click → enter content mode, drag pans content ✓
7. Escape → exit content mode ✓
8. PropertiesPanel: ? popover, toggle, fit buttons, X/Y/W/H fields ✓
9. Save → reload → all state preserved ✓
10. Export IDML → frame ≠ image bounds preserved ✓

- [ ] **Step 3: Final commit (if any tweaks)**

```bash
git status
# If no changes: nothing to commit, plan complete
```

---

## Self-Review

**Spec coverage:**
- Modèle clipPath natif → Tasks 1, 2, 3 ✓
- Migration → Task 2 ✓
- 4 comportements de scaling → Task 4 ✓
- Mode contenu (double-clic + Échap + drag) → Task 5 ✓
- Fit helpers → Task 6 ✓
- PropertiesPanel section + popover d'aide → Task 7 ✓
- Toast pédagogique → Task 8 ✓
- Export IDML → Task 9 ✓
- Persistance Firestore → Task 1 ✓
- Feedback visuel cadre accent (`borderColor`/`cornerColor` `#6366f1` en mode contenu) → Task 5 step 2 ✓

**Note sur le rendu de l'image débordante** (point spec "image débordante visible pleine opacité hors du cadre") : avec `clipPath` Fabric, l'image est par défaut découpée. Pour révéler le débordement en mode contenu, une approche additionnelle serait de désactiver temporairement le clipPath au rendu et redessiner le cadre par-dessus. **Cette feature visuelle est reportée si le mode contenu reste utilisable sans elle** (le panning fonctionne déjà et le cadre reste visible via les bordures Fabric). Si jugée nécessaire après test, ajouter une Task 5.5 dédiée. Décision laissée à l'exécution post-Task 5 step 5 (manual test).

**Placeholder scan:** aucun TBD/TODO. Tout le code est explicite.

**Type consistency:** `ensureImageClipPath`, `enterContentMode`, `exitContentMode`, `isInContentMode`, `fitFrameToContent`, `fillFrameProportionally` — noms cohérents entre Task 3, 5, 6, 7.
