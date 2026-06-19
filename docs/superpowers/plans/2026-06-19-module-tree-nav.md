# Menu en arbre dépliant des modules + deep-link — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformer la liste plate des modules (sidebar + drawer) en arbre dépliant où chaque module expose ses fonctions dédiées, avec deep-link direct vers chaque fonction.

**Architecture:** Données d'arbre dans `modules.ts` (`children`). Composant `ModuleTree` unique partagé par la sidebar du Dashboard et le drawer. Au clic enfant : `navigate('/dashboard', { state: { section, intent } })` ; `DashboardPage` (point de passage unique) pose `activeSection` et pousse l'`intent` dans un store one-shot `moduleIntent` (avec compteur `seq` pour re-déclencher sur intent identique) ; chaque écran cible consomme son intent via le hook `useModuleIntent`.

**Tech Stack:** React 18, TypeScript strict, Zustand v4, React Router v6, Vitest, Tailwind v3, Lucide.

## Global Constraints

- TypeScript strict, cible ES2022. Vérification types : **`npx tsc -b`** (project references — `tsc --noEmit` ne vérifie rien).
- Composants `PascalCase.tsx`, max 150 lignes. Hooks `useCamelCase.ts`. Stores `camelCase.store.ts`.
- Pas d'`any`, props typées explicitement. Pas de logique métier dans l'UI.
- Théming par tokens : `bg-surface` / `bg-surface-2` / `text-white/xx` ; jamais d'hex sombre en dur. `white` = avant-plan thémable. Accent `#6366f1` (indigo-500).
- Ne jamais modifier `src/components/ui/**`, `src/lib/firebase/config.ts`, `public/fonts/`.
- Tests : `npm run test:run`. Lint : `npm run lint` (erreurs bloquantes). Code mort : `npx knip` doit rester exit 0 — un symbole utilisé seulement dans son fichier ne doit PAS être exporté.
- Répondre/commenter en français.

---

## Fichiers créés / modifiés

