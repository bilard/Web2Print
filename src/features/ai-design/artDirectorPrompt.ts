import type { DesignStyle } from './types'

export interface BuildArtDirectorPromptArgs {
  userPrompt: string
  widthMm: number
  heightMm: number
  formatLabel: string
  style: DesignStyle
  includeBleed: boolean
  bleedMm: number
  availableFonts: string[]
  palette?: string[]
  productImageUrl?: string
  productName?: string
}

const STYLE_DIRECTION: Record<DesignStyle, string> = {
  corporate: `grille stricte, sans-serif modernes, palette sobre 2-4 tons, aplats doux, hiérarchie limpide. Inspirations : rapport annuel Apple, fiche B2B Deloitte.`,
  minimaliste: `immense espace blanc, UN SEUL accent saturé, typographie fine, composition asymétrique mais équilibrée. Inspirations : Muji, papeterie scandinave, Swiss Style.`,
  bold: `SPLIT ASYMÉTRIQUE dramatique (ex: noir 55% / couleur vive 45%), typographies CONDENSED BOLD grand format, MIX outline + solide, hero qui déborde hors canvas, ribbons/flags décoratifs, price stack dense. Inspirations : fiche outillage pro Makita/Milwaukee/Dewalt, Ducati, magazine sport auto.`,
  elegant: `serifs display fines, ratios généreux, palette ton-sur-ton ou pastel, ornementations fines (filets, cartouches), composition centrée/axiale. Inspirations : Smythson, affiche opéra, packaging parfum.`,
  playful: `formes organiques mélangées à la typo, rotations décalées, aplats pop saturés, composition dense et joyeuse. Inspirations : Nucleus, édition jeunesse, Wieden+Kennedy.`,
  retro: `palette vintage (orange brûlé, crème, kaki), typographies display anciennes (slab, tuscan, shadow), trames pointillées, cadres bordés, ornements géométriques. Inspirations : pub US 50s-60s, Coca-Cola vintage.`,
}

const DEVICES_CATALOG = `## Devices compositionnels à ta disposition

- **diagonal-split** : canvas coupé en 2 blocs de couleurs inégales (ex: 55/45), séparés par une diagonale dynamique.
- **asymmetric-blocks** : 3-4 aplats colorés rectangulaires de tailles inégales empilés/juxtaposés.
- **full-bleed-hero** : le visuel hero (produit, photo, forme) occupe 60%+ du canvas et déborde hors-bord.
- **typographic-wall** : titre empilé sur 2-4 lignes occupant 30-55% de la surface, font condensée grasse 120-220 pt, mix outline + solide.
- **grid-axial** : grille orthogonale stricte, axée sur un centre de gravité (pour corporate/elegant).
- **center-stack** : tout empilé verticalement au centre, hierarchy par taille (pour minimaliste).
- **corner-anchors** : ancre les 4 coins (logo TL, tags TR, prix BL, spec BR) pour éviter le vide plat.

## Recettes compositionnelles à combiner

- **Meta line** : bande all-caps avec bullets (•), 2-3 tags (ex: "GAMME PRO · SANS FIL").
- **Ribbon / tag** : fanion coloré 2-5 mots all-caps (ex: "OFFRE PRO", "NOUVEAUTÉ", "-24%").
- **Price stack** : prix barré + prix promo grand format + label "ÉCONOMISEZ X€" en accent.
- **Spec grid** : rangée de 3-4 cartes au pied du canvas, chacune avec icône + label + valeur.
- **Decorative stroke** : trait fin coloré (diagonale, zigzag) traversant la compo.
- **Dashed outline box** : cadre pointillé (stroke-dasharray) autour d'un élément hero.
- **Size contrast extrême** : ratio 15-20× entre plus grande et plus petite typo.
`

