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

1. La **page 1** du PDF est **rasterisée** et verrouillée en fond.
2. La **même décomposition** que _Image → SVG éditable_ s'applique : les **textes détectés** deviennent des calques éditables (overlays).

Pour repartir d'un **PDF existant** (BAT, ancien document) sans disposer du fichier source InDesign. Pour un import multi-pages fidèle avec fonts, préfère _Import InDesign (IDML)_.`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.import' },
      label: 'Ouvrir Importer',
      icon: FileText,
    },
  ],
}
