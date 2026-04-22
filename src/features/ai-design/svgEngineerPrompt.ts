/**
 * Prompt pour le SVG Engineer (Claude multimodal).
 * Reçoit :
 *  - Une image PNG du design créatif (généré par Nano Banana)
 *  - Un plan structuré (DesignPlan de l'Art Director)
 *
 * Doit produire :
 *  - Un SVG qui injecte l'image Nano Banana comme background
 *  - Zones texte/slots positionnés exactement selon le plan
 *  - Tous les textes doivent être éditables (pas de rasterization)
 */

import type { DesignPlan } from './artDirectorSchema'
import type { BuildDesignPromptArgs } from './designPrompt'

export interface BuildSvgEngineerPromptArgs {
  /** Plan structuré produit par l'Art Director */
  plan: DesignPlan

  /** Format et dimensions */
  widthMm: number
  heightMm: number
  formatLabel: string

  /** Bleed si applicable */
  includeBleed: boolean
  bleedMm: number

  /** Fonts disponibles */
  availableFonts: string[]

  /** Assets du fournisseur (logos, pictos) */
  productAssets?: Array<{ type: string; title?: string }>
}

export function buildSvgEngineerPrompt(args: BuildSvgEngineerPromptArgs): string {
  const bleedLine = args.includeBleed
    ? `- **Bleed** : ${args.bleedMm} mm. Les zones "background" doivent déborder en coordonnées négatives (viewBox incluant le bleed).`
    : `- **Pas de bleed** : toutes les coordonnées dans [0, ${args.widthMm}] × [0, ${args.heightMm}].`

  const zoneDescriptions = args.plan.zones
    .map(
      (z) =>
        `- **${z.id}** (${z.role}): bbox x=${z.bboxMm.x}, y=${z.bboxMm.y}, w=${z.bboxMm.w}, h=${z.bboxMm.h}mm. Fill: ${z.fill || 'transparent'}. ${z.content ? `Content: "${z.content}"` : ''}`,
    )
    .join('\n')

  const slotDescriptions = args.plan.slots
    .map(
      (s) =>
        `- **${s.id}** (${s.role}): bbox x=${s.bboxMm.x}, y=${s.bboxMm.y}, w=${s.bboxMm.w}, h=${s.bboxMm.h}mm. Description: ${s.description}`,
    )
    .join('\n')

  return `Tu es un **SVG Layout Engineer** — analyse l'image Nano Banana fournie et crée un SVG qui reproduit fidèlement sa composition.

## Input
1. Une IMAGE Nano Banana (le design créatif complet — c'est ta SOURCE DE VÉRITÉ visuelle)
2. Un PLAN avec zones définissant les positions des éléments éditables
3. Comparaison visuelle: l'image vs le plan

## Output
Un SVG ENTIÈREMENT ÉDITABLE qui :
- **Layer 1 (bottom)** : Image Nano Banana comme background (href="placeholder:nanobanana")
- **Layer 2 (middle)** : Blocs structurels du plan (rectangles de fond, zones de couleur)
- **Layer 3 (top)** : Zones texte éditables avec TEXTE VISIBLE (opacity=1, pas 0.01)
- **Layer 4 (top)** : Slots d'images (placeholder rectangles, href="placeholder:<id>")

✓ Tous les éléments doivent être VISIBLES et ÉDITABLES (sélectionnables dans Fabric.js)
⚠️ **L'image Nano Banana est une RÉFÉRENCE VISUELLE, pas le produit final** — elle guide la composition mais le SVG doit contenir la structure vectorielle complète.
⚠️ **SUCCÈS = utilisateur voit image + texte + blocs structurels superposés, tous éditables**.

## Analyse visuelle CRITIQUE

AVANT de créer le SVG, tu DOIS :

1. **Analyser l'image Nano Banana fournie**
   - Identifier où se trouvent RÉELLEMENT les zones texte
   - Observer la composition: haut/bas/gauche/droite, centrées, alignées à quoi?
   - Noter les proportions: quel pourcentage de l'image chaque zone occupe?
   - Mesurer l'espacement entre les éléments visuellement

2. **Valider le plan contre l'image**
   - Le plan dit zone "title" à x=10, y=20. Est-ce que ça correspond à ce que tu vois dans l'image?
   - Si écart > 5mm, SIGNALER l'incohérence
   - Corriger les positions du plan si l'image montre clairement une position différente
   - PRIORITÉ ABSOLUE: L'IMAGE EST LA VÉRITÉ. Le plan est un guide, l'image est la référence.

3. **Checklist avant émission du SVG**
   - ✓ L'image Nano Banana est injectée comme background?
   - ✓ CHAQUE zone texte du plan a des coordonnées x, y EXACTES validées visuellement?
   - ✓ Les zones correspondent à ce que je vois dans l'image (pas de décalage apparent)?
   - ✓ Les proportions (largeur/hauteur des zones) sont fidèles à l'image?
   - ✓ Aucun texte ne sort de sa zone de bbox?
   - ✓ Pas de width/height en pixels. UNIQUEMENT viewBox en mm?

## Concept clé

Tu ne vectorises PAS l'image (impossible). Tu UTILISES l'image comme asset + tu crées une couche structurelle par-dessus basée sur ce que TU OBSERVES dans l'image :

- **Layer 1 (bottom)** : Nano Banana image (full width/height) → href="placeholder:nanobanana"
- **Layer 2 (top)** : Zones texte éditables + slots d'images (avec bboxes validées visuellement)

## Processus strict

1. **Analyse visuelle de l'image**
   - Observer attentivement la composition
   - Identifier chaque zone de texte, son position approximative, sa taille
   - Noter les marges, espacements, alignements

2. **Layer 1 : Image background**
   - Crée un élément <image x="0" y="0" width="${args.widthMm}" height="${args.heightMm}" href="placeholder:nanobanana" />
   - Cet élément occupe toute la canvas

3. **Layer 2 : Blocs structurels du plan (rectangles de fond)**
   Pour CHAQUE zone du plan avec un role="background" ou role="accent" :
   - Créer un <rect x, y, width, height> avec les dimensions EXACTES du plan
   - Remplir avec la couleur fill du plan (hex #RRGGBB)
   - **opacity=1 (DOIT ÊTRE VISIBLE)**
   - Le texte se superposera par-dessus ces blocs

   EXEMPLE : Si plan dit "zone title-block à x=5, y=8, w=155, h=48, fill=#1A2B3C"
   → <rect x="5" y="8" width="155" height="48" fill="#1A2B3C" opacity="1" />

4. **Layer 3 : Zones texte éditables (BASÉES SUR L'IMAGE)**
   Pour CHAQUE zone du plan avec du contenu texte :
   - Vérifier visuellement sa position dans l'image
   - Si le plan dit x=10 mais l'image montre x=20, utiliser x=20
   - Créer un élément <text> aux positions VALIDÉES visuellement
   - Position ABSOLUE : zone.bboxMm.x, .y (ajustées si nécessaire)
   - Dimensions ABSOLUTES : zone.bboxMm.w, .h
   - **opacity=1 (TEXTE DOIT ÊTRE VISIBLE ET ÉDITABLE)**
   - Utiliser les styles du plan (couleurs, police, poids)
   - Texte peut avoir des <tspan> pour multi-lignes

5. **Layer 4 : Slots d'images (image-slot, hero-visual)**
   Pour CHAQUE zone du plan avec role contenant "image" :
   - Créer <image href="placeholder:<zone.id>" /> avec dimensions du plan
   - Position et dimensions exactes du plan

## Directives critiques

- **L'IMAGE EST UNE RÉFÉRENCE, PAS LE PRODUIT FINAL** : L'image Nano Banana guide la composition visuelle, MAIS le SVG doit générer la structure complète (blocs + texte + slots). L'utilisateur verra l'image + la structure superposée dans le canvas Fabric.
- **STRUCTURE VECTORIELLE COMPLÈTE** : Générer TOUS les blocs du plan (rectangles de fond), pas seulement du texte invisible. Pas d'opacity=0.01 - tout doit être visible et éditable.
- **FIDÉLITÉ VISUELLE** : Si l'image montre une composition différente du plan (décalage position/taille), utiliser ce que tu vois dans l'IMAGE. L'image prime sur le plan.
- **Position EXACTE** : Mesurer visuellement où se trouvent les zones dans l'image, puis les reproduire dans le SVG.
- **Zones par-dessus l'image** : textes et blocs structurels se superposent à l'image (Layer order: image bottom, blocs middle, texte top).
- **ÉDITABLE PARTOUT** : <text> avec <tspan>, jamais rasterisé. Blocs = <rect> avec couleurs solides. Slots = <image href="placeholder:<id>" />. Tous opacity=1.
- **Couleurs** : utilise palette du plan (hex #RRGGBB).
- **Fonts** : uniquement les fonts disponibles.

## Format : ${args.formatLabel} (${args.widthMm} × ${args.heightMm} mm)
${bleedLine}

## Plan structuré

**Concept** : ${args.plan.concept}

**Device compositional** : ${args.plan.mainDevice}

**Palette de couleurs (EXCLUSIVEMENT)** :
${args.plan.palette.map((c) => `- ${c}`).join('\n')}

**Typography**
- Hero font : ${args.plan.typography.heroFont}
- Body font : ${args.plan.typography.bodyFont}
- Hierarchy : ${args.plan.typography.hierarchy.map((h) => `${h.role} (${h.size}pt, weight ${h.weight}, ${h.color})`).join(' | ')}

**Zones du design** :
${zoneDescriptions}

**Image slots** :
${slotDescriptions}

${args.productAssets && args.productAssets.length > 0 ? `**Assets du fournisseur disponibles** :
${args.productAssets.map((a) => `- ${a.type}: ${a.title || '(sans titre)'}`).join('\n')}

⚠️ Ces assets seront fournis comme images dans le message multimodal. Intègre-les dans le SVG si pertinent (logo en coin, pictos techniques, etc.).
` : ''}

## Contraintes techniques

- **SVG root** : <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${args.widthMm} ${args.heightMm}"> (unités en mm, SANS width/height en pixels)
  - ⚠️ N'ajoute JAMAIS d'attributs width/height en pixels. Garde UNIQUEMENT le viewBox en mm.
- **Image background first** :
  <image x="0" y="0" width="${args.widthMm}" height="${args.heightMm}"
         href="placeholder:nanobanana" preserveAspectRatio="xMidYMid slice" />
- **Fonts autorisées** (tu ne peux RÉFÉRENCER que celles-ci) :
${args.availableFonts.map((f) => `  • ${f}`).join('\n')}
- **Couleurs** : hex #RRGGBB uniquement (pas de named colors comme "red")

## Avant d'émettre ton SVG : DOUBLE CHECKLIST

✓ L'image Nano Banana est bien injectée comme <image href="placeholder:nanobanana" /> ?
✓ Chaque zone texte a ses coordonnées validées VISUELLEMENT dans l'image fournie?
✓ Aucun écart apparent entre l'image et les positions SVG?
✓ Tous les slots image ont leurs positions du plan?
✓ Zéro texte qui dépasse sa zone (bounding box < zone bbox)?
✓ Pas de width/height en pixels. UNIQUEMENT viewBox en mm?
✓ L'image Nano Banana EST LE GUIDE VISUEL, pas le plan secondaire?

## Output format

Produis le SVG avec ce JSON :

{
  "svg": "...",
  "rationale": "Analyse visuelle: [brève description de ce que tu observes dans l'image]. Positionnement: [zones et corrections appliquées]. Fidélité: [comment le SVG respecte l'image] (2-3 phrases)"
}

**Rappel final** : Image = asset principal + SOURCE DE VÉRITÉ visuelle. Zones = calque structurel par-dessus, positionné selon l'IMAGE, pas seulement le plan.`
}
