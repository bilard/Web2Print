import { LayoutGrid } from 'lucide-react'
import type { HelpSection } from './types'

export const importPptxSection: HelpSection = {
  id: 'import-pptx',
  title: 'Importer PPTX',
  category: 'Import',
  intro: 'Importer un .pptx pour le réutiliser comme template ou point de départ.',
  blocks: [
    {
      type: 'text',
      md: `IBS-Studio accepte les fichiers PowerPoint au format \`.pptx\` et les transforme en projets éditables. Utile pour récupérer une présentation existante et la transformer en template.`,
    },
    {
      type: 'text',
      md: `### Importer un PPTX

1. Tableau de bord → **Importer**
2. Sélectionne le \`.pptx\`
3. Le parser extrait textes, images et formes — y compris le **thème** (les couleurs de thème sont résolues) et les **transparences** de remplissage
4. La slide devient une page éditable dans IBS-Studio

⚠️ **Seule la première slide est importée.** Pour une présentation multi-slides, découpe le fichier en plusieurs \`.pptx\` (un par slide à récupérer) ou passe par le chemin IDML.

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

- **Multi-slides** : seule la **slide 1** est lue — les suivantes sont ignorées
- **Animations PowerPoint** : non supportées (IBS-Studio exporte du print/statique)
- **SmartArt** : ignorés à l'import (non convertis en formes)
- **Round-trip PPTX → Fabric → PPTX** : fonctionnel sur des slides simples, à valider sur cas complexes (plusieurs masters, mises en page custom)

Pour un export 100% fidèle vers PowerPoint, garde l'export PPTX pour des cas simples ; pour l'impression haut de gamme, privilégie le path PDF ou IDML.`,
    },
  ],
}
