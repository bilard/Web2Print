# Manuel d'utilisation intégré — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer un manuel d'utilisation accessible via un bouton `?` global, sous forme de drawer latéral non-modal, avec copies d'écran, mockups React et liens navigables vers les menus de l'application.

**Architecture:** Module isolé `src/features/help/` (aucun import Fabric, aucun appel Firebase). Un store Zustand gère l'ouverture du drawer et l'ID de l'élément à mettre en surbrillance. Un hook `useHighlight` est instrumenté dans les composants cibles pour réagir. Le contenu est typé (pas de MDX), décrit sous forme de blocs hétérogènes (text, screenshot, mockup, menu-link, shortcut). Deux sections rédigées + 8 stubs pour montrer l'emplacement.

**Tech Stack:** React 18, Zustand v4, React Router v6, Tailwind v3, Lucide React, react-markdown + remark-gfm (déjà installés), Vitest (jsdom).

**Spec de référence:** `docs/superpowers/specs/2026-04-17-help-manual-design.md`

---

## File Structure

**Nouveaux fichiers (`src/features/help/`):**
- `help.store.ts` — état Zustand (open, currentSectionId, highlightTarget)
- `content/types.ts` — types HelpSection, HelpBlock, MenuTarget, HelpCategory
- `content/index.ts` — registre des sections + lookup par ID + liste blanche highlightIds
- `content/_stubs.ts` — 8 sections placeholder
- `content/getting-started.tsx` — section « Prise en main »
- `content/editor.tsx` — section « L'éditeur »
- `content/mockups/ExportButtonMock.tsx` — mockup React
- `content/mockups/ToolBarMock.tsx` — mockup React
- `hooks/useHelp.ts` — ouvrir/fermer/goToSection
- `hooks/useHighlight.ts` — applique ring + scroll si match
- `blocks/TextBlock.tsx` — rendu markdown d'un bloc text
- `blocks/ScreenshotBlock.tsx` — rendu image avec caption
- `blocks/MockupBlock.tsx` — rendu composant React inline
- `blocks/ShortcutBlock.tsx` — affichage touches clavier
- `MenuLink.tsx` — bouton lien qui navigue + highlight
- `HelpSectionView.tsx` — rendu d'une section (itération sur blocs)
- `HelpTableOfContents.tsx` — sommaire par catégorie + recherche
- `HelpDrawer.tsx` — drawer principal (portail, non-modal)
- `HelpTrigger.tsx` — bouton `?` flottant + raccourci clavier

**Fichiers modifiés:**
- `src/features/auth/ProtectedRoute.tsx` — rend `<HelpTrigger />`
- `src/components/panels/EditorHeader.tsx` — instrumente boutons Save et Export
- `src/components/panels/ToolBar.tsx` — instrumente outils Texte et Image
- `src/components/panels/LayersPanel.tsx` — instrumente le conteneur
- `src/pages/DashboardPage.tsx` — instrumente le bouton « Nouveau document »

**Tests (vitest):**
- `src/features/help/help.store.test.ts`
- `src/features/help/content/index.test.ts`

