import { Tag } from 'lucide-react'
import type { HelpSection } from './types'

export const retailPromoSection: HelpSection = {
  id: 'retail-promo',
  title: 'Création studio',
  category: 'Données',
  intro: 'Créez et gérez vos promotions retail : visuels, offres et déclinaisons multi-format.',
  blocks: [
    {
      type: 'text',
      md: `Le module **Création studio** permet de créer et de gérer des promotions pour le point de vente : affiches, étiquettes, flyers et autres supports prêts à l'impression ou à la diffusion digitale.`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.retail-promo' },
      label: 'Ouvrir Création studio',
      icon: Tag,
    },
  ],
}
