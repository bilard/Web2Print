import { LayoutGrid, Database, Download } from 'lucide-react'
import type { HelpSection } from './types'

export const easyCatalogSection: HelpSection = {
  id: 'easycatalog',
  title: 'EasyCatalog (InDesign)',
  category: 'Import',
  intro:
    "Aller-retour avec le plug-in EasyCatalog : importer un gabarit, fusionner ses champs, puis réexporter un IDML reconnu nativement.",
  blocks: [
    {
      type: 'text',
      md: `**EasyCatalog** (65bit Software) est le plug-in InDesign de référence pour les catalogues et listes de prix pilotés par les données. IBS-Studio sert de **front web** à ce workflow : on importe un gabarit produit sous EasyCatalog, on l'édite et on le fusionne avec ses données, puis on réexporte un IDML qu'EasyCatalog **reconnaît nativement**.

Bonne nouvelle : EasyCatalog inscrit ses champs directement dans l'IDML (marqueurs invisibles). IBS-Studio les relit donc **automatiquement** — pas de re-balisage manuel à l'import.`,
    },
    {
      type: 'text',
      md: `### 1. Importer un gabarit EasyCatalog

1. Depuis InDesign (avec ton document EasyCatalog ouvert) : **Fichier → Exporter… → InDesign Markup (IDML)**
2. Dans IBS-Studio : Tableau de bord → **Importer** → sélectionne le \`.idml\`
3. Le gabarit s'ouvre dans l'éditeur. Les **champs EasyCatalog deviennent des placeholders éditables** :
   - **Champs texte** → \`{{Nom du champ}}\` (ex. \`{{Price}}\`, \`{{Description}}\`, \`{{Prix Malin}}\`)
   - **Champs image** → cadres image liés, prêts à recevoir un visuel par ligne`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.import' },
      label: 'Importer un IDML',
      icon: LayoutGrid,
    },
    {
      type: 'text',
      md: `### 2. Brancher tes données et fusionner

Dans l'éditeur, panneau **Publipostage** : connecte une source (Excel, Google Sheets, PIM…). IBS-Studio remplace les \`{{champs}}\` par les valeurs de la ligne courante, et charge les images dans les cadres liés.

> Pour que la correspondance se fasse, les **noms de colonnes** de ta source doivent matcher les noms de champs du gabarit (ex. colonne « Price » ↔ \`{{Price}}\`). La casse et les accents sont tolérés.

Tu peux alors **exporter par lot** : un PDF / PNG / PPTX par ligne, directement depuis le panneau Publipostage — sans repasser par InDesign.`,
    },
    {
      type: 'text',
      md: `### 3. Exporter une source de données POUR EasyCatalog

Depuis l'**espace Données**, bouton **EasyCatalog** : génère un zip prêt à brancher comme *flat-file data source* dans EasyCatalog.

Le zip contient :
- \`data.csv\` (tab ou virgule) ou \`data.xlsx\` — en-têtes = noms de champs stables
- un **champ-clé** garanti (pour la re-synchronisation EasyCatalog)
- \`fields.json\` — type de chaque champ (alphanumérique / numérique / image)
- \`images.csv\` — table URL → nom de fichier (si colonnes image)
- \`README.txt\` — mode d'emploi`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.data' },
      label: 'Espace Données',
      icon: Database,
    },
    {
      type: 'text',
      md: `### 4. Réexporter un IDML (aller-retour complet)

Depuis l'éditeur, **Exporter → IDML (multi-pages)** : IBS-Studio produit un IDML qui **conserve les marqueurs EasyCatalog** et résout les valeurs par ligne.

À la réouverture dans InDesign + EasyCatalog, le document **retrouve ses champs** : tu peux re-synchroniser, re-paginer ou finaliser côté print. Pas de lock-in.`,
    },
    {
      type: 'menu-link',
      target: { path: '/editor/:id', highlightId: 'editor-header.export' },
      label: "Bouton Exporter (depuis l'éditeur)",
      icon: Download,
    },
    {
      type: 'accordion',
      items: [
        {
          title: 'Les champs ne sont pas reconnus à l\'import ?',
          md: `Vérifie que l'IDML provient bien d'un document **piloté par EasyCatalog** (les champs y sont insérés via le panneau EasyCatalog, repérables aux crochets verts). Un texte tapé à la main n'est pas un champ. La reconnaissance a été validée sur InDesign 2026 ; des versions très anciennes peuvent stocker les champs différemment.`,
        },
        {
          title: 'Quelles données mettre dans les colonnes image ?',
          md: `Une **URL** d'image (ex. lien Firebase/DAM) se charge directement. Un simple **nom de fichier** est résolu via ton stockage si le fichier y existe. Le binding image se branche tout seul sur le cadre EasyCatalog importé.`,
        },
        {
          title: 'Limites connues',
          md: `- Les champs sous **forme qualifiée** (référence data source complète) ne sont pas encore convertis en placeholders et restent en texte.
- Un champ **sans valeur** dans le gabarit d'origine peut ne pas générer de placeholder.
- À l'export IDML, les **images** ne sont pas ré-incorporées dans le fichier : EasyCatalog les re-tire depuis sa propre source à la réouverture (le cadre et son champ sont conservés).`,
        },
      ],
    },
  ],
}
