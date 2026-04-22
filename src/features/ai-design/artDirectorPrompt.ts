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

const DEVICES_CATALOG = `## Device : choisis UNE composition principale

- **diagonal-split** : bloc coloré diagonal (ex: 55% bleu / 45% blanc), produit et texte des deux côtés.
- **full-bleed-hero** : produit/photo en grand (50-70% canvas), texte en bas/coin.
- **typographic-wall** : titre énorme (80-140pt) + image petite + prix/meta en corner.
- **center-stack** : tout centré verticalement, image → titre → prix → CTA (minimaliste).
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

## Zones : contrainte stricte

⚠️ **EXACTEMENT 4-6 zones DISJOINTES**. Pas moins, pas plus.

- **1 zone background** (couvre 100% du canvas ou avec bleed)
- **1-2 zones hero-visual** (image produit, photo, logo)
- **2-4 zones texte** (titre, subtitle, body, prix, CTA, meta)

Exemple « Makita 234,99€ » :
1. Background bleu acier diagonal
2. Hero-visual : photo tronçonneuse 40%
3. Titre « TAILLE-HAIE 18V » en gros blanc
4. Price stack « 435,99€ barré + 234,99€ TTC + badge »
5. Meta + specs footer
(= 5 zones clairement séparées)

**Hiérarchie typo** : 2-3 niveaux max (pas 4-5).
- Display/hero : 60-120 pt, gras
- Body : 14-24 pt
- Meta : 8-12 pt

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