**Assets statiques (`public/help/screenshots/`):**
- `dashboard-overview.png`, `editor-layout.png`, `editor-toolbar.png`, `editor-layers.png` (fournis par l'utilisateur ou capturés en exécution manuelle — voir Task 16)

---

## Task 1 : Types du module Help

**Files:**
- Create: `src/features/help/content/types.ts`

- [ ] **Step 1: Créer le fichier de types**

```ts
// src/features/help/content/types.ts
import type { ComponentType } from 'react'
import type { LucideIcon } from 'lucide-react'

export type HelpCategory = 'Démarrage' | 'Édition' | 'Import' | 'Données' | 'Export'

export type MenuTarget = {
  path: string
  highlightId?: string
}

export type HelpBlock =
  | { type: 'text'; md: string }
  | { type: 'screenshot'; src: string; alt: string; caption?: string }
  | { type: 'mockup'; Component: ComponentType }
  | { type: 'menu-link'; target: MenuTarget; label: string; icon?: LucideIcon }
  | { type: 'shortcut'; keys: string[]; label: string }

export type HelpSection = {
  id: string
  title: string
  category: HelpCategory
  intro: string
  blocks: HelpBlock[]
}

export const HELP_CATEGORIES: HelpCategory[] = [
  'Démarrage',
  'Édition',
  'Import',
  'Données',
  'Export',
]
```

- [ ] **Step 2: Vérifier la compilation TS**

Run: `npx tsc --noEmit`
Expected: pas d'erreur sur ce fichier

- [ ] **Step 3: Commit**

```bash
git add src/features/help/content/types.ts
git commit -m "feat(help): add content types for help module"
```

---

## Task 2 : Store Zustand — state & actions

**Files:**
- Create: `src/features/help/help.store.ts`
- Test: `src/features/help/help.store.test.ts`

- [ ] **Step 1: Écrire le test en échec**

```ts
// src/features/help/help.store.test.ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useHelpStore } from './help.store'

describe('help.store', () => {
  beforeEach(() => {
    useHelpStore.setState({
      open: false,
      currentSectionId: null,
      highlightTarget: null,
    })
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('opens and closes the drawer', () => {
    useHelpStore.getState().openDrawer()
    expect(useHelpStore.getState().open).toBe(true)

    useHelpStore.getState().closeDrawer()
    expect(useHelpStore.getState().open).toBe(false)
  })

  it('goToSection opens drawer and sets currentSectionId', () => {
    useHelpStore.getState().goToSection('editor')
    const { open, currentSectionId } = useHelpStore.getState()
    expect(open).toBe(true)
    expect(currentSectionId).toBe('editor')
  })

  it('setHighlightTarget stores the id', () => {
    useHelpStore.getState().setHighlightTarget('toolbar.text')
    expect(useHelpStore.getState().highlightTarget).toBe('toolbar.text')
  })

  it('setHighlightTarget auto-resets after 3 seconds', () => {
    useHelpStore.getState().setHighlightTarget('toolbar.text')
    expect(useHelpStore.getState().highlightTarget).toBe('toolbar.text')

    vi.advanceTimersByTime(3000)
    expect(useHelpStore.getState().highlightTarget).toBe(null)
  })

  it('setHighlightTarget(null) cancels pending reset', () => {
    useHelpStore.getState().setHighlightTarget('toolbar.text')
    useHelpStore.getState().setHighlightTarget(null)

    vi.advanceTimersByTime(3000)
    expect(useHelpStore.getState().highlightTarget).toBe(null)
  })

  it('a new target cancels previous timeout', () => {
    useHelpStore.getState().setHighlightTarget('a')
    vi.advanceTimersByTime(1500)
    useHelpStore.getState().setHighlightTarget('b')
    vi.advanceTimersByTime(1500)
    expect(useHelpStore.getState().highlightTarget).toBe('b')
    vi.advanceTimersByTime(1500)
    expect(useHelpStore.getState().highlightTarget).toBe(null)
  })
})
```

- [ ] **Step 2: Lancer le test — il doit échouer (module manquant)**

Run: `npx vitest run src/features/help/help.store.test.ts`
Expected: FAIL — `Cannot find module './help.store'`

- [ ] **Step 3: Implémenter le store**

```ts
// src/features/help/help.store.ts
import { create } from 'zustand'

interface HelpState {
  open: boolean
  currentSectionId: string | null
  highlightTarget: string | null
  openDrawer: () => void
  closeDrawer: () => void
  toggleDrawer: () => void
  goToSection: (id: string) => void
  setHighlightTarget: (id: string | null) => void
}

let resetTimer: ReturnType<typeof setTimeout> | null = null

export const useHelpStore = create<HelpState>((set) => ({
  open: false,
  currentSectionId: null,
  highlightTarget: null,

  openDrawer: () => set({ open: true }),
  closeDrawer: () => set({ open: false }),
  toggleDrawer: () => set((s) => ({ open: !s.open })),

  goToSection: (id) => set({ open: true, currentSectionId: id }),

  setHighlightTarget: (id) => {
    if (resetTimer) {
      clearTimeout(resetTimer)
      resetTimer = null
    }
    set({ highlightTarget: id })
    if (id !== null) {
      resetTimer = setTimeout(() => {
        set({ highlightTarget: null })
        resetTimer = null
      }, 3000)
    }
  },
}))
```

- [ ] **Step 4: Relancer le test — il doit passer**

Run: `npx vitest run src/features/help/help.store.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/features/help/help.store.ts src/features/help/help.store.test.ts
git commit -m "feat(help): add Zustand store with auto-reset highlight"
```

---

## Task 3 : Hook useHighlight

**Files:**
- Create: `src/features/help/hooks/useHighlight.ts`

- [ ] **Step 1: Implémenter le hook**

Pas de test unitaire (pas de `@testing-library/react` installé). Logique simple vérifiée par usage dans les composants cibles.

```ts
// src/features/help/hooks/useHighlight.ts
import { useEffect, useRef } from 'react'
import { useHelpStore } from '../help.store'

const HIGHLIGHT_CLASS =
  'ring-2 ring-indigo-500 ring-offset-2 ring-offset-[#0f0f0f] animate-pulse transition-shadow'

/**
 * À placer sur un composant cible. Quand help.store.highlightTarget === id,
 * applique un ring indigo pulsant + scroll au centre. Reset automatique par le store.
 */
export function useHighlight<T extends HTMLElement>(id: string): {
  ref: React.RefObject<T>
  className: string
} {
  const ref = useRef<T>(null)
  const isActive = useHelpStore((s) => s.highlightTarget === id)

  useEffect(() => {
    if (isActive && ref.current) {
      ref.current.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [isActive])

  return {
    ref,
    className: isActive ? HIGHLIGHT_CLASS : '',
  }
}
```

- [ ] **Step 2: Vérifier la compilation TS**

Run: `npx tsc --noEmit`
Expected: pas d'erreur

- [ ] **Step 3: Commit**

```bash
git add src/features/help/hooks/useHighlight.ts
git commit -m "feat(help): add useHighlight hook for cross-page targeting"
```

---

## Task 4 : Hook useHelp

**Files:**
- Create: `src/features/help/hooks/useHelp.ts`

- [ ] **Step 1: Implémenter le hook**

```ts
// src/features/help/hooks/useHelp.ts
import { useHelpStore } from '../help.store'

/**
 * Façade publique pour ouvrir/fermer le drawer ou naviguer vers une section.
 * Évite aux consommateurs d'importer directement le store.
 */
export function useHelp() {
  const open = useHelpStore((s) => s.open)
  const currentSectionId = useHelpStore((s) => s.currentSectionId)
  const openDrawer = useHelpStore((s) => s.openDrawer)
  const closeDrawer = useHelpStore((s) => s.closeDrawer)
  const toggleDrawer = useHelpStore((s) => s.toggleDrawer)
  const goToSection = useHelpStore((s) => s.goToSection)

  return {
    open,
    currentSectionId,
    openDrawer,
    closeDrawer,
    toggleDrawer,
    goToSection,
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/help/hooks/useHelp.ts
git commit -m "feat(help): add useHelp facade hook"
```

---

## Task 5 : Liste blanche des highlightIds

**Files:**
- Create: `src/features/help/hooks/highlightIds.ts`

- [ ] **Step 1: Créer la liste blanche**

Cette liste est la source de vérité : un `MenuLink` ne peut cibler que ces IDs, et le test du registre (Task 11) la vérifie.

```ts
// src/features/help/hooks/highlightIds.ts
export const HIGHLIGHT_IDS = [
  'editor-header.save',
  'editor-header.export',
  'toolbar.text',
  'toolbar.image',
  'layers-panel',
  'dashboard.new-project',
] as const

export type HighlightId = typeof HIGHLIGHT_IDS[number]
```

- [ ] **Step 2: Commit**

```bash
git add src/features/help/hooks/highlightIds.ts
git commit -m "feat(help): declare highlight id whitelist"
```

---

## Task 6 : Bloc TextBlock

**Files:**
- Create: `src/features/help/blocks/TextBlock.tsx`

- [ ] **Step 1: Implémenter le bloc**

Utilise `react-markdown` (déjà installé) + `remark-gfm`.

```tsx
// src/features/help/blocks/TextBlock.tsx
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface TextBlockProps {
  md: string
}

export function TextBlock({ md }: TextBlockProps) {
  return (
    <div className="prose prose-invert prose-sm max-w-none
      prose-p:text-white/70 prose-p:leading-relaxed
      prose-strong:text-white/90
      prose-code:text-indigo-300 prose-code:bg-white/5 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:hidden prose-code:after:hidden
      prose-ul:text-white/70 prose-li:my-0.5
      prose-a:text-indigo-400 hover:prose-a:text-indigo-300">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>
    </div>
  )
}
```

- [ ] **Step 2: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: pas d'erreur

- [ ] **Step 3: Vérifier que le plugin typography Tailwind est actif**

Il l'est : `package.json` inclut `@tailwindcss/typography`. Si `tailwind.config.ts` ne l'importe pas, l'ajouter. Lire le fichier :

Run: `grep -n "typography" /Applications/_IA/Claude_workspace/Web2Print/tailwind.config.ts`
Expected: une ligne contenant `require('@tailwindcss/typography')` dans `plugins`.

Si absent, ajouter dans `plugins: [...]` : `require('@tailwindcss/typography')`.

- [ ] **Step 4: Commit**

```bash
git add src/features/help/blocks/TextBlock.tsx tailwind.config.ts
git commit -m "feat(help): add TextBlock using react-markdown"
```

---

## Task 7 : Bloc ScreenshotBlock

**Files:**
- Create: `src/features/help/blocks/ScreenshotBlock.tsx`

- [ ] **Step 1: Implémenter le bloc**

```tsx
// src/features/help/blocks/ScreenshotBlock.tsx
interface ScreenshotBlockProps {
  src: string
  alt: string
  caption?: string
}

export function ScreenshotBlock({ src, alt, caption }: ScreenshotBlockProps) {
  return (
    <figure className="my-3">
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="w-full rounded-lg border border-white/10 bg-[#0f0f0f]"
      />
      {caption && (
        <figcaption className="mt-1.5 text-[11px] text-white/40 text-center italic">
          {caption}
        </figcaption>
      )}
    </figure>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/help/blocks/ScreenshotBlock.tsx
git commit -m "feat(help): add ScreenshotBlock"
```

---

## Task 8 : Bloc MockupBlock

**Files:**
- Create: `src/features/help/blocks/MockupBlock.tsx`

- [ ] **Step 1: Implémenter le bloc**

```tsx
// src/features/help/blocks/MockupBlock.tsx
import type { ComponentType } from 'react'

interface MockupBlockProps {
  Component: ComponentType
}

export function MockupBlock({ Component }: MockupBlockProps) {
  return (
    <div className="my-3 p-4 rounded-lg border border-white/10 bg-[#0f0f0f] flex items-center justify-center">
      <Component />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/help/blocks/MockupBlock.tsx
git commit -m "feat(help): add MockupBlock"
```

---

## Task 9 : Bloc ShortcutBlock

**Files:**
- Create: `src/features/help/blocks/ShortcutBlock.tsx`

- [ ] **Step 1: Implémenter le bloc**

```tsx
// src/features/help/blocks/ShortcutBlock.tsx
interface ShortcutBlockProps {
  keys: string[]
  label: string
}

export function ShortcutBlock({ keys, label }: ShortcutBlockProps) {
  return (
    <div className="my-2 flex items-center justify-between gap-3 py-1.5 px-2.5 rounded-md bg-white/[0.02] border border-white/5">
      <span className="text-xs text-white/70">{label}</span>
      <div className="flex items-center gap-1">
        {keys.map((k, i) => (
          <kbd
            key={i}
            className="min-w-[24px] h-6 px-1.5 flex items-center justify-center rounded border border-white/15 bg-white/5 text-[11px] text-white/70 font-mono"
          >
            {k}
          </kbd>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/help/blocks/ShortcutBlock.tsx
git commit -m "feat(help): add ShortcutBlock"
```

---

## Task 10 : Composant MenuLink

**Files:**
- Create: `src/features/help/MenuLink.tsx`

- [ ] **Step 1: Implémenter le composant**

```tsx
// src/features/help/MenuLink.tsx
import { useLocation, useNavigate } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import { ArrowUpRight } from 'lucide-react'
import type { MenuTarget } from './content/types'
import { useHelpStore } from './help.store'

interface MenuLinkProps {
  target: MenuTarget
  label: string
  icon?: LucideIcon
}

export function MenuLink({ target, label, icon: Icon }: MenuLinkProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const setHighlightTarget = useHelpStore((s) => s.setHighlightTarget)
  const closeDrawer = useHelpStore((s) => s.closeDrawer)

  const isCurrentRoute = matchesRoute(location.pathname, target.path)

  const handleClick = () => {
    if (target.highlightId) {
      setHighlightTarget(target.highlightId)
    }
    if (!isCurrentRoute) {
      navigate(resolveNavigatablePath(target.path))
      closeDrawer()
    }
  }

  const TrailingIcon = Icon ?? ArrowUpRight

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-1.5 my-1 mr-1 px-2 py-1 rounded-md
        bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 hover:text-indigo-300
        border border-indigo-500/20 text-xs font-medium transition-colors"
    >
      <TrailingIcon className="w-3 h-3" />
      {label}
    </button>
  )
}

/** Les paths peuvent contenir :id — on compare le premier segment statique. */
function matchesRoute(current: string, target: string): boolean {
  const currentSegments = current.split('/').filter(Boolean)
  const targetSegments = target.split('/').filter(Boolean)
  if (currentSegments.length === 0 || targetSegments.length === 0) return false
  return currentSegments[0] === targetSegments[0]
}

/** Pour /editor/:id on ne peut pas naviguer tel quel — on retourne / si placeholder. */
function resolveNavigatablePath(path: string): string {
  if (path.includes(':')) {
    // Segment avec placeholder — on ne navigue pas, reste sur la route courante
    return path.split(':')[0].replace(/\/$/, '') || '/'
  }
  return path
}
```

- [ ] **Step 2: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: pas d'erreur

- [ ] **Step 3: Commit**

```bash
git add src/features/help/MenuLink.tsx
git commit -m "feat(help): add MenuLink with route-aware navigation + highlight"
```

---

## Task 11 : Registre de contenu + validation (TDD)

**Files:**
- Create: `src/features/help/content/index.ts`
- Create: `src/features/help/content/_stubs.ts`
- Test: `src/features/help/content/index.test.ts`

- [ ] **Step 1: Écrire les stubs (placeholders)**

```tsx
// src/features/help/content/_stubs.ts
import type { HelpSection } from './types'

const stub = (id: string, title: string, category: HelpSection['category']): HelpSection => ({
  id,
  title,
  category,
  intro: 'Rédaction à venir.',
  blocks: [
    {
      type: 'text',
      md: '_Cette section sera rédigée prochainement._',
    },
  ],
})

export const STUBS: HelpSection[] = [
  stub('import-idml', 'Import InDesign (IDML)', 'Import'),
  stub('import-pptx', 'Import PowerPoint (PPTX)', 'Import'),
  stub('import-excel', 'Import Excel & PIM', 'Import'),
  stub('dam', 'Bibliothèque d\'assets (DAM)', 'Édition'),
  stub('taxonomies', 'Taxonomies', 'Données'),
  stub('briefs', 'Briefs & génération IA', 'Données'),
  stub('scraping', 'Scraping produits', 'Données'),
  stub('export', 'Export multi-format', 'Export'),
]
```

- [ ] **Step 2: Écrire le test du registre en échec**

```ts
// src/features/help/content/index.test.ts
import { describe, it, expect } from 'vitest'
import { helpSections, helpSectionsById } from './index'
import { HIGHLIGHT_IDS } from '../hooks/highlightIds'

describe('help content registry', () => {
  it('contains at least 10 sections (2 rédigées + 8 stubs)', () => {
    expect(helpSections.length).toBeGreaterThanOrEqual(10)
  })

  it('every section has a unique id', () => {
    const ids = helpSections.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('helpSectionsById resolves every section by id', () => {
    for (const s of helpSections) {
      expect(helpSectionsById.get(s.id)).toBe(s)
    }
  })

  it('every menu-link highlightId is in the whitelist', () => {
    const whitelist = new Set<string>(HIGHLIGHT_IDS)
    const offenders: string[] = []
    for (const s of helpSections) {
      for (const b of s.blocks) {
        if (b.type === 'menu-link' && b.target.highlightId) {
          if (!whitelist.has(b.target.highlightId)) {
            offenders.push(`${s.id}: ${b.target.highlightId}`)
          }
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
```

- [ ] **Step 3: Lancer — doit échouer (index.ts manquant)**

Run: `npx vitest run src/features/help/content/index.test.ts`
Expected: FAIL — `Cannot find module './index'`

- [ ] **Step 4: Implémenter le registre**

Les fichiers `getting-started.tsx` et `editor.tsx` n'existent pas encore — créer un registre **temporaire** qui ne charge que les stubs, pour faire passer le test. Les sections rédigées seront ajoutées Tasks 13-14.

```ts
// src/features/help/content/index.ts
import type { HelpSection } from './types'
import { STUBS } from './_stubs'

export const helpSections: HelpSection[] = [
  // Sections rédigées (ajoutées en Tasks 13-14)
  ...STUBS,
]

export const helpSectionsById: Map<string, HelpSection> = new Map(
  helpSections.map((s) => [s.id, s]),
)
```

- [ ] **Step 5: Relancer — doit passer**

Run: `npx vitest run src/features/help/content/index.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add src/features/help/content/_stubs.ts src/features/help/content/index.ts src/features/help/content/index.test.ts
git commit -m "feat(help): add content registry with stubs and validation"
```

---

## Task 12 : Mockups React pour sections rédigées

**Files:**
- Create: `src/features/help/content/mockups/ExportButtonMock.tsx`
- Create: `src/features/help/content/mockups/ToolBarMock.tsx`

- [ ] **Step 1: Créer le mockup du bouton Exporter**

```tsx
// src/features/help/content/mockups/ExportButtonMock.tsx
import { Download } from 'lucide-react'

export function ExportButtonMock() {
  return (
    <button
      type="button"
      className="flex items-center gap-1.5 bg-indigo-500 text-white text-sm font-medium px-3 py-1.5 rounded-lg pointer-events-none"
    >
      <Download className="w-3.5 h-3.5" />
      Exporter
    </button>
  )
}
```

- [ ] **Step 2: Créer le mockup de la toolbar**

```tsx
// src/features/help/content/mockups/ToolBarMock.tsx
import { MousePointer2, Type, Square, Circle, Image as ImageIcon } from 'lucide-react'

const tools = [
  { Icon: MousePointer2, label: 'Sélection' },
  { Icon: Type, label: 'Texte' },
  { Icon: Square, label: 'Rectangle' },
  { Icon: Circle, label: 'Ellipse' },
  { Icon: ImageIcon, label: 'Image' },
]

export function ToolBarMock() {
  return (
    <div className="w-11 bg-[#1a1a1a] border border-white/10 rounded-md flex flex-col items-center py-2 gap-0.5 pointer-events-none">
      {tools.map((t, i) => (
        <div
          key={i}
          className="w-[34px] h-[34px] flex items-center justify-center rounded-md text-white/60"
          title={t.label}
        >
          <t.Icon className="w-4 h-4" />
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/features/help/content/mockups/
git commit -m "feat(help): add React mockups for help sections"
```

---

## Task 13 : Section rédigée — Prise en main

**Files:**
- Create: `src/features/help/content/getting-started.tsx`
- Modify: `src/features/help/content/index.ts`

- [ ] **Step 1: Rédiger la section**

```tsx
// src/features/help/content/getting-started.tsx
import { LayoutGrid, Pencil } from 'lucide-react'
import type { HelpSection } from './types'

export const gettingStarted: HelpSection = {
  id: 'getting-started',
  title: 'Prise en main',
  category: 'Démarrage',
  intro: 'Connexion, tableau de bord et création du premier projet.',
  blocks: [
    {
      type: 'text',
      md: `Web2Print est un éditeur visuel en ligne pour créer, importer et exporter des documents imprimables (print ou présentation).

**Étapes pour démarrer :**

1. **Se connecter** via Google depuis l'écran de connexion.
2. **Choisir une action** dans la barre latérale du tableau de bord.
3. **Créer un projet vierge** ou **importer** un document existant (IDML, PPTX, Excel).`,
    },
    {
      type: 'screenshot',
      src: '/help/screenshots/dashboard-overview.png',
      alt: 'Vue générale du tableau de bord Web2Print',
      caption: 'Le tableau de bord : bibliothèque de projets, import et paramètres.',
    },
    {
      type: 'text',
      md: `### Créer un projet vierge

Ouvre le panneau « Nouveau document » et choisis un format (A4, A3, personnalisé). Le projet s'ouvre directement dans l'éditeur.`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.new-project' },
      label: 'Ouvrir « Nouveau document »',
      icon: LayoutGrid,
    },
    {
      type: 'text',
      md: `### Retrouver un projet existant

La bibliothèque liste tous tes projets. Clic simple pour ouvrir, clic droit pour dupliquer ou supprimer. Les taxonomies permettent de classer les projets par thématique.`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard' },
      label: 'Retour au tableau de bord',
    },
    {
      type: 'text',
      md: `### Raccourcis utiles à connaître`,
    },
    { type: 'shortcut', keys: ['⌘', 'S'], label: 'Sauvegarder le projet' },
    { type: 'shortcut', keys: ['⌘', 'Z'], label: 'Annuler la dernière action' },
    { type: 'shortcut', keys: ['⌘', 'Y'], label: 'Rétablir' },
    { type: 'shortcut', keys: ['⇧', '?'], label: 'Ouvrir / fermer le manuel' },
    {
      type: 'text',
      md: `La section suivante, _L'éditeur_, détaille l'interface et les outils disponibles.`,
    },
    {
      type: 'menu-link',
      target: { path: '/editor' },
      label: 'Ouvrir l\'éditeur',
      icon: Pencil,
    },
  ],
}
```

- [ ] **Step 2: Enregistrer la section dans le registre**

Modifier `src/features/help/content/index.ts` :

```ts
// src/features/help/content/index.ts
import type { HelpSection } from './types'
import { STUBS } from './_stubs'
import { gettingStarted } from './getting-started'

