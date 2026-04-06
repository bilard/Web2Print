# Navigation Style InDesign — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer la sidebar gauche par une barre d'outils verticale (style InDesign) et déplacer tous les panneaux de contenu à droite en accordéons empilés et draggables sous le panneau Propriétés.

**Architecture:** Barre d'outils verticale étroite (44px) à gauche avec les outils de dessin/sélection. Panneau droit unique contenant Propriétés (toujours visible en haut) + panneaux accordéons réductibles et réordonnables par drag (Calques, Images, Palette, Assets, Import). Le canvas occupe tout l'espace central.

**Tech Stack:** React 18, Tailwind, Zustand, @dnd-kit/sortable (déjà installé), Lucide icons, Fabric.js v6

---

## Structure des fichiers

| Action | Fichier | Responsabilité |
|--------|---------|---------------|
| Créer | `src/components/panels/ToolBar.tsx` | Barre d'outils verticale gauche |
| Créer | `src/components/panels/RightPanelStack.tsx` | Conteneur des panneaux droite (Propriétés + accordéons) |
| Créer | `src/components/panels/CollapsiblePanel.tsx` | Wrapper accordéon draggable générique |
| Modifier | `src/stores/ui.store.ts` | Ajouter état tool actif + ordre/état des panneaux droite |
| Modifier | `src/pages/EditorPage.tsx` | Nouveau layout (ToolBar | Canvas | RightPanelStack) |
| Modifier | `src/components/panels/PropertiesPanel.tsx` | Retirer le bouton collapse externe, adapter la largeur |
| Conserver | `src/components/panels/LeftSidebar.tsx` | Ne pas supprimer — garder comme fallback, retirer de EditorPage |

---

### Task 1: Ajouter l'état UI pour les outils et panneaux

**Files:**
- Modify: `src/stores/ui.store.ts`

- [ ] **Step 1: Ajouter les types et l'état pour l'outil actif**

```typescript
// Ajouter au type
type ActiveTool = 'select' | 'text' | 'rect' | 'ellipse' | 'line' | 'image' | 'hand' | 'zoom'

// Ajouter à l'interface UIState
activeTool: ActiveTool
setActiveTool: (tool: ActiveTool) => void

// Ajouter les panneaux droite
rightPanels: { id: string; collapsed: boolean }[]
setRightPanels: (panels: { id: string; collapsed: boolean }[]) => void
toggleRightPanel: (id: string) => void
```

- [ ] **Step 2: Ajouter les valeurs par défaut et les implémentations**

```typescript
// defaults
activeTool: 'select',
rightPanels: [
  { id: 'layers', collapsed: true },
  { id: 'images', collapsed: true },
  { id: 'palette', collapsed: true },
  { id: 'assets', collapsed: true },
  { id: 'import', collapsed: true },
],

// implementations
setActiveTool: (tool) => set({ activeTool: tool }),
setRightPanels: (panels) => set({ rightPanels: panels }),
toggleRightPanel: (id) => set((s) => ({
  rightPanels: s.rightPanels.map((p) =>
    p.id === id ? { ...p, collapsed: !p.collapsed } : p
  ),
})),
```

- [ ] **Step 3: Vérifier compilation**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/stores/ui.store.ts
git commit -m "feat: add activeTool and rightPanels state to UI store"
```

---

### Task 2: Créer la barre d'outils verticale

**Files:**
- Create: `src/components/panels/ToolBar.tsx`

- [ ] **Step 1: Créer le composant ToolBar**

Barre verticale 44px avec les outils groupés :
- Groupe 1 (Sélection) : MousePointer2
- Séparateur
- Groupe 2 (Création) : Type, Square, Circle, Minus, ImagePlus
- Séparateur
- Groupe 3 (Navigation) : Hand, ZoomIn

Chaque bouton : 34x34px, rounded-md, tooltip au hover, fond indigo si actif.

- [ ] **Step 2: Connecter au store**

Lire `activeTool` et appeler `setActiveTool` au clic.

- [ ] **Step 3: Vérifier compilation**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/components/panels/ToolBar.tsx
git commit -m "feat: create vertical ToolBar component"
```

---

