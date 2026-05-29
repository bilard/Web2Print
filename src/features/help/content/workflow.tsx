import { Workflow } from 'lucide-react'
import type { HelpSection } from './types'

export const workflowSection: HelpSection = {
  id: 'workflow',
  title: 'Workflows (automatisation)',
  category: 'Automatisation',
  intro: "Enchaîner les fonctions de l'app en pipelines visuels — façon Zapier / Make.",
  blocks: [
    {
      type: 'text',
      md: `Le module **Workflows** chaîne les fonctions de Web2Print (import, scraping, IA, transformation, export, envoi) dans un **graphe visuel**. Chaque **node** est une brique ; tu les relies par leurs ports (entrées/sorties typés).`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.workflows' },
      label: 'Ouvrir Workflows',
      icon: Workflow,
    },
    {
      type: 'text',
      md: `### Deux façons de construire

- **Manuel** : glisse les nodes depuis la palette (à gauche), relie-les, configure chacun (panneau de droite), puis **Run**.
- **IA (Prompt-to-Flow)** : bouton **« Générer (IA) »** → décris ton besoin en langage naturel, un LLM construit le graphe complet (nodes + liaisons + config) à partir du catalogue. Disponible aussi via \`/flow\` sur Telegram.

La **palette est progressive** : commence par un node **Import** (source), puis enrichis / transforme / sauvegarde / exporte / communique.`,
    },
    {
      type: 'text',
      md: `### Catalogue des nodes

**Import (sources)**
| Node | Rôle |
|---|---|
| Upload | Fichier/dossier local (auto-parse CSV/Excel) |
| Parser Excel/CSV | CSV/XLSX → tableau |
| Import IDML / SVG / PPTX / image | Charge un fichier InDesign / SVG / PowerPoint / image |
| Image → SVG · PDF → SVG | Convertit un raster / PDF en SVG éditable |
| Import Google Sheets · Import Google Drive | Source depuis Google Drive |
| Saisie texte | Texte saisi à la main (prompt, valeur à interpoler) |
| **Scrape URL** | Scrape 1+ URLs (Jina + IA, pipeline produit complet) |
| **Recherche web** ⭐ | Cherche sur le web + lit les pages → tableau + texte de synthèse |
| **Question web (IA)** ⭐ | Question → recherche web + réponse synthétisée par le LLM (+ sources) |

**Enrichissement**
| Node | Rôle |
|---|---|
| Enrichissement | Scrape les URLs d'une colonne et complète les champs via IA |
| Génération image (Nano Banana) | Génère des images depuis un prompt |

**Transformation**
| Node | Rôle |
|---|---|
| Définir / réécrire colonnes | Templates \`{{col}}\` appliqués par ligne |
| Filtrer · Trier · Renommer · Opération texte | Manipulations de tableau |
| Décomposer (SVG éditable) | Analyse un SVG (Vision IA) en calques éditables |

**Sauvegarde**
| Node | Rôle |
|---|---|
| Save PIM | Persiste les lignes comme produits (Firestore) |
| Import Taxonomie | Construit une taxonomie hiérarchique |
| Save DAM | Upload les assets vers Google Drive |

**Export**
| Node | Rôle |
|---|---|
| Export Excel / PPTX / HTML→PDF / (design) | Génère le fichier |
| Export Google Sheets / Google Drive | Vers Google Drive |

**Logique**
| Node | Rôle |
|---|---|
| If / Else · Pipe · Loop (each / collect) | Branches, chaînage d'expressions, boucles |

**Communication**
| Node | Rôle |
|---|---|
| Envoyer via Gmail | Envoie un email (+ pièces jointes) |
| Envoyer via Telegram | Envoie un message / document |`,
    },
    {
      type: 'text',
      md: `### Exemples de pipelines

- **Veille** : Recherche web → Export Excel → Envoyer via Gmail.
- **Réponse sourcée** : Question web (IA) → Envoyer via Telegram.
- **Fiches produit** : Scrape URL → Enrichissement → Save PIM → Export PPTX.
- **Batch** : Upload (Excel d'URLs) → Enrichissement → Save DAM.`,
    },
    {
      type: 'text',
      md: `_Les nodes IA (Scrape, Enrichissement, Décomposer, Génération de workflow, Question web) routent automatiquement vers un modèle adapté et à jour — aucun réglage de modèle à faire._`,
    },
  ],
}
