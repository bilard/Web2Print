# Claude Design Brief Persistence — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the Claude Design panel's brief + generation parameters on the Firestore project document so the user can edit and regenerate after an initial design.

**Architecture:** A dedicated Zustand store (`designBrief.store.ts`) holds the form state. `useAutoSave.ts` serializes it to `projects/{projectId}.claudeDesignBrief` (JSON stringified). `useLoadCanvas.ts` resets and hydrates the store from Firestore on project open. `DesignPromptPanel.tsx` is refactored to read/write the store instead of local `useState`.

**Tech Stack:** React 18, Zustand v4, Firebase Firestore v10, Vitest, TypeScript strict.

**Spec:** `docs/superpowers/specs/2026-04-21-claude-design-brief-persistence-design.md`

---

## File Structure

**Create:**
- `src/stores/designBrief.store.ts` — Zustand store + `useDesignBrief` selector
- `src/stores/designBrief.store.test.ts` — unit tests (vitest)

**Modify:**
- `src/features/ai-design/types.ts` — add `DesignBriefState` interface and `DEFAULT_DESIGN_BRIEF` export
- `src/features/ai-design/DesignPromptPanel.tsx` — replace 7 `useState` by store reads/writes
- `src/features/editor/useAutoSave.ts` — persist `claudeDesignBrief`, subscribe to store to mark unsaved
- `src/features/editor/useLoadCanvas.ts` — reset then hydrate store from Firestore

---

## Task 1: Define `DesignBriefState` type and defaults

**Files:**
- Modify: `src/features/ai-design/types.ts`

- [ ] **Step 1: Read the current file**

Run: open `src/features/ai-design/types.ts` — you should see `DesignStyle`, `DesignRequest`, `ImageSlot`, `DesignResult` types already defined.

- [ ] **Step 2: Add `DesignBriefState` interface and `DEFAULT_DESIGN_BRIEF` constant**

At the bottom of `src/features/ai-design/types.ts`, append:

```ts
import { DEFAULT_FORMAT_ID } from '@/features/print/PRINT_FORMATS'

/**
 * Persisted state of the Claude Design form. Stored on
 * `projects/{projectId}.claudeDesignBrief` as a JSON string.
 */
export interface DesignBriefState {
  prompt: string
  formatId: string
  customWidthMm?: number
  customHeightMm?: number
  style: DesignStyle
  includeBleed: boolean
  /** Raw text of the palette input — NOT parsed. Validation happens at submit time. */
  paletteText: string
  updatedAt: number
}

export const DEFAULT_DESIGN_BRIEF: DesignBriefState = {
  prompt: '',
  formatId: DEFAULT_FORMAT_ID,
  customWidthMm: undefined,
  customHeightMm: undefined,
  style: 'corporate',
  includeBleed: true,
  paletteText: '',
  updatedAt: 0,
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/features/ai-design/types.ts
git commit -m "feat(ai-design): add DesignBriefState type and DEFAULT_DESIGN_BRIEF

Preparatory type for persisting the Claude Design panel form state.
Used by the upcoming designBrief.store and Firestore save/load wiring."
```

---

## Task 2: Implement `designBrief.store.ts` (TDD)

