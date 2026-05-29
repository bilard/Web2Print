import { Shapes } from 'lucide-react'
import type { HelpSection } from './types'

export const importSvgSection: HelpSection = {
  id: 'import-svg',
  title: 'Importer SVG (vectoriel)',
  category: 'Import',
  intro: 'Charger un .svg comme calques vectoriels éditables.',
  blocks: [
    {
      type: 'text',
      md: `Carte **« Importer SVG »** (sous-titre *Vectoriel éditable*). Charge un fichier \`.svg\` en **calques vectoriels éditables** : formes, textes et chemins deviennent des objets manipulables dans l'éditeur.`,
    },
    {
      type: 'text',
      md: `### Quand l'utiliser

- Un **logo** vectoriel à retoucher ou recolorer.
- Un visuel **déjà vectorisé** (export Illustrator/Figma) à intégrer dans une maquette.

⚠️ À ne pas confondre avec **Image → SVG éditable**, qui part d'un **raster** (PNG/JPG) : là, l'image reste un fond verrouillé et seuls les textes détectés deviennent éditables.`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.import' },
      label: 'Ouvrir Importer',
      icon: Shapes,
    },
  ],
}
