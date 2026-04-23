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
  /** Si true, une image de référence Nano Banana est jointe au prompt multimodal.
   *  L'Art Director DOIT l'analyser et en extraire la composition + le contenu texte. */
  hasReferenceImage?: boolean
  /** Assets scrapés sur le site fournisseur, pour que l'Art Director prévoie
   *  des slots correspondants. */
  scrapedAssets?: Array<{ type: string; title?: string }>
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

  const referenceImageSection = args.hasReferenceImage
    ? `\n## Image de référence Nano Banana (jointe en multimodal)

Une image créative a été générée par Nano Banana (Gemini) pour INSPIRER ce design. **Elle N'EST PAS intégrée dans le SVG final** — elle te sert UNIQUEMENT de référence visuelle pour décider de la composition, des couleurs, des tailles, des typos et des contenus textes. Le SVG final sera 100 % vectoriel : chaque forme, chaque couleur, chaque texte que tu décris devient un objet éditable.

Ton travail : **retranscrire l'image en plan vectoriel structuré**. Tu décomposes TOUT ce que tu vois :

### Étape 1 — Bandes / panneaux structurels (role=background ou accent)
Identifie les GRANDES MASSES DE COULEUR :
- Header coloré (bande navy/noir/vert en haut) → zone \`role="background"\` couvrant cette bande
- Split vertical / diagonal → 2 zones \`role="background"\`
- Footer coloré → zone \`role="background"\` ou \`role="accent"\`
- Badge prix coloré → zone \`role="price"\` avec \`fill\` = couleur du badge
- Bouton CTA coloré → zone \`role="cta"\` avec \`fill\` = couleur du bouton **ET** \`content\` = label exact ("ACHETER MAINTENANT", "EN SAVOIR PLUS", etc.)
- Pennant / flag / ribbon décoratif PUR (sans texte) → zone \`role="accent"\` avec \`fill\` uniquement
- **Badge étiquette AVEC TEXTE** (pastille "LITHIUM-ION", "LXT", "18v", "XPT", "NEW", "-20 %"…) → zone \`role="accent"\` avec \`fill\` = couleur du badge **ET** \`content\` = texte exact. Le texte sera centré automatiquement sur le rect.

### Étape 2 — Visuels photographiques / logos (slots)
Chaque IMAGE visible (photo produit, logo marque, picto) = 1 slot :
- Photo produit/hero → \`slots[]\` avec role \`hero-visual\` ou \`product\`, position et taille observées
- Logo marque → slot role \`logo\`, dimension typique 30-60 mm de large
- Picto / icon → slot role \`picto\`, 10-20 mm
- Si une liste \`scrapedAssets\` t'est fournie, utilise \`assetIndex\` pour assigner chaque slot à l'asset scrapé le plus pertinent (logo sur slot logo, photo sur slot produit)

### Étape 3 — Tous les textes (role=title/subtitle/body/cta/price/accent)

⚠️ **CHECK-LIST OBLIGATOIRE** — pour un packshot produit (fiche, affiche retail, flyer promo), vérifie que tu as PRÉVU une zone pour chacun des éléments visibles dans la référence :
- [ ] **titre** produit (role=title, ex: "HEDGE TRIMMER DUH752Z")
- [ ] **accroche/subtitle** (role=subtitle, ex: "PUISSANT. EFFICACE. SANS FIL.")
- [ ] **liste de features/bullets** AVEC LEURS VALEURS — \`role="body"\` UNE SEULE zone, \`content\` multi-ligne avec \`\\n\`, ex: \`"• LONGUEUR DE COUPE : 75 cm\\n• AUTONOMIE OPTIMISÉE (18V)\\n• SYSTÈME ANTI-VIBRATIONS"\`. Si une feature a un picto associé à gauche, le picto est un slot séparé (type=picto) mais le texte de la feature reste dans la zone body unique.
- [ ] **paragraphe de description** (role=body) — si un bloc de texte courant est présent (2-5 lignes), c'est OBLIGATOIRE ; ne saute JAMAIS un paragraphe visible.
- [ ] **prix barré** (role=price, decoration=line-through) si applicable
- [ ] **prix promo** (role=price) avec fontSize ~2× le prix barré
- [ ] **CTA** (role=cta) avec \`fill\` ET \`content\` — le texte du bouton fait PARTIE de la zone, pas séparé
- [ ] **chaque badge/pastille** visible (role=accent avec fill ET content)

**Règle de groupement (CRUCIALE)** :
- **Un paragraphe / une liste de bullets / un bloc de specs = UNE SEULE zone**, pas N zones. Sépare les lignes avec \`\\n\` dans \`content\`.
  - Exemple : 6 bullets de features → 1 seule zone \`role="body"\` avec \`content="• Bullet 1\\n• Bullet 2\\n• Bullet 3..."\`.
  - Exemple : un bloc "specs techniques" avec 4 lignes de caractéristiques → 1 seule zone \`role="body"\`.
- **Un titre multi-ligne = 1 zone** avec \`\\n\` entre les lignes. Ne découpe jamais un titre en 2 zones "title1"/"title2".
- **Exceptions** (vraiment 2 zones distinctes) : un prix barré (line-through) ET un prix promo (deux zones). Un CTA est toujours sa propre zone. Chaque badge avec un texte différent est sa propre zone accent.

⚠️ **INTERDIT** : créer une zone \`role="cta"\`, \`role="price"\` ou \`role="accent"\` avec \`fill\` sans \`content\`. Le rect vide laisserait un rectangle de couleur muet à la place du bouton/badge. Si c'est un badge purement décoratif (sans texte), utilise \`role="accent"\` sans confusion.

Pour chaque zone :
- \`content\` : le TEXTE EXACT tel qu'il apparaît (casse, ponctuation, accents). Multi-lignes avec \`\\n\`.
- \`bboxMm\` : position ET TAILLE du bloc ENTIER (toutes les lignes groupées comprises) :
  - **largeur** : ajoute ~15-20 % de marge à droite pour que l'auto-fit ne shrinke pas un bold/display trop tôt
  - **hauteur** : calcule \`nbLignes × fontSize_mm × 1.3\` + marge. Un bloc de 6 bullets à 11pt fait ~35-40 mm de haut minimum.
- \`fontSize\` (pt) : taille estimée à partir de la hauteur en mm des majuscules (1 pt ≈ 0,353 mm). **Un titre sur une bannière de 100 mm de haut fait typiquement 30-50 pt**. Pour les BOLD/BLACK/condensed (wordmark style Makita), ATTENTION à la largeur : estime 0.55-0.62 mm par caractère × fontSize_mm et élargis la bbox en conséquence.
- \`textColor\` : couleur hex du texte observé.
- \`fill\` (optionnel, uniquement si le texte est sur un rect coloré non décrit ailleurs) : laisse \`undefined\` si le texte se pose sur un background/accent déjà listé.
- \`decoration: "line-through"\` si le prix est barré.
- \`align: "left" | "center" | "right"\`

⚠️ **Aucune invention, aucune omission** : tout ce qui est visible dans l'image doit être dans ton plan. Rien de plus, rien de moins.
`
    : ''

  const scrapedAssetsSection = args.scrapedAssets && args.scrapedAssets.length > 0
    ? `\n## Assets scrapés disponibles (numérotés)

Le site fournisseur a été scrapé. Voici la liste INDEXÉE des assets prêts à être injectés. Pour chaque asset que tu veux utiliser, crée un slot dédié et mets son index dans le champ \`assetIndex\` du slot :

${args.scrapedAssets
  .map((a, i) => `- **index=${i}** — type=\`${a.type}\` — "${a.title || '(sans titre)'}"`)
  .join('\n')}