**Files:**
- Create: `src/stores/designBrief.store.ts`
- Create: `src/stores/designBrief.store.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/stores/designBrief.store.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useDesignBriefStore, useDesignBrief } from './designBrief.store'
import { DEFAULT_DESIGN_BRIEF, type DesignBriefState } from '@/features/ai-design/types'

describe('designBrief.store', () => {
  beforeEach(() => {
    useDesignBriefStore.getState().resetBrief()
  })

  it('starts with brief === null', () => {
    expect(useDesignBriefStore.getState().brief).toBeNull()
  })

  it('useDesignBrief selector returns DEFAULTS when brief === null', () => {
    // Can't use the React hook in a plain test, so validate the fallback logic
    // via the same shape the hook uses:
    const brief = useDesignBriefStore.getState().brief
    const effective = brief ?? DEFAULT_DESIGN_BRIEF
    expect(effective).toEqual(DEFAULT_DESIGN_BRIEF)
  })

  it('setBrief creates a full state from DEFAULTS when brief === null', () => {
    useDesignBriefStore.getState().setBrief({ prompt: 'hello' })
    const brief = useDesignBriefStore.getState().brief
    expect(brief).not.toBeNull()
    expect(brief!.prompt).toBe('hello')
    expect(brief!.style).toBe(DEFAULT_DESIGN_BRIEF.style)
    expect(brief!.updatedAt).toBeGreaterThan(0)
  })

  it('setBrief applies partial patches without overwriting other fields', () => {
    useDesignBriefStore.getState().setBrief({ prompt: 'first' })
    useDesignBriefStore.getState().setBrief({ style: 'bold' })
    const brief = useDesignBriefStore.getState().brief!
    expect(brief.prompt).toBe('first')
    expect(brief.style).toBe('bold')
  })

  it('setBrief updates updatedAt on every call', async () => {
    useDesignBriefStore.getState().setBrief({ prompt: 'a' })
    const first = useDesignBriefStore.getState().brief!.updatedAt
    await new Promise((r) => setTimeout(r, 2))
    useDesignBriefStore.getState().setBrief({ prompt: 'b' })
    const second = useDesignBriefStore.getState().brief!.updatedAt
    expect(second).toBeGreaterThan(first)
  })

  it('resetBrief sets brief back to null', () => {
    useDesignBriefStore.getState().setBrief({ prompt: 'x' })
    useDesignBriefStore.getState().resetBrief()
    expect(useDesignBriefStore.getState().brief).toBeNull()
  })

  it('hydrateBrief(null) sets brief to null', () => {
    useDesignBriefStore.getState().setBrief({ prompt: 'x' })
    useDesignBriefStore.getState().hydrateBrief(null)
    expect(useDesignBriefStore.getState().brief).toBeNull()
  })

  it('hydrateBrief(obj) replaces brief entirely', () => {
    const incoming: DesignBriefState = {
      prompt: 'loaded',
      formatId: 'a4',
      customWidthMm: undefined,
      customHeightMm: undefined,
      style: 'elegant',
      includeBleed: false,
      paletteText: '#ff0000',
      updatedAt: 1234,
    }
    useDesignBriefStore.getState().hydrateBrief(incoming)
    expect(useDesignBriefStore.getState().brief).toEqual(incoming)
  })

  it('useDesignBrief is exported and is a function', () => {
    expect(typeof useDesignBrief).toBe('function')
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npx vitest run src/stores/designBrief.store.test.ts`
Expected: FAIL — module `./designBrief.store` not found.

- [ ] **Step 3: Implement the store**

Create `src/stores/designBrief.store.ts`:

```ts
import { create } from 'zustand'
import { DEFAULT_DESIGN_BRIEF, type DesignBriefState } from '@/features/ai-design/types'

interface DesignBriefStore {
  brief: DesignBriefState | null
  setBrief: (patch: Partial<DesignBriefState>) => void
  resetBrief: () => void
  hydrateBrief: (brief: DesignBriefState | null) => void
}

export const useDesignBriefStore = create<DesignBriefStore>((set) => ({
  brief: null,
  setBrief: (patch) =>
    set((s) => {
      const base = s.brief ?? DEFAULT_DESIGN_BRIEF
      return { brief: { ...base, ...patch, updatedAt: Date.now() } }
    }),
  resetBrief: () => set({ brief: null }),
  hydrateBrief: (brief) => set({ brief }),
}))

/**
 * Selector hook — always returns a full DesignBriefState.
 * Falls back to DEFAULT_DESIGN_BRIEF when nothing is loaded / stored.
 */
export function useDesignBrief(): DesignBriefState {
  return useDesignBriefStore((s) => s.brief ?? DEFAULT_DESIGN_BRIEF)
}
```

- [ ] **Step 4: Run the test — expect PASS**

Run: `npx vitest run src/stores/designBrief.store.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/stores/designBrief.store.ts src/stores/designBrief.store.test.ts
git commit -m "feat(stores): add designBrief store with hydrate/reset/patch API

Holds the Claude Design panel form state. setBrief applies partial
patches, hydrateBrief/resetBrief are driven by Firestore load/unload."
```