export const helpSections: HelpSection[] = [
  gettingStarted,
  ...STUBS,
]

export const helpSectionsById: Map<string, HelpSection> = new Map(
  helpSections.map((s) => [s.id, s]),
)
```

- [ ] **Step 3: Relancer le test du registre**

Run: `npx vitest run src/features/help/content/index.test.ts`
Expected: PASS (4 tests, le whitelist test doit toujours passer)

- [ ] **Step 4: Commit**

```bash
git add src/features/help/content/getting-started.tsx src/features/help/content/index.ts
git commit -m "feat(help): add Getting Started section content"
```

---

## Task 14 : Section rédigée — L'éditeur

**Files:**
- Create: `src/features/help/content/editor.tsx`
- Modify: `src/features/help/content/index.ts`

- [ ] **Step 1: Rédiger la section**

```tsx
// src/features/help/content/editor.tsx
import { Save, Download, Type, Image as ImageIcon, Layers } from 'lucide-react'
import type { HelpSection } from './types'
import { ExportButtonMock } from './mockups/ExportButtonMock'
import { ToolBarMock } from './mockups/ToolBarMock'

export const editorSection: HelpSection = {
  id: 'editor',
  title: "L'éditeur",
  category: 'Édition',
  intro: 'Canvas, outils, calques et sauvegarde du projet.',
  blocks: [
    {
      type: 'text',
      md: `L'éditeur se compose d'un **header** (titre, sauvegarde, export), d'une **barre d'outils** à gauche, du **canvas** au centre et des **panneaux** à droite (calques, palette, données).`,
    },
    {
      type: 'screenshot',
      src: '/help/screenshots/editor-layout.png',
      alt: 'Vue générale de l\'éditeur avec ses zones',
      caption: 'Les zones principales de l\'éditeur.',
    },
    { type: 'text', md: '### Barre d\'outils' },
    { type: 'mockup', Component: ToolBarMock },
    {
      type: 'text',
      md: `Les outils de création (Texte, Rectangle, Ellipse, Ligne) ajoutent immédiatement une forme sur le canvas puis reviennent à l'outil Sélection. L'outil Image ouvre le panneau Images dans la colonne de droite.`,
    },
    {
      type: 'menu-link',
      target: { path: '/editor', highlightId: 'toolbar.text' },
      label: 'Outil Texte',
      icon: Type,
    },
    {
      type: 'menu-link',
      target: { path: '/editor', highlightId: 'toolbar.image' },
      label: 'Outil Image',
      icon: ImageIcon,
    },
    { type: 'text', md: '### Calques' },
    {
      type: 'text',
      md: `Le panneau **Calques** liste tous les objets du canvas. Tu peux masquer (œil), supprimer (poubelle) ou réordonner un calque par drag-and-drop. Les textes se déplient pour éditer chaque segment séparément.`,
    },
    {
      type: 'menu-link',
      target: { path: '/editor', highlightId: 'layers-panel' },
      label: 'Panneau Calques',
      icon: Layers,
    },
    { type: 'text', md: '### Sauvegarder & exporter' },
    {
      type: 'text',
      md: `La sauvegarde est **automatique** mais le bouton Sauvegarder permet un commit manuel. Le bouton Exporter ouvre la fenêtre de choix de format (PDF, PNG, PPTX).`,
    },
    {
      type: 'menu-link',
      target: { path: '/editor', highlightId: 'editor-header.save' },
      label: 'Bouton Sauvegarder',
      icon: Save,
    },
    { type: 'mockup', Component: ExportButtonMock },
    {
      type: 'menu-link',
      target: { path: '/editor', highlightId: 'editor-header.export' },
      label: 'Bouton Exporter',
      icon: Download,
    },
    { type: 'text', md: '### Raccourcis de l\'éditeur' },
    { type: 'shortcut', keys: ['V'], label: 'Outil Sélection' },
    { type: 'shortcut', keys: ['T'], label: 'Outil Texte' },
    { type: 'shortcut', keys: ['R'], label: 'Outil Rectangle' },
    { type: 'shortcut', keys: ['E'], label: 'Outil Ellipse' },
  ],
}
```

- [ ] **Step 2: Enregistrer dans le registre**

```ts
// src/features/help/content/index.ts
import type { HelpSection } from './types'
import { STUBS } from './_stubs'
import { gettingStarted } from './getting-started'
import { editorSection } from './editor'

