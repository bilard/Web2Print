# Module Taxonomies — Design Spec
**Date :** 2026-04-04  
**Projet :** Web2Print / DesignStudio  
**Stack :** React 18, Vite, TypeScript strict, Zustand, React Query, Firebase Firestore, @dnd-kit, shadcn/ui

---

## Contexte

Le projet gère des imports de fichiers de mise en page (IDML, PowerPoint, etc.) organisés par Taxonomies. Une Taxonomie est une arborescence hiérarchique à N niveaux. Chaque nœud terminal est le point d'entrée pour accrocher des projets/templates. Exemple réel : `Doublet/Nomenclature.md` (~250 nœuds, 3 niveaux).

---

## Section 1 — Types & Structure de données

### Types TypeScript (`src/features/taxonomy/types.ts`)

```ts
interface TaxonomyNode {
  id: string
  label: string
  parentId: string | null
  order: number                   // position parmi les frères
  level: number                   // 0 = racine, 1 = enfant, etc.
  linkedProjectIds: string[]      // projets liés (nœuds terminaux uniquement)
}

interface Taxonomy {
  id: string
  name: string
  ownerId: string
  createdAt: Timestamp
  updatedAt: Timestamp
  nodes: Record<string, TaxonomyNode>   // map plate sérialisée
}

// Nœud enrichi avec enfants calculés — utilisé uniquement en mémoire
interface TaxonomyNodeWithChildren extends TaxonomyNode {
  children: TaxonomyNodeWithChildren[]
  isLeaf: boolean
}
```

### Firestore

```
taxonomies/{taxonomyId}
  id, name, ownerId, createdAt, updatedAt
  nodes: { [nodeId]: TaxonomyNode }   // map plate
```

Choix : map embarquée dans le document principal (vs. sous-collection). Justification : ~250 nœuds typiques, bien en deçà de la limite 1 MB Firestore. Lecture unique, écriture atomique.

### Règles Firestore (ajout à `firestore.rules`)

```
match /taxonomies/{taxonomyId} {
  allow read:   if isAuthenticated() && resource.data.ownerId == request.auth.uid;
  allow create: if isAuthenticated() && request.resource.data.ownerId == request.auth.uid;
  allow update, delete: if isAuthenticated() && resource.data.ownerId == request.auth.uid;
}
```

### Store Zustand — UI state uniquement (`src/stores/taxonomy.store.ts`)

```ts
interface TaxonomyUIState {
  selectedTaxonomyId: string | null
  expandedNodeIds: Set<string>
  searchQuery: string
  highlightedNodeId: string | null

  setSelectedTaxonomy: (id: string | null) => void
  toggleNode: (id: string) => void
  expandAll: (nodeIds: string[]) => void
  setSearch: (q: string) => void
  setHighlighted: (id: string | null) => void
}
```

---

## Section 2 — Composants & Structure de fichiers

```
src/
├── features/taxonomy/
│   ├── types.ts
│   ├── taxonomyUtils.ts            # buildTree(), flattenTree(), findPath()
│   ├── parsers/
│   │   ├── parseMarkdown.ts        # H2 + bold bullets + indented bullets
│   │   ├── parseCsv.ts             # colonnes level_1…level_N (via xlsx)
│   │   └── parseXlsx.ts           # même structure, lecture xlsx
│   ├── useTaxonomies.ts            # useQuery → liste toutes les taxonomies
│   ├── useTaxonomyById.ts          # useQuery → une taxonomie par ID
│   └── useTaxonomyMutations.ts     # create/rename/delete/addNode/renameNode/
│                                   # deleteNode/moveNode/linkProject/unlinkProject
│
├── stores/
│   └── taxonomy.store.ts
│
├── components/taxonomy/
│   ├── TaxonomyNode.tsx            # Nœud récursif : label, expand, D&D, CRUD
│   ├── TaxonomyTree.tsx            # Arbre complet d'une taxonomie
│   ├── TaxonomySidebar.tsx         # Liste des taxonomies (panneau gauche)
│   ├── TaxonomySearchBar.tsx       # Input + dropdown autocomplétion
│   ├── TaxonomyImportModal.tsx     # Upload + prévisualisation + confirmation
│   ├── LinkProjectsModal.tsx       # Sélecteur de projets à lier
│   └── TaxonomyEmptyState.tsx      # État vide avec CTA import
│
└── pages/
    └── TaxonomiesPage.tsx          # Assemblage — layout sidebar + tree(s)
```

### Layout de la page

```
┌─────────────────┬──────────────────────────────────────┐
│  TaxonomySidebar│  Header: SearchBar  [+ Import]        │
│  ─────────────  │  ─────────────────────────────────── │
│  Nomenclature   │  TaxonomyTree (taxonomie sélectionnée)│
│  Monoprix       │                                       │
│  Doublet        │  → TaxonomyNode (récursif)            │
│                 │    ├── TaxonomyNode                   │
│  [+ Nouvelle]   │    │   └── TaxonomyNode (feuille)     │
└─────────────────┴──────────────────────────────────────┘
```

---

## Section 3 — Flux de données & interactions clés

### Architecture : React Query + mutations optimistes

Pattern choisi cohérent avec `useProjects`. Pas de listener `onSnapshot` — les mutations invalident le cache React Query.

Chaque mutation :
1. `optimisticUpdate` → modifie le cache React Query (UI instantanée)
2. `updateDoc(db, 'taxonomies/id', { nodes: updatedMap })` → persiste Firestore
3. `onError` → rollback snapshot précédent + toast Sonner