---

## Task 3: Persist the brief in `useAutoSave.ts`

**Files:**
- Modify: `src/features/editor/useAutoSave.ts`

- [ ] **Step 1: Add import**

At the top of `src/features/editor/useAutoSave.ts`, after the existing store imports, add:

```ts
import { useDesignBriefStore } from '@/stores/designBrief.store'
```

- [ ] **Step 2: Serialize the brief in `updateDoc`**

Locate the `await updateDoc(doc(db, 'projects', projectId), { ... })` block inside the `save` function (around line 228). Add one new line to the payload:

```ts
await updateDoc(doc(db, 'projects', projectId), {
  title,
  canvasData: json,
  charSpacingMaps: Object.keys(charSpacingMaps).length > 0 ? JSON.stringify(charSpacingMaps) : null,
  dataSource: dataSource ? JSON.stringify(dataSource) : null,
  mergeFormulas: Object.keys(useMergeStore.getState().formulas).length > 0
    ? JSON.stringify(useMergeStore.getState().formulas) : null,
  mergeFormulaConfigs: Object.keys(useMergeStore.getState().formulaConfigs).length > 0
    ? JSON.stringify(useMergeStore.getState().formulaConfigs) : null,
  mergeHideLineIfEmpty: Object.keys(useMergeStore.getState().hideLineIfEmpty).length > 0
    ? JSON.stringify(useMergeStore.getState().hideLineIfEmpty) : null,
  canvasWidth,
  canvasHeight,
  canvasBg,
  canvasBgType,
  canvasBgGradient: JSON.stringify(canvasBgGradient),
  canvasBgImage,
  paletteColors: JSON.stringify(paletteColors),
  paletteGradients: JSON.stringify(paletteGradients),
  claudeDesignBrief: useDesignBriefStore.getState().brief
    ? JSON.stringify(useDesignBriefStore.getState().brief)
    : null,
  thumbnail,
  idmlSourceFileName: globalIdmlSource?.fileName ?? null,
  updatedAt: Date.now(),
})
```

- [ ] **Step 3: Subscribe to the brief store to mark unsaved**

Inside the `useAutoSave(fabricRef)` function, after the existing `useEffect` that hooks into Fabric events (`canvas.on('object:modified', …)`) and before the return, add a new effect that subscribes to the brief store:

```ts
// Mark project as unsaved whenever the Claude Design brief changes.
// Respects _loadingInProgress so hydration during load doesn't mark dirty.
useEffect(() => {
  if (!projectId) return
  const unsub = useDesignBriefStore.subscribe((state, prevState) => {
    if (state.brief === prevState.brief) return
    if (_loadingInProgressRef()) return
    setSaveStatus('unsaved')
  })
  return unsub
}, [projectId, setSaveStatus])
```

Because `_loadingInProgress` is a module-level `let` in the same file, expose it via a tiny accessor next to its declaration. At the top of the file, next to the existing `let _loadingInProgress = false` and `setLoadingInProgress` export, add:

```ts
function _loadingInProgressRef(): boolean {
  return _loadingInProgress
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/features/editor/useAutoSave.ts
git commit -m "feat(editor): persist Claude Design brief to Firestore on autosave

Serializes the designBrief store to projects/{id}.claudeDesignBrief and
marks the project as unsaved whenever the brief changes (gated by
_loadingInProgress to avoid dirty-on-hydrate)."
```

---

## Task 4: Hydrate the store in `useLoadCanvas.ts`

**Files:**
- Modify: `src/features/editor/useLoadCanvas.ts`

- [ ] **Step 1: Add imports**

At the top of `src/features/editor/useLoadCanvas.ts`, with the other store imports, add:

```ts
import { useDesignBriefStore } from '@/stores/designBrief.store'
import type { DesignBriefState } from '@/features/ai-design/types'
```

- [ ] **Step 2: Reset the store at the start of `load`**

Inside the `load(canvas)` inner function, immediately after `setLoadingInProgress(true)` and before `const snap = await getDoc(...)`, add:

```ts
// Prevent a previous project's brief from leaking into this load window.
useDesignBriefStore.getState().resetBrief()
```