export const helpSections: HelpSection[] = [
  gettingStarted,
  editorSection,
  ...STUBS,
]

export const helpSectionsById: Map<string, HelpSection> = new Map(
  helpSections.map((s) => [s.id, s]),
)
```

- [ ] **Step 3: Relancer le test**

Run: `npx vitest run src/features/help/content/index.test.ts`
Expected: PASS (tous les highlightIds utilisés — `toolbar.text`, `toolbar.image`, `layers-panel`, `editor-header.save`, `editor-header.export`, `dashboard.new-project` — sont dans `HIGHLIGHT_IDS`)

- [ ] **Step 4: Commit**

```bash
git add src/features/help/content/editor.tsx src/features/help/content/index.ts
git commit -m "feat(help): add Editor section content with mockups and links"
```

---

## Task 15 : Composant HelpSectionView

**Files:**
- Create: `src/features/help/HelpSectionView.tsx`

- [ ] **Step 1: Implémenter le composant**

```tsx
// src/features/help/HelpSectionView.tsx
import type { HelpSection, HelpBlock } from './content/types'
import { TextBlock } from './blocks/TextBlock'
import { ScreenshotBlock } from './blocks/ScreenshotBlock'
import { MockupBlock } from './blocks/MockupBlock'
import { ShortcutBlock } from './blocks/ShortcutBlock'
import { MenuLink } from './MenuLink'

