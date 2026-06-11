import { BookOpen, Database } from 'lucide-react'
import type { HelpSection } from './types'

export const scrapingHubSection: HelpSection = {
  id: 'scraping-hub',
  title: 'Scraping Hub',
  category: 'Données',
  intro: 'Le centre de contrôle du scraping : règles d\'équipe, vue par fournisseur et debug des extractions.',
  blocks: [
    {
      type: 'text',
      md: `Le **Scraping Hub** centralise la gouvernance du scraping en trois onglets.`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.scraping-hub' },
      label: 'Ouvrir Scraping Hub',
      icon: BookOpen,
    },
    {
      type: 'accordion',
      items: [
        {
          title: 'Règles',
          md: 'Les **règles rédactionnelles** de l\'équipe (markdown) : conventions de nommage, formats de prix, langue des descriptions… Stockées dans Firestore et **partagées par toute l\'équipe**, elles servent de référence commune aux enrichissements. L\'édition requiert la permission *Éditer les règles de scraping*.',
        },
        {
          title: 'Fournisseurs & Templates',
          md: 'Vue d\'ensemble de **tous les templates groupés par domaine fournisseur** : déplie un fournisseur pour voir ses templates et leur état, et ouvre directement l\'éditeur de template d\'un clic.',
        },
        {
          title: 'Debug Jina/LLM',
          md: 'Le **journal des dernières requêtes** de scraping (30 max, rafraîchi toutes les 2 s) : pour chaque appel, le contenu renvoyé par Jina et la réponse du LLM. Indispensable pour comprendre pourquoi un champ revient vide — bouton **Vider** pour repartir à zéro.',
        },
      ],
    },
    {
      type: 'text',
      md: `### Voir aussi

La création des templates se fait dans **Templates scraping** ; le mode d'emploi général (Scrape, Map + Extract, Crawl, limites anti-bot) est dans **Scraping produits**.`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.scraping-templates' },
      label: 'Ouvrir Templates scraping',
      icon: Database,
    },
  ],
}
