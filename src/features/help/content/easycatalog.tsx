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
      md: `### Sous le capot : comment les champs survivent à l'IDML

EasyCatalog ne stocke pas ses champs sous forme de texte : il pose des **marqueurs invisibles** sur le balisage InDesign que IBS-Studio sait relire.

- **Champ texte** : deux marqueurs encadrent la valeur sur le run de caractères — \`$ID/4 <nom>\` **ouvre** le champ, \`$ID/5 <nom>\` le **ferme** (attribut \`ECTagData\`). Le contenu du marqueur lui-même n'est qu'un caractère invisible (U+FEFF). IBS-Studio détecte cette paire et remplace tout ce qui est entre les deux par un seul \`{{nom}}\`, même si la valeur s'étalait sur plusieurs runs.
- **Champ image** : le cadre est un rectangle portant \`ECPageItemData="2 2 <nom>"\`. IBS-Studio le convertit en cadre image transparent **lié au champ** — le publipostage y chargera le visuel de la ligne.
- Les **noms de champs** sont URL-encodés dans l'IDML ; ils sont décodés à la lecture, ce qui explique pourquoi des libellés avec accents ou espaces (ex. \`{{Prix Malin}}\`) ressortent proprement.`,
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

À la réouverture dans InDesign + EasyCatalog, le document **retrouve ses champs** : tu peux re-synchroniser, re-paginer ou finaliser côté print. Pas de lock-in.

> **Comment l'aller-retour reste « propre » (preserve-and-patch)** : à l'export, IBS-Studio ne touche **jamais** aux marqueurs \`$ID/4\`/\`$ID/5\` — ils sont laissés tels quels. Seule la **valeur** entre les marqueurs est remplacée par \`{{champ}}\` puis résolue ligne par ligne. C'est pour ça qu'EasyCatalog reconnaît encore ses champs nativement après le passage par le web. Côté EasyCatalog, relie le document à ta data source via **Adopt Fields**.`,
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
          md: `Une **URL** d'image (ex. lien Firebase/DAM) se charge directement. Un simple **nom de fichier** est résolu via ton stockage si le fichier y existe. Le binding image se branche tout seul sur le cadre EasyCatalog importé.

À l'export EasyCatalog, les colonnes image sont aussi inscrites dans le zip sous forme de **noms de fichiers** dans la donnée, et un manifeste \`images.csv\` (colonnes \`ecFieldName, row_key, url, filename\`) te donne la table URL → fichier pour rapatrier les visuels dans le dossier image du data source.`,
        },
        {
          title: 'Comment le champ-clé est-il choisi à l\'export ?',
          md: `IBS-Studio prend ta **colonne primaire** comme clé EasyCatalog **si** toutes ses valeurs sont uniques et non vides. Sinon, il **synthétise** une clé \`_ec_key\` (\`row_1\`, \`row_2\`, …) pour garantir une re-synchronisation fiable. Le \`README.txt\` du zip rappelle quel champ sert de clé et s'il a été généré.

Les **noms de champs** exportés sont assainis pour rester stables : lettres et chiffres (accents inclus) conservés, le reste collapsé en \`_\`, et dédoublonnage insensible à la casse (suffixe \`_2\`, \`_3\`…). C'est la même règle qui permet aux noms de matcher au publipostage.`,
        },
        {
          title: 'Limites connues',
          md: `- Les champs sous **forme qualifiée** (référence data source complète, marqueurs \`$ID/2\`/\`$ID/3\`) ne sont pas encore convertis en placeholders et restent en texte ; seule la forme simple \`$ID/4\`/\`$ID/5\` est reconnue.
- Un champ **vide** dans le gabarit d'origine génère quand même son placeholder à l'import (la paire de marqueurs suffit).
- À l'export IDML, les **images** ne sont pas ré-incorporées dans le fichier : EasyCatalog les re-tire depuis sa propre source à la réouverture (le cadre et son champ sont conservés).`,
        },
      ],
    },
  ],
}
