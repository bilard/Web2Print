# Spec — Disposition libre de la fiche (Catalogue studio)

> Date : 2026-07-04
> Module : `src/features/catalog/`
> Objectif : permettre au **concepteur** de placer/redimensionner librement, en **drag & drop live** dans l'aperçu de « Style des fiches », **tous les objets** de la fiche produit — tout en restant **dynamique** (appliqué à toutes les fiches, rééchelonné selon format / nombre par page / vedettes).

## Contexte / état actuel (vérifié)

- La fiche est rendue par `ProductCell.tsx` en **flux** (flex/grid) — robuste : aucun débordement même sur des centaines de produits aux textes variables. C'est la raison du choix « cosmétique borné » (le moteur libre complet avait été écarté).
- Le style cosmétique vit dans `CatalogCardStyle` (`catalogTypes.ts`), appliqué par variables CSS (`cardStyleVars` dans `catalogCss.ts`) par‑dessus `CATALOG_CSS`. Les tailles de texte scalent déjà via `--cat-fit` (F, posé par `ProductGridPage`).
- Le panneau `CardStyleCard.tsx` édite ce style avec un **aperçu live** (`CardStylePreview.tsx`, rend le vrai `ProductCell` sur des données d'exemple).
- Persistance : `cardStyle` est dans `plan.cardStyle` (doc catalogue + modèles `catalogTemplatesApi` + pilotable au prompt IA via `sanitizeAICardStyle`).
- Référence drag/redimensionnement (module voisin) : `RetailPromoCard.tsx` + `PromoSelectionOverlay.tsx` (offsets/scales en **px** sur carte fixe). On s'en inspire mais on stocke en **%**.

## Décisions cadrées (brainstorming)

1. **Drag & drop live de TOUS les objets** de la fiche, dans l'aperçu, + poignées de **redimensionnement** (largeur au minimum ; ex. élargir le prix barré).
2. **Tout en pourcentage de la carte** (jamais en pixels) → s'applique à toutes les fiches et se rééchelonne fluide selon format / nombre par page / taille vedette. C'est l'exigence **fondamentale**.
3. **Toggle opt‑in `Disposition libre`** : OFF (défaut) = flux auto actuel (filet de sécurité, zéro débordement) ; ON = la disposition libre du concepteur s'applique partout. « Réinitialiser » restaure le flux.
4. **Bornage du risque** : en mode libre, débordements possibles sur textes longs → atténués par ellipsis/`line-clamp` déjà en place ; le toggle laisse toujours revenir au flux sûr.
5. Hors périmètre V1 : panneau de propriétés dédié dans l'aperçu (le style — couleurs/polices/échelles — reste réglé par les contrôles existants de « Style des fiches »). V1 = **placement + taille + sélection (contour)**.

## Architecture

### Modèle de données — `CatalogCardStyle` (catalogTypes.ts)

- `freeLayout: boolean` (défaut `false`).
- `layout: Partial<Record<CardObjectId, CardBox>>` où `CardBox = { x: number; y: number; w?: number; h?: number }` en **% de la carte** (0–100 ; `x/y` = coin haut‑gauche ; `w/h` optionnels). Utilisé uniquement si `freeLayout`.
- `CardObjectId` (union fermée, les objets déplaçables) :
  `promo` (cartouche), `image`, `sticker` (‑X%), `kicker` (sous‑famille), `vedette` (ruban), `brand`, `name`, `description`, `ref`, `unit`, `price` (bloc prix barré+prix), `details`.
- `DEFAULT_CARD_STYLE` : `freeLayout: false`, `layout: {}`.

### Rendu — `ProductCell.tsx` + `catalogCss.ts`

- `freeLayout` **off** → rendu flux ACTUEL, inchangé (chemin par défaut, zéro régression).
- `freeLayout` **on** → la carte devient `position: relative` (classe `cat-free`) ; chaque objet rendu en `position: absolute` avec `left:x% ; top:y% ; width:w%` (si défini), **en conservant ses classes/styles existants** (couleurs, polices, échelles, `--cat-fit`). Seul le positionnement change.
- Les objets sans box définie dans `layout` prennent une **position de repli** (valeurs `%` par défaut reproduisant approximativement le flux) → une fiche passée en libre n'est jamais vide/cassée avant que le concepteur ne touche à rien.
- Débordement : `line-clamp`/ellipsis conservés sur nom/description/etc.
- CSS : nouvelles règles sous `.cat-free .cat-cell-*` (position absolute + box) ; les tailles de police gardent `* var(--cat-fit,1)`.

### Éditeur — drag & drop dans l'aperçu

- Nouveau composant `CardLayoutOverlay.tsx` (features/catalog) : couche interactive au‑dessus de la carte d'aperçu (mesurée en espace‑carte).
  - **Drag** d'un objet → met à jour `layout[id].x/y` en % (delta pointeur ÷ taille px de la carte, comme `PromoSelectionOverlay` mais en %).
  - **Poignées de redimensionnement** (au moins largeur ; coins pour w+h sur image/price/description) → `layout[id].w/h` en %.
  - **Sélection** au clic → contour indigo ; pas de panneau de propriétés dédié en V1.
  - `data-object-id` sur chaque objet rendu par `ProductCell` (mode libre) pour que l'overlay les cible.
- Intégration : `CardStylePreview` monte l'overlay quand `freeLayout` est actif ; un **toggle « Disposition libre »** ajouté dans `CardStyleCard` (près de « Réinitialiser »), + bouton « Réinitialiser les positions » (`layout: {}`).
- Setters store/plan : `setPlan` sur `plan.cardStyle` (déjà le pattern de `CardStyleCard.patch`). Helper `setObjectBox(id, box)` local au panneau.

### Persistance / IA

- `cardStyle` déjà persisté (doc + modèles). `freeLayout`/`layout` suivent automatiquement (fusion `DEFAULT_CARD_STYLE` dans `cardStyleVars`/`CardStyleCard`).
- `sanitizeAICardStyle` : accepte `freeLayout` (bool) + `layout` (bornage 0–100, ids connus). Le prompt IA peut proposer une disposition (optionnel, non requis).

## Flux de données

```
concepteur drag/resize dans l'aperçu
  → CardLayoutOverlay met à jour cardStyle.layout[id] (%)
    → plan.cardStyle (persisté : doc + modèles + IA)
      → ProductCell (freeLayout ? absolute % : flux)  ← toutes les fiches
        → rééchelonné par la taille de cellule (packing) + --cat-fit
```

## Tests (Vitest, moteurs purs)

- `catalogCss.test.ts` : `cardStyleVars`/mode libre — le rendu CSS d'un objet positionné produit `left/top/width` en % attendus ; `freeLayout:false` ne change rien (parité flux).
- Sanitize IA : `sanitizeAICardStyle` clampe `layout` (valeurs hors 0–100 rejetées, ids inconnus ignorés, `freeLayout` bool).
- Repli : un `layout` vide + `freeLayout:true` → chaque objet reçoit sa position de repli (pas de NaN/undefined).

## Hors périmètre (YAGNI / suites)

- **F3 (suite demandée)** : solliciter l'IA / HyperFrames pour **proposer plusieurs graphismes de fiche** (variantes de disposition prêtes à l'emploi) — spec dédiée ultérieure.
- Panneau de propriétés complet dans l'aperçu (typo/couleur par sélection) — le style reste réglé par les contrôles existants.
- Rotation des objets ; calques/ordre z interactif (l'ordre DOM suffit en V1) ; snapping/guides.
- Disposition **par taille de carte** (1×1 / 2×1 / 2×2 distinctes) — une seule disposition % pour toutes en V1.

## Livraison (phasée, commit + deploy)

1. **Modèle + rendu** : `CardObjectId`/`CardBox`, `freeLayout`/`layout` dans `CatalogCardStyle`+défauts ; `ProductCell` chemin libre (absolute %) + CSS `.cat-free` + positions de repli ; `data-object-id`. Tests rendu. (Aucune UI encore → toggle caché ou défaut off.)
2. **Éditeur** : `CardLayoutOverlay` (drag + resize + sélection) ; toggle « Disposition libre » + « Réinitialiser les positions » dans `CardStyleCard`/`CardStylePreview`. → commit + build + `firebase deploy --only hosting` + smoke live.
3. **IA/persistance** : `sanitizeAICardStyle` étendu (bornage layout) ; vérifier portage par les modèles. → commit + deploy + smoke.

Chaque étape : `npx tsc -b` + `npm run test:run` + `npm run lint` + `npx knip` verts avant commit.