interface HelpSectionViewProps {
  section: HelpSection
}

export function HelpSectionView({ section }: HelpSectionViewProps) {
  return (
    <article className="flex flex-col gap-1">
      <header className="mb-2">
        <div className="text-[10px] uppercase tracking-wider text-indigo-400/80 font-medium">
          {section.category}
        </div>
        <h2 className="text-lg font-semibold text-white mt-0.5">{section.title}</h2>
        <p className="text-sm text-white/60 mt-1">{section.intro}</p>
      </header>
      {section.blocks.map((b, i) => (
        <BlockRenderer key={i} block={b} />
      ))}
    </article>
  )
}

function BlockRenderer({ block }: { block: HelpBlock }) {
  switch (block.type) {
    case 'text':
      return <TextBlock md={block.md} />
    case 'screenshot':
      return <ScreenshotBlock src={block.src} alt={block.alt} caption={block.caption} />
    case 'mockup':
      return <MockupBlock Component={block.Component} />
    case 'menu-link':
      return <MenuLink target={block.target} label={block.label} icon={block.icon} />
    case 'shortcut':
      return <ShortcutBlock keys={block.keys} label={block.label} />
  }
}
```

- [ ] **Step 2: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: pas d'erreur (switch doit être exhaustif)

- [ ] **Step 3: Commit**

```bash
git add src/features/help/HelpSectionView.tsx
git commit -m "feat(help): add HelpSectionView block renderer"
```

---

## Task 16 : Composant HelpTableOfContents

**Files:**
- Create: `src/features/help/HelpTableOfContents.tsx`

- [ ] **Step 1: Implémenter le sommaire**

```tsx
// src/features/help/HelpTableOfContents.tsx
import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { helpSections } from './content/index'
import { HELP_CATEGORIES, type HelpCategory, type HelpSection } from './content/types'
import { useHelpStore } from './help.store'