- **Créer** `src/stores/moduleIntent.store.ts` — store one-shot `{ intent, seq, set }`.
- **Créer** `src/features/navigation/useModuleIntent.ts` — hook de consommation par préfixe.
- **Créer** `src/features/navigation/ModuleTree.tsx` — rendu d'arbre partagé.
- **Créer** `src/features/navigation/useModuleIntent.test.ts` — tests store + hook.
- **Créer** `src/features/navigation/ModuleTree.test.tsx` — tests rendu/persistance.
- **Modifier** `src/features/navigation/modules.ts` — type `ModuleChild`, champ `children`, entrée `settings`.
- **Modifier** `src/features/navigation/ModuleNavDrawer.tsx` — liste plate → `<ModuleTree>`.
- **Modifier** `src/pages/DashboardPage.tsx` — sidebar → `<ModuleTree>` ; pousser l'intent depuis l'effet de navigation.
- **Modifier** écrans cibles (application d'intent) : `DamPage.tsx`, `SettingsPanel.tsx`, `DataPage.tsx`, `TaxonomiesPage.tsx`, `ScrapingHubPage.tsx`, `AccessAdminPage.tsx`, `ImportPanel.tsx`, `WorkflowsPage.tsx`, `HyperframesPage.tsx`, `ScrapingTemplatesPage.tsx`.

---

## Task 1 : Store `moduleIntent` + hook `useModuleIntent`

**Files:**
- Create: `src/stores/moduleIntent.store.ts`
- Create: `src/features/navigation/useModuleIntent.ts`
- Test: `src/features/navigation/useModuleIntent.test.ts`

**Interfaces:**
- Produces : `useModuleIntentStore` (Zustand) avec `{ intent: string | null, seq: number, set(intent: string | null): void }` ; `useModuleIntent(prefix: string, apply: (action: string) => void): void`.

- [ ] **Step 1 : Écrire le test (échoue)**

```ts
// src/features/navigation/useModuleIntent.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useModuleIntentStore } from '@/stores/moduleIntent.store'
import { useModuleIntent } from './useModuleIntent'

describe('moduleIntent store', () => {
  beforeEach(() => useModuleIntentStore.setState({ intent: null, seq: 0 }))

  it('incrémente seq à chaque set, même valeur identique', () => {
    const { set } = useModuleIntentStore.getState()
    set('dam:tab:favorites')
    const s1 = useModuleIntentStore.getState().seq
    set('dam:tab:favorites')
    expect(useModuleIntentStore.getState().seq).toBe(s1 + 1)
  })
})

describe('useModuleIntent', () => {
  beforeEach(() => useModuleIntentStore.setState({ intent: null, seq: 0 }))

  it('applique l’action quand le préfixe correspond, puis consomme', () => {
    const apply = vi.fn()
    renderHook(() => useModuleIntent('dam', apply))
    useModuleIntentStore.getState().set('dam:tab:favorites')
    expect(apply).toHaveBeenCalledWith('tab:favorites')
    expect(useModuleIntentStore.getState().intent).toBeNull()
  })

  it('ignore un intent d’un autre préfixe', () => {
    const apply = vi.fn()
    renderHook(() => useModuleIntent('dam', apply))
    useModuleIntentStore.getState().set('settings:tab:ai')
    expect(apply).not.toHaveBeenCalled()
    expect(useModuleIntentStore.getState().intent).toBe('settings:tab:ai')
  })

  it('re-déclenche apply sur un intent identique consécutif', () => {
    const apply = vi.fn()
    renderHook(() => useModuleIntent('dam', apply))
    useModuleIntentStore.getState().set('dam:tab:favorites')
    useModuleIntentStore.getState().set('dam:tab:favorites')
    expect(apply).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2 : Lancer le test (doit échouer)**

Run: `npm run test:run -- src/features/navigation/useModuleIntent.test.ts`
Expected: FAIL (modules introuvables).

- [ ] **Step 3 : Implémenter le store**

```ts
// src/stores/moduleIntent.store.ts
import { create } from 'zustand'

/**
 * Intent de navigation « fonction » poussé par le menu en arbre (sidebar/drawer)
 * et consommé une seule fois par l'écran cible via `useModuleIntent`.
 *
 * `seq` s'incrémente à chaque `set` : re-cliquer la même fonction (intent
 * identique) re-déclenche les abonnés. Format de l'intent : '<module>:<action>'.
 */
interface ModuleIntentState {
  intent: string | null
  seq: number
  set: (intent: string | null) => void
}

export const useModuleIntentStore = create<ModuleIntentState>((set) => ({
  intent: null,
  seq: 0,
  set: (intent) => set((s) => ({ intent, seq: s.seq + 1 })),
}))
```

- [ ] **Step 4 : Implémenter le hook**

```ts
// src/features/navigation/useModuleIntent.ts
import { useEffect, useRef } from 'react'
import { useModuleIntentStore } from '@/stores/moduleIntent.store'

/**
 * Consomme une seule fois l'intent courant si son préfixe correspond à `prefix`.
 * `apply` reçoit l'action (l'intent privé de « <prefix>: »). Re-déclenché sur
 * chaque `set` du store (dép. `seq`), même intent identique.
 */
export function useModuleIntent(prefix: string, apply: (action: string) => void): void {
  const intent = useModuleIntentStore((s) => s.intent)
  const seq = useModuleIntentStore((s) => s.seq)
  const setIntent = useModuleIntentStore((s) => s.set)
  const applyRef = useRef(apply)
  applyRef.current = apply

  useEffect(() => {
    if (!intent) return
    const p = `${prefix}:`
    if (!intent.startsWith(p)) return
    applyRef.current(intent.slice(p.length))
    setIntent(null) // one-shot
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq])
}
```

- [ ] **Step 5 : Lancer le test (doit passer)**

Run: `npm run test:run -- src/features/navigation/useModuleIntent.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6 : Commit**

```bash
git add src/stores/moduleIntent.store.ts src/features/navigation/useModuleIntent.ts src/features/navigation/useModuleIntent.test.ts
git commit -m "feat(nav): store moduleIntent + hook useModuleIntent (deep-link one-shot)"
```

---

## Task 2 : Données d'arbre dans `modules.ts`

**Files:**
- Modify: `src/features/navigation/modules.ts`

**Interfaces:**
- Produces : `interface ModuleChild { id: string; label: string; intent: string; permission?: string; routeTo?: string }` ; `ModuleItem.children?: ModuleChild[]` ; nouvelle entrée `MODULE_ITEMS` `{ id: 'settings' }`.
- Consumes : `Section` (existant) inclut déjà `'settings'`.

- [ ] **Step 1 : Ajouter le type `ModuleChild` et le champ `children`**

Dans `src/features/navigation/modules.ts`, après l'interface `ModuleItem` (l.23-30), ajouter le champ et le type :

```ts
export interface ModuleChild {
  /** Suffixe d'action, ex. 'tab:favorites'. */
  id: string
  label: string
  /** Clé complète envoyée dans location.state.intent : '<module>:<id>'. */
  intent: string
  /** Permission `.view`/`.x` supplémentaire pour cet enfant (sinon hérite du parent). */
  permission?: string
  /** Si la fonction est une vraie route (ex. nouveau workflow), naviguer ici au lieu de section+intent. */
  routeTo?: string
}
```

Et dans `interface ModuleItem`, ajouter :

```ts
  children?: ModuleChild[]
```

- [ ] **Step 2 : Importer l'icône Settings et ajouter l'entrée `settings`**

Dans l'import lucide (l.2), ajouter `Settings`. Dans `MODULE_ITEMS`, insérer **avant** l'entrée `access` :

```ts
  { id: 'settings', icon: Settings, label: 'Réglages', accent: 'text-slate-400', activeBg: 'bg-slate-500/[0.1]', activeText: 'text-slate-300' },
```

- [ ] **Step 3 : Renseigner les `children` (niveaux 1+2)**

Ajouter `children: [...]` aux entrées concernées de `MODULE_ITEMS`. Valeurs exactes :

```ts
// images (DAM)
children: [
  { id: 'tab:stock', label: 'Banque d’images', intent: 'images:tab:stock' },
  { id: 'tab:my-images', label: 'Mes images', intent: 'images:tab:my-images' },
  { id: 'tab:favorites', label: 'Favoris', intent: 'images:tab:favorites' },
  { id: 'tab:collections', label: 'Collections', intent: 'images:tab:collections' },
  { id: 'tab:recent', label: 'Récents', intent: 'images:tab:recent' },
  { id: 'tab:projects', label: 'Projets', intent: 'images:tab:projects' },
  { id: 'tab:generate', label: 'Générer', intent: 'images:tab:generate', permission: 'dam.generate' },
  { id: 'tab:videos', label: 'Animations HTML', intent: 'images:tab:videos', permission: 'dam.animations' },
  { id: 'tab:gdrive', label: 'Google Drive', intent: 'images:tab:gdrive', permission: 'dam.gdrive' },
]

// data (PIM)
children: [
  { id: 'action:import', label: 'Importer un fichier', intent: 'data:action:import' },
  { id: 'action:scrape', label: 'Scraper le web', intent: 'data:action:scrape' },
  { id: 'action:create-empty', label: 'Créer BDD vide', intent: 'data:action:create-empty' },
  { id: 'action:update', label: 'Mise à jour', intent: 'data:action:update' },
  { id: 'action:export-xlsx', label: 'Exporter Excel', intent: 'data:action:export-xlsx' },
  { id: 'action:export-ec', label: 'Export EasyCatalog', intent: 'data:action:export-ec' },
]

// taxonomies
children: [
  { id: 'tab:tree', label: 'Arbre', intent: 'taxonomies:tab:tree' },
  { id: 'tab:briefs', label: 'Briefs', intent: 'taxonomies:tab:briefs' },
  { id: 'action:import', label: 'Importer une taxonomie', intent: 'taxonomies:action:import' },
]

// scraping-hub
children: [
  { id: 'tab:rules', label: 'Règles', intent: 'scraping-hub:tab:rules' },
  { id: 'tab:vendors', label: 'Fournisseurs & Templates', intent: 'scraping-hub:tab:vendors' },
  { id: 'tab:debug', label: 'Debug Jina/LLM', intent: 'scraping-hub:tab:debug' },
]

// scraping-templates
children: [
  { id: 'action:new', label: 'Nouveau template', intent: 'scraping-templates:action:new' },
]

// workflows
children: [
  { id: 'action:new', label: 'Nouveau workflow', intent: 'workflows:action:new' },
  { id: 'action:my-templates', label: 'Mes modèles', intent: 'workflows:action:my-templates' },
  { id: 'action:builtin-templates', label: 'Modèles intégrés', intent: 'workflows:action:builtin-templates' },
]

// hyperframes (Animation)
children: [
  { id: 'action:generate', label: 'Générer une animation', intent: 'hyperframes:action:generate' },
  { id: 'action:list', label: 'Mes animations', intent: 'hyperframes:action:list' },
]

// import (Importer)
children: [
  { id: 'format:idml', label: 'IDML', intent: 'import:format:idml', permission: 'import.idml' },
  { id: 'format:pptx', label: 'PPTX', intent: 'import:format:pptx', permission: 'import.pptx' },
  { id: 'format:image', label: 'Image', intent: 'import:format:image', permission: 'import.image' },
  { id: 'format:svg', label: 'SVG', intent: 'import:format:svg', permission: 'import.svg' },
  { id: 'format:excel', label: 'Excel/CSV', intent: 'import:format:excel', permission: 'import.excel' },
  { id: 'format:image-to-svg', label: 'Image → SVG', intent: 'import:format:image-to-svg', permission: 'import.imageToSvg' },
  { id: 'format:pdf-to-svg', label: 'PDF → SVG', intent: 'import:format:pdf-to-svg', permission: 'import.pdfToSvg' },
]

// settings (Réglages) — ajout Task 2 Step 2
children: [
  { id: 'tab:profile', label: 'Profil', intent: 'settings:tab:profile' },
  { id: 'tab:ai', label: 'IA', intent: 'settings:tab:ai' },
  { id: 'tab:connectors', label: 'Connecteurs', intent: 'settings:tab:connectors' },
  { id: 'tab:cookies', label: 'Cookies', intent: 'settings:tab:cookies' },
  { id: 'tab:firebase', label: 'Firebase', intent: 'settings:tab:firebase' },
  { id: 'tab:stats', label: 'Statistiques', intent: 'settings:tab:stats' },
  { id: 'tab:data', label: 'Données', intent: 'settings:tab:data' },
]

// access (Utilisateurs & rôles)
children: [
  { id: 'tab:users', label: 'Utilisateurs', intent: 'access:tab:users' },
  { id: 'tab:roles', label: 'Rôles', intent: 'access:tab:roles' },
]
```

- [ ] **Step 4 : Vérifier les types**

Run: `npx tsc -b`
Expected: aucune erreur.

- [ ] **Step 5 : Commit**

```bash
git add src/features/navigation/modules.ts
git commit -m "feat(nav): données d'arbre (children) + module Réglages dans modules.ts"
```

---

## Task 3 : Composant `ModuleTree` partagé

**Files:**
- Create: `src/features/navigation/ModuleTree.tsx`
- Test: `src/features/navigation/ModuleTree.test.tsx`

**Interfaces:**
- Consumes : `ModuleItem`, `ModuleChild` (Task 2) ; `useAccessStore`/`useIsAdmin` pour gater les enfants par `permission`.
- Produces : `ModuleTree` props `{ modules: ModuleItem[]; activeSection?: Section; onOpen: (section: Section) => void; onOpenChild: (section: Section, intent: string, routeTo?: string) => void; variant: 'sidebar' | 'drawer' }`.

- [ ] **Step 1 : Écrire le test (échoue)**

```tsx
// src/features/navigation/ModuleTree.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ModuleTree } from './ModuleTree'
import type { ModuleItem } from './modules'
import { Library, Image as ImageIcon } from 'lucide-react'

const MODULES: ModuleItem[] = [
  { id: 'library', icon: Library, label: 'Bibliothèque', accent: '', activeBg: '', activeText: '' },
  { id: 'images', icon: ImageIcon, label: 'DAM', accent: '', activeBg: '', activeText: '',
    children: [{ id: 'tab:favorites', label: 'Favoris', intent: 'images:tab:favorites' }] },
]

describe('ModuleTree', () => {
  beforeEach(() => window.localStorage.clear())

  it('rend un chevron uniquement pour les modules avec enfants', () => {
    render(<ModuleTree modules={MODULES} onOpen={vi.fn()} onOpenChild={vi.fn()} variant="drawer" />)
    expect(screen.getByRole('button', { name: /Déplier DAM/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Déplier Bibliothèque/i })).toBeNull()
  })

  it('clic label appelle onOpen', () => {
    const onOpen = vi.fn()
    render(<ModuleTree modules={MODULES} onOpen={onOpen} onOpenChild={vi.fn()} variant="drawer" />)
    fireEvent.click(screen.getByText('Bibliothèque'))
    expect(onOpen).toHaveBeenCalledWith('library')
  })

  it('déplier puis clic enfant appelle onOpenChild avec l’intent', () => {
    const onOpenChild = vi.fn()
    render(<ModuleTree modules={MODULES} onOpen={vi.fn()} onOpenChild={onOpenChild} variant="drawer" />)
    fireEvent.click(screen.getByRole('button', { name: /Déplier DAM/i }))
    fireEvent.click(screen.getByText('Favoris'))
    expect(onOpenChild).toHaveBeenCalledWith('images', 'images:tab:favorites', undefined)
  })
})
```

- [ ] **Step 2 : Lancer le test (doit échouer)**

Run: `npm run test:run -- src/features/navigation/ModuleTree.test.tsx`
Expected: FAIL (`ModuleTree` introuvable).

- [ ] **Step 3 : Implémenter `ModuleTree`**

```tsx
// src/features/navigation/ModuleTree.tsx
import { useState, useCallback } from 'react'
import { ChevronRight } from 'lucide-react'
import { useIsAdmin } from '@/features/access/useAccess'
import { useAccessStore } from '@/stores/access.store'
import type { ModuleItem, ModuleChild, Section } from './modules'

const STORE_KEY = 'nav:tree:expanded'

function readExpanded(): Record<string, boolean> {
  try {
    return JSON.parse(window.localStorage.getItem(STORE_KEY) ?? '{}') as Record<string, boolean>
  } catch {
    return {}
  }
}

interface ModuleTreeProps {
  modules: ModuleItem[]
  activeSection?: Section
  onOpen: (section: Section) => void
  onOpenChild: (section: Section, intent: string, routeTo?: string) => void
  variant: 'sidebar' | 'drawer'
}

export function ModuleTree({ modules, activeSection, onOpen, onOpenChild, variant }: ModuleTreeProps) {
  const isAdmin = useIsAdmin()
  const permissions = useAccessStore((s) => s.permissions)
  const [expanded, setExpanded] = useState<Record<string, boolean>>(readExpanded)

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = { ...prev, [id]: !prev[id] }
      try {
        window.localStorage.setItem(STORE_KEY, JSON.stringify(next))
      } catch {
        /* noop */
      }
      return next
    })
  }, [])

  const canChild = (c: ModuleChild) => isAdmin || !c.permission || permissions.has(c.permission)

  return (
    <div role="tree" aria-label="Modules" className="space-y-0.5">
      {modules.map((m) => {
        const Icon = m.icon
        const kids = (m.children ?? []).filter(canChild)
        const isOpen = !!expanded[m.id]
        const isActive = activeSection === m.id
        return (
          <div key={m.id} role="treeitem" aria-expanded={kids.length ? isOpen : undefined}>
            <div className={`group flex items-center rounded-md ${isActive ? m.activeBg : 'hover:bg-white/[0.04]'}`}>
              {kids.length > 0 ? (
                <button
                  type="button"
                  onClick={() => toggle(m.id)}
                  aria-label={`${isOpen ? 'Replier' : 'Déplier'} ${m.label}`}
                  className="p-1.5 text-white/30 hover:text-white/70 transition-transform"
                >
                  <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                </button>
              ) : (
                <span className="w-[26px]" aria-hidden="true" />
              )}
              <button
                type="button"
                onClick={() => onOpen(m.id)}
                className={`flex-1 flex items-center gap-2.5 pr-3 py-[7px] rounded-md text-[13px] text-left transition-colors
                  ${isActive ? m.activeText : 'text-white/55 hover:text-white/85'}`}
              >
                <Icon className={`w-4 h-4 shrink-0 opacity-70 ${m.accent}`} />
                <span className="flex-1">{m.label}</span>
              </button>
            </div>
            {isOpen && kids.length > 0 && (
              <div role="group" className="ml-[26px] pl-2 border-l border-white/[0.06]">
                {kids.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    role="treeitem"
                    onClick={() => onOpenChild(m.id, c.intent, c.routeTo)}
                    className="w-full flex items-center gap-2 px-2.5 py-[5px] rounded-md text-[12.5px] text-left
                      text-white/40 hover:text-white/75 hover:bg-white/[0.04] transition-colors"
                  >
                    <span className="flex-1">{c.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
```

Note `variant` est accepté pour usage de style ultérieur (sidebar collapsée) ; ne pas l'exporter ailleurs. Si `variant` n'est pas lu, retirer la prop pour rester knip-propre **ou** l'utiliser réellement à l'étape sidebar (Task 5). Choix : la conserver et l'exploiter en Task 5.

- [ ] **Step 4 : Lancer le test (doit passer)**

Run: `npm run test:run -- src/features/navigation/ModuleTree.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5 : Vérifier types**

Run: `npx tsc -b`
Expected: aucune erreur.

- [ ] **Step 6 : Commit**

```bash
git add src/features/navigation/ModuleTree.tsx src/features/navigation/ModuleTree.test.tsx
git commit -m "feat(nav): composant ModuleTree partagé (arbre dépliant + persistance)"
```

---

## Task 4 : Brancher `ModuleTree` dans le drawer

**Files:**
- Modify: `src/features/navigation/ModuleNavDrawer.tsx`

**Interfaces:**
- Consumes : `ModuleTree` (Task 3), `useModuleIntentStore.set` n'est PAS appelé ici (le drawer navigue toujours vers `/dashboard` ; c'est DashboardPage qui pousse l'intent — Task 5).

- [ ] **Step 1 : Remplacer la liste plate par `ModuleTree`**

Dans `ModuleNavDrawer.tsx`, remplacer le bloc `{modules.map(...)}` (l.102-115) par :

```tsx
<ModuleTree
  modules={modules}
  onOpen={(section) => { setOpen(false); navigate('/dashboard', { state: { section } }) }}
  onOpenChild={(section, intent, routeTo) => {
    setOpen(false)
    if (routeTo) navigate(routeTo)
    else navigate('/dashboard', { state: { section, intent } })
  }}
  variant="drawer"
/>
```

Ajouter l'import : `import { ModuleTree } from './ModuleTree'`. Supprimer l'ancien `go` s'il n'est plus utilisé ailleurs, et l'import devenu inutile de l'icône individuelle (les icônes viennent de `modules`).

- [ ] **Step 2 : Vérifier types + lint**

Run: `npx tsc -b && npm run lint`
Expected: aucune erreur (warnings tolérés).

- [ ] **Step 3 : Vérifier le code mort**

Run: `npx knip`
Expected: exit 0 (pas de nouvel export/symbole mort).

- [ ] **Step 4 : Commit**

```bash
git add src/features/navigation/ModuleNavDrawer.tsx
git commit -m "feat(nav): drawer global utilise ModuleTree"
```

---

## Task 5 : Brancher `ModuleTree` dans la sidebar du Dashboard + pousser l'intent

**Files:**
- Modify: `src/pages/DashboardPage.tsx`

**Interfaces:**
- Consumes : `ModuleTree` (Task 3), `useModuleIntentStore` (Task 1).
- Produces : l'effet de navigation pose désormais `moduleIntent` ; la sidebar rend l'arbre.

- [ ] **Step 1 : Pousser l'intent dans l'effet de navigation**

Dans `DashboardPage.tsx`, importer le store :

```tsx
import { useModuleIntentStore } from '@/stores/moduleIntent.store'
```

Dans le composant, récupérer le setter :

```tsx
const setModuleIntent = useModuleIntentStore((s) => s.set)
```

Modifier l'effet existant (l.59-62) pour pousser l'intent à chaque navigation (intent ou null pour purger un intent périmé) :

```tsx
useEffect(() => {
  const state = location.state as { section?: Section; intent?: string } | null
  if (state?.section) setActiveSection(state.section)
  setModuleIntent(state?.intent ?? null)
}, [location.key, location.state, setModuleIntent])
```

- [ ] **Step 2 : Remplacer la sidebar plate par `ModuleTree`**

Localiser le rendu de la sidebar (autour de l.317, `const isActive = activeSection === id` dans un `.map`). Remplacer ce `.map` des modules par :

```tsx
<ModuleTree
  modules={menuItems}
  activeSection={activeSection}
  onOpen={(section) => setActiveSection(section)}
  onOpenChild={(section, intent, routeTo) => {
    if (routeTo) { navigate(routeTo); return }
    navigate('/dashboard', { state: { section, intent } })
  }}
  variant="sidebar"
/>
```

Ajouter `import { ModuleTree } from '@/features/navigation/ModuleTree'`. `menuItems` est la liste déjà filtrée par droits utilisée par la sidebar (vérifier son nom exact dans le fichier ; c'est la source des items de la sidebar). Si la sidebar peut être repliée (`sidebarOpen === false`), conserver le rendu icônes-seules existant pour ce cas et n'utiliser `ModuleTree` que lorsque `sidebarOpen`.

- [ ] **Step 3 : Vérifier types + lint + knip**

Run: `npx tsc -b && npm run lint && npx knip`
Expected: aucune erreur ; knip exit 0.

- [ ] **Step 4 : Test manuel**

Run: `npm run dev`
Vérifier : la sidebar du Dashboard affiche l'arbre ; déplier DAM, cliquer « Favoris » → DAM s'ouvre sur l'onglet Favoris (sera vrai après Task 6 ; pour l'instant DAM s'ouvre au moins). Le pli/dépli persiste après reload.

- [ ] **Step 5 : Commit**

```bash
git add src/pages/DashboardPage.tsx
git commit -m "feat(nav): sidebar Dashboard utilise ModuleTree + pousse l'intent"
```

---

## Task 6 : Application d'intent — DAM (store)

**Files:**
- Modify: `src/features/dam/components/DamPage.tsx`

**Interfaces:**
- Consumes : `useModuleIntent` (Task 1) ; `useDamStore().setActiveTab(tab: DamTab)`.

- [ ] **Step 1 : Brancher l'intent**

Dans `DamPage.tsx`, importer le hook : `import { useModuleIntent } from '@/features/navigation/useModuleIntent'`. Récupérer le setter du store (déjà disponible via `useDamStore`) :

```tsx
const setActiveTab = useDamStore((s) => s.setActiveTab)
useModuleIntent('images', (action) => {
  if (action.startsWith('tab:')) setActiveTab(action.slice('tab:'.length) as Parameters<typeof setActiveTab>[0])
})
```

`setActiveTab` accepte exactement les ids d'onglets DAM (`stock | my-images | favorites | collections | recent | projects | generate | videos | gdrive`), identiques aux suffixes d'intent.

- [ ] **Step 2 : Vérifier types**

Run: `npx tsc -b`
Expected: aucune erreur.

- [ ] **Step 3 : Test manuel**

Run: `npm run dev` — depuis le drawer (sur l'éditeur) ET la sidebar : DAM → chaque onglet ouvre le bon onglet. Re-cliquer le même onglet re-fonctionne.

- [ ] **Step 4 : Commit**

```bash
git add src/features/dam/components/DamPage.tsx
git commit -m "feat(nav): deep-link onglets DAM via moduleIntent"
```

---

## Task 7 : Application d'intent — Réglages (useState local)

**Files:**
- Modify: `src/components/shared/SettingsPanel.tsx`

**Interfaces:**
- Consumes : `useModuleIntent` (Task 1) ; `setActiveTab` local (`useState<SettingsTab>`, l.561).

- [ ] **Step 1 : Brancher l'intent**

Dans `SettingsPanel.tsx`, importer le hook. Après la déclaration `const [activeTab, setActiveTab] = useState<SettingsTab>('connectors')` (l.561), ajouter :

```tsx
useModuleIntent('settings', (action) => {
  if (action.startsWith('tab:')) {
    const tab = action.slice('tab:'.length) as SettingsTab
    if (canTab(tab)) setActiveTab(tab)
  }
})
```

`canTab` (l.565) existe déjà et gate les onglets owner/permission ; un intent vers un onglet interdit est ignoré.

- [ ] **Step 2 : Vérifier types**

Run: `npx tsc -b`
Expected: aucune erreur (si `canTab` est défini après cet appel, déplacer l'appel `useModuleIntent` après `canTab`).

- [ ] **Step 3 : Test manuel**

Run: `npm run dev` — Réglages → IA / Connecteurs / Données : ouvre le bon onglet. Onglet interdit (Firebase en non-owner) : ignoré.

- [ ] **Step 4 : Commit**

```bash
git add src/components/shared/SettingsPanel.tsx
git commit -m "feat(nav): deep-link onglets Réglages via moduleIntent"
```

---

## Task 8 : Application d'intent — PIM (actions DataPage)

**Files:**
- Modify: `src/pages/DataPage.tsx`

**Interfaces:**
- Consumes : `useModuleIntent` (Task 1) ; setters existants : `setImportModalOpen`, `setScrapingOpen`, `createEmpty()`, `setUpdateModalOpen`, `setEcExportOpen`, `exportToXlsx(sheets, name)`.

- [ ] **Step 1 : Brancher l'intent**

Dans `DataPage.tsx`, importer le hook. Après les déclarations des états/handlers (après l.75 et l.56), ajouter :

```tsx
useModuleIntent('data', (action) => {
  switch (action) {
    case 'action:import': setImportModalOpen(true); break
    case 'action:scrape': setScrapingOpen(true); break
    case 'action:create-empty': createEmpty(); break
    case 'action:update': setUpdateModalOpen(true); break
    case 'action:export-xlsx':
      exportToXlsx(sheets, `${currentFileName ?? sheets[activeSheetIndex]?.name ?? 'export'}.xlsx`)
      break
    case 'action:export-ec': setEcExportOpen(true); break
  }
})
```

Vérifier les noms exacts `sheets`, `activeSheetIndex`, `currentFileName` (déstructurés du store l.51) ; ajuster le nom de la feuille courante au pattern déjà utilisé l.442 si différent.

- [ ] **Step 2 : Vérifier types**

Run: `npx tsc -b`
Expected: aucune erreur.

- [ ] **Step 3 : Test manuel**

Run: `npm run dev` — PIM → Importer un fichier (modal s'ouvre) · Scraper le web (modal) · Créer BDD vide · Mise à jour · Export EasyCatalog · Exporter Excel (téléchargement).

- [ ] **Step 4 : Commit**

```bash
git add src/pages/DataPage.tsx
git commit -m "feat(nav): deep-link actions PIM via moduleIntent"
```

---

## Task 9 : Application d'intent — Taxonomies (store + état import)

**Files:**
- Modify: `src/pages/TaxonomiesPage.tsx`

**Interfaces:**
- Consumes : `useModuleIntent` (Task 1) ; `useBriefUIStore().setCurrentTab(tab: 'tree' | 'briefs')` (`src/stores/brief.store.ts`) ; état d'import (`importOpen`/`setImportOpen`, l.40).

- [ ] **Step 1 : Brancher l'intent**

Dans `TaxonomiesPage.tsx`, importer le hook. Récupérer le setter d'onglet : `const setCurrentTab = useBriefUIStore((s) => s.setCurrentTab)`. Ajouter :

```tsx
useModuleIntent('taxonomies', (action) => {
  if (action === 'tab:tree') setCurrentTab('tree')
  else if (action === 'tab:briefs') setCurrentTab('briefs')
  else if (action === 'action:import') setImportOpen(true)
})
```

Vérifier le nom exact de l'état d'import dans ce fichier (l.40, `importOpen`/`setImportOpen`). S'il est porté par `TaxonomySidebar`, le remonter en prop ou utiliser le store dédié ; sinon utiliser le setter local existant.

- [ ] **Step 2 : Vérifier types**

Run: `npx tsc -b`
Expected: aucune erreur.

- [ ] **Step 3 : Test manuel**

Run: `npm run dev` — Taxonomies → Arbre / Briefs / Importer une taxonomie.

- [ ] **Step 4 : Commit**

```bash
git add src/pages/TaxonomiesPage.tsx
git commit -m "feat(nav): deep-link Taxonomies (onglets + import) via moduleIntent"
```

---

## Task 10 : Application d'intent — Scraping Hub (useState local)

**Files:**
- Modify: `src/features/scraping-hub/ScrapingHubPage.tsx`

**Interfaces:**
- Consumes : `useModuleIntent` (Task 1) ; `setTab` local (`useState<Tab>('rules')`, l.16).

- [ ] **Step 1 : Brancher l'intent**

Dans `ScrapingHubPage.tsx`, importer le hook. Après `const [tab, setTab] = useState<Tab>('rules')` (l.16), ajouter :

```tsx
useModuleIntent('scraping-hub', (action) => {
  if (action.startsWith('tab:')) setTab(action.slice('tab:'.length) as Tab)
})
```

Suffixes d'intent (`rules | vendors | debug`) = ids `Tab`.

- [ ] **Step 2 : Vérifier types**

Run: `npx tsc -b`
Expected: aucune erreur.

- [ ] **Step 3 : Test manuel**

Run: `npm run dev` — Scraping Hub → Règles / Fournisseurs & Templates / Debug Jina/LLM.

- [ ] **Step 4 : Commit**

```bash
git add src/features/scraping-hub/ScrapingHubPage.tsx
git commit -m "feat(nav): deep-link onglets Scraping Hub via moduleIntent"
```

---

## Task 11 : Application d'intent — Utilisateurs & rôles (useState local)

**Files:**
- Modify: `src/features/access/admin/AccessAdminPage.tsx`

**Interfaces:**
- Consumes : `useModuleIntent` (Task 1) ; `setTab` local (`useState<'users' | 'roles'>('users')`, l.8).

- [ ] **Step 1 : Brancher l'intent**

Dans `AccessAdminPage.tsx`, importer le hook. Après `const [tab, setTab] = useState<'users' | 'roles'>('users')` (l.8), ajouter :

```tsx
useModuleIntent('access', (action) => {
  if (action === 'tab:users') setTab('users')
  else if (action === 'tab:roles') setTab('roles')
})
```

- [ ] **Step 2 : Vérifier types**

Run: `npx tsc -b`
Expected: aucune erreur.

- [ ] **Step 3 : Test manuel**

Run: `npm run dev` — Utilisateurs & rôles → Utilisateurs / Rôles.

- [ ] **Step 4 : Commit**

```bash
git add src/features/access/admin/AccessAdminPage.tsx
git commit -m "feat(nav): deep-link onglets Utilisateurs & rôles via moduleIntent"
```

---

## Task 12 : Application d'intent — Importer (défilement vers le format)

**Files:**
- Modify: `src/components/shared/ImportPanel.tsx`

**Interfaces:**
- Consumes : `useModuleIntent` (Task 1).

- [ ] **Step 1 : Ajouter des ancres par format**

Dans `ImportPanel.tsx`, sur le conteneur de chaque format (zones IDML/PPTX/Image/SVG/Excel/Image→SVG/PDF→SVG, l.45-133), ajouter l'attribut `data-import-format="<clé>"` avec les clés : `idml`, `pptx`, `image`, `svg`, `excel`, `image-to-svg`, `pdf-to-svg`.

- [ ] **Step 2 : Brancher l'intent (défilement + flash)**

Ajouter dans le composant :

```tsx
useModuleIntent('import', (action) => {
  if (!action.startsWith('format:')) return
  const key = action.slice('format:'.length)
  const el = document.querySelector<HTMLElement>(`[data-import-format="${key}"]`)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.classList.add('ring-2', 'ring-indigo-500')
  window.setTimeout(() => el.classList.remove('ring-2', 'ring-indigo-500'), 1500)
})
```

Importer le hook. (Le DOM est monté car la section `import` est active quand l'intent arrive.)

- [ ] **Step 3 : Vérifier types**

Run: `npx tsc -b`
Expected: aucune erreur.

- [ ] **Step 4 : Test manuel**

Run: `npm run dev` — Importer → PDF → SVG : la page défile et met en évidence la bonne zone.

- [ ] **Step 5 : Commit**

```bash
git add src/components/shared/ImportPanel.tsx
git commit -m "feat(nav): deep-link formats Importer (scroll + highlight) via moduleIntent"
```

---

## Task 13 : Application d'intent — Workflows (route + défilement modèles)

**Files:**
- Modify: `src/features/workflows/WorkflowsPage.tsx`

**Interfaces:**
- Consumes : `useModuleIntent` (Task 1) ; `create()` existant (crée + `navigate('/workflows/:id')`, l.77-82).

- [ ] **Step 1 : Brancher l'intent**

Dans `WorkflowsPage.tsx`, importer le hook. Ajouter :

```tsx
useModuleIntent('workflows', (action) => {
  if (action === 'action:new') { create(); return }
  const sel = action === 'action:my-templates'
    ? '[data-wf-section="my-templates"]'
    : action === 'action:builtin-templates'
    ? '[data-wf-section="builtin-templates"]'
    : null
  if (sel) document.querySelector<HTMLElement>(sel)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
})
```

Ajouter `data-wf-section="builtin-templates"` sur le conteneur de la grille de modèles intégrés (l.363-376) et `data-wf-section="my-templates"` sur la section `UserTemplatesSection` (l.379-386).

- [ ] **Step 2 : Vérifier types**

Run: `npx tsc -b`
Expected: aucune erreur.

- [ ] **Step 3 : Test manuel**

Run: `npm run dev` — Workflows → Nouveau workflow (route éditeur) · Mes modèles / Modèles intégrés (défilement).

- [ ] **Step 4 : Commit**

```bash
git add src/features/workflows/WorkflowsPage.tsx
git commit -m "feat(nav): deep-link Workflows (nouveau + sections modèles) via moduleIntent"
```

---

## Task 14 : Application d'intent — Animation (Hyperframes)

**Files:**
- Modify: `src/features/video/HyperframesPage.tsx`

**Interfaces:**
- Consumes : `useModuleIntent` (Task 1) ; état d'ouverture de `VideoModal` (l.28) ; `UserAnimationsList` (l.36).

- [ ] **Step 1 : Brancher l'intent**

Dans `HyperframesPage.tsx`, importer le hook. Ajouter (en réutilisant le setter d'état de la modale présent l.28) :

```tsx
useModuleIntent('hyperframes', (action) => {
  if (action === 'action:generate') setVideoModalOpen(true)
  else if (action === 'action:list')
    document.querySelector<HTMLElement>('[data-hf-section="list"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
})
```

Vérifier le nom exact du setter de la modale (inventaire : `VideoModal setState(true)`, l.28). Ajouter `data-hf-section="list"` sur le conteneur de `UserAnimationsList` (l.36).

- [ ] **Step 2 : Vérifier types**

Run: `npx tsc -b`
Expected: aucune erreur.

- [ ] **Step 3 : Test manuel**

Run: `npm run dev` — Animation → Générer une animation (modale) · Mes animations (défilement).

- [ ] **Step 4 : Commit**

```bash
git add src/features/video/HyperframesPage.tsx
git commit -m "feat(nav): deep-link Animation via moduleIntent"
```

---

## Task 15 : Application d'intent — Templates scraping (nouveau)

**Files:**
- Modify: `src/pages/ScrapingTemplatesPage.tsx`

**Interfaces:**
- Consumes : `useModuleIntent` (Task 1) ; `createNew()` existant (l.34-37).

- [ ] **Step 1 : Brancher l'intent**

Dans `ScrapingTemplatesPage.tsx`, importer le hook. Ajouter :

```tsx
useModuleIntent('scraping-templates', (action) => {
  if (action === 'action:new') createNew()
})
```

- [ ] **Step 2 : Vérifier types**

Run: `npx tsc -b`
Expected: aucune erreur.

- [ ] **Step 3 : Test manuel**

Run: `npm run dev` — Templates scraping → Nouveau template (ouvre l'éditeur de template vierge).

- [ ] **Step 4 : Commit**

```bash
git add src/pages/ScrapingTemplatesPage.tsx
git commit -m "feat(nav): deep-link Nouveau template via moduleIntent"
```

---

## Task 16 : Vérification globale + déploiement

**Files:** aucun (vérification).

- [ ] **Step 1 : Build complet**

Run: `npm run build`
Expected: `tsc -b` + `vite build` OK.

- [ ] **Step 2 : Tests + lint + knip**

Run: `npm run test:run && npm run lint && npx knip`
Expected: tests verts ; lint sans erreur ; knip exit 0.

- [ ] **Step 3 : Smoke manuel complet**

Run: `npm run dev`. Vérifier depuis la **sidebar** ET le **drawer** (sur l'éditeur), pour chaque module à enfants : déplier, cliquer chaque fonction, confirmer le saut direct. Confirmer la persistance pli/dépli après reload. Confirmer que re-cliquer la même fonction re-déclenche. Vérifier le gating (un compte sans `dam.generate` ne voit pas l'enfant « Générer »).

- [ ] **Step 4 : Déploiement (convention projet)**

```bash
firebase deploy --only hosting
```

(Le commit sur `master` est déjà fait par tâche. Déployer une fois l'ensemble validé.)

---

## Self-review (couverture spec)

- Mécanisme transport `location.state` + store `seq` → Task 1, Task 5. ✓
- Hook `useModuleIntent` one-shot → Task 1. ✓
- `ModuleTree` partagé sidebar+drawer → Task 3/4/5. ✓
- Données `children` + entrée Réglages → Task 2. ✓
- Niveau 1 (DAM, Réglages, PIM, Taxonomies, Scraping Hub, Accès) → Tasks 6-11. ✓
- Niveau 2 (Importer, Workflows, Animation, Templates scraping) → Tasks 12-15. ✓
- Vigilance reset de store au montage : DAM `activeTab` (vérifié : porté par le store, non réinitialisé au montage — `setActiveTab` reset seulement `selectedProjectId`) ; Taxonomies `currentTab` (store, défaut `'tree'` mais non re-set au montage du composant). Confirmer à l'exécution si un `useEffect` de reset existe ; sinon appliquer l'intent après. → Tasks 6, 9.
- Permissions enfants gated → Task 3 (`canChild`).
- Persistance pli/dépli localStorage → Task 3.
- Niveau 3 laissé plat (pas d'enfants) → conforme (aucune tâche). ✓
- Non-objectif (pas de query params, pas d'actions contextuelles) → respecté.
