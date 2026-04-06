# Spec — Gestion des masques d'image (style InDesign)

**Date** : 2026-04-06
**Statut** : approuvé, prêt pour planification

## Objectif

Reproduire dans DesignStudio le comportement frame/content d'InDesign pour les images : un cadre (masque) et un contenu (image bitmap) manipulables indépendamment, avec modificateurs clavier pour basculer entre redimensionnement du cadre, du contenu, ou des deux (proportionnel ou libre).

## Architecture

### Modèle de données

- **Représentation** : `fabric.Image` natif + propriété `clipPath: fabric.Rect` (en coordonnées objet, relatives au centre de l'image, conformément à Fabric v6).
- **Pas de wrapper, pas de Group.** L'image masquée reste un `fabric.Image` standard, sélectionnable, déplaçable.
- **Migration** : à l'ouverture d'un projet (`useLoadCanvas`), toute image sans `clipPath` reçoit automatiquement un `Rect` couvrant ses bounds natives. Aucun cas spécial dans le reste du code : toute image a toujours un clipPath.
- **Création** : `useAddObject.ts` ajoute un clipPath par défaut lors de l'insertion d'une nouvelle image.

### Persistance

- **Firestore/JSON** : `clipPath` est ajouté à la liste de propriétés sérialisées dans `useAutoSave` via `toJSON([..., 'clipPath'])`. Fabric gère nativement le round-trip.
- **Sérialisation cross-hooks** : aucune duplication dans `object.data` — la source de vérité est le clipPath natif.

### Nouveau hook

`src/features/editor/useImageMask.ts` — encapsule toute la logique :
- Interception de `object:scaling` pour appliquer le bon comportement selon les modificateurs.
- Gestion du mode édition (frame vs content).
- Fonctions utilitaires : `fitFrameToContent(img)`, `fillFrameProportionally(img)`, `enterContentMode(img)`, `exitContentMode(img)`.
- Binding double-clic pour entrer en mode contenu.
- Binding `Échap` / clic extérieur pour sortir.

Ce hook est consommé par `CanvasContainer.tsx`.

## Comportements de scaling

Lors d'un drag sur une **poignée de coin** d'une image masquée :

| Modificateur | Cadre (clipPath) | Image (bitmap) | Ratio |
|---|---|---|---|
| Aucun | resize | inchangée | libre (révèle/cache) |
| Shift | resize | resize | proportionnel |
| Cmd (⌘) | resize | resize | libre (déforme) |
| Cmd + Shift | resize | resize | proportionnel (agrandir sans déformer) |

### Implémentation

- Listener `object:scaling` sur le canvas Fabric.
- Lecture de `e.e.shiftKey` et `e.e.metaKey` (ou `ctrlKey` sur Windows/Linux — abstraction `isMetaKey()`).
- Selon le modificateur :
  - **Aucun** : on neutralise le scale appliqué par Fabric à l'image (`scaleX = scaleY = previousScale`) et on agrandit le `clipPath.width/height` de la différence en pixels objet.
  - **Shift / Cmd+Shift** : on laisse Fabric scaler proportionnellement, on synchronise le clipPath au même ratio.
  - **Cmd seul** : on laisse Fabric scaler librement, on synchronise le clipPath aux nouvelles dimensions.
- Les poignées latérales (E/W/N/S) suivent les mêmes règles, mais sur un seul axe.

## Modes d'édition

### Mode cadre (par défaut)

- Sélection normale : poignées Fabric standards autour du cadre.
- Bordure de sélection : `#6366f1` (accent DesignStudio).
- Drag = déplace l'image entière (cadre + contenu).

### Mode contenu

- **Entrée** : double-clic sur l'image **OU** toggle dans `PropertiesPanel`.
- **Sortie** : `Échap`, clic extérieur, ou re-toggle.
- En mode contenu :
  - Drag = repositionne l'image **dans** son cadre (modifie l'offset image vs clipPath).
  - L'image débordant le cadre est rendue **pleine opacité** hors du cadre (override `_render` ou suppression temporaire du clipPath durant le rendu de l'objet sélectionné).
  - Le cadre est redessiné en `#6366f1` par-dessus pour rester visible.