- [ ] **Step 3: Hydrate after reading the doc**

Inside `load(canvas)`, after `if (data.title) setProjectTitle(data.title)` and before the `if (data.canvasWidth && data.canvasHeight)` block, add:

```ts
// Restore Claude Design brief (form state of the AI design panel).
try {
  const raw = data.claudeDesignBrief
  const parsed = typeof raw === 'string' && raw.length > 0
    ? JSON.parse(raw) as DesignBriefState
    : null
  useDesignBriefStore.getState().hydrateBrief(parsed)
} catch (err) {
  console.warn('[Load] claudeDesignBrief parse error:', err)
  useDesignBriefStore.getState().hydrateBrief(null)
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/features/editor/useLoadCanvas.ts
git commit -m "feat(editor): hydrate designBrief store from Firestore on project load

Resets the store before each load to prevent cross-project leakage,
then hydrates from the claudeDesignBrief JSON field if present."
```

---

## Task 5: Refactor `DesignPromptPanel.tsx` to read/write the store

**Files:**
- Modify: `src/features/ai-design/DesignPromptPanel.tsx`

- [ ] **Step 1: Read the current file**

Open `src/features/ai-design/DesignPromptPanel.tsx` (≈210 lines). You should see 7 `useState` calls at the top of the component: `prompt`, `formatId`, `customWidthMm`, `customHeightMm`, `style`, `includeBleed`, `paletteText`, plus `progressDismissed`.

- [ ] **Step 2: Replace the imports and state block**

Replace the top of the component (from the top of the file, through the 7 useState declarations) with:

```tsx
import { useEffect, useRef, useState } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import { FormatSelector } from './FormatSelector'
import { PrintSettingsPanel } from './PrintSettingsPanel'
import { DesignProgress } from './DesignProgress'
import { useGenerateDesign } from './useGenerateDesign'
import type { DesignStyle, DesignRequest } from './types'
import { DEFAULT_FORMAT_ID, PRINT_FORMATS, getFormatById } from '@/features/print/PRINT_FORMATS'
import { useUIStore } from '@/stores/ui.store'
import { useDesignBrief, useDesignBriefStore } from '@/stores/designBrief.store'
import { mmToPx, pxToMm } from '@/features/print/dimensions'

const STYLES: Array<{ id: DesignStyle; label: string; emoji: string }> = [
  { id: 'corporate',   label: 'Corporate',    emoji: '🏢' },
  { id: 'minimaliste', label: 'Minimaliste',  emoji: '◽' },
  { id: 'bold',        label: 'Bold',         emoji: '💥' },
  { id: 'elegant',     label: 'Élégant',      emoji: '✨' },
  { id: 'playful',     label: 'Playful',      emoji: '🎨' },
  { id: 'retro',       label: 'Rétro',        emoji: '📻' },
]

export function DesignPromptPanel() {
  const brief = useDesignBrief()
  const setBrief = useDesignBriefStore((s) => s.setBrief)
  const [progressDismissed, setProgressDismissed] = useState(false)
```

All subsequent references to `prompt`, `formatId`, `customWidthMm`, `customHeightMm`, `style`, `includeBleed`, `paletteText` in the body must become `brief.prompt`, `brief.formatId`, etc. All `setPrompt(v)` / `setFormatId(v)` / ... calls must become `setBrief({ prompt: v })` / `setBrief({ formatId: v })`, etc.

- [ ] **Step 3: Update the two sync `useEffect`s**

Replace the "(1) Push" effect with:

```tsx
useEffect(() => {
  if (!userChangedFormatRef.current) return
  userChangedFormatRef.current = false
  let widthMm: number | undefined
  let heightMm: number | undefined
  let dpiToUse = useUIStore.getState().dpi
  if (brief.formatId === 'custom') {
    widthMm = brief.customWidthMm
    heightMm = brief.customHeightMm
  } else {
    const f = getFormatById(brief.formatId)
    if (f) {
      widthMm = f.widthMm
      heightMm = f.heightMm
      dpiToUse = f.nativeDpi ?? dpiToUse
    }
  }
  if (!widthMm || !heightMm) return
  const wPx = Math.round(mmToPx(widthMm, dpiToUse))
  const hPx = Math.round(mmToPx(heightMm, dpiToUse))
  if (canvasWidth !== wPx || canvasHeight !== hPx) {
    useUIStore.getState().setCanvasSize(wPx, hPx, useUIStore.getState().canvasBg)
  }
}, [brief.formatId, brief.customWidthMm, brief.customHeightMm, canvasWidth, canvasHeight])
```

