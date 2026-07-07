import { BookText } from 'lucide-react'
import type { HelpSection } from './types'

export const catalogSection: HelpSection = {
  id: 'catalog',
  title: 'Catalogue studio',
  category: 'Données',
  intro: 'Générez un catalogue produits complet — de la sélection PIM au PDF prêt à imprimer — via un assistant en 6 étapes piloté par IA.',
  blocks: [
    {
      type: 'text',
      md: `Le module **Catalogue studio** assemble automatiquement un catalogue multi-pages à partir de vos données produits : vous choisissez une source (PIM ou Excel), une structure, un style, et l'IA compose les pages. Vous gardez la main sur le **chemin de fer** (l'ordre et le contenu des pages) avant d'exporter en PDF.`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.catalog' },
      label: 'Ouvrir Catalogue studio',
      icon: BookText,
    },
    {
      type: 'text',
      md: `### Créer un catalogue
1. Ouvrez **Catalogue studio** depuis le menu latéral (groupe *Publication*).
2. Cliquez **Nouveau catalogue** (ou reprenez-en un dans *Mes catalogues*).
3. L'assistant en **6 étapes** s'ouvre. Vous pouvez naviguer librement entre les étapes une fois la source choisie ; le travail est **sauvegardé automatiquement**.`,
    },
    {
      type: 'text',
      md: `### Les 6 étapes de l'assistant

**1 · Source** — Choisissez d'où viennent les produits : un **projet PIM** ou un **dataset Excel** importé. Chaque ligne devient un produit du catalogue.

**2 · Structure** — Organisez le catalogue en sections (rubriques, familles). Reliez une **taxonomie** pour regrouper les produits par catégorie et donner son plan au catalogue.

**3 · Prompt & style** — Décrivez le rendu voulu en langage naturel et posez la **charte graphique** (voir plus bas). L'IA en déduit la mise en page, les couleurs et les typographies.

**4 · Chemin de fer** — Le *flatplan* : chaque page est une vignette. **Glissez-déposez** pour réordonner, déplacer un produit d'une page à l'autre, ajouter ou retirer des pages. C'est ici que vous validez le déroulé.

**5 · Aperçu** — Le rendu page par page, fidèle à l'export.

**6 · Export** — Génération du fichier final (voir *Exporter*).`,
    },
    {
      type: 'text',
      md: `### Charte graphique & source d'inspiration
À l'étape **Prompt & style**, la carte **Charte & éléments joints** pilote le moteur créatif :
- **Éléments joints** : ajoutez un logo, une charte PDF ou des visuels de référence.
- **Source d'inspiration** : collez une **URL** (Dribbble, Behance, ou une image directe). Le studio l'analyse et en extrait la **palette de couleurs** et les **typographies détectées**, qui pilotent ensuite le plan généré par l'IA — pour un catalogue qui « ressemble à » votre référence.`,
    },
    {
      type: 'text',
      md: `### Exporter
À l'étape **Export**, deux sorties :
- **PDF écran** — léger, pour l'aperçu et le partage web.
- **PDF print pro** — haute définition, prêt pour l'impression.

Le data-merge par produit et les autres formats de sortie sont détaillés dans la section **Export multi-format**.`,
    },
    {
      type: 'text',
      md: `### Bon à savoir
- La source est **relue au chargement** du catalogue : si le PIM évolue, rouvrez le catalogue pour repartir des données à jour.
- Pour des fiches promo unitaires (affiches, étiquettes) plutôt qu'un catalogue complet, voyez **Création studio**.
- La composition des pages et la palette sont générées par IA à partir de la charte : soignez le prompt et les éléments joints pour un meilleur résultat.`,
    },
  ],
}
