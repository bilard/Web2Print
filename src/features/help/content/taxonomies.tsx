import { Tags } from 'lucide-react'
import type { HelpSection } from './types'
import { TaxonomyNavMock } from './mockups/TaxonomyNavMock'

export const taxonomiesSection: HelpSection = {
  id: 'taxonomies',
  title: 'Taxonomies',
  category: 'Données',
  intro: 'Classifier produits et projets dans une hiérarchie navigable.',
  blocks: [
    {
      type: 'text',
      md: `Les taxonomies sont des arbres de catégories que tu attaches à tes produits ou tes projets. Elles servent à filtrer, grouper et naviguer dans de gros volumes de données.

Exemple : \`Outillage > Électroportatif > Perceuses > Visseuses-perceuses\`.`,
    },
    { type: 'mockup', Component: TaxonomyNavMock },
    {
      type: 'text',
      md: `_Le navigateur de taxonomie : la branche active s'auto-déplie, le nœud sélectionné est mis en évidence, et chaque niveau a sa propre couleur._`,
    },
    {
      type: 'text',
      md: `### Créer une taxonomie

1. Va dans **Taxonomies** depuis le menu
2. Clique **Nouvelle taxonomie**
3. Donne-lui un nom (ex: \`Catégories produits\`)
4. Ajoute des niveaux : clique sur un nœud pour créer un enfant, glisse pour réorganiser
5. Renomme par double-clic, supprime par clic-droit

Les taxonomies sont stockées dans Firestore et synchronisées à travers tes appareils.`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.taxonomies' },
      label: 'Ouvrir Taxonomies',
      icon: Tags,
    },
    {
      type: 'text',
      md: `### Navigation intelligente

Dès qu'une BDD source est active, le navigateur de gauche **auto-déplie** la branche correspondante et **colorise tous les ancêtres** du nœud sélectionné jusqu'à la racine. Désélectionner referme la branche. Pratique pour se repérer dans des arbres profonds (4-5 niveaux et plus).

Quand plusieurs sources matchent, l'arbre se déplie sur l'union des branches actives.`,
    },
    {
      type: 'text',
      md: `### Lier une taxonomie à une BDD

Dans le PIM, chaque ligne peut être assignée à un nœud de la taxonomie :

1. Ouvre une BDD
2. Sélectionne une ligne
3. Clique **Non classé dans une taxonomie globale — cliquer pour classer** au-dessus du panneau
4. Choisis le nœud cible

Une fois classées, tes lignes peuvent être filtrées par catégorie depuis le navigateur de taxonomie à gauche.`,
    },
    {
      type: 'text',
      md: `### Auto-construction depuis le scraping

Quand tu scrapes un site avec un breadcrumb (fil d'Ariane), Web2Print peut auto-construire une taxonomie à partir des chemins de catégorie rencontrés. Utile pour démarrer un PIM en miroir d'un site fournisseur.

Cette auto-construction est faite via \`buildTaxonomyFromLevels()\` quand l'extraction template renvoie un champ \`Fil d'ariane\`.`,
    },
    {
      type: 'text',
      md: `### Cas d'usage

- **Catalogue multi-marques** : taxonomie principale par typologie produit (Outillage / Jardin / Électroménager)
- **Multi-langues** : une taxonomie par langue, ou bien une taxonomie unique avec des labels multilingues sur les nœuds
- **Reporting** : filtrer un export PDF/PPTX par catégorie pour générer des sous-catalogues thématiques`,
    },
  ],
}