Replace the "(2) Pull" effect with:

```tsx
useEffect(() => {
  const uiDpi = useUIStore.getState().dpi
  const match = PRINT_FORMATS.find((f) => {
    const dpi = f.nativeDpi ?? uiDpi
    const wPx = Math.round(mmToPx(f.widthMm, dpi))
    const hPx = Math.round(mmToPx(f.heightMm, dpi))
    return Math.abs(wPx - canvasWidth) <= 2 && Math.abs(hPx - canvasHeight) <= 2
  })
  if (match) {
    if (match.id !== brief.formatId) setBrief({ formatId: match.id })
  } else {
    const wMm = Math.round(pxToMm(canvasWidth, uiDpi))
    const hMm = Math.round(pxToMm(canvasHeight, uiDpi))
    if (brief.formatId !== 'custom' || brief.customWidthMm !== wMm || brief.customHeightMm !== hMm) {
      setBrief({ formatId: 'custom', customWidthMm: wMm, customHeightMm: hMm })
    }
  }
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [canvasWidth, canvasHeight])
```

- [ ] **Step 4: Update `onSubmit`**

Replace the `onSubmit` function with:

```tsx
const onSubmit = () => {
  if (!brief.prompt.trim() || isRunning) return

  const palette = brief.paletteText
    .split(/[\s,]+/)
    .map((c) => c.trim())
    .filter((c) => /^#[0-9a-fA-F]{6}$/.test(c))

  const req: DesignRequest = {
    prompt: brief.prompt.trim(),
    formatId: brief.formatId,
    customWidthMm: brief.customWidthMm,
    customHeightMm: brief.customHeightMm,
    style: brief.style,
    includeBleed: brief.includeBleed,
    palette: palette.length > 0 ? palette : undefined,
  }
  setProgressDismissed(false)
  generate(req)
}
```

- [ ] **Step 5: Update the JSX — textarea, FormatSelector, style grid, bleed checkbox, palette input**

Replace the textarea block:

```tsx
<textarea
  value={brief.prompt}
  onChange={(e) => setBrief({ prompt: e.target.value })}
  placeholder="Ex : Affiche promo soldes d'été -30% pour magasin de chaussures, ambiance bord de mer"
  rows={4}
  className="w-full bg-[#1a1a1a] border border-neutral-800 rounded px-2 py-1.5 text-sm resize-none"
/>
```

Replace the `FormatSelector` block:

```tsx
<FormatSelector
  formatId={brief.formatId}
  customWidthMm={brief.customWidthMm}
  customHeightMm={brief.customHeightMm}
  onChange={(v) => {
    userChangedFormatRef.current = true
    setBrief({
      formatId: v.formatId,
      customWidthMm: v.customWidthMm,
      customHeightMm: v.customHeightMm,
    })
  }}
/>
```

Replace the style grid — inside the `STYLES.map`, change `style === s.id` to `brief.style === s.id` and `onClick={() => setStyle(s.id)}` to `onClick={() => setBrief({ style: s.id })}`.

Replace the bleed checkbox:

```tsx
<input
  type="checkbox"
  checked={brief.includeBleed}
  onChange={(e) => setBrief({ includeBleed: e.target.checked })}
  className="accent-indigo-500"
/>
```

Replace the palette input:

```tsx
<input
  type="text"
  value={brief.paletteText}
  onChange={(e) => setBrief({ paletteText: e.target.value })}
  placeholder="#ff6b35, #1a1a1a, #ffffff"
  className="w-full bg-[#1a1a1a] border border-neutral-800 rounded px-2 py-1 text-sm font-mono"
/>
```

Finally, the submit button's `disabled` check must use `brief.prompt`:

```tsx
<button
  type="button"
  onClick={onSubmit}
  disabled={isRunning || !brief.prompt.trim()}
  className="..."
>
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass, including the new `designBrief.store.test.ts`.

- [ ] **Step 8: Commit**

```bash
git add src/features/ai-design/DesignPromptPanel.tsx
git commit -m "refactor(ai-design): wire DesignPromptPanel to designBrief store

Replaces the 7 local useState fields by reads/writes on the shared
Zustand store. Persistence is now handled transparently by
useAutoSave / useLoadCanvas."
```

---

## Task 6: Manual smoke test and documentation of verified behavior

**Files:**
- None (verification only)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Expected: Vite dev server running, no TS errors.

- [ ] **Step 2: Scenario 1 — new project persistence**

1. Open the app, sign in, create a new project.
2. Open the Claude Design panel.
3. Type "Affiche test persistance" in the brief.
4. Change style to "Bold", format to A3, uncheck "Inclure fond perdu".
5. Type `#ff0000, #00ff00` in the palette field.
6. Trigger a save (e.g. click somewhere that triggers `globalSave`, or wait for the save badge to reach `saved`).
7. Reload the page.

Expected: the panel restores the exact values you typed. All five fields preserved.

- [ ] **Step 3: Scenario 2 — no cross-project leakage**

1. In the newly-loaded project (with brief "Affiche test persistance"), navigate to another project (existing or new) that has no brief.
2. Open the Claude Design panel.

Expected: the panel shows defaults (`prompt` empty, style `corporate`, bleed checked) — NOT "Affiche test persistance".

- [ ] **Step 4: Scenario 3 — brief survives a generation**

1. Return to the first project.
2. Click "Générer" and wait for the SVG to render on canvas.
3. Look at the panel after generation completes.

Expected: the brief text and all parameters are exactly what you submitted. You can edit any field and re-click "Générer".

- [ ] **Step 5: Scenario 4 — unsaved indicator fires on edit**

1. In a project, wait for save status to reach `saved`.
2. Edit any field in the Claude Design panel (e.g. toggle the bleed checkbox).

Expected: save status flips to `unsaved` immediately. After the next autosave fires, it goes back to `saved`.

- [ ] **Step 6: Verify no regressions**

Run: `npx vitest run`
Expected: all tests pass.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Report completion**

Summarize the four scenarios tested and confirm success. If any scenario failed, STOP and report the failure — do not claim completion.

---

## Self-review — plan vs spec

- **Spec § "Shape Firestore" — `claudeDesignBrief: string | null`:** covered by Task 3 (serialize) + Task 4 (hydrate).
- **Spec § "Store Zustand" — `setBrief`, `resetBrief`, `hydrateBrief`, `useDesignBrief`:** covered by Task 2 (TDD, all four APIs tested).
- **Spec § "Integration A — DesignPromptPanel":** covered by Task 5 (replaces 7 `useState`, keeps `progressDismissed` as local `useState` per spec, keeps the two sync effects).
- **Spec § "Integration B — useAutoSave":** covered by Task 3 (updateDoc line + subscribe effect gated by `_loadingInProgressRef`).
- **Spec § "Integration C — useLoadCanvas":** covered by Task 4 (resetBrief then hydrateBrief, with try/catch on JSON.parse).
- **Spec § "Integration D — Reset on project change":** covered by Task 4 Step 2 (resetBrief at start of `load`).
- **Spec § "Migration":** implicit in Task 4 Step 3 — `data.claudeDesignBrief === undefined` → `parsed = null` → `hydrateBrief(null)` → panel uses defaults. No schema migration needed.
- **Spec § "Tests — unit":** covered by Task 2 Step 1 (8 vitest tests covering all four store methods + selector + partial patches + updatedAt monotonicity).
- **Spec § "Tests — manual":** covered by Task 6 (4 scenarios mapping 1:1 to the spec's manual test list).
- **Spec § "Risks — fuite inter-projet":** mitigated by Task 4 Step 2.
- **Spec § "Risks — marking unsaved au chargement":** mitigated by Task 3 Step 3 (`_loadingInProgressRef()` gate).
- **Spec § "Risks — debounce autosave":** no change to existing debounce behavior — documented explicitly in the spec and not contradicted by any task.
