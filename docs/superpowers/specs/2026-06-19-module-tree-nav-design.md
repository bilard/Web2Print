# Menu en arbre dépliant des modules + deep-link des fonctions

> Date : 2026-06-19
> Statut : design validé (brainstorming), prêt pour plan d'implémentation

## Problème

La navigation expose les modules en **liste plate** (sidebar du Dashboard + drawer global,
source unique `src/features/navigation/modules.ts`). Les fonctions dédiées de chaque module
(onglets DAM, onglets Réglages, actions PIM, onglets Scraping Hub…) sont **dispersées dans
chaque écran** : peu découvrables, et inatteignables sans d'abord ouvrir le module puis
chercher le bon bouton/onglet.

## Objectif

Transformer la liste plate en **arbre dépliant** où chaque module peut exposer ses fonctions
dédiées en enfants. Un clic sur une fonction enfant **va droit à la fonction** (deep-link) :
ouvre le module ET active l'onglet / le store / l'action correspondante.

Bénéfice premier : **découvrabilité et organisation** (la plainte « dispersées »). Le
deep-link est le bonus. L'arbre s'affiche dans la **sidebar du Dashboard ET le drawer global**
(ils partagent déjà `modules.ts`).

## Décisions actées (questions de cadrage)

- **Comportement au clic enfant** : aller droit à la fonction (deep-link), pas seulement ouvrir.
- **Portée d'affichage** : sidebar + drawer global (rendu partagé, pas forké).
- **Périmètre de câblage** : niveaux 1 + 2 (voir arbre). Niveau 3 reste plat.
- **Réglages** : ajouté à l'arbre comme module à part entière (ses 7 onglets en enfants) ;
  l'icône d'engrenage existante est conservée en parallèle.

## Architecture

### Vue d'ensemble

```
modules.ts (données)            ModuleTree (rendu partagé)         transport + application
─────────────────────          ─────────────────────────         ───────────────────────
MODULE_ITEMS[].children    →    sidebar Dashboard ────┐
  { id, label, intent,         drawer ModuleNavDrawer ┘──clic enfant──> navigate('/dashboard',
    permission? }                                                          { state:{section,intent} })
                                                                                  │
                                                       DashboardPage effect ◄──────┘
                                                       (location.key, location.state)
                                                         ├─ setActiveSection(section)
                                                         └─ moduleIntent.set(intent)
                                                                  │
                                          chaque écran : useModuleIntent('<module>', apply)
                                                         consomme une fois → applique → clear
```

### Transport de l'intent : `location.state`, pas un store nu

L'intent voyage dans `location.state` à côté de `section` — réutilise le pattern existant
(`location.state.section`). **Pourquoi pas un store seul** : `location.key` change à chaque
navigation, donc re-cliquer la même fonction re-déclenche l'effet ; un store nu ne re-fire pas
sur une valeur identique sans nonce. `DashboardPage` est le **point de passage unique** (le
drawer navigue toujours vers `/dashboard`).

### Consommation : petit store `moduleIntent` (découplage)

`src/stores/moduleIntent.store.ts` (Zustand) :

```ts
interface ModuleIntentState {
  intent: string | null
  set: (intent: string | null) => void
  consume: () => string | null   // lit + remet à null (one-shot)
}
```

`DashboardPage` (effet existant `[location.key, location.state]`) : après `setActiveSection`,
appelle `moduleIntent.set(location.state.intent ?? null)`.

Hook de consommation par écran :

```ts
// src/features/navigation/useModuleIntent.ts
useModuleIntent(prefix: string, apply: (action: string) => void)
```

S'abonne au store ; quand `intent` commence par `prefix:`, appelle `apply(action)` puis
`consume()`. One-shot. Pas de prop threading.

### Convention de clés d'intent

`'<module>:<action>'`, ex. `'dam:tab:favorites'`, `'settings:tab:ai'`, `'pim:action:import'`,
`'scraping-hub:tab:debug'`. L'`action` est ce que reçoit le `apply` de l'écran.

### Composant `ModuleTree` partagé

`src/features/navigation/ModuleTree.tsx` :

- Props : `modules: ModuleItem[]`, `activeSection?`, `onOpen(section)`,
  `onOpenChild(section, intent)`, `variant: 'sidebar' | 'drawer'` (styles/compacité).
