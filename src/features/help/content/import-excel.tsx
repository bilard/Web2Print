import { Database } from 'lucide-react'
import type { HelpSection } from './types'

export const importExcelSection: HelpSection = {
  id: 'import-excel',
  title: 'Importer Excel',
  category: 'Import',
  intro: 'Alimenter le PIM depuis un fichier Excel, CSV/TSV ou Google Sheets.',
  blocks: [
    {
      type: 'text',
      md: `Cet import crée (ou complète) une **base de données produits** dans le PIM à partir d'un fichier. C'est le point d'entrée le plus rapide pour démarrer un catalogue.`,
    },
    {
      type: 'text',
      md: `### Formats supportés

| Format | Usage |
|---|---|
| **.xlsx / .xls** | Catalogue Excel classique, multi-feuilles supporté |
| **.csv / .tsv** | Export ERP (séparateur virgule ou tabulation), détection auto des types de colonnes |
| **Google Sheets** | Via OAuth Google — disponible dans le panneau **Publipostage** de l'éditeur et via les nodes Workflow (pas dans cette modale d'import) |

L'import détecte automatiquement les types de colonnes : texte, nombre, booléen, date, **formule** (stockée puis évaluée au moment de la fusion) et **dictionnaire** (colonne à valeurs répétitives → liste de choix).`,
    },
    {
      type: 'text',
      md: `### Importer un fichier

1. Ouvre **PIM** depuis le menu.
2. Clique **Importer un fichier** (ou *Créer vide* pour partir d'une base vierge).
3. Sélectionne ton fichier.
4. Vérifie les colonnes détectées.
5. Valide → la base est créée et synchronisée sur Firebase.`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.data' },
      label: 'Ouvrir le PIM',
      icon: Database,
    },
    {
      type: 'text',
      md: `### Et ensuite ?

Une fois la base importée, tout se passe dans le **PIM** : enrichir les fiches par IA, gérer les champs structurés (spécifications, variants, documents, images) et exporter en série. Voir la section **PIM**.`,
    },
  ],
}
