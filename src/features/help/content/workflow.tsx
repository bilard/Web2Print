import { Workflow, Send } from 'lucide-react'
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
    { type: 'text', md: `### Catalogue des nodes

Déplie une catégorie pour voir ses nodes.` },
    {
      type: 'accordion',
      items: [
        {
          title: 'Import (sources) — 14 nodes',
          md:
            '| Node | Rôle |\n|---|---|\n' +
            '| Upload | Fichier/dossier local (auto-parse CSV/Excel) |\n' +
            '| Parser Excel/CSV | CSV/XLSX → tableau |\n' +
            '| Import IDML / SVG / PPTX / image | Charge un fichier InDesign / SVG / PowerPoint / image |\n' +
            '| Image → SVG · PDF → SVG | Convertit un raster / PDF en SVG éditable |\n' +
            '| Import Google Sheets · Import Google Drive | Source depuis Google Drive |\n' +
            '| Saisie texte | Texte saisi à la main (prompt, valeur à interpoler) |\n' +
            '| **Scrape URL** | Scrape 1+ URLs (Jina + IA, pipeline produit complet) |\n' +
            '| **Recherche web** ⭐ | Cherche sur le web + lit les pages → tableau + texte de synthèse |\n' +
            '| **Question web (IA)** ⭐ | Question → recherche web + réponse synthétisée par le LLM (+ sources) |',
        },
        {
          title: 'Enrichissement',
          md:
            '| Node | Rôle |\n|---|---|\n' +
            '| Enrichissement | Scrape les URLs d\'une colonne et complète les champs via IA |\n' +
            '| Génération image (Nano Banana) | Génère des images depuis un prompt |',
        },
        {
          title: 'Transformation',
          md:
            '| Node | Rôle |\n|---|---|\n' +
            '| Définir / réécrire colonnes | Templates `{{col}}` appliqués par ligne |\n' +
            '| Filtrer · Trier · Renommer · Opération texte | Manipulations de tableau |\n' +
            '| Décomposer (SVG éditable) | Analyse un SVG (Vision IA) en calques éditables |',
        },
        {
          title: 'Sauvegarde',
          md:
            '| Node | Rôle |\n|---|---|\n' +
            '| Save PIM | Persiste les lignes comme produits (Firestore) |\n' +
            '| Import Taxonomie | Construit une taxonomie hiérarchique |\n' +
            '| Save DAM | Upload les assets vers Google Drive |',
        },
        {
          title: 'Export',
          md:
            '| Node | Rôle |\n|---|---|\n' +
            '| Export Excel / PPTX / HTML→PDF / (design) | Génère le fichier |\n' +
            '| Export Google Sheets / Google Drive | Vers Google Drive |',
        },
        {
          title: 'Logique',
          md:
            '| Node | Rôle |\n|---|---|\n' +
            '| If / Else · Pipe · Loop (each / collect) | Branches, chaînage d\'expressions, boucles |',
        },
        {
          title: 'Communication',
          md:
            '| Node | Rôle |\n|---|---|\n' +
            '| Envoyer via Gmail | Envoie un email (+ pièces jointes) |\n' +
            '| Envoyer via Telegram | Envoie un message / document |',
        },
      ],
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
    {
      type: 'text',
      md: `### Piloter depuis Telegram

Les workflows se déclenchent aussi à distance : \`/flow <demande>\` génère et exécute un workflow, \`/run <nom>\` rejoue un workflow sauvegardé — et le fichier produit revient sur Telegram.`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.telegram' },
      label: 'Ouvrir Telegram',
      icon: Send,
    },
  ],
}