### Mutations couvertes

| Mutation | Description |
|---|---|
| `createTaxonomy` | Crée un nouveau document Firestore |
| `renameTaxonomy` | Met à jour `name` |
| `deleteTaxonomy` | Supprime le document entier |
| `duplicateTaxonomy` | `setDoc` avec nouvel ID |
| `addNode` | Ajoute un enfant à un nœud, inline edit immédiat |
| `renameNode` | Met à jour `label` |
| `deleteNode` | Supprime le nœud + tous ses descendants récursivement |
| `moveNode` | Change `parentId` + recalcule `order` (D&D) |
| `linkProject` | Ajoute un ID à `linkedProjectIds` |
| `unlinkProject` | Retire un ID de `linkedProjectIds` |

### Drag-and-drop (`@dnd-kit/sortable`)

- `DndContext` wrapping l'arbre entier
- Chaque `TaxonomyNode` est un `SortableItem`
- `onDragEnd` : même parent → réordonne. Parent différent → change `parentId` + réordonne. Les deux cas appellent `moveNode`.
- Contrainte : `restrictToVerticalAxis`

### Recherche & autocomplétion

- Input contrôlé dans le store (`searchQuery`)
- Après 2 caractères : filtre sur tous les nœuds → liste déroulante `label + breadcrumb`
- Sélection : `expandAll(pathToNode)` + `setHighlighted(nodeId)` + scroll to node
- Filtre live : nœud visible si lui-même ou un descendant match (ancêtres toujours visibles)

### Lien projets ↔ nœuds terminaux

- Bouton "Lier" sur les nœuds `isLeaf: true`
- `LinkProjectsModal` : liste `useProjects`, cases à cocher, confirmation
- `linkedProjectIds` mis à jour via `linkProject` / `unlinkProject`
- Dans `DashboardPage`, badge "taxonomie" sur `ProjectCard` : lookup en mémoire depuis `useTaxonomies` pour trouver le label du nœud lié

### Import de fichiers

Formats supportés :
- **Markdown** : `## N. Titre` = niveau 1, `- **Gras**` = niveau 2, `  - texte` = niveaux suivants
- **CSV** : colonnes `level_1`, `level_2`, … `level_N` (via `xlsx`)
- **XLSX** : même structure que CSV (via `xlsx`)

Flow : upload → parsing → prévisualisation arbre read-only → confirmation → `createTaxonomy`

---

## Section 4 — Navigation & intégration Dashboard

### Route autonome

`/taxonomies` dans `router.tsx` avec `lazy()` + `ProtectedRoute`, même pattern que `/data`.

### Intégration Dashboard

Entrée dans `menuItems` de `DashboardPage.tsx` :

```ts
{ id: 'taxonomies', icon: FolderTree, label: 'Taxonomies',
  accent: 'text-teal-400', activeBg: 'bg-teal-500/[0.1]', activeText: 'text-teal-300' }
```

`activeSection === 'taxonomies'` → `<TaxonomiesPage embedded />` dans la zone de contenu.

### Badge sur ProjectCard

`ProjectCard` reçoit `taxonomyLabel?: string`. `DashboardPage` calcule ce label via lookup en mémoire :  
pour chaque projet, cherche dans `useTaxonomies` un nœud dont `linkedProjectIds.includes(project.id)`.

### Comportement initial de l'arbre

- Niveau 1 : tous les nœuds visibles et ouverts
- Niveaux 2+ : fermés par défaut, SAUF pour la première taxonomie de la liste où tout est déplié
- `expandedNodeIds` initialisé dans le store au chargement des données

### Accessibilité

- Boutons CRUD : `aria-label` explicites ("Ajouter un enfant à X", "Renommer X", "Supprimer X")
- `AlertDialog` shadcn pour confirmation suppression : focus trap natif
- `LinkProjectsModal` : focus trap, `role="dialog"`, `aria-labelledby`
- Navigation clavier arbre : `ArrowUp/Down` pour nœuds visibles, `Enter` pour expand/collapse

---

## Ordre d'implémentation

1. `src/features/taxonomy/types.ts`
2. `src/features/taxonomy/taxonomyUtils.ts`
3. `src/features/taxonomy/parsers/` (parseMarkdown, parseCsv, parseXlsx)
4. `src/stores/taxonomy.store.ts`
5. `src/features/taxonomy/useTaxonomies.ts` + `useTaxonomyById.ts`
6. `src/features/taxonomy/useTaxonomyMutations.ts`
7. `src/components/taxonomy/TaxonomyNode.tsx`
8. `src/components/taxonomy/TaxonomyTree.tsx`
9. `src/components/taxonomy/TaxonomySidebar.tsx`
10. `src/components/taxonomy/TaxonomySearchBar.tsx`
11. `src/components/taxonomy/TaxonomyImportModal.tsx`
12. `src/components/taxonomy/LinkProjectsModal.tsx`
13. `src/components/taxonomy/TaxonomyEmptyState.tsx`
14. `src/pages/TaxonomiesPage.tsx`
15. Navigation : `router.tsx` + `DashboardPage.tsx` + badge `ProjectCard`
16. `firestore.rules` : ajout règle `taxonomies`

---

## Dépendances

Aucune nouvelle dépendance requise. Tout est déjà installé :
- `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`
- `xlsx` (pour CSV et XLSX)
- `@tanstack/react-query` v5
- `zustand` v4
- `firebase` v10
- `sonner` (toasts)
- `shadcn/ui` (Button, Dialog, AlertDialog, Input, ScrollArea, Tooltip)
