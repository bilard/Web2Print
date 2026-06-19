import { Database, Sparkles, FolderTree, Download } from 'lucide-react'
import type { HelpSection } from './types'
import { PimGridMock } from './mockups/PimGridMock'
import { EnrichmentPanelMock } from './mockups/EnrichmentPanelMock'

export const pimSection: HelpSection = {
  id: 'pim',
  title: 'PIM',
  category: 'Données',
  intro: 'Gérer tes bases de données produits : fiches, enrichissement IA, champs structurés et export.',
  blocks: [
    {
      type: 'text',
      md: `Le **PIM** (*Product Information Management*) est ta **source de vérité produits** : c'est lui qui alimente le *data-merge* avec un template graphique pour produire des fiches en série. Tes bases sont stockées sur Firebase et accessibles depuis n'importe quel poste connecté à ton compte.`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.data' },
      label: 'Ouvrir le PIM',
      icon: Database,
    },
    { type: 'mockup', Component: PimGridMock },
    {
      type: 'text',
      md: `_Vue d'une base : chaque ligne est un produit ; l'icône violette signale une fiche enrichie par IA._`,
    },
    {
      type: 'text',
      md: `### Bases de données

Tu peux gérer **plusieurs bases** en parallèle. Trois façons d'en créer une :

- **Importer un fichier** — depuis Excel ou CSV/TSV (voir *Importer Excel*).
- **Scraper le web** — partir d'URLs produits et laisser l'IA remplir les fiches.
- **Créer vide** — démarrer une base à la main.`,
    },
    { type: 'mockup', Component: EnrichmentPanelMock },
    {
      type: 'text',
      md: `### Enrichir une fiche par IA

Clique sur une ligne → panneau **Enrichi par IA** à droite.

**Mode AUTO** (violet) : si la ligne a un \`title\`, \`brand\` ou \`reference\`, une **recherche web (Jina) + LLM** trouve l'URL et extrait les infos (modèle principal : Gemini, secours : Claude). Risque d'hallucination — à privilégier quand tu n'as pas d'URL.

**Mode TEMPLATE** (vert) : si l'URL est connue ET qu'un template de scraping correspond au domaine, l'extraction est **déterministe** (sélecteurs CSS), le LLM ne sert qu'à la rédaction. Précision maximale.

**Astuce** : si ta ligne a **uniquement une URL** (colonne \`url\`, \`URL\`, \`product_url\`…), le pipeline détecte la colonne, associe le template et lance le Mode TEMPLATE — idéal pour traiter 1000 URLs en lot.`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.scraping-templates' },
      label: 'Gérer les templates scraping',
      icon: Sparkles,
    },
    {
      type: 'text',
      md: `### Champs structurés

Au-delà du texte simple, une fiche stocke des champs riches, tous exploitables dans le data-merge :

- **Formules Excel** : évaluées à la volée.
- **Spécifications** : \`[{ group, name, value }]\` (dimensions, matériaux…).
- **Variants** : références produit (ref, label, propriétés).
- **Documents** : liens PDF, fiches techniques, vidéos.
- **Images** : URLs ou fichiers Firebase Storage.`,
    },
    {
      type: 'text',
      md: `### Champs calculés (colonnes formules)

Une colonne peut être une **formule** plutôt qu'une valeur saisie — comme dans Excel. Tu écris une expression qui référence d'autres colonnes, et la valeur se **recalcule à la volée** quand les données changent.

- Exemple : une colonne **\`Prix TTC\`** = \`Prix HT * 1.2\`, ou une **remise** = \`(Prix barré - Prix) / Prix barré\`.
- Les formules supportent les opérateurs arithmétiques, les références de colonnes et les fonctions courantes ; elles sont **réévaluées automatiquement** à chaque modification d'une cellule source ou d'une ligne enrichie par IA.
- Le résultat est un champ **comme un autre** : exploitable dans le *data-merge* (placeholder \`{{ prix_ttc }}\`), filtrable et exportable.
- Types de colonnes reconnus à l'import et à l'édition : **texte, nombre, formule, dictionnaire (liste de valeurs), date** — détectés automatiquement depuis un Excel (voir *Importer Excel*).`,
    },
    {
      type: 'text',
      md: `### Éditer la table comme un tableur

La table produits se manipule directement, sans quitter la page :

- **Éditer une cellule** : un clic sélectionne, un second clic (ou Entrée) passe en édition ; \`Entrée\` valide, \`Échap\` annule. La saisie est adaptée au **type de colonne** (texte, nombre, date, case à cocher…).
- **Rechercher** : la barre de recherche filtre les lignes dont **n'importe quelle valeur** contient le terme.
- **Trier** : clique l'en-tête (ou le menu de colonne) pour basculer **A→Z / Z→A**, puis annuler le tri. Les colonnes numériques proposent aussi un **tri par couleur** (zones bleu → jaune → vert selon la valeur).
- **Ajouter / supprimer une ligne** : bouton « + » en bas de table ; suppression depuis la ligne.
- **Réorganiser les colonnes** : glisse un en-tête, ou via le **menu de colonne** (← / →, première / dernière position), redimensionne par la poignée, **renomme** ou **masque** une colonne.`,
    },
    {
      type: 'text',
      md: `### Types de colonnes (façon Airtable)

Le bouton **« + »** d'en-tête ouvre un sélecteur de **type de champ**, regroupés par catégorie (Texte, Nombre, Choix, Date, Lien, Autre) avec recherche. Au-delà de texte/nombre/formule, tu disposes notamment de :

- **Texte long / Texte riche**, **Téléphone**, **E-mail**, **URL**.
- **Sélection unique / multiple**, **Case à cocher**, **Évaluation** (étoiles), **Pourcentage**, **Devise**.
- **Date**, **Durée**, **Numéro automatique**, **Code-barres**, **Image / pièce jointe**, **Lien vers une autre entrée**.

Le type pilote l'affichage et l'édition de la cellule ; il est aussi **détecté automatiquement** à l'import Excel.`,
    },
    {
      type: 'text',
      md: `### Statistiques de colonne

Sous l'en-tête d'une colonne numérique, des **badges Min / Moyenne / Max** résument les valeurs visibles. Cliquer **Min** trie en croissant, **Max** en décroissant — un coup d'œil suffit pour repérer prix aberrants ou champs vides.`,
    },
    {
      type: 'text',
      md: `### Fraîcheur par champ

Chaque valeur enrichie porte la **date de son dernier changement** (\`updatedAt\` au niveau du champ). En table, une cellule devient **ambre au-delà de 30 jours** et **rouge au-delà de 90 jours** : tu vois d'un coup d'œil quelles données sont périmées et méritent un ré-enrichissement. Re-merger une valeur identique ne rafraîchit PAS l'âge (sinon il ne voudrait rien dire).`,
    },
    {
      type: 'text',
      md: `### Plusieurs sources dans une base

La **colonne latérale gauche** liste les **sources** d'une base (chaque import / scrape / saisie manuelle = une source). Clique une source pour **afficher/masquer ses produits** dans la table ; coche-en plusieurs pour les **fusionner à l'écran**. Chaque source se **renomme** ou se **supprime** d'un clic. Quand des fiches de sources différentes décrivent le même produit (même SKU/EAN), elles sont **fusionnées** en un produit master, et l'aperçu de fusion te montre **champ par champ** ce qui sera appliqué.`,
    },
    {
      type: 'text',
      md: `### Galerie d'images d'une fiche

Dans le panneau de fiche, les images se **réorganisent par glisser-déposer** (la première sert de visuel principal) et se **suppriment** à l'unité. Tu peux **basculer une image entre « Photos » et « Pictos & logos »** d'un clic — utile pour ne garder que les bons visuels avant un data-merge.`,
    },
    {
      type: 'text',
      md: `### Classer & exporter

- Relie une base à une **taxonomie** pour naviguer le catalogue par catégories.
- Une fois les fiches prêtes, le **data-merge** génère un document par produit à partir d'un template (PDF, PNG…).`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.taxonomies' },
      label: 'Ouvrir les Taxonomies',
      icon: FolderTree,
    },
    {
      type: 'text',
      md: `### Vue galerie

Le basculeur **tableau / galerie** (en haut à droite de la table) affiche les produits en **cartes** : visuel (colonne image détectée automatiquement), titre, prix ou marque, et pastille de complétude. Cliquer une carte ouvre la fiche. Le mode choisi est mémorisé.`,
    },
    {
      type: 'text',
      md: `### Complétude des fiches

Chaque ligne de la table porte une **pastille de complétude** : verte (≥ 90 % des colonnes remplies), ambre (≥ 60 %) ou rouge. Survole-la pour voir les **champs manquants**. La barre d'état sous la table affiche la **complétude moyenne** des lignes visibles — pratique pour prioriser l'enrichissement.`,
    },
    {
      type: 'text',
      md: `### Voir aussi

L'**export en série** (data-merge) est détaillé dans la section *Export multi-format*. Le **re-skin d'un visuel** par les produits PIM est décrit dans la section *L'éditeur*.`,
    },
    {
      type: 'menu-link',
      target: { path: '/editor/:id', highlightId: 'editor-header.export' },
      label: 'Export (ouvre un projet d\'abord)',
      icon: Download,
    },
  ],
}
