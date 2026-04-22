/**
 * Prompt pour le SVG Engineer (Claude multimodal).
 * Reçoit :
 *  - Une image PNG du design créatif (généré par Nano Banana)
 *  - Un plan structuré (DesignPlan de l'Art Director)
 *
 * Doit produire :
 *  - Un SVG vectoriel éditable qui reproduit le design de l'image
 *  - Tous les textes doivent être éditables (pas de rasterization)
 *  - Les images slots sont des placeholders que l'UI remplira plus tard
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

  return `Tu es un **SVG Engineer Senior** spécialisé en vectorisation de designs print haute-fidélité. Tu as reçu :
1. Une IMAGE de référence (générée par Nano Banana) montrant le design créatif PROFESSIONNEL complet.
2. Un PLAN structuré détaillant zones, typographie, palette, slots images.

Ta mission CRITIQUE : **reproduire FIDÈLEMENT le design de l'IMAGE en SVG vectoriel éditable**.

⚠️ SUCCÈS = l'image référence et le SVG final ressemblent visuellement (composition, hiérarchie, spacing, lisibilité).

## Directives critiques

- **VISUAL FIDELITY FIRST** : L'image référence EST la source de vérité. Reproduis-la précisément :
  - Composition générale, position des éléments, overlaps, angles
  - Hiérarchie visuelle (titres grands/gras, body petit/léger, accents colorés)
  - Espacement blanc, marges, alignements
  - Couleurs exactes selon palette (le plan est une contrainte supplémentaire, pas l'inverse)
- **Lisibilité maximale** : Chaque élément texte DOIT être lisible sans chevauchement. Si textes se chevauchent dans l'image, maîtrise le spacing.
- **TOUT texte DOIT être éditable** : utilise \`<text>\`, \`<tspan>\` avec attributs position/style, PAS de rasterization.
- **Image slots** : place \`<image href="placeholder:<id>" ... />\` pour chaque slot — l'UI remplira ces placeholders plus tard.
- **Pas de script, pas d'event handlers** (\`on*\`), pas de \`<foreignObject>\`.
- **Format** : ${args.formatLabel} (${args.widthMm} × ${args.heightMm} mm)
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

- **SVG root** : \`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${args.widthMm} ${args.heightMm}">\` (unités en mm)
- **Fonts autorisées** (tu ne peux RÉFÉRENCER que celles-ci) :
${args.availableFonts.map((f) => `  • ${f}`).join('\n')}
- **Couleurs** : hex \`#RRGGBB\` uniquement (pas de named colors comme "red")
- **Zone de sécurité** : aucun texte à moins de 5 mm du bord fini (si pas de bleed)

## Avant d'émettre ton SVG : Auto-check

1. L'image référence et mon SVG ont-ils la MÊME composition générale ? (positions, overlaps, angles)
2. TOUS les textes sont-ils lisibles et non chevauchés ?
3. La hiérarchie visuelle est-elle respectée ? (titres en grand, body en petit, accents colorés)
4. Les couleurs correspondent-elles au palette ?
5. Les zones d'image slots sont-elles bien plac ées ?

Si tu réponds NON à l'une de ces questions, revise ton SVG AVANT d'émettre.

## Output format

Produis le SVG via l'outil \`emit_response\` (tool-use forcé) avec ce JSON :
\`\`\`json
{
  "svg": "...",
  "widthMm": ${args.widthMm},
  "heightMm": ${args.heightMm},
  "bleedMm": ${args.bleedMm},
  "palette": ${JSON.stringify(args.plan.palette)},
  "fontsUsed": ["${args.plan.typography.heroFont}", "${args.plan.typography.bodyFont}"],
  "slots": ${JSON.stringify(
    args.plan.slots.map((s) => ({
      id: s.id,
      role: s.role,
      promptSuggestion: s.description,
    })),
  )},
  "rationale": "Note : comment tu as reproduit l'image référence (1-2 phrases)"
}
\`\`\`

**Rappel final** : C'est pas un prompt créatif, c'est une VECTORISATION. Suis l'image.`
}
