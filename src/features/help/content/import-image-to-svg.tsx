import { Wand2 } from 'lucide-react'
import type { HelpSection } from './types'

export const importImageToSvgSection: HelpSection = {
  id: 'import-image-to-svg',
  title: 'Image → SVG éditable',
  category: 'Import',
  intro: 'Rendre une image raster éditable : fond verrouillé + textes décomposés par IA.',
  blocks: [
    {
      type: 'text',
      md: `Carte **« Image → SVG éditable »** (sous-titre *Raster verrouillé + overlays*). Transforme un **raster** (\`.png\`, \`.jpg\`, \`.webp\`, \`.gif\`) en projet éditable.`,
    },
    {
      type: 'text',
      md: `### Comment ça marche

1. L'image est **verrouillée en fond** (fidélité visuelle préservée).
2. L'IA (**Google Vision**) **détecte les textes** et les recrée en **calques éditables** par-dessus (overlays).
3. Tu modifies les textes, prix, titres… sans toucher au visuel d'origine.

La taille du canvas épouse les **pixels natifs** de la source. Idéal pour reprendre une **affiche / un visuel existant** dont tu n'as pas le fichier source.`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.import' },
      label: 'Ouvrir Importer',
      icon: Wand2,
    },
  ],
}
