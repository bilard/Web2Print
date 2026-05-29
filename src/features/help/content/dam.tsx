import { Image } from 'lucide-react'
import type { HelpSection } from './types'
import { DamGridMock } from './mockups/DamGridMock'

export const damSection: HelpSection = {
  id: 'dam',
  title: 'Bibliothèque d\'assets (DAM)',
  category: 'Édition',
  intro: 'Banque d\'images, génération IA, édition, variantes et organisation des visuels.',
  blocks: [
    {
      type: 'text',
      md: `Le DAM (Digital Asset Management) centralise tous tes visuels — photos de banque, images générées par IA, assets de projet — accessibles directement depuis l'éditeur. Il s'ouvre via l'onglet **DAM** du menu latéral.`,
    },
    { type: 'mockup', Component: DamGridMock },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.images' },
      label: 'Ouvrir le DAM',
      icon: Image,
    },
    {
      type: 'text',
      md: `### Les onglets

| Onglet | Contenu |
|---|---|
| **Banque d'images** | Recherche dans Pexels & Unsplash (millions de photos libres) |
| **Mes images** | Tes images sauvegardées (depuis la banque ou générées) |
| **Favoris** | Images marquées d'un ♥ |
| **Collections** | Dossiers d'organisation que tu crées |
| **Récents** | Derniers ajouts |
| **Projets** | Images **et polices** du projet courant |
| **Création d'image** | Génération IA (Gemini / Nano Banana 2) |
| **Animations HTML** | Tes compositions vidéo (HyperFrames) |
| **Google Drive** | Accès à tes fichiers Drive (après connexion) |`,
    },
    {
      type: 'text',
      md: `### Rechercher des images

- **Par texte** : barre de recherche avec **autocomplétion** et historique des recherches récentes.
- **Par image** (recherche inversée) : bouton **caméra** → choisis une image locale → le DAM trouve des visuels **similaires** dans la banque.
- **Filtres combinables** (volet de gauche) : **Source** (Toutes / Pexels / Unsplash), **Orientation** (Paysage / Portrait / Carré), **Couleur dominante** (palette de 10 teintes).`,
    },
    {
      type: 'text',
      md: `### Créer une image par IA

Onglet **Création d'image** — moteur **Nano Banana 2** (Gemini 3.1 image, texte → image). Voici chaque paramètre du panneau, en détail.`,
    },
    {
      type: 'text',
      md: `#### Prompt

Zone de description de l'image à générer. Tu peux **coller une image** directement dans le champ : elle est alors ajoutée aux *fichiers de référence*. Deux assistants au-dessus du champ :

- **« Améliorer »** — réécrit ton prompt en **une passe** en un prompt optimisé pour Nano Banana 2 (sujet, style, composition, éclairage, qualité), en tenant compte des images de référence.
- **« Avec questions »** — l'IA te pose **3 à 6 questions ciblées** (environnement, éclairage, mise en page, ambiance…) avec des choix proposés ; tes réponses sont intégrées dans un prompt affiné. Plus précis quand ton brief est encore flou.`,
    },
    {
      type: 'text',
      md: `#### Fichiers de référence

Bouton **« Ajouter des fichiers »** (ou colle une image dans le prompt). **Tous formats acceptés** : images, logos, **PDF**, **SVG** (rastérisé en PNG côté navigateur, **plafonné à 2048 px**). Les références sont **transmises telles quelles** à Nano Banana 2, qui les **voit** directement : il préserve leur structure/géométrie et n'applique que les changements demandés (branding, texte, décor). Chaque référence s'affiche en vignette ; bouton **✕** pour la retirer.`,
    },
    {
      type: 'text',
      md: `#### Format de sortie

| Option | Effet |
|---|---|
| **Images & texte** _(défaut)_ | Demande au modèle **image + texte** : il peut accompagner l'image d'un court commentaire. |
| **Images seul.** | **Image uniquement** — force la sortie visuelle et empêche le modèle de répondre en mode conversationnel (utile s'il « parle » au lieu de générer). |`,
    },
    {
      type: 'text',
      md: `#### Température

Curseur **0 → 2** (pas de 0,1 ; **défaut 1,0**). Règle la créativité :

- **0 — Précis** : déterministe, fidèle au prompt et aux références, peu de variation.
- **2 — Créatif** : plus de liberté et de surprise, interprétation plus large.

Pour reproduire fidèlement une référence, baisse vers 0 ; pour explorer des idées, monte vers 2.`,
    },
    {
      type: 'text',
      md: `#### Ratio (format)

\`Auto\` · \`1:1\` · \`16:9\` · \`9:16\` · \`4:3\` · \`3:4\`.

- **Auto** _(défaut)_ : le modèle choisit le cadrage le plus adapté au prompt / aux références (aucune contrainte envoyée).
- Les autres valeurs **imposent** le rapport largeur/hauteur : \`1:1\` carré (réseaux), \`16:9\` / \`4:3\` paysage, \`9:16\` / \`3:4\` portrait.`,
    },
    {
      type: 'text',
      md: `#### Résolution

\`1K\` _(défaut)_ · \`2K\` · \`4K\`. Définition du visuel généré. ⚠️ **2K et 4K sont 2 à 3× plus lents** — réserve-les au rendu final ; reste en 1K pour itérer rapidement.`,
    },
    {
      type: 'text',
      md: `#### Nombre d'images

\`1\` _(défaut)_ · \`2\` · \`4\`. Génère **N variations** en parallèle à partir du même prompt — pratique pour comparer plusieurs propositions d'un coup.`,
    },
    {
      type: 'text',
      md: `#### Générer & résultats

Bouton **« Générer »**. Pour chaque image produite :

- **Télécharger** — enregistre le PNG en local.
- **Sauvegarder** — ajoute à **« Mes images »** (avec prompt d'origine, prompt amélioré et Q/R conservés en métadonnées).
- **Insérer dans l'éditeur** — place l'image dans le projet ouvert.

Bouton **Réinitialiser / Effacer** pour vider les résultats. Idéal pour : visuels d'ambiance, mockups, illustrations. Pour de **vraies photos produit**, privilégie la banque d'images ou le scraping.`,
    },
    {
      type: 'text',
      md: `### Visualiser & éditer une image

Un clic ouvre la **visionneuse** (lightbox) avec une barre d'outils d'édition non destructive :

- **Zoom**, **Rotation** (90°), **Miroir** horizontal / vertical.
- **Recadrage (crop)** : masque interactif à 8 poignées, grille des tiers, contraintes de ratio.
- **Colorimétrie** : sliders **Luminosité**, **Contraste**, **Saturation**, **Teinte**.
- **Export** : **PNG / JPEG / WebP**, avec réglage de **qualité** et d'**échelle**.
- **Réinitialiser** pour annuler toutes les retouches.`,
    },
    {
      type: 'text',
      md: `### Variantes

Sauvegarde une retouche (crop + colorimétrie + miroir + rotation) comme **variante nommée** d'une image, sans toucher l'originale :

- **Enregistrer variante** → donne-lui un nom.
- **Charger / Mettre à jour / Renommer / Supprimer** depuis le panneau **Versions**.
- L'original reste accessible (★ Original). Pratique pour décliner un même visuel (cadrage carré pour réseaux, 16:9 pour bannière…).`,
    },
    {
      type: 'text',
      md: `### Analyse IA d'une image

Dans la visionneuse, onglet **Analyse IA** → bouton **« Analyser avec IA »**. L'IA renvoie : **sujet**, description, **marques** identifiées, **texte détecté (OCR)**, ambiance / style / composition / éclairage, objets, **tags de recherche** et **palette de couleurs**. Utile pour retrouver/classer un visuel.`,
    },
    {
      type: 'text',
      md: `### Organiser

- **Favoris** (♥) : accès rapide.
- **Collections** : crée des dossiers, ajoute/retire des images, vue vignettes ou liste.
- **Projets** : retrouve les images **et les polices** d'un projet.
- **Supprimer** une image sauvegardée la retire **en cascade** (variantes, collections, favoris).`,
    },
    {
      type: 'text',
      md: `### Utiliser une image dans l'éditeur

- **Clic** : insère l'image au centre du canvas (mise à l'échelle automatique).
- **Glisser-déposer** : depuis la grille vers le canvas.
- **Remplacer** : en mode sélection d'objet, double-clic remplace l'objet visé (l'image épouse son cadre, l'historique des sources est conservé).`,
    },
    {
      type: 'text',
      md: `### Sources externes

- **Pexels & Unsplash** : banque intégrée (recherche + filtres).
- **Google Drive** : connecte ton compte (onglet Google Drive) pour piocher dans tes fichiers.

_Note : le DAM n'a pas d'upload « bibliothèque » classique — tes images entrent via la banque, la génération IA, les assets de projet ou Drive. Les fichiers locaux servent de **référence** pour la génération ou de cible pour la **recherche par image**._`,
    },
  ],
}
