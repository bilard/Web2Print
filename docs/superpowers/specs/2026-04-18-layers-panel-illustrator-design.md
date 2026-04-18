# Refonte du panneau Calques — fidélité Illustrator

**Statut :** spec validé, prêt pour plan d'implémentation
**Auteur :** fbilard
**Date :** 2026-04-18

## Contexte

Le panneau Calques actuel (`src/components/panels/LayersPanel.tsx`) est fonctionnel mais en-deçà de l'ergonomie attendue : pas de verrouillage, pas de recherche, pas de renommage, pas de drag inter-groupes, contrôles uniquement au survol. La référence visuelle cible est le panneau Calques d'Adobe Illustrator.

## Objectifs

- Offrir la parité ergonomique avec le panneau Calques d'Illustrator sur l'essentiel (affichage, manipulation hiérarchique, recherche, verrouillage).
- Respecter les conventions `CLAUDE.md` (composants ≤ 150 lignes, pas de logique métier dans l'UI, dark mode, français).
- Aucun changement de schéma de persistance Firestore.

## Non-objectifs

- Vignettes rendues dynamiquement à partir du canvas (option A écartée au profit de l'option B : icône + swatch de couleur).
- Concept de « calques-containers » à la Illustrator (distinct des groupes Fabric). Hors scope.
- Couleurs de calque personnalisables (indicateur de couleur par calque).
- Undo/redo sur rename et lock (à évaluer lors de l'implémentation selon l'état de `useHistory`).

## Décisions de conception

### Vignettes (option B)
Swatch de couleur 14×14 reflétant la source de remplissage + icône de type Lucide en overlay. Pas de rendu Fabric snapshotisé.

### Données
Aucun champ ajouté à `CanvasObjectProps`. Les champs `name`, `visible`, `locked` existent déjà et suffisent.

## Architecture

### Nouveaux / modifiés composants

```
src/components/panels/
  LayersPanel.tsx            (modif, ~80 lignes)  orchestration, DndContext, état recherche
  layers/
    LayerSearchBar.tsx       (nouveau, ~40)       input + debounce + icône filtre
    LayerTree.tsx            (nouveau, ~80)       rendu récursif avec profondeur
    LayerRow.tsx             (nouveau, ~120)      une ligne complète
    LayerRowControls.tsx     (nouveau, ~50)       œil / cadenas / cible / supprimer
    LayerNameInput.tsx       (nouveau, ~40)       édition inline (double-clic)
  TextSegmentRow.tsx         (inchangé)
```

### Nouveaux / modifiés hooks & utils

```
src/features/editor/
  useLayers.ts               +renameLayer, +lockLayer, +moveLayerToGroup, +toggleSelectionTarget
  useLayerFilter.ts          (nouveau, ~50)   filtrage recherche + préservation ancêtres
  getAutoName.ts             (nouveau, ~30)   mapping type → <Rectangle>, <Tracé>, etc.
```

## Anatomie d'une ligne

De gauche à droite, hauteur ~26 px :

```
│■│ 👁 🔒 › [▣Ⓣ] Nom du calque           ◯ 🗑
```

- **Barre de sélection** (2 px) : indigo `#6366f1` si sélectionné, transparent sinon.
- **Œil** : toujours visible, toggle `visible` via `useLayers.toggleVisibility`.
- **Cadenas** : visible si `locked === true`, sinon apparaît au survol.
- **Chevron** : présent uniquement si groupe ou styles-mixtes (conservé de l'existant).
- **Swatch + icône** :
  - Swatch 14×14 bordure `white/20`, rempli selon `fillType` :
    - `solid` → `fill`
    - `gradient` → 1er stop du gradient
    - `image` → pattern damier
    - `none` → blanc avec diagonale barrée rouge
    - `group` → dégradé indigo de marque
  - Icône type 10×10 Lucide en coin bas-droit avec ombre de lisibilité.
- **Nom** : simple span, double-clic → bascule en `LayerNameInput`.
- **Cercle cible** : `◉` filled indigo si sélectionné, `○` outline `white/30` sinon.
- **Supprimer** : uniquement au survol.

### États visuels

| État | Rendu |
|---|---|
| Sélectionné | `bg-indigo-500/20` + barre gauche indigo |
| Verrouillé | row opacité 60 %, nom italique, drag désactivé |
| Masqué (`visible=false`) | œil barré, nom opacité 40 % |
| En rename | input inline autofocus texte sélectionné |

## Résolution du nom d'affichage

`getDisplayName(obj, columns): string`

1. Si `obj.name` correspond à une clé de colonne merge → retourne le label de la colonne (comportement actuel préservé).
2. Si `obj.name` est non vide → retourne `obj.name`.
3. Sinon → `getAutoName(obj.type)` qui retourne `<Rectangle>`, `<Tracé>`, etc.

**Changement associé dans `useAddObject`** : retirer les noms par défaut posés à la création (`name: 'Rectangle'`, `name: 'Ellipse'`, etc. → `name: ''`). Les nouveaux objets s'affichent directement comme `<Rectangle>`, `<Ellipse>`… jusqu'au premier rename. Cela évite de devoir distinguer « nom par défaut » vs « nom utilisateur identique ».

### Table `getAutoName`

| Type | Auto-nom |
|---|---|
| rect | `<Rectangle>` |
| ellipse | `<Ellipse>` |
| path | `<Tracé>` |
| line | `<Ligne>` |
| text | `<Texte>` |
| image | `<Image>` |
| group | `<Groupe>` |
| polygon | `<Polygone>` |
| triangle | `<Triangle>` |
| star | `<Étoile>` |
| arrow | `<Flèche>` |
| hexagon | `<Hexagone>` |
| diamond | `<Losange>` |
| callout | `<Bulle>` |

Les auto-noms sont affichés en italique `white/50`.

## Comportements

### Renommage

- Double-clic sur le nom → `LayerNameInput` remplace le span, autofocus, texte pré-sélectionné.
- Commit (Enter ou blur) → `renameLayer(id, newName)` :
  - Écrit dans `obj.name` dans le store et dans `fabricObj.data.name` sur le Fabric object.
  - Si l'objet était précédemment lié à une clé merge (i.e. `obj.name` égal à une clé de colonne), le binding se fait par ailleurs via le mécanisme de merge existant — le rename ne casse pas ce lien tant que le nouveau nom reste la clé ; si le nom change, l'utilisateur accepte de délier (cohérent avec le comportement actuel où `name` sert de clé).
- Esc → annule.
- Nom vide après commit → `name` reste `''`, l'auto-nom `<Type>` reprend l'affichage.
- Noms dupliqués autorisés (comme Illustrator).

### Verrouillage

- Clic cadenas → `lockLayer(id, !locked)`.
- Sur Fabric : `selectable = !locked`, `evented = !locked`, `lockMovementX/Y = locked`, `lockScalingX/Y = locked`, `lockRotation = locked`.
- Row verrouillée reste cliquable dans le panneau pour inspection.
- Verrouiller un groupe grise visuellement ses enfants (rendu seulement — la cascade Fabric est gérée par le groupe lui-même).

### Cible de sélection (cercle à droite)

- Clic simple → sélection single (comme cliquer la row).
- Shift / Cmd-clic → toggle dans `selectedObjectIds` (multi-select).
- Rendu : `◉` filled indigo si sélectionné, `○` outline `white/30` sinon.

### Drag inter-groupes

- Top-level : conservation du comportement actuel (`arrayMove`).
- Drop d'un objet top-level sur le header d'un groupe → `moveLayerToGroup(childId, groupId)` insère l'objet dans `group.getObjects()`.
- Drop d'un enfant de groupe hors de son parent → `moveLayerToGroup(childId, null)` le remonte en top-level.
- Zone de drop d'un groupe : row header + 4 px au-dessus/en-dessous.
- `DragOverlay` dnd-kit pour preview pendant le drag.
- Drag désactivé pendant recherche active (query non vide).

### Recherche

- Input debounced 150 ms.
- Match insensible à la casse et aux accents (via `normalize('NFD')` + strip).
- Hook `useLayerFilter(objects, query)` :
  - Retourne l'arbre complet si query vide.
  - Sinon, retourne seulement les branches avec au moins un match. Les ancêtres d'un match restent visibles et sont force-expandés (sans altérer `expandedIds` utilisateur).
- Highlight du terme matché : wrapping `<mark>` bg `indigo/20`.

## API `useLayers` étendue

```ts
renameLayer(id: string, name: string): void
lockLayer(id: string, locked: boolean): void
moveLayerToGroup(childId: string, groupId: string | null): void
toggleSelectionTarget(id: string, additive: boolean): void
```

Les méthodes existantes (`selectLayer`, `deleteLayer`, `toggleVisibility`, `reorderLayers`) sont conservées.

## Edge cases

- **Édition texte en cours** : lock en mode édition IText → exit du mode édition d'abord, puis appliquer lock.
- **Drag no-op** : drop d'un objet sur le groupe qui le contient déjà → ignorer.
- **Groupe vide après extraction** : si `moveLayerToGroup` retire le dernier enfant d'un groupe → supprimer le groupe (comportement Illustrator).
- **`selectedObjectIds` cohérent** après suppression / déplacement : nettoyer les ids invalides.
- **Rename d'un objet lié merge** : le nom sert de clé de binding merge. Le rename casse le lien (cohérent avec le comportement actuel). À documenter dans l'UX si nécessaire.

## Performance

- Recherche debounced + `useMemo` sur `filteredObjects`.
- Swatch calculé à la volée — coût négligeable.
- Pas de rendu canvas snapshotisé (option B) → pas d'impact sur la boucle Fabric.

## Tests

Tests Vitest unitaires uniquement (pas d'E2E pour ce scope — pattern projet : UI validée en browser).

- `getAutoName.test.ts` : mapping exhaustif des 14 types.
- `useLayerFilter.test.ts` : matching accents, préservation des ancêtres, query vide = arbre complet.
- `useLayers.test.ts` :
  - `renameLayer` : écriture `name` store + Fabric, rename avec chaîne vide laisse `name = ''`.
  - `lockLayer` : application des flags Fabric (`selectable`, `lockMovementX/Y`, etc.), toggle off restaure.
  - `moveLayerToGroup` : entrée dans un groupe, sortie vers top-level, no-op auto-détecté, cleanup d'un groupe devenu vide.

Pas de tests pour les composants React (pattern projet).

## Risques & inconnues

- **Comportement dnd-kit sur nested SortableContext** : vérifier que `DragOverlay` fonctionne correctement avec plusieurs niveaux. Fallback possible : ne supporter que drop sur le header, pas entre enfants de groupe.
- **`useHistory`** : à vérifier si rename et lock doivent être historisés. Si oui, patcher via les patterns existants.
- **Syncing Fabric ↔ store lors de `moveLayerToGroup`** : vérifier que `syncToStore` reconstruit correctement la hiérarchie `children`.

## Livrables

1. Composants créés / modifiés ci-dessus.
2. Hooks / utils créés / modifiés ci-dessus.
3. Tests Vitest listés.
4. Validation browser manuelle : sélection, rename, lock, visibilité, drag top-level, drag inter-groupes, recherche.

## Hors scope (futur)

- Vraies vignettes rendues par Fabric (option A).
- Couleurs de calque Illustrator persistantes et personnalisables.
- Sélection lasso dans le panneau.
- Multi-sélection drag (déplacer N objets en une passe).
- Mode focus/isolation d'un groupe.