export function HelpTableOfContents() {
  const currentSectionId = useHelpStore((s) => s.currentSectionId)
  const goToSection = useHelpStore((s) => s.goToSection)
  const [query, setQuery] = useState('')

  const grouped = useMemo(() => groupByCategory(filter(helpSections, query)), [query])

  return (
    <nav className="flex flex-col gap-3">
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher..."
          className="w-full bg-white/5 border border-white/10 rounded-md pl-7 pr-2 py-1.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-indigo-500"
        />
      </div>
      {HELP_CATEGORIES.map((cat) => {
        const sections = grouped.get(cat)
        if (!sections || sections.length === 0) return null
        return (
          <div key={cat} className="flex flex-col gap-0.5">
            <div className="text-[10px] uppercase tracking-wider text-white/40 font-medium px-2 mb-1">
              {cat}
            </div>
            {sections.map((s) => {
              const active = s.id === currentSectionId
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => goToSection(s.id)}
                  className={`text-left text-xs px-2 py-1.5 rounded transition-colors ${
                    active
                      ? 'bg-indigo-500/15 text-indigo-300'
                      : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {s.title}
                </button>
              )
            })}
          </div>
        )
      })}
    </nav>
  )
}

function filter(sections: HelpSection[], query: string): HelpSection[] {
  const q = query.trim().toLowerCase()
  if (!q) return sections
  return sections.filter(
    (s) => s.title.toLowerCase().includes(q) || s.intro.toLowerCase().includes(q),
  )
}

function groupByCategory(sections: HelpSection[]): Map<HelpCategory, HelpSection[]> {
  const map = new Map<HelpCategory, HelpSection[]>()
  for (const s of sections) {
    const arr = map.get(s.category) ?? []
    arr.push(s)
    map.set(s.category, arr)
  }
  return map
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/help/HelpTableOfContents.tsx
git commit -m "feat(help): add table of contents with search and category grouping"
```

---

## Task 17 : Composant HelpDrawer

**Files:**
- Create: `src/features/help/HelpDrawer.tsx`

- [ ] **Step 1: Implémenter le drawer (portail, non-modal)**

```tsx
// src/features/help/HelpDrawer.tsx
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, HelpCircle } from 'lucide-react'
import { useHelpStore } from './help.store'
import { helpSectionsById, helpSections } from './content/index'
import { HelpTableOfContents } from './HelpTableOfContents'
import { HelpSectionView } from './HelpSectionView'

export function HelpDrawer() {
  const open = useHelpStore((s) => s.open)
  const currentSectionId = useHelpStore((s) => s.currentSectionId)
  const closeDrawer = useHelpStore((s) => s.closeDrawer)
  const goToSection = useHelpStore((s) => s.goToSection)

  // Escape ferme le drawer
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, closeDrawer])

  // À l'ouverture, sélectionne la 1re section si aucune
  useEffect(() => {
    if (open && !currentSectionId && helpSections.length > 0) {
      goToSection(helpSections[0].id)
    }
  }, [open, currentSectionId, goToSection])

  const section = currentSectionId ? helpSectionsById.get(currentSectionId) : null

  return createPortal(
    <aside
      aria-label="Manuel d'utilisation"
      className={`fixed top-0 right-0 h-screen z-40 w-[480px] max-w-full
        bg-[#1a1a1a] border-l border-white/10 shadow-2xl
        flex flex-col
        transition-transform duration-200 ease-out
        ${open ? 'translate-x-0' : 'translate-x-full pointer-events-none'}`}
    >
      <header className="h-12 flex items-center justify-between px-3 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-indigo-400" />
          <span className="text-sm font-medium text-white">Aide</span>
        </div>
        <button
          type="button"
          onClick={closeDrawer}
          className="p-1.5 rounded-md text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          title="Fermer (Echap)"
        >
          <X className="w-4 h-4" />
        </button>
      </header>
      <div className="flex-1 min-h-0 grid grid-cols-[180px_1fr]">
        <div className="border-r border-white/10 overflow-y-auto p-3">
          <HelpTableOfContents />
        </div>
        <div className="overflow-y-auto p-4">
          {section ? (
            <HelpSectionView section={section} />
          ) : (
            <p className="text-sm text-white/50">
              Sélectionne une section dans le sommaire.
            </p>
          )}
        </div>
      </div>
    </aside>,
    document.body,
  )
}
```

- [ ] **Step 2: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: pas d'erreur

- [ ] **Step 3: Commit**

```bash
git add src/features/help/HelpDrawer.tsx
git commit -m "feat(help): add non-modal help drawer with portal"
```

---

## Task 18 : Composant HelpTrigger + intégration

**Files:**
- Create: `src/features/help/HelpTrigger.tsx`
- Modify: `src/features/auth/ProtectedRoute.tsx`

- [ ] **Step 1: Créer le trigger**

```tsx
// src/features/help/HelpTrigger.tsx
import { useEffect } from 'react'
import { HelpCircle } from 'lucide-react'
import { useHelpStore } from './help.store'
import { HelpDrawer } from './HelpDrawer'

export function HelpTrigger() {
  const toggleDrawer = useHelpStore((s) => s.toggleDrawer)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // ⇧? — Shift + '/' sur un clavier US (ou déjà un '?' sur un clavier FR)
      if (e.key === '?' && !isEditable(e.target)) {
        e.preventDefault()
        toggleDrawer()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [toggleDrawer])

  return (
    <>
      <button
        type="button"
        onClick={toggleDrawer}
        title="Aide (⇧?)"
        aria-label="Ouvrir l'aide"
        className="fixed bottom-4 right-4 z-30
          w-10 h-10 rounded-full
          bg-[#1a1a1a] border border-white/10 hover:border-indigo-500/50
          text-white/60 hover:text-indigo-400
          flex items-center justify-center
          shadow-lg
          transition-colors"
      >
        <HelpCircle className="w-5 h-5" />
      </button>
      <HelpDrawer />
    </>
  )
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return target.isContentEditable
}
```

- [ ] **Step 2: Monter le trigger dans `ProtectedRoute`**

Modifier `src/features/auth/ProtectedRoute.tsx` :

```tsx
// src/features/auth/ProtectedRoute.tsx
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth.store'
import { HelpTrigger } from '@/features/help/HelpTrigger'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const user = useAuthStore((s) => s.user)

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return (
    <>
      {children}
      <HelpTrigger />
    </>
  )
}
```

- [ ] **Step 3: Lancer le dev server et vérifier visuellement**

Run: `npm run dev`
Puis : ouvrir `http://localhost:5173/dashboard` (ou l'URL affichée), vérifier :
- Bouton `?` visible en bas-droite
- Clic dessus = drawer qui glisse de la droite
- Sommaire affiché à gauche du drawer avec les 10 sections (2 rédigées + 8 stubs)
- Clic sur une section = contenu affiché à droite
- Echap = ferme le drawer
- Raccourci `?` depuis le clavier = toggle drawer (en dehors d'un input)

Attendu : tout fonctionne. Les screenshots (`editor-layout.png`, etc.) apparaissent comme 404 — normal, ils seront ajoutés à la Task 20.

- [ ] **Step 4: Commit**

```bash
git add src/features/help/HelpTrigger.tsx src/features/auth/ProtectedRoute.tsx
git commit -m "feat(help): mount HelpTrigger on all authenticated routes"
```

---

## Task 19 : Instrumentation des cibles de highlight

**Files:**
- Modify: `src/components/panels/EditorHeader.tsx`
- Modify: `src/components/panels/ToolBar.tsx`
- Modify: `src/components/panels/LayersPanel.tsx`
- Modify: `src/pages/DashboardPage.tsx`

- [ ] **Step 1: Instrumenter les boutons Save et Export de l'EditorHeader**

Lire le fichier actuel puis éditer le bouton Save (ligne ~98) et Export (ligne ~115).

Pour Save :

```tsx
// Ajouter en haut du fichier :
import { useHighlight } from '@/features/help/hooks/useHighlight'

// Dans le composant EditorHeader, au-dessus du return :
const saveHighlight = useHighlight<HTMLButtonElement>('editor-header.save')
const exportHighlight = useHighlight<HTMLButtonElement>('editor-header.export')
```

Modifier le `<button>` Save pour ajouter `ref={saveHighlight.ref}` et concaténer `saveHighlight.className` dans le className existant (utiliser template literal).

```tsx
{/* Save */}
<button
  ref={saveHighlight.ref}
  onClick={() => globalSave?.()}
  disabled={saveStatus === 'saving'}
  className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 ${
    saveStatus === 'unsaved'
      ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 hover:text-amber-300 border border-amber-500/30'
      : saveStatus === 'saved'
        ? 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 hover:text-emerald-300 border border-emerald-500/20'
        : 'bg-white/10 hover:bg-white/15 text-white/70 hover:text-white border border-transparent'
  } ${saveHighlight.className}`}
  title="Sauvegarder (⌘S)"
>
  {/* …inchangé */}
</button>
```

Puis pour Export :

```tsx
{/* Export */}
<button
  ref={exportHighlight.ref}
  onClick={() => setShowExport(true)}
  className={`flex items-center gap-1.5 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${exportHighlight.className}`}
>
  <Download className="w-3.5 h-3.5" />
  <span className="hidden sm:block">Exporter</span>
</button>
```

- [ ] **Step 2: Instrumenter les outils Texte et Image de la ToolBar**

Dans `src/components/panels/ToolBar.tsx`, le composant `ToolButton` est utilisé pour les outils. Pour ajouter le highlight uniquement sur `text` et `image`, passer un `highlightId` optionnel au ToolButton et l'ImageMenuButton.

Ajouter à `ToolButtonProps` :

```tsx
interface ToolButtonProps {
  tool: ActiveTool
  icon: LucideIcon
  tooltip: string
  highlightId?: string
}
```

Puis dans `ToolButton`, importer et utiliser `useHighlight` :

```tsx
import { useHighlight } from '@/features/help/hooks/useHighlight'

function ToolButton({ tool, icon: Icon, tooltip, highlightId }: ToolButtonProps) {
  // ... existing hooks ...
  const highlight = useHighlight<HTMLButtonElement>(highlightId ?? '__none__')
  // Note: passer '__none__' si pas d'id, c'est un id jamais déclenché.

  // ... existing handleClick ...

  return (
    <button
      ref={highlight.ref}
      className={`w-[34px] h-[34px] flex items-center justify-center rounded-md transition-colors ${
        isActive
          ? 'bg-indigo-500/20 text-indigo-400'
          : 'text-white/40 hover:text-white/70 hover:bg-white/5'
      } ${highlight.className}`}
      title={tooltip}
      onClick={handleClick}
    >
      <Icon className="w-4 h-4" />
    </button>
  )
}
```

Puis passer l'id à l'outil Texte dans le rendu `ToolBar` :

```tsx
<ToolButton tool="text" icon={Type} tooltip="Texte (T)" highlightId="toolbar.text" />
```

Pour `ImageMenuButton` (pas de ToolButton standard), appliquer `useHighlight` sur le bouton intérieur :

```tsx
function ImageMenuButton() {
  // ... existing hooks ...
  const highlight = useHighlight<HTMLButtonElement>('toolbar.image')

  return (
    <div className="relative" ref={menuRef}>
      <button
        ref={highlight.ref}
        onClick={() => setOpen((prev) => !prev)}
        title="Image (I)"
        className={`w-8 h-8 flex items-center justify-center rounded transition ${
          open ? 'bg-indigo-500/20 text-indigo-400' : 'text-white/40 hover:text-white/70 hover:bg-white/5'
        } ${highlight.className}`}
      >
        <ImageIcon className="w-4 h-4" />
      </button>
      {/* ... menu inchangé ... */}
    </div>
  )
}
```

- [ ] **Step 3: Instrumenter le conteneur LayersPanel**

Ouvrir `src/components/panels/LayersPanel.tsx`. La fonction `LayersPanel` (ligne 197) a **deux `return`** : un empty state (ligne 227) et un normal state (ligne 235). Instrumenter les deux avec le même highlight.

Import en haut du fichier : `import { useHighlight } from '@/features/help/hooks/useHighlight'`

Dans `LayersPanel`, juste avant les early-return et return final (ligne 204, après `useState`) :

```tsx
const layersHighlight = useHighlight<HTMLDivElement>('layers-panel')
```

Pour l'empty state (ligne 228), remplacer :
```tsx
<div className="p-4 flex flex-col items-center justify-center gap-2 text-white/20 py-12">
```
par :
```tsx
<div
  ref={layersHighlight.ref}
  className={`p-4 flex flex-col items-center justify-center gap-2 text-white/20 py-12 ${layersHighlight.className}`}
>
```

Pour le normal state (ligne 236), remplacer :
```tsx
<div className="flex flex-col">
```
par :
```tsx
<div ref={layersHighlight.ref} className={`flex flex-col ${layersHighlight.className}`}>
```

- [ ] **Step 4: Instrumenter le bouton « Nouveau document » dans DashboardPage**

Dans `src/pages/DashboardPage.tsx`, le menu latéral est généré via `menuItems.map(...)` aux lignes 228-246. L'item `id: 'blank'` correspond au « Nouveau document ».

Ajouter en haut du fichier : `import { useHighlight } from '@/features/help/hooks/useHighlight'`

Dans le composant `DashboardPage`, avant le `return`, ajouter :

```tsx
const newProjectHighlight = useHighlight<HTMLButtonElement>('dashboard.new-project')
```

Modifier le `<button>` (ligne 231) pour attacher le `ref` et la className **uniquement quand `id === 'blank'`**. Deux changements précis :

1. Juste après `id={\`menu-${id}\`}` (ligne 232), ajouter :
   ```tsx
   ref={id === 'blank' ? newProjectHighlight.ref : undefined}
   ```

2. Dans le `className={...}` (ligne 241), concaténer en fin de template literal, juste avant la fermeture du backtick final :
   ```tsx
   ${id === 'blank' ? newProjectHighlight.className : ''}
   ```

Le résultat ressemble à :

```tsx
{menuItems.map(({ id, icon: Icon, label, accent, activeBg, activeText }) => {
  const isActive = activeSection === id
  return (
    <button
      id={`menu-${id}`}
      ref={id === 'blank' ? newProjectHighlight.ref : undefined}
      key={id}
      role="menuitem"
      /* … props inchangés … */
      className={`w-full flex items-center ${sidebarOpen ? 'gap-2.5 px-3' : 'justify-center px-0'} py-[7px] rounded-md text-[13px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 focus-visible:ring-offset-[#141414] ${
        isActive
          ? `${activeBg} ${activeText} font-medium`
          : 'text-white/45 hover:text-white/70 hover:bg-white/[0.04]'
      } ${id === 'blank' ? newProjectHighlight.className : ''}`}
    >
      {/* … inchangé … */}
    </button>
  )
})}
```

- [ ] **Step 5: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: pas d'erreur

- [ ] **Step 6: Relancer les tests**

Run: `npx vitest run`
Expected: tous les tests passent (store + registre)

- [ ] **Step 7: Vérifier visuellement le highlight cross-page**

Run: `npm run dev`

Scénarios à tester :
- Ouvrir l'app sur `/dashboard`
- Ouvrir l'aide, aller dans « Prise en main », cliquer sur « Ouvrir Nouveau document » → le bouton « Nouveau document » dans la sidebar doit pulser en indigo pendant 3s.
- Ouvrir un projet dans l'éditeur (`/editor/xxx`), ouvrir l'aide, aller dans « L'éditeur », cliquer sur « Outil Texte » → l'icône T dans la toolbar pulse 3s.
- Cliquer sur « Bouton Sauvegarder » → le bouton Save du header pulse 3s.
- Cliquer sur « Panneau Calques » → le panneau calques à droite pulse 3s.

Si un élément n'est pas visible à l'écran au moment du clic, le `scrollIntoView` doit le recentrer.

- [ ] **Step 8: Commit**

```bash
git add src/components/panels/EditorHeader.tsx src/components/panels/ToolBar.tsx src/components/panels/LayersPanel.tsx src/pages/DashboardPage.tsx
git commit -m "feat(help): instrument highlight targets in editor and dashboard"
```

---

## Task 20 : Captures d'écran statiques

**Files:**
- Create: `public/help/screenshots/dashboard-overview.png`
- Create: `public/help/screenshots/editor-layout.png`
- Create: `public/help/screenshots/editor-toolbar.png`
- Create: `public/help/screenshots/editor-layers.png`

- [ ] **Step 1: Créer le dossier**

Run: `mkdir -p /Applications/_IA/Claude_workspace/Web2Print/public/help/screenshots`

- [ ] **Step 2: Capturer les 4 écrans**

Cette étape est manuelle. Depuis l'application en mode dev :

1. `dashboard-overview.png` : capture large du `/dashboard` avec la barre latérale ouverte sur section « Bibliothèque ».
2. `editor-layout.png` : capture large d'un projet ouvert dans l'éditeur, avec ToolBar visible à gauche, canvas au centre, panneau Calques ouvert à droite.
3. `editor-toolbar.png` : capture zoomée de la ToolBar seule.
4. `editor-layers.png` : capture zoomée du panneau Calques avec 2-3 objets.

Recommandations :
- Résolution finale max 1200px de large
- Compresser en PNG optimisé (ex: via tinypng.com ou `pngquant`), cible <150 Ko chacun
- Placer dans `public/help/screenshots/`

Si les captures ne sont pas disponibles au moment de l'implémentation, commit des PNG placeholders (ex: petites images 1200x600 grises avec texte « Screenshot à venir » généré via un outil comme placehold.co).

- [ ] **Step 3: Vérifier le rendu dans le drawer**

Run: `npm run dev`
Ouvrir l'aide → « Prise en main » → le screenshot `dashboard-overview.png` doit s'afficher.
Ouvrir « L'éditeur » → le screenshot `editor-layout.png` doit s'afficher.

- [ ] **Step 4: Commit**

```bash
git add public/help/screenshots/
git commit -m "feat(help): add static screenshots for help sections"
```

---

## Task 21 : Validation finale & build

**Files:** aucun

- [ ] **Step 1: Full test run**

Run: `npm run test:run`
Expected: tous les tests passent (store + content registry)

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: aucun nouveau warning / error sur les fichiers du module help. Fixer si présents.

- [ ] **Step 3: Build de production**

Run: `npm run build`
Expected: build OK, pas d'erreur TypeScript stricte

- [ ] **Step 4: Tour de validation manuelle (une dernière fois)**

Checklist :
- [ ] Bouton `?` visible sur `/dashboard`, `/editor/:id`, `/data`, `/taxonomies`, `/scraping-templates`
- [ ] Bouton `?` NON visible sur `/login`
- [ ] Raccourci `⇧?` ouvre/ferme le drawer depuis n'importe quelle page authentifiée
- [ ] Raccourci `⇧?` ignoré quand le focus est dans un champ texte
- [ ] Drawer non-modal : on peut cliquer sur le canvas / boutons de l'app pendant qu'il est ouvert
- [ ] Echap ferme le drawer
- [ ] Les 2 sections rédigées affichent leur contenu (texte, screenshots, mockups, shortcuts)
- [ ] Les 8 stubs affichent « Rédaction à venir »
- [ ] La recherche filtre les sections par titre / intro
- [ ] Les MenuLink avec `highlightId` font pulser la cible pendant 3s
- [ ] Les MenuLink sans highlightId ferment le drawer et naviguent
- [ ] Navigation inter-pages ferme le drawer
- [ ] Navigation intra-page (même route) laisse le drawer ouvert et highlight la cible

- [ ] **Step 5: Commit final (si modif mineure)**

Si des ajustements ont été nécessaires lors de la validation :

```bash
git add -u
git commit -m "feat(help): polish based on final validation pass"
```

Sinon, passer directement à la livraison.

---

## Synthèse

**Livré :**
- Infra complète du manuel (store, drawer, trigger, TOC, 5 types de blocs, MenuLink, useHighlight)
- 2 sections rédigées : « Prise en main » et « L'éditeur »
- 8 stubs placeholders pour les sections à rédiger
- Instrumentation de 6 cibles de highlight (save/export/text/image/layers/new-project)
- Raccourci clavier `⇧?`
- Tests unitaires : store (6 tests) + registre (4 tests)

**À compléter par l'utilisateur au fil de l'eau :**
- Remplacer les 8 stubs par du contenu rédigé dans `src/features/help/content/`
- Ajouter des `useHighlight('nouvel-id')` dans les composants ciblés et ajouter l'id dans `HIGHLIGHT_IDS`
- Créer les mockups React additionnels si pertinent