- Pas de content grabber central pour la v1 (YAGNI).

## `PropertiesPanel` — section "Masque"

Apparaît uniquement quand une `fabric.Image` est sélectionnée.

Contenu :
- **Toggle** "Éditer cadre / Éditer contenu" (radio ou switch).
- Bouton **Ajuster le cadre au contenu** (`fitFrameToContent`) — réduit le clipPath aux bounds de l'image.
- Bouton **Remplir le cadre proportionnellement** (`fillFrameProportionally`) — agrandit l'image pour couvrir le clipPath en gardant son ratio.
- Champs numériques **X / Y / W / H** du clipPath (édition directe des dimensions du cadre).
- Bouton icône **`?`** (Lucide `HelpCircle`) ouvrant un `Popover` shadcn/ui avec le tableau des modificateurs clavier.

### Notice d'aide raccourcis

- **Popover** déclenché par le bouton `?` :
  - Tableau 4 lignes (Aucun / Shift / Cmd / Cmd+Shift) × 3 colonnes (Cadre / Image / Ratio).
  - Style dark : fond `#1a1a1a`, headers en `#6366f1`, texte clair.
- **Tooltip pédagogique** : au premier scaling d'une image masquée dans la session utilisateur, `Sonner` affiche un toast :
  > "Astuce : Shift pour agrandir sans déformer, Cmd pour déformer, sans modificateur pour ajuster le cadre seul."
  Flag stocké dans `localStorage` (`ds.tip.maskShortcuts.seen`) pour ne s'afficher qu'une fois par utilisateur.

## Export

### IDML (`src/features/idml/idmlExporter.ts`)

- IDML est déjà structuré en `<Rectangle>` parent contenant `<Image>` enfant. Le mapping est natif :
  - `clipPath` bounds → `PathGeometry` du `<Rectangle>` parent.
  - Image bounds (sans clipPath) → `PathGeometry` de l'`<Image>` enfant.
  - L'offset image vs cadre → transformation `ItemTransform` de l'image enfant.

### PDF / PPTX

- Rasterisation via `fabric.Image.toDataURL({ ...clipBounds })` — l'image exportée est déjà découpée à la taille du cadre.
- Position dans le document = position du cadre.

## Fichiers touchés

### Nouveau
- `src/features/editor/useImageMask.ts`

### Modifiés
- `src/features/editor/useLoadCanvas.ts` — migration : ajout d'un clipPath par défaut aux images sans masque.
- `src/features/editor/useAutoSave.ts` — ajout de `'clipPath'` à la liste de props sérialisées.
- `src/features/editor/useAddObject.ts` — création d'un clipPath par défaut pour toute nouvelle image.
- `src/features/editor/CanvasContainer.tsx` — binding de `useImageMask`, gestion double-clic / Échap.
- `src/components/panels/PropertiesPanel.tsx` — section "Masque" + popover d'aide.
- `src/features/idml/idmlExporter.ts` — mapping clipPath → PathGeometry du Rectangle parent.

## Hors scope v1 (YAGNI)

- Content grabber central (cercle au centre de l'image en mode édition).
- Masques non-rectangulaires (ellipse, polygone, path arbitraire).
- Commandes additionnelles : "Center content", "Fit content to frame".
- Raccourcis clavier dédiés (`⌘⌥C`, `⌘⌥E`, etc.).
- Édition multi-sélection des masques.

## Critères de succès

1. Une image importée a un clipPath et peut être réduite en cadre sans perdre de pixels.
2. Les 4 combinaisons de modificateurs produisent les comportements documentés.
3. Double-clic entre en mode contenu, drag repositionne l'image dans son cadre.
4. Sauvegarde Firestore + rechargement préservent intégralement le clipPath et la position image.
5. Export IDML round-trip avec InDesign : le cadre et le contenu sont fidèles.
6. La notice d'aide est accessible en un clic depuis le panel.
