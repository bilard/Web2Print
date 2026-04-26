# Pivot 2+3 — Nano Banana 2 sans texte + template overlays

**Date** : 2026-04-26 (après-midi, post E2E)
**Auteur** : ibs.studio + Claude
**Statut** : Spec validée, remplace `2026-04-26-nano-banana-as-primary-render-design.md` (β1 retail)

## Contexte

L'architecture β1 retail (NB2 background + masks + Textbox overlays positionnés via Claude Vision) ne fonctionne pas en pratique. Validation E2E sur Brico Dépôt révèle :

- Les bboxes retournées par Claude Vision ne sont PAS pixel-perfectly alignées avec le rendu réel de NB2
- Les fontSize calculées (`fontSizePct * canvasHeight`) sont décalées par rapport aux fontSize natives du PNG NB2 (déformation due aux ratios canvas vs image source différents)
- Conséquence visible : doublons de textes, overlays plus grands que les pills NB2 sous-jacentes, mask 4px insuffisant pour couvrir l'antialiasing

Le pipeline β1 supposait une précision Claude-Vision-vers-rendu qu'aucun modèle ne peut garantir. Architecture intrinsèquement fragile.

## Objectif

Inverser l'approche une seconde fois : ne plus essayer d'aligner pixel-perfectly des overlays sur du texte NB2. À la place :

- **Demander à NB2 de générer un fond visuel SANS texte** (prompt anti-typo agressif)
- **Poser le PNG NB2 plein canvas, lockée** comme fond visuel
- **Poser tous les textes/données en overlay éditable depuis `scrapedProductData`** selon un layout template fixe (positions hardcodées éprouvées)

Combine l'avantage créatif de NB2 (photo, ambiance, gradients) avec la fiabilité d'un layout template depuis Jina (zéro hallucination, données exactes, positions stables).

## Architecture cible

```
URL site → Jina scrape → scrapedProductData
       │
       ▼
NB2 prompt anti-texte → PNG fond visuel pur (photo + ambiance + gradients, ZÉRO texte)
       │
       ▼
Canvas :
  [bottom] page bg / grid
           NB2 PNG locked (full canvas, isNanoBananaBg: true)
           decorativeShapes critiques uniquement (pill noire prix, pills CTA/badge)
           Textbox + FabricImage overlays template depuis scrapedProductData
  [top]    print marks
```

**Aucune phase Claude Vision sur le NB2** — pas de bbox extraction, pas de fontSize calculée, pas de mask, pas de sample pixel.

## Pipeline

```
si NB2 OK :
   poseNB2(canvas, dataUri)                      // plein canvas, locked
   layoutDataOverlays(canvas, scrapedProductData) // pills + textes + images en positions template
sinon (NB2 KO) :
   si scrapedProductData :
      composeDesignFromScrapedData → ancien pipeline creative (avec fond crème de fallback)
   sinon :
      → erreur fatale
```

## Layout des overlays

Réutilise les positions de `composeDesignFromScrapedData.ts` (déjà testées sur compose-direct), avec deux changements :

1. **Pas de `background`** → c'est le PNG NB2 qui sert de fond
2. **decorativeShapes filtrées** : on garde uniquement les **pills critiques** pour la lisibilité :
   - Pill noire `price_block` (sous le prix actuel)
   - Pill verte `cta_bg` (sous le CTA "J'EN PROFITE")
   - Pill verte `badge_bg` (sous "OFFRE EXCLUSIVE")
   On supprime les checkmarks ronds verts (`feature_dot_*`) — remplacés par préfixe `✓ ` unicode dans le texte feature, ou supprimés si trop intrusifs sur le NB2

3. **textes et imageSlots** : inchangés (titre, features, rating, prices, CTA, logo, photo produit)

## NB2 prompt anti-texte

Le prompt envoyé à NB2 doit insister fortement sur l'absence de texte. Approche :

```
GENERATE A CLEAN PHOTOGRAPHIC BACKGROUND for a retail flyer.

PRODUCT: {scraped.title}
CONTEXT: {prompt utilisateur}
STYLE: lifestyle product photography, ambient lighting, professional retouching

ABSOLUTE REQUIREMENTS — STRICTLY ENFORCED:
- ZERO TEXT in the image. No typography, no letters, no numbers, no symbols.
- NO PRICE TAGS, NO BADGES, NO LABELS, NO STICKERS, NO LOGOS.
- The image must be 100% TEXT-FREE so typography can be added in a later editing step.
- Composition: leave generous negative space on the [left/right/top/bottom] for text overlays to be added later.

Render: clean ambient background, the product nicely placed but without ANY accompanying text or branding overlays.
```

NB2 résiste parfois à ces consignes. On accepte le risque : du texte parasite NB2 dans des zones non-overlayées est visuellement acceptable (mieux que zéro fond visuel).

## Code mort à supprimer

Le code de l'architecture β1 devient inutile :
- `src/features/ai-design/sampleColor.ts` + tests
- `src/features/ai-design/analyzeDesignForEdit.ts` (entier — pas de Claude Vision sur NB2)
- Helpers dans `renderNanoBananaCanvas.ts` : `pickMaskColor`, `buildMaskRect`, `buildEditableTextbox`, `resolveImageForSlot`, `renderNanoBananaWithOverlays`
- Type `Bbox` exporté depuis `analyzeDesignForEdit.ts` (devient inutilisé)
- `overrideTextsWithScrapedData` dans `useGenerateDesign.ts` (pas de textes NB2 à overrider)
- `DesignAnalysis.mode`, `TextElement.role`, `*.backgroundColor`, `*.backgroundIsUniform` — tout le schéma étendu

À supprimer ou neutraliser dans le commit final.

## Code à conserver

- `composeDesignFromScrapedData` : devient le générateur du layout template (avec changements ci-dessus)
- Les fonctions vectorielles dans `renderNanoBananaCanvas.ts` (`renderBackground`, `renderDecorativeShapes`, `addEditableTextOverlays`, `addEditableImageSlots`) : conservées pour le fallback NB2 KO
- `scrapeProductForDesign.ts`, `brandLogos.ts` : inchangés
- `generateNanoBananaRef.ts` : prompt modifié

## Nouveaux fichiers / fonctions

- `renderNanoBananaTemplate(canvas, dataUri, scrapedData, canvasW, canvasH)` dans `renderNanoBananaCanvas.ts` :
  1. Pose le PNG NB2 plein canvas, locked
  2. Construit la `DesignAnalysis` depuis `composeDesignFromScrapedData(scrapedData)` SANS `background`
  3. Filtre `decorativeShapes` pour ne garder que les pills critiques (`price_block`, `cta_bg`, `badge_bg`)
  4. Appelle `renderDecorativeShapes` + `addEditableTextOverlays` + `addEditableImageSlots`

## Compatibilité

- Pas de migration de données (DesignAnalysis n'est pas persistée)
- Designs déjà sauvegardés intacts

## Stratégie de validation

1. E2E sur URL Brico Dépôt (la même que le test pivot précédent)
2. Vérifier : NB2 généré sans texte (ou avec peu de texte parasite) ; overlays template propres ; **ZÉRO superposition** ; tout éditable
3. E2E fallback (NB2 KO forcé) — vérifier compose-direct full creative s'active

## Hors scope

- Layout dynamique adapté à l'image NB2 (par exemple, déplacer les overlays selon le crop de la photo NB2). Pour V1, layout fixe template.
- Multi-format (poster, carré, paysage) — V1 supporte les formats actuels (A5 portrait par défaut)
- Auto-tuning du prompt anti-texte selon les ratés observés — V1 utilise un prompt unique
