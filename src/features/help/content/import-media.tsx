import { Upload } from 'lucide-react'
import type { HelpSection } from './types'

export const importMediaSection: HelpSection = {
  id: 'import-media',
  title: 'Import images, SVG & PDF',
  category: 'Import',
  intro: 'Placer une image, charger un SVG vectoriel, ou rendre une image / PDF éditable.',
  blocks: [
    {
      type: 'text',
      md: `Depuis l'écran **Importer**, plusieurs entrées selon le format source et le résultat voulu. Déplie chacune :`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.import' },
      label: 'Ouvrir Importer',
      icon: Upload,
    },
    {
      type: 'accordion',
      items: [
        {
          title: 'Importer une image (PNG, JPG, SVG, WebP)',
          md:
            'Crée un projet et **place l\'image sur le canvas**. Formats acceptés : `.png`, `.jpg`, `.webp`, `.gif`, `.svg`. ' +
            'L\'image reste **une image** (non décomposée) — pour en éditer le texte, utilise plutôt *Image → SVG éditable*.',
        },
        {
          title: 'Importer SVG (vectoriel éditable)',
          md:
            'Charge un fichier **`.svg`** comme **calques vectoriels éditables** (formes, textes, chemins). ' +
            'Idéal pour un **logo** ou un visuel déjà vectorisé que tu veux retoucher dans l\'éditeur.',
        },
        {
          title: 'Image → SVG éditable',
          md:
            'Transforme un **raster** (`.png`, `.jpg`, `.webp`, `.gif`) en projet éditable : l\'image est **verrouillée en fond** ' +
            'et l\'IA (Google Vision) en **décompose les textes** en calques éditables par-dessus (overlays). ' +
            'Parfait pour reprendre une **affiche / un visuel existant**. La taille du canvas épouse les pixels natifs de la source.',
        },
        {
          title: 'PDF → SVG éditable',
          md:
            'Rasterise la **page 1** d\'un **`.pdf`** en fond verrouillé, puis applique la **même décomposition** que *Image → SVG* ' +
            '(textes éditables en overlays). Pour repartir d\'un **PDF existant** sans le fichier source.',
        },
      ],
    },
    {
      type: 'text',
      md: `### Lequel choisir ?

- **Poser** une image dans une maquette → **Importer une image**.
- Un **SVG déjà vectoriel** à retoucher → **Importer SVG**.
- **Éditer le texte** d'une image ou d'un PDF existant → **Image → SVG** / **PDF → SVG**.
- Une **maquette InDesign** → _Import InDesign (IDML)_ · une **présentation** → _Import PowerPoint (PPTX)_ · des **données** → _Import Excel & PIM_.`,
    },
  ],
}
