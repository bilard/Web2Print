import { FileText } from 'lucide-react'
import type { HelpSection } from './types'

export const importPdfToSvgSection: HelpSection = {
  id: 'import-pdf-to-svg',
  title: 'PDF → SVG éditable',
  category: 'Import',
  intro: 'Repartir d\'un PDF : page 1 rasterisée en fond + textes éditables.',
  blocks: [
    {
      type: 'text',
      md: `Carte **« PDF → SVG éditable »** (sous-titre *Page 1 rasterisée + overlays*). Convertit un **\`.pdf\`** en projet éditable.`,
    },
    {
      type: 'text',
      md: `### Comment ça marche

1. Si le PDF contient un **calque texte natif** exploitable, la conversion vectorielle est tentée d'abord : les textes arrivent **exacts** (pas d'OCR).
2. Sinon, la **page 1** est **rasterisée** et verrouillée en fond, puis la **même décomposition** que _Image → SVG éditable_ s'applique : les **textes détectés** deviennent des calques éditables (overlays).
3. Les images **CMYK** embarquées sont automatiquement ré-encodées en RGB (pas de couleurs inversées).

⚠️ **Seule la page 1 est traitée** — les pages suivantes sont ignorées. Pour repartir d'un **PDF existant** (BAT, ancien document) sans disposer du fichier source InDesign. Pour un import multi-pages fidèle avec fonts, préfère _Import InDesign (IDML)_.`,
    },
    {
      type: 'text',
      md: `### Texte natif vs OCR — trois niveaux

L'import suit une **cascade** : il garde toujours le niveau le plus fidèle disponible.

1. **Conversion vectorielle (MuPDF)** — tentée d'abord. Si le PDF contient du **vrai texte**, le document devient un SVG complet : paths exacts, images, et chaque mot reste du **texte réel** avec sa position, sa taille, sa couleur et sa graisse d'origine. **Zéro OCR.**
2. **Repli rasterisé + calque texte natif** — si le vectoriel échoue, la page 1 est rasterisée et verrouillée en fond, MAIS le **calque texte natif** du PDF est tout de même lu (positions et tailles exactes) : chaque mot redevient un \`<text>\` éditable posé par-dessus le fond, effacé du raster quand son fond est uni. **Toujours pas d'OCR.**
3. **OCR (« Décomposer »)** — uniquement quand le PDF est **aplati** (texte vectorisé/scanné, aucun mot détecté) : on retombe alors sur la décomposition Vision de _Image → SVG éditable_.

Autrement dit, « rasterisé » ne veut **pas** dire « OCR » : tant que le PDF garde un calque texte, vos textes restent exacts.`,
    },
    {
      type: 'accordion',
      items: [
        {
          title: 'Ce qui devient éditable (conversion vectorielle)',
          md: `Quand le PDF passe par la **conversion vectorielle**, l'import ne se contente pas de séparer texte et fond — il reconstruit des objets vraiment manipulables :

- **Blocs de texte regroupés** : un **prix composé** (« 22 DT ,99 »), une **bulle** (« 30 % d'économie »), une **pastille** (« +55g GRATUIT ») sont rassemblés en **un seul groupe** déplaçable d'un tenant, au lieu de mots éparpillés.
- **Ombres portées InDesign** → converties en **ombre native** éditable depuis le panneau Ombre (au lieu d'un voile gris).
- **Images CMYK** (photos InDesign/Adobe) → ré-encodées en **RGB** pour éviter le rendu noir/inversé des navigateurs.
- **Marques d'impression** (traits de coupe, repères) et **doublons d'impression** (passe blanche + passe encrée superposées) sont déballés/dédoublonnés pour ne pas bloquer la sélection ni polluer les calques.`,
        },
        {
          title: 'Polices fidèles (embarquées + repli Google Fonts)',
          md: `Pour que le rendu ne retombe pas sur une police par défaut :

- Les **polices embarquées** dans le PDF (sous-ensembles TrueType) sont **extraites et chargées** sous leur vraie famille (« WRZTFA+ArialNarrow-Bold » → *Arial Narrow*, gras).
- Les familles non extractibles (ex. **Bebas Neue**) sont récupérées depuis **Google Fonts**, en graisses **400 et 700** (pour éviter un faux-gras synthétique).
- La **chasse** de chaque texte est ensuite **calée sur sa largeur d'origine** : le texte condensé du design (« 30 % » comprimé) ne déborde plus sur son voisin, même si la police de rendu n'a pas les métriques exactes.`,
        },
        {
          title: 'Champs de fusion {{…}} préservés',
          md: `Si le PDF d'origine contient déjà des **champs de fusion** \`{{…}}\` (publipostage), l'import les reconnaît et leur attache leur **cadre de composition** : largeur du bloc + **alignement détecté** sur la géométrie réelle (bords droits communs → aligné à droite, centres → centré).

Ces champs deviennent des **Textbox à cadre fixe** : à la fusion, les valeurs longues **reviennent à la ligne** dans le cadre au lieu de déborder, et l'alignement du design est conservé. Le moteur de publipostage descend aussi **dans les blocs groupés** pour retrouver ces champs.`,
        },
        {
          title: 'Limites & quand l\'utiliser',
          md: `- **Page 1 uniquement** : les pages suivantes sont ignorées. Pour un multi-pages fidèle, préférez _Import InDesign (IDML)_.
- Idéal pour **repartir d'un PDF existant** (BAT, ancien document) quand le fichier source InDesign n'est plus disponible.
- Un PDF **scanné ou totalement aplati** n'a pas de calque texte : on passe alors par l'**OCR** (« Décomposer »), de fidélité moindre.
- Le SVG généré est **marqué** pour que l'éditeur **n'enclenche pas l'OCR** quand un calque texte natif est déjà présent.`,
        },
      ],
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.import' },
      label: 'Ouvrir Importer',
      icon: FileText,
    },
  ],
}
