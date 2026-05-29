import { Image as ImageIcon, Upload } from 'lucide-react'
import type { HelpSection } from './types'

export const importImageSection: HelpSection = {
  id: 'import-image',
  title: 'Importer une image',
  category: 'Import',
  intro: 'Placer une image (PNG, JPG, SVG, WebP) sur le canvas d\'un nouveau projet.',
  blocks: [
    {
      type: 'text',
      md: `Carte **« Importer une image »** de l'écran Importer. Formats acceptés : \`.png\`, \`.jpg\`, \`.webp\`, \`.gif\`, \`.svg\`.

L'image est posée sur le **canvas** d'un nouveau projet — elle **reste une image** (pas de décomposition). Tu peux ensuite la déplacer, la redimensionner et ajouter d'autres éléments par-dessus.`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.import' },
      label: 'Ouvrir Importer',
      icon: ImageIcon,
    },
    {
      type: 'text',
      md: `Pour **éditer le texte** d'une image existante (et pas seulement la poser), utilise plutôt _Image → SVG éditable_.`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.import' },
      label: 'Voir Image → SVG éditable',
      icon: Upload,
    },
  ],
}
