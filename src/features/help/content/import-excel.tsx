import { Database, Sparkles } from 'lucide-react'
import type { HelpSection } from './types'

export const importExcelSection: HelpSection = {
  id: 'import-excel',
  title: 'Import Excel & PIM',
  category: 'Import',
  intro: 'Alimenter le PIM depuis Excel, CSV, JSON ou Google Sheets — et enrichir par IA.',
  blocks: [
    {
      type: 'text',
      md: `Le PIM (Product Information Management) est ta source de vérité pour tout merge avec un template graphique. Plusieurs façons de l'alimenter.`,
    },
    {
      type: 'text',
      md: `### Formats supportés

| Format | Usage |
|---|---|
| **.xlsx / .xls** | Catalogue Excel classique, multi-feuilles supporté |
| **.csv** | Export ERP, détection auto des types de colonnes |
| **.json** | \`{ sheets: [{ columns, rows }] }\` — pour intégration custom |
| **Google Sheets** | Via OAuth Google, sync à la demande |

L'import détecte automatiquement les types : texte, nombre, booléen, date, formule, dictionnaire.`,
    },
    {
      type: 'text',
      md: `### Importer un fichier

1. Va dans **PIM** depuis le menu
2. Clique **Importer un fichier** (ou crée une BDD vide pour commencer)
3. Sélectionne ton fichier
4. Vérifie les colonnes détectées
5. Valide → la BDD est créée et synchronisée Firestore

Tes BDD sont stockées sur Firebase et accessibles depuis n'importe quel poste connecté à ton compte.`,
    },
    {
      type: 'menu-link',
      target: { path: '/data' },
      label: 'Ouvrir le PIM',
      icon: Database,
    },
    {
      type: 'text',
      md: `### Enrichir une ligne par IA

Clique sur une ligne → panneau **Enrichi par IA** à droite.

**Mode AUTO** (violet) : si la ligne a un \`title\`, \`brand\` ou \`reference\`, recherche Google + LLM trouve l'URL et extrait. Risque d'hallucination — à privilégier quand tu n'as pas d'URL.

**Mode TEMPLATE** (vert) : si l'URL est connue ET un template scraping matche le domaine, extraction déterministe par CSS selectors + LLM uniquement pour la rédaction. Précision maximale.

**Astuce** : si ta ligne a **uniquement une URL** (colonne nommée \`url\`, \`URL\`, \`product_url\`…), le pipeline détecte la colonne, matche le template et lance Mode TEMPLATE sans avoir besoin de titre. Workflow idéal pour batcher 1000 URLs.`,
    },
    {
      type: 'menu-link',
      target: { path: '/scraping-templates' },
      label: 'Gérer les templates scraping',
      icon: Sparkles,
    },
    {
      type: 'text',
      md: `### Champs structurés

Au-delà du texte simple, le PIM stocke :

- **Formules Excel** : évaluées à la volée
- **Spécifications** : \`[{group, name, value}]\` (ex: dimensions, matériaux)
- **Variants** : tableau de références produit (ref, label, propriétés)
- **Documents** : liens PDF, fiches techniques, vidéos
- **Images** : URLs ou Storage Firebase

Tous ces champs structurés sont accessibles dans le data-merge pour alimenter un template.`,
    },
  ],
}