- Ligne module : clic **label** → `onOpen(section)` ; clic **chevron** → toggle déplié.
  (Modules sans enfants : pas de chevron, clic = ouvre.)
- Enfants rendus indentés sous le parent quand déplié ; clic → `onOpenChild`.
- État déplié/replié par module persisté en `localStorage` (clé `nav:tree:expanded`).
- Gating : un enfant n'est visible que si sa `permission` (si présente) est accordée ;
  sinon hérite de la visibilité du parent (déjà filtrée par `useVisibleModules`).
- Accessibilité : `role="tree"/"treeitem"`, `aria-expanded`, navigation clavier de base
  (flèches/Entrée) — au minimum focusable + Entrée, parité avec l'existant.

`DashboardPage` (sidebar) et `ModuleNavDrawer` remplacent leur `.map()` plat par `<ModuleTree>`.

### Modèle de données (`modules.ts`)

```ts
export interface ModuleChild {
  id: string            // suffixe d'action, ex. 'tab:favorites'
  label: string
  intent: string        // clé complète '<module>:<id>'
  permission?: string   // gate optionnel en plus du parent
  routeTo?: string      // si la fonction est une vraie route (ex. nouveau workflow)
}
export interface ModuleItem {
  /* … champs existants … */
  children?: ModuleChild[]
}
```

Ajouter aussi l'entrée **Réglages** (`id: 'settings'`) à `MODULE_ITEMS` avec ses enfants.
`settings` est déjà un `Section` valide et géré par `DashboardPage`.

## Arbre détaillé (enfants à câbler — niveaux 1+2)

Légende : `[saut]` deep-link · `[route]` navigation directe · mécanisme d'application entre ( ).

### Niveau 1 — deep-link propre (onglets/stores)

- **DAM** (`images`) — applique via `useDamStore.setState({ activeTab })` :
  `tab:stock` Banque d'images · `tab:my-images` Mes images · `tab:favorites` Favoris ·
  `tab:collections` Collections · `tab:recent` Récents · `tab:projects` Projets ·
  `tab:generate` Générer · `tab:videos` Animations HTML · `tab:gdrive` Google Drive.
  (Enfants gated comme dans DamPage : generate/videos/gdrive selon droits.)
- **Réglages** (`settings`) — applique via `setActiveTab` de `SettingsPanel` (local `useState`,
  à lever via intent) : `tab:profile` Profil · `tab:ai` IA · `tab:connectors` Connecteurs ·
  `tab:cookies` Cookies · `tab:firebase` Firebase · `tab:stats` Statistiques · `tab:data` Données.
  (Firebase/Données owner-only ; Connecteurs/Cookies selon permission.)
- **PIM** (`data`) — applique via stores/handlers de DataPage :
  `action:import` Importer un fichier (`importModalOpen`) · `action:scrape` Scraper le web
  (`scrapingOpen`) · `action:create-empty` Créer BDD vide (`createEmpty()`) ·
  `action:update` Mise à jour (`updateModalOpen`) · `action:export-xlsx` Exporter Excel
  (`exportToXlsx()`) · `action:export-ec` Export EasyCatalog (`ecExportOpen`).
- **Taxonomies** (`taxonomies`) — `useBriefUIStore.currentTab` + état import :
  `tab:tree` Arbre · `tab:briefs` Briefs · `action:import` Importer une taxonomie (`importOpen`).
- **Scraping Hub** (`scraping-hub`) — `setTab` local de ScrapingHubPage :
  `tab:rules` Règles · `tab:vendors` Fournisseurs & Templates · `tab:debug` Debug Jina/LLM.
- **Utilisateurs & rôles** (`access`) — `tab` local de AccessAdminPage :
  `tab:users` Utilisateurs · `tab:roles` Rôles.

### Niveau 2 — intérêt moyen

- **Importer** (`import`) — `apply` défile vers / met en évidence le bon dépôt dans ImportPanel
  (ancre par format ; pas de modal préouvert) : `format:idml` · `format:pptx` · `format:image`
  · `format:svg` · `format:excel` · `format:image-to-svg` · `format:pdf-to-svg`
  (chaque enfant gated par sa permission `import.*`).