### Règles d'assignation
- \`type=logo\` → crée un slot \`role="logo-slot"\`, 30-60 mm de large, coin/entête.
- \`type=picto\` → slot \`role="accent"\`, 10-20 mm, badge/corner.
- \`type=image\` → slot \`role="hero-visual"\` ou \`role="product"\`, 40-60 % du canvas.

Chaque asset utilisé = 1 slot avec \`assetIndex\` explicite. Ne réutilise jamais le même index.
`
    : ''

  return `Tu es un **Art Director éditorial senior** (Makita, Apple, Muji, Ducati selon le style). Ta mission : produire un PLAN de design print structuré en JSON, **pas encore le SVG**. Un SVG Engineer exécutera ton plan ensuite et produira un SVG **100 % vectoriel éditable** — ne laisse rien d'ambigu, et retranscris TOUT ce que tu vois en éléments vectoriels (rects pour les fonds, slots pour les photos, zones texte pour les textes).

## Brief utilisateur
<user_brief>
${args.userPrompt}
</user_brief>
${productImageLine}
${referenceImageSection}
${scrapedAssetsSection}

## Contraintes techniques
- **Format** : ${args.formatLabel} — ${args.widthMm} × ${args.heightMm} mm (format fini après coupe).
${bleedLine}
- **Zone de sécurité** : aucun TEXTE à moins de 5 mm du bord fini (les backgrounds peuvent et doivent déborder).
- **Fonts autorisés** (heroFont et bodyFont DOIVENT être dans cette liste) :
${args.availableFonts.map((f) => `  • ${f}`).join('\n')}
- **Style demandé** : **${args.style}** — ${STYLE_DIRECTION[args.style]}
${paletteLine}

${DEVICES_CATALOG}

## Zones (vectorielles éditables)

Si une image de référence est jointe (voir section ci-dessus), retranscris-la fidèlement en zones. Sinon, compose from-scratch selon le brief :
- **1 zone background** couvrant le canvas
- **1-2 zones hero-visual**
- **3-6 zones texte** bien séparées

**Minimum 4 zones, aucun plafond haut.** Si l'image a 10+ éléments distincts, ton plan a 10+ zones.

**Hiérarchie typo indicative** (adapte selon l'image) :
- Display/hero : 30-80 pt, gras
- Subtitle : 14-24 pt
- Body : 9-14 pt
- Meta/disclaimer : 7-10 pt

**IMPORTANT — tailles généreuses** : nos estimateurs de police prévoient ~15 % de marge. Si tu observes un titre à ~40 pt dans l'image, écris \`fontSize: 40\` (pas 30). Bbox aussi généreuses (ajoute 15-20 % de marge).

**Planchers lisibles absolus** (tailles minimum, JAMAIS en-dessous) : body ≥ 5 pt, subtitle ≥ 7 pt, title ≥ 10 pt, price ≥ 7 pt, cta ≥ 6 pt, accent ≥ 3 pt. Un texte à 2-4 pt est illisible et sera invisible. Si la bbox semble trop petite pour ton texte, **agrandis la bbox** au lieu de réduire la police.

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
