/**
 * Prompt pour le SVG Engineer (Claude multimodal).
 * Reçoit :
 *  - Une image PNG du design créatif (généré par Nano Banana) — RÉFÉRENCE visuelle uniquement
 *  - Un plan structuré (DesignPlan de l'Art Director)
 *
 * Doit produire :
 *  - Un SVG 100 % VECTORIEL qui reproduit la composition observée dans l'image
 *  - Rectangles, polygones, texte — tous éditables
 *  - AUCUN <image> pointant vers placeholder:nanobanana (on ne réinjecte pas le bitmap)
 */

import type { DesignPlan } from './artDirectorSchema'

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
    ? `- **Bleed** : ${args.bleedMm} mm. Les rectangles de fond débordent en coordonnées négatives.`
    : `- **Pas de bleed** : coordonnées dans [0, ${args.widthMm}] × [0, ${args.heightMm}].`

  const zoneDescriptions = args.plan.zones
    .map(
      (z) =>
        `- **${z.id}** (${z.role}): x=${z.bboxMm.x}, y=${z.bboxMm.y}, w=${z.bboxMm.w}, h=${z.bboxMm.h}mm. Fill: ${z.fill || 'transparent'}. ${z.content ? `Contenu: "${z.content}"` : ''}`,
    )
    .join('\n')

  const slotDescriptions = args.plan.slots
    .map(
      (s) =>
        `- **${s.id}** (${s.role}): x=${s.bboxMm.x}, y=${s.bboxMm.y}, w=${s.bboxMm.w}, h=${s.bboxMm.h}mm. ${s.description}`,
    )
    .join('\n')

  return `Tu es un **SVG Vectorization Engineer**. Tu reçois une image créative (Nano Banana) + un plan structuré. Tu produis un **SVG 100 % vectoriel** qui reproduit la composition observée.

## Rôle de l'image

L'image Nano Banana est ta **RÉFÉRENCE VISUELLE** — tu l'analyses pour comprendre la composition, les couleurs, les proportions, l'agencement. Tu ne l'intègres **JAMAIS** dans le SVG final. Le SVG produit doit être autonome : rectangles, polygones, texte. Pas de balise \`<image>\` pointant vers \`placeholder:nanobanana\`.

## Objectif

Reproduire fidèlement la composition de l'image en pur vectoriel pour obtenir un SVG **éditable** (texte modifiable, couleurs changeables, blocs déplaçables).

## Couches du SVG (toutes visibles, opacity=1)

1. **Background** : 1 à 3 rectangles pleins qui reproduisent les grandes zones de couleur de l'image (ex. split gauche sombre / droite claire). Coordonnées débordant le viewBox pour le bleed.
2. **Éléments géométriques** : polygones/formes pour diagonales, accents, séparateurs visibles dans l'image.
3. **Slots image produit** : pour les zones role="hero-visual" ou "product", utilise \`<image href="placeholder:<zone.id>" />\` (cette image sera fournie par l'utilisateur ou laissée en placeholder — ce n'est PAS l'image Nano Banana).
4. **Texte éditable** : tous les textes visibles dans l'image reproduits avec \`<text>\` + \`<tspan>\`. Police, taille, poids, couleur, position alignés sur ce que tu vois dans l'image (pas sur le plan si l'image diffère).

## Règles strictes sur les tspans

- Pour afficher plusieurs lignes dans un même \`<text>\`, utilise **exclusivement** \`<tspan x="..." dy="1.2em">\` (ou dy en mm = fontSize×1.2).
- Chaque tspan qui commence une nouvelle ligne DOIT répéter l'attribut \`x\` ET avoir un \`dy\` strictement positif (jamais dy=0 sur un tspan suivant le premier).
- Alternative acceptable : répéter \`x\` ET \`y\` absolus sur chaque tspan (pas de dy), avec y croissant d'au moins \`fontSize × 1.2\` mm entre lignes.
- **Interdit** : deux tspans avec mêmes coordonnées effectives (chevauchement garanti).

## Règles strictes sur les zones

- **Aucun chevauchement** entre zones texte ni entre rectangles de texte. Un espacement minimum de 2 mm entre bordures de zones texte.
- Les rectangles de background peuvent se toucher ou se superposer (c'est le design) mais le texte reste dans une seule zone à la fois.
- Respecte les bboxMm du plan comme point de départ, corrige visuellement si l'image montre une autre composition.

## Analyse visuelle AVANT d'émettre

1. Observe l'image : où sont les blocs de couleur ? Où est le texte ? Quelles sont les tailles relatives ?
2. Mesure les proportions : le bloc sombre occupe ~40 % de la largeur ? Le hero-visual occupe quelle part ?
3. Vérifie les alignements : texte aligné à gauche, centré, à droite ?
4. Identifie la hiérarchie : quel titre est le plus gros ? quelle est la couleur d'accent ?

## Format : ${args.formatLabel} (${args.widthMm} × ${args.heightMm} mm)
${bleedLine}

## Plan de référence

**Concept** : ${args.plan.concept}

**Device** : ${args.plan.mainDevice}

**Palette (utilise EXCLUSIVEMENT ces couleurs)** :
${args.plan.palette.map((c) => `- ${c}`).join('\n')}

**Typographie**
- Hero : ${args.plan.typography.heroFont}
- Body : ${args.plan.typography.bodyFont}
- Hiérarchie : ${args.plan.typography.hierarchy.map((h) => `${h.role} (${h.size}pt, ${h.weight}, ${h.color})`).join(' | ')}

**Zones du plan**
${zoneDescriptions}

**Slots image**
${slotDescriptions}

${args.productAssets && args.productAssets.length > 0 ? `**Assets fournisseur disponibles** :
${args.productAssets.map((a) => `- ${a.type}: ${a.title || '(sans titre)'}`).join('\n')}
` : ''}

## Contraintes techniques

- **SVG root** : \`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${args.widthMm} ${args.heightMm}">\` — unités mm, SANS width/height en pixels.
- **AUCUN** \`<image href="placeholder:nanobanana"\` — interdit. L'image Nano Banana n'est qu'une référence visuelle.
- **Fonts autorisées uniquement** :
${args.availableFonts.map((f) => `  • ${f}`).join('\n')}
- **Couleurs** : hex #RRGGBB uniquement (pas de noms comme "red").
- **Pas de rasterisation** : tout le texte reste en \`<text>\`, jamais converti en path.

## Checklist avant d'émettre

✓ Zéro balise \`<image href="placeholder:nanobanana"\`
✓ Chaque \`<text>\` a des coordonnées validées visuellement
✓ Chaque tspan suivant le premier a \`dy > 0\` OU un \`y\` absolu différent
✓ Aucun chevauchement entre zones texte
✓ Background = rectangles pleins qui reproduisent la composition de l'image
✓ Slots image produit utilisent \`placeholder:<zone.id>\` (jamais "nanobanana")
✓ viewBox en mm, pas de width/height en px

## Output format

{
  "svg": "...",
  "rationale": "Analyse: [ce que tu as observé]. Vectorisation: [comment tu as reproduit la composition]. (2-3 phrases)"
}
`
}
