# Manuel d'utilisation intégré — Menu Help

**Date** : 2026-04-17
**Statut** : Design validé, en attente du plan d'implémentation

## Contexte

L'application Web2Print est riche (Dashboard, Editor Fabric.js, Import IDML/PPTX/Excel/PDF, DAM, Taxonomies, Briefs, Scraping, Export multi-format) et ne dispose d'aucune aide en ligne. Les nouveaux utilisateurs doivent découvrir les fonctionnalités par essai-erreur. Ce lot pose l'infrastructure d'un manuel utilisateur contextuel, accessible partout dans l'app, avec copies d'écran et liens cliquables vers les menus décrits.

## Objectif

Livrer une infrastructure stable et typée pour un manuel d'utilisation intégré, accompagnée de deux sections de référence complètes (« Prise en main » et « L'éditeur ») servant de modèle pour la rédaction ultérieure des autres sections par l'utilisateur.

## Décisions de design

| Sujet | Choix |
|---|---|
| Placement | Global — bouton `?` flottant accessible sur toutes les pages authentifiées |
| Format | Drawer latéral droit (non-modal, l'app reste utilisable derrière) |
| Copies d'écran | Hybride — PNG statiques pour vues globales + mockups React pour UI ciblée |
| Liens vers menus | Navigation combinée — navigue vers la page cible si différente, puis applique un highlight visuel sur l'élément référencé |
| Portée du contenu | Infra + 2 sections rédigées + 8 stubs placeholders |
| i18n | Français uniquement |

## Architecture

### Arborescence des fichiers

```
src/features/help/
├── HelpTrigger.tsx          # Bouton "?" flottant (bas-droite, z-40), raccourci ⇧?
├── HelpDrawer.tsx           # Drawer shadcn Sheet, ~480px, non-modal
├── HelpTableOfContents.tsx  # Sommaire + recherche (titre + intro)
├── HelpSectionView.tsx      # Rendu d'une section (itération sur blocs)
├── MenuLink.tsx             # Lien cliquable → navigue + highlight
├── blocks/
│   ├── TextBlock.tsx        # Markdown minimal (p, ul, code inline)
│   ├── ScreenshotBlock.tsx  # <img> avec caption + zoom au clic
│   ├── MockupBlock.tsx      # Rend un composant React inline
│   └── ShortcutBlock.tsx    # Affiche des touches clavier stylisées
├── help.store.ts            # Zustand: open, currentSectionId, highlightTarget
├── hooks/
│   ├── useHelp.ts           # open/close/goToSection
│   └── useHighlight.ts      # À utiliser dans les cibles (ToolBar, LayersPanel…)
└── content/
    ├── index.ts             # Registre des sections (array ordonné + Map par id)
    ├── types.ts             # HelpSection, HelpBlock, MenuTarget
    ├── getting-started.tsx  # Section rédigée
    ├── editor.tsx           # Section rédigée
    └── _stubs.ts            # 8 placeholders "Rédaction à venir"

public/help/screenshots/     # PNG statiques (4-6 images)
  ├── dashboard-overview.png
  ├── editor-layout.png
  ├── editor-toolbar.png
  └── editor-layers.png
```

### Intégration globale

`<HelpTrigger />` est rendu à l'intérieur de `ProtectedRoute` (`src/features/auth/ProtectedRoute.tsx`) afin d'apparaître automatiquement sur toutes les routes authentifiées sans modifier le router. Il n'est donc jamais affiché sur `LoginPage`.

Le trigger expose un raccourci clavier global `⇧?` (`event.shiftKey && event.key === '?'`) qui ouvre/ferme le drawer. L'écouteur est attaché au `window` et retiré au démontage.

## Modèle de contenu

### Types (typés strict, pas de `any`)

```ts
// src/features/help/content/types.ts
import { ComponentType } from 'react'
import { LucideIcon } from 'lucide-react'

export type HelpCategory = 'Démarrage' | 'Édition' | 'Import' | 'Données' | 'Export'

export type MenuTarget = {
  path: string              // Ex: '/dashboard', '/editor/:id', '/taxonomies'
  highlightId?: string      // Ex: 'toolbar.text', 'layers-panel.add'
}

export type HelpBlock =
  | { type: 'text'; md: string }
  | { type: 'screenshot'; src: string; alt: string; caption?: string }
  | { type: 'mockup'; Component: ComponentType }
  | { type: 'menu-link'; target: MenuTarget; label: string; icon?: LucideIcon }
  | { type: 'shortcut'; keys: string[]; label: string }

export type HelpSection = {
  id: string                // slug unique, ex: 'editor'
  title: string
  category: HelpCategory
  intro: string             // 1-2 phrases affichées dans le sommaire + en tête de section
  blocks: HelpBlock[]
}
```

### Registre

`content/index.ts` exporte `helpSections: HelpSection[]` (ordre d'affichage dans le sommaire) et `helpSectionsById: Map<string, HelpSection>`. Un test unitaire vérifie l'unicité des IDs et que chaque `highlightId` référencé dans un `menu-link` correspond à une cible réellement instrumentée (liste blanche maintenue dans `useHighlight.ts`).

## Système de highlight cross-page

### Principe

Quand l'utilisateur clique un `MenuLink` dans le drawer :

1. Le store met à jour `highlightTarget` avec le `highlightId` de la cible.
2. Si `target.path` diffère de la route actuelle, `navigate(path)` est appelé et le drawer se ferme (listener sur `useLocation`).
3. Si même route, le drawer reste ouvert.
4. Le composant cible (ToolBar, LayersPanel, etc.) utilise `useHighlight(id)` qui :
   - observe `highlightTarget` dans le store
   - si match : applique `ring-2 ring-indigo-500 animate-pulse` + `scrollIntoView({ block: 'center' })`
   - reset automatique du target après 3 secondes (via `setTimeout` géré dans le store)

### Instrumentation initiale

Les 5-6 cibles suivantes reçoivent `useHighlight(id)` dans ce lot, car référencées depuis les 2 sections rédigées :

| Composant | highlightId |
|---|---|
| `EditorHeader` (bouton Save) | `editor-header.save` |
| `EditorHeader` (bouton Export) | `editor-header.export` |
| `ToolBar` (outil Texte) | `toolbar.text` |
| `ToolBar` (outil Image) | `toolbar.image` |
| `LayersPanel` | `layers-panel` |
| `DashboardPage` (bouton Nouveau projet) | `dashboard.new-project` |

Les autres instrumentations seront ajoutées au fil de la rédaction des sections manquantes (hors scope de ce lot).

## UI

### HelpDrawer

Drawer custom construit dans `features/help/HelpDrawer.tsx` (pas de dépendance shadcn Sheet — seul `alert-dialog.tsx` est installé dans `src/components/ui/` et le CLAUDE.md interdit d'y toucher).

- Rendu via portail React dans `document.body`
- Container : `fixed top-0 right-0 h-screen z-40 w-[480px] max-w-full`
- Animation : translation `translate-x-full` → `translate-x-0` avec `transition-transform duration-200`
- Background : `bg-[#1a1a1a]` avec border-left `border-white/10`
- Non-modal : pas de backdrop, l'app reste interactive derrière (clics capturés uniquement dans le drawer)
- Fermeture : bouton X en haut-droite + touche `Escape` + clic hors drawer **désactivé** (non-modal)
- Header fixe : titre « Aide » + bouton fermer + champ recherche
- Body : sommaire collapsible en colonne latérale interne (catégories) + zone de contenu scrollable

### HelpTrigger

- Bouton rond 40×40 px, `bg-[#1a1a1a] border border-white/10`
- Position : `fixed bottom-4 right-4 z-40`
- Icône Lucide `HelpCircle`
- Tooltip au survol : « Aide (⇧?) »

### MenuLink (rendu dans le drawer)

- Pastille inline type badge : fond `bg-indigo-500/10`, texte `text-indigo-400`, border `border-indigo-500/20`
- Icône optionnelle à gauche (Lucide)
- Cursor pointer, hover : `bg-indigo-500/20`

### Highlight visuel (dans l'app)

- Wrapper div géré par `useHighlight` renvoyant `{ ref, className }`
- `className` actif : `ring-2 ring-indigo-500 ring-offset-2 ring-offset-[#0f0f0f] animate-pulse transition-all`
- Pulse animé puis disparaît en fondu après 3s

## État & persistance

- État du drawer : en mémoire uniquement (Zustand, pas de persist). À chaque rechargement, le drawer est fermé.
- Aucun appel Firebase ou API. Le contenu est compilé dans le bundle (TS + PNG).
- Aucun tracking analytics dans ce lot.

## Respect des conventions projet

- Composants : PascalCase.tsx, max 150 lignes
- Hooks : useCamelCase.ts
- Store : `help.store.ts` (un seul domaine)
- Typage strict : pas de `any`, props explicites
- Dark mode obligatoire : fond `#0f0f0f`, surface `#1a1a1a`, accent `#6366f1`
- Français uniquement dans les chaînes UI et la documentation
- Aucun import Fabric.js (module indépendant du canvas)
- Aucun fichier modifié dans `src/components/ui/**`, `src/lib/firebase/config.ts`, `public/fonts/`

## Livraison

### Inclus

- Infrastructure complète (store, drawer, trigger, TOC, 4 types de blocs, MenuLink, useHighlight)
- Section **Prise en main** rédigée (login → dashboard → création 1er projet)
- Section **L'éditeur** rédigée (canvas, toolbar, layers, sauvegarde, undo/redo, export)
- 4 à 6 screenshots PNG dans `public/help/screenshots/`
- 2 à 3 mockups React (ex : vue stylisée du bouton Exporter, mini-toolbar)
- 8 stubs placeholders (Import, Excel, DAM, Taxonomies, Briefs, Scraping, Fusion de données, Export avancé)
- Instrumentation `useHighlight` sur les 6 cibles listées ci-dessus
- Raccourci clavier `⇧?`

### Tests (vitest)

- `help.store` : open/close, setHighlight, reset auto après 3s
- `useHighlight` : applique `className` si match, reset si mismatch
- Registre : IDs uniques, tous les `highlightId` utilisés sont instrumentés
- Pas de tests E2E

### Hors scope

- Rédaction des 8 sections restantes (à compléter par l'utilisateur au fil de l'eau)
- Versioning/historique du manuel
- Recherche full-text avancée (seule la recherche sur titre + intro est livrée)
- Tour guidé / onboarding interactif
- Internationalisation (FR uniquement)
- Tracking analytics ou telemetry

## Risques & mitigations

| Risque | Mitigation |
|---|---|
| Drift entre screenshots PNG et UI réelle | Stratégie hybride : PNG pour vues globales stables, mockups React pour UI susceptible d'évoluer |
| Dead links vers `highlightId` non instrumentés | Test unitaire bloquant qui vérifie la liste blanche |
| Bundle size (screenshots PNG dans `public/`) | Servis statiquement par Vite, non bundlés dans le JS. Optimiser à <100 Ko chacun via compression |
| Drawer qui masque l'élément highlighté | Drawer ancré à droite (480px), `scrollIntoView({ block: 'center' })` recentre l'élément dans la zone visible restante |

## Prochaines étapes

Création du plan d'implémentation détaillé via `writing-plans`.
