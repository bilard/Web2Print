import { LayoutGrid } from 'lucide-react'
import type { HelpSection } from './types'

export const importPptxSection: HelpSection = {
  id: 'import-pptx',
  title: 'Import PowerPoint (PPTX)',
  category: 'Import',
  intro: 'Importer un .pptx pour le réutiliser comme template ou point de départ.',
  blocks: [
    {
      type: 'text',
      md: `Web2Print accepte les fichiers PowerPoint au format \`.pptx\` et les transforme en projets éditables. Utile pour récupérer une présentation existante et la transformer en template.`,
    },
    {
      type: 'text',
      md: `### Importer un PPTX

1. Tableau de bord → **Importer**
2. Sélectionne le \`.pptx\`
3. Le parser extrait les slides, textes, images, formes
4. Chaque slide devient une page éditable dans Web2Print

Une fois importé, tu peux modifier le contenu, ajouter des placeholders pour le data-merge, et exporter dans n'importe quel format.`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.import' },
      label: 'Importer un fichier',
      icon: LayoutGrid,
    },
    {
      type: 'text',
      md: `### Cas d'usage type

**Présentation commerciale dynamique** : ton équipe vente part d'un PPTX modèle. Tu l'importes une fois, tu mappes les placeholders sur ta BDD produits, et chaque commercial génère sa version personnalisée (logo client, prix négocié, références prioritaires).

**Reverse engineering** : un client te fournit un PPTX que tu dois reproduire. Importe-le, capture la mise en page, exporte en IDML pour finition graphique.`,
    },
    {
      type: 'text',
      md: `### Limites

- **Animations PowerPoint** : non supportées (Web2Print exporte du print/statique)
- **SmartArt complexes** : peuvent être approximés en formes simples
- **Round-trip PPTX → Fabric → PPTX** : fonctionnel sur des slides simples, à valider sur cas complexes (plusieurs masters, mises en page custom)

Pour un export 100% fidèle vers PowerPoint, garde l'export PPTX pour des cas simples ; pour l'impression haut de gamme, privilégie le path PDF ou IDML.`,
    },
  ],
}