- **Workflows** (`workflows`) — `action:new` Nouveau workflow `[route]` (crée puis route
  `/workflows/:id`, comme `create()` actuel) · `action:my-templates` Mes modèles `[saut]`
  (défile vers la section UserTemplatesSection) · `action:builtin-templates` Modèles intégrés
  `[saut]` (défile vers la grille de modèles).
- **Animation** (`hyperframes`) — `action:generate` Générer une animation (ouvre VideoModal) ·
  `action:list` Mes animations (défile vers UserAnimationsList).
- **Templates scraping** (`scraping-templates`) — `action:new` Nouveau template (`createNew()`).

### Niveau 3 — laissés plats (pas d'enfants)

Nouveau document · Bibliothèque · Veille tarifaire · Telegram · Chat IA.

## Points de vigilance (issus de la revue)

1. **Reset de store au montage** : pour les cibles `[saut]` basées store (DAM `activeTab`,
   Taxonomies `currentTab`), vérifier que l'écran ne réinitialise PAS cet état à son montage,
   sinon l'intent est écrasé. Si reset il y a, appliquer l'intent APRÈS (effet d'ordre) ou
   neutraliser le reset quand un intent est en attente. À valider par cible avant câblage.
2. **Écrans en `useState` local** (Réglages, Scraping Hub, Access) : exposer un point
   d'application de l'intent (effet qui lit `useModuleIntent` et `setActiveTab`). Ces écrans
   sont lazy/embedded ; l'effet doit tourner au montage du composant cible.
3. **Sections vs routes** : Workflows `action:new` navigue vers une vraie route ; les autres
   passent par `state.section + intent`. `ModuleTree` choisit selon `routeTo`.
4. **Drawer masqué sur `/dashboard`** : comportement conservé. Sur l'éditeur/routes autonomes,
   le drawer navigue vers `/dashboard` avec section+intent (déjà le pattern actuel).
5. **Hauteur sidebar** : la sidebar du Dashboard a une largeur fixe ; l'arbre déplié peut
   dépasser → conteneur `overflow-y-auto`. Vérifier le mode replié (sidebar étroite) :
   en sidebar collapsée, ne pas afficher les enfants (icônes seules), arbre uniquement déplié.

## Tests

- **Unitaire** : `useModuleIntent` consomme une fois et clear ; matching par préfixe.
- **Unitaire** : `ModuleTree` rend chevron uniquement si enfants ; respecte la persistance
  localStorage ; gate les enfants par permission.
- **Intégration légère** : clic enfant → `navigate` appelé avec `{ section, intent }` correct
  (mock router), parité sidebar/drawer.
- **Manuel/smoke** (utilisateur) : DAM→Favoris, Réglages→IA, PIM→Importer, Scraping Hub→Debug,
  Workflows→Nouveau, depuis sidebar ET drawer ; re-clic re-déclenche.

## Non-objectifs (YAGNI)

- Pas de deep-link des actions contextuelles (renommer/supprimer/dupliquer/réordonner) qui
  exigent un élément sélectionné.
- Pas de synchro URL/query params (`?tab=`) ni de liens partageables/persistants au reload :
  l'intent reste éphémère, piloté par le menu (comme `location.state.section` aujourd'hui).
- Pas d'enfants pour le niveau 3 à ce stade (extensible plus tard via `children`).

## Fichiers touchés (estimation)

- `src/features/navigation/modules.ts` — `ModuleChild`, `children`, entrée `settings`.
- `src/features/navigation/ModuleTree.tsx` — **nouveau**, rendu partagé.
- `src/features/navigation/useModuleIntent.ts` — **nouveau**, hook de consommation.
- `src/stores/moduleIntent.store.ts` — **nouveau**, store one-shot.
- `src/pages/DashboardPage.tsx` — sidebar → `<ModuleTree>` ; effet pousse l'intent.
- `src/features/navigation/ModuleNavDrawer.tsx` — liste plate → `<ModuleTree>`.
- Écrans cibles (application de l'intent) : `DamPage`, `SettingsPanel`, `DataPage`,
  `TaxonomiesPage`, `ScrapingHubPage`, `AccessAdminPage`, `ImportPanel`, `WorkflowsPage`,
  `HyperframesPage`, `ScrapingTemplatesPage`.