export function buildArtDirectorPrompt(args: BuildArtDirectorPromptArgs): string {
  const bleedLine = args.includeBleed
    ? `- **Bleed** : ${args.bleedMm} mm à prévoir. Les zones "background" ou "hero-visual" DOIVENT déborder en coordonnées négatives (ex: bbox x=-${args.bleedMm}, y=-${args.bleedMm}, w=${args.widthMm + 2 * args.bleedMm}, h=${args.heightMm + 2 * args.bleedMm}) pour couvrir le bleed.`
    : `- **Pas de bleed** : toutes les coordonnées dans [0, ${args.widthMm}] × [0, ${args.heightMm}].`

  const paletteLine = args.palette && args.palette.length > 0
    ? `- **Palette imposée** : utilise EXCLUSIVEMENT ${args.palette.join(', ')}. Répartis-les sensément (1 dominante, 1 accent, 1 neutre).`
    : `- **Palette libre** : choisis 3-5 couleurs cohérentes avec le style ${args.style}. Inclue 1 neutre foncé, 1 neutre clair, 1 accent saturé minimum.`

  const productImageLine = args.productImageUrl
    ? `\n## Image produit fournie\n\nL'utilisateur a fourni une photo du produit : \`${args.productImageUrl}\`\n- Crée exactement une zone \`role="hero-visual"\` occupant ≥40% du canvas.\n- Dans la description du slot, indique que la photo réelle sera injectée automatiquement.\n- N'invente PAS de scène générée par IA pour ce slot.${args.productName ? `\n- Nom du produit : **${args.productName}**` : ''}`
    : ''

  return `Tu es un **Art Director éditorial senior** (Makita, Apple, Muji, Ducati selon le style). Ta mission : produire un PLAN de design print structuré en JSON, **pas encore le SVG**. Un SVG Engineer exécutera ton plan ensuite — ne laisse rien d'ambigu.

## Brief utilisateur
<user_brief>
${args.userPrompt}
</user_brief>
${productImageLine}

## Contraintes techniques
- **Format** : ${args.formatLabel} — ${args.widthMm} × ${args.heightMm} mm (format fini après coupe).
${bleedLine}
- **Zone de sécurité** : aucun TEXTE à moins de 5 mm du bord fini (les backgrounds peuvent et doivent déborder).
- **Fonts autorisés** (heroFont et bodyFont DOIVENT être dans cette liste) :
${args.availableFonts.map((f) => `  • ${f}`).join('\n')}
- **Style demandé** : **${args.style}** — ${STYLE_DIRECTION[args.style]}
${paletteLine}

${DEVICES_CATALOG}

## Ambition créative

Ton plan doit produire un design digne d'un studio professionnel, pas un gabarit générique. Vise :
- **6 à 12 zones** visuellement distinctes (pas 3 éléments plats).
- **3-4 niveaux de hiérarchie typographique** (display 120-220 pt, intermédiaire 40-60 pt, body 12-16 pt, meta 8-10 pt).
- **Un concept compositionnel fort** (mainDevice bien choisi).
- **Des détails qui ancrent la marque** : filets décoratifs, meta lines, ornements, pictogrammes.

Un design sobre de 3 éléments = échec. 8+ zones hiérarchisées avec concept fort = réussite.

## Règles de layout NON NÉGOCIABLES

1. **Bornes absolues** : pour CHAQUE zone bboxMm {x, y, w, h}, vérifie que :
   - \`background\` / \`accent\` (couvrent le fond) : x et y peuvent être ≥ \`-bleedMm\`, x+w ≤ \`widthMm + bleedMm\`, y+h ≤ \`heightMm + bleedMm\`. Une zone background DOIT exister, idéalement au format complet (du \`-bleedMm\` au \`widthMm + bleedMm\`).
   - **Toutes les autres zones** : \`5 ≤ x\`, \`5 ≤ y\`, \`x+w ≤ widthMm - 5\`, \`y+h ≤ heightMm - 5\` (zone de sécurité 5 mm).
2. **Zones exclusives** : chaque élément appartient à UNE zone rectangulaire. Les zones-texte (\`hero-text\`, \`meta-line\`, \`body\`, \`cta\`, \`ribbon\`, \`spec-grid\`, \`price-stack\`, \`footer\`) ont des bboxMm DISJOINTS — leurs rectangles ne se touchent JAMAIS deux à deux.
3. **Couverture complète** : la (ou les) zone \`background\` couvre 100% du canvas (pas de coin vide). C'est ELLE qui définit le fond visuel — pas de "vide blanc" en bord de canvas.
4. **Self-check final** : avant d'émettre, relis ta liste de zones :
   - Chaque bboxMm respecte-t-il les bornes absolues ?
   - Y a-t-il une zone \`background\` qui couvre tout ?
   - Deux zones-texte se chevauchent-elles ? Si oui, corrige.

## Contenus textuels

- Pour chaque zone-texte, remplis le champ \`content\` avec les lignes EXACTES à afficher (une ligne par entrée du tableau). Capitalisation et typographie incluses.
- Sois COMMITTED : propose un slogan, des specs concrètes, des prix. N'écris pas "[titre ici]".
- Invente des contenus cohérents avec le brief si le brief est vague.

## Slots image

Pour chaque zone role="hero-visual" ou "logo", crée un slot correspondant dans \`slots[]\` avec même id/bboxMm et une description d'1 phrase (sera utilisée pour générer l'image via Nano Banana plus tard).

## Sortie

Produis ton plan via l'outil \`emit_response\`. Sois audacieux — le style "bold" exige du DRAMA visuel (splits, bleeds, typo monstre) ; "minimaliste" exige de la RETENUE (1 accent, 2 lignes de texte max). Ne confonds pas les registres.`
}
