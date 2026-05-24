# Décomposition Image/PDF → SVG : moteur sémantique hybride (Vision + Gemini 3.5)

**Date** : 2026-05-24
**Statut** : design approuvé, à implémenter
**Module concerné** : `src/features/svg/useImageToSvgDecompose.ts` (+ nouveau module), `src/features/svg/refinePrices.ts`, `src/features/ai/llmRouter.ts`

## Problème

Le pipeline de décomposition auto (« Décomposer » → texte éditable sur un calque `image-bg-locked`) a été calé heuristiquement sur **une seule créa** (Heineken Carrefour). Sur d'autres créas (jambon Carrefour), chaque heuristique casse différemment :
- prix `5,49` rendu « 5 £ 49 » (€ mal lu, non empilé) ;
- « LES 2 POUR » : le « 2 » manquant ;
- fragments parasites de la photo produit / packaging ;
- titre produit mal placé.

La cause racine : les heuristiques pixel (regroupement par couleur+proximité, clustering de prix, filtre zone-produit géométrique, typage implicite) ne généralisent pas. **Décision (utilisateur)** : repenser le moteur pour la généralité en déléguant la **sémantique** à Gemini 3.5, tout en gardant la **précision des positions** de Google Vision.

## Objectif

Extraire **uniquement le contenu produit éditable** — prix, titre, description, mécanique promotionnelle, mentions — et **jamais** le texte des logos/pictos/certifications ni du packaging photographié, sur une créa retail **arbitraire** (pas seulement Heineken).

## Architecture — Hybride

```
Rasterisation (PDF page 1 / image)  →  image + dimensions   [inchangé]
        │
        ▼
Google Vision DOCUMENT_TEXT_DETECTION  →  textes indexés + bbox PRÉCISES   [gardé]
        │
        ▼
Gemini 3.5 (design.semanticLayout)  ←  image + liste textes(index, bbox, position%)
        │   renvoie une STRUCTURE sémantique (voir schéma) ; logos/pictos/photo ABSENTS
        ▼
Build Fabric  ←  bbox = union des bbox Vision des memberIndices (précis)
                 type Gemini pilote le rendu (prix empilé / titre / description / accroche…)
```

### Étape 3 — `semanticLayout()` (nouveau)

Nouveau module `src/features/svg/semanticLayout.ts` exposant :

```ts
export interface LayoutBlock {
  type: 'price' | 'headline' | 'title' | 'description' | 'mention' | 'unitprice'
  text: string            // texte composé/nettoyé, multi-ligne avec \n si besoin
  memberIndices: number[]  // index dans la liste Vision → bbox précise par union
  priceValue?: string      // pour type=price : valeur réassemblée "5,49 €"
}
export async function semanticLayout(
  imageDataUri: string,
  texts: { i: number; text: string; xPct: number; yPct: number }[],
): Promise<LayoutBlock[]>
```

- Appel `generateJson` task **`design.semanticLayout`** (routing **gemini-3.5-pro**, temp 0), **multimodal** (image + texte).
- Prompt : « créa promo retail. Voici les textes OCR (index, position%). Regroupe-les en blocs éditables et type chacun. EXCLUS tout texte de logo/picto/certification/origine et tout texte sur le packaging photographié. Pour les prix, réassemble la valeur composée (gros chiffre + €/décimales) en `priceValue` "X,YY €". Retourne `{blocks:[…]}`. »
- Schéma Zod + JSON Schema (pour Gemini ET Claude fallback).

### Étape 4 — Build (réutilise l'existant, piloté par `type`)

Pour chaque block :
- **bbox** = union des `bbox` Vision des `memberIndices` (filtrer les index invalides ; bloc sans index valide → ignoré).
- **couleur/fond** : échantillonnage par bloc (`sampleBackground`, `sampleTextColor`) sur la bbox *(gardé)*.
- **masques** : zones de fond de **couleur uniforme** → `growBoxToColorExtent` + `isNearWhite` *(gardé, générique)*. Les blocs sont regroupés par fond couleur pour le masque comme aujourd'hui, mais sur la base des blocs Gemini.
- rendu selon `type` :
  - `price` → builder **prix empilé** existant (gros entier ancré centre + pile `€/décimales` ancrée bas), en parsant `priceValue` via `parsePriceParts`.
  - `headline` → builder headline (boost + ancrage centre + `%`/exposant via styles).
  - `title` / `description` / `mention` / `unitprice` → `buildTextbox` + `buildTextAndStyles` (multi-ligne, ordinaux exposant, tailles).
- Tag `data.role='image-decompose-text'` (overlays nettoyés par `undoDecompose`), `priceGroupId` pour les prix liés.

## Ce qui est SUPPRIMÉ / REMPLACÉ par Gemini
- `groupItemsByZone` (regroupement couleur+proximité) → blocs Gemini.
- `detectPriceClusters` + passe orpheline (clustering de prix pixel) → `priceValue` Gemini.
- Filtre `isInProductZone` (géométrique) et `isGreenBackground` → Gemini exclut packaging/photo/logos sémantiquement.
- `classifyLogoTexts` (passe logo séparée ajoutée en Phase 13) → fusionnée dans `semanticLayout` (l'exclusion logo est native à la structuration).
- `countLines` / `reconstructMultilineText` côté typage → le texte composé multi-ligne vient de Gemini (mais on garde le découpage par-mots pour les styles % / exposant).

## Ce qui est GARDÉ
- Google Vision (`googleVisionDecompose.ts`) — positions/texte.
- `sampleBackground` / `sampleTextColor` / `detectFontWeight` (échantillonnage pixel par bloc).
- `growBoxToColorExtent` / `isNearWhite` / `buildMaskRect` (masques bandeaux couleur).
- Builders : `buildTextbox`, `buildTextAndStyles` (styles %/ordinaux/exposant), prix empilé, headline, listeners de déplacement lié des prix.
- `undoDecompose`, lock du calque bg, `syncToStore`.

## Robustesse / erreurs
- Modèle **gemini-3.5-pro** (`design.semanticLayout` dans `llmRouter` : routing gemini→claude, temp 0).
- **Fallback total** : si `semanticLayout` échoue (timeout, JSON invalide, 0 bloc) → on **retombe sur le pipeline heuristique actuel** (conservé en fonction privée `decomposeHeuristic()`), pour ne jamais régresser sur les créas déjà calées.
- Bloc avec `memberIndices` tous invalides → ignoré (log warn).
- Coût : 1 appel Gemini 3.5 multimodal / décomposition (remplace l'appel logo + supprime les passes prix multiples).

## Critères de succès
- Sur le **jambon** (Produit2) : prix `5,49 €` et `8,90 €` corrects et empilés ; « LES 2 POUR » complet ; titre/description bien placés ; **aucun** texte de logo/picto/packaging.
- Sur le **Heineken** (Produit1) : non-régression (résultat ≥ qualité actuelle).
- Test : vérification live navigateur sur les deux créas (import → Décomposer).

## Hors périmètre (YAGNI)
- Multi-pages PDF (page 1 uniquement, inchangé).
- Détection/recréation des éléments graphiques (pictos en icônes) — on les laisse sur le raster de fond.
- Édition post-décompo (déjà gérée).