### Task 3: Créer le wrapper CollapsiblePanel

**Files:**
- Create: `src/components/panels/CollapsiblePanel.tsx`

- [ ] **Step 1: Créer le composant accordéon**

Props : `id`, `title`, `icon`, `collapsed`, `onToggle`, `children`
- Header cliquable avec icône + titre + chevron (rotate quand ouvert)
- Contenu avec transition height
- Intégration @dnd-kit/sortable pour le drag handle sur le header

- [ ] **Step 2: Vérifier compilation**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/components/panels/CollapsiblePanel.tsx
git commit -m "feat: create CollapsiblePanel accordion component"
```

---

### Task 4: Créer le RightPanelStack

**Files:**
- Create: `src/components/panels/RightPanelStack.tsx`

- [ ] **Step 1: Créer le conteneur des panneaux**

Structure :
1. PropertiesPanel toujours visible en haut (non draggable)
2. Séparateur
3. Zone scrollable avec DndContext + SortableContext
4. Les panneaux accordéons (Calques, Images, Palette, Assets, Import) wrappés dans CollapsiblePanel + useSortable
5. Lire l'ordre depuis `ui.store.rightPanels`
6. Mettre à jour l'ordre via `setRightPanels` sur `onDragEnd`

Mapping des panneaux :
- `layers` → LayersPanel, icône Layers
- `images` → NanoBanaPanel, icône ImagePlus
- `palette` → PalettePanel, icône Palette
- `assets` → AssetsPanel, icône FolderOpen
- `import` → ImagesPanel, icône Download

Largeur : 300px (`w-[300px]`)

- [ ] **Step 2: Vérifier compilation**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/components/panels/RightPanelStack.tsx
git commit -m "feat: create RightPanelStack with draggable accordion panels"
```

---

### Task 5: Modifier le layout EditorPage

**Files:**
- Modify: `src/pages/EditorPage.tsx`

- [ ] **Step 1: Remplacer LeftSidebar par ToolBar**

Remplacer `<LeftSidebar />` par `<ToolBar />` dans le layout flex.

- [ ] **Step 2: Remplacer PropertiesPanel par RightPanelStack**

Remplacer `<PropertiesPanel />` par `<RightPanelStack />`.

- [ ] **Step 3: Adapter le layout**

```tsx
<div className="flex flex-1 overflow-hidden">
  <ToolBar />
  <div className="flex-1 relative overflow-hidden">
    <CanvasContainer />
  </div>
  <RightPanelStack />
</div>
```

- [ ] **Step 4: Vérifier compilation et rendu**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/pages/EditorPage.tsx
git commit -m "feat: replace LeftSidebar with ToolBar + RightPanelStack layout"
```

---

### Task 6: Adapter PropertiesPanel

**Files:**
- Modify: `src/components/panels/PropertiesPanel.tsx`

- [ ] **Step 1: Retirer le wrapper externe et le bouton collapse**

- Supprimer la div conteneur avec `w-72` et le bouton collapse `absolute -left-4`
- Le composant retourne directement son contenu scrollable
- RightPanelStack gère la largeur et le positionnement

- [ ] **Step 2: Vérifier compilation**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/components/panels/PropertiesPanel.tsx
git commit -m "refactor: adapt PropertiesPanel for RightPanelStack integration"
```

---

### Task 7: Nettoyage et polish

**Files:**
- Modify: `src/pages/EditorPage.tsx`
- Modify: `src/stores/ui.store.ts`

- [ ] **Step 1: Retirer l'import de LeftSidebar de EditorPage**

Supprimer la ligne `import { LeftSidebar }` si plus utilisée.

- [ ] **Step 2: Nettoyer les anciens états du store**

Supprimer `activeLeftPanel`, `toggleLeftPanel`, `setActiveLeftPanel` du store s'ils ne sont plus utilisés ailleurs.

- [ ] **Step 3: Vérifier qu'aucun autre fichier n'utilise les anciens états**

Run: `grep -r "activeLeftPanel\|toggleLeftPanel" src/ --include="*.ts" --include="*.tsx"`

- [ ] **Step 4: Vérifier compilation finale**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: clean up old LeftSidebar state and imports"
```
