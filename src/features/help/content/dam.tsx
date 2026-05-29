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
    { type: 'text', md: `### Les onglets

Clique un onglet pour l'**ouvrir directement** dans le DAM.` },
    {
      type: 'accordion',
      items: [
        { title: 'Banque d\'images', md: 'Recherche dans **Pexels & Unsplash** (millions de photos libres de droits) avec filtres source / orientation / couleur.', target: { path: '/dashboard', highlightId: 'dashboard.sidebar.images', damTab: 'stock' } },
        { title: 'Mes images', md: 'Tes images **sauvegardées** — depuis la banque ou issues de la génération IA.', target: { path: '/dashboard', highlightId: 'dashboard.sidebar.images', damTab: 'my-images' } },
        { title: 'Favoris', md: 'Les images que tu as marquées d\'un **♥** pour un accès rapide.', target: { path: '/dashboard', highlightId: 'dashboard.sidebar.images', damTab: 'favorites' } },
        { title: 'Collections', md: 'Des **dossiers d\'organisation** que tu crées et remplis toi-même.', target: { path: '/dashboard', highlightId: 'dashboard.sidebar.images', damTab: 'collections' } },
        { title: 'Récents', md: 'Les **derniers ajouts**, triés par date.', target: { path: '/dashboard', highlightId: 'dashboard.sidebar.images', damTab: 'recent' } },
        { title: 'Projets', md: 'Les **images et les polices** du projet courant, prêtes à glisser sur le canvas.', target: { path: '/dashboard', highlightId: 'dashboard.sidebar.images', damTab: 'projects' } },
        { title: 'Création d\'image', md: 'Génération d\'images par IA (**Gemini / Nano Banana 2**) — voir le détail des paramètres plus bas.', target: { path: '/dashboard', highlightId: 'dashboard.sidebar.images', damTab: 'generate' } },
        { title: 'Animations HTML', md: 'Tes **compositions vidéo** (HyperFrames).', target: { path: '/dashboard', highlightId: 'dashboard.sidebar.images', damTab: 'videos' } },
        { title: 'Google Drive', md: 'Accès à tes **fichiers Google Drive** une fois ton compte connecté.', target: { path: '/dashboard', highlightId: 'dashboard.sidebar.images', damTab: 'gdrive' } },
      ],
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

Onglet **Création d'image** — moteur **Nano Banana 2** (Gemini 3.1 image, texte → image). Déplie chaque paramètre :`,
    },
    {
      type: 'accordion',
      items: [
        {
          title: 'Prompt (+ Améliorer / Avec questions)',
          md:
            'Décris l\'image à générer. Tu peux **coller une image** dans le champ : elle rejoint les *fichiers de référence*. Deux assistants :\n\n' +
            '- **« Améliorer »** — réécrit ton prompt en **une passe** (sujet, style, composition, éclairage, qualité), en tenant compte des références.\n' +
            '- **« Avec questions »** — l\'IA pose **3 à 6 questions ciblées** (environnement, éclairage, mise en page, ambiance…) ; tes réponses affinent le prompt. Utile quand le brief est flou.',
        },
        {
          title: 'Fichiers de référence',
          md:
            'Bouton **« Ajouter des fichiers »** (ou colle une image). **Tous formats** : images, logos, **PDF**, **SVG** (rastérisé en PNG, **plafonné à 2048 px**). Les références sont **transmises telles quelles** à Nano Banana 2 qui les **voit** : il préserve leur structure et n\'applique que les changements demandés (branding, texte, décor). Vignette + **✕** pour retirer.',
        },
        {
          title: 'Format de sortie',
          md:
            '- **Images & texte** _(défaut)_ : image **+ texte** — le modèle peut commenter brièvement.\n' +
            '- **Images seul.** : **image uniquement** — force la sortie visuelle et empêche le modèle de répondre en mode conversationnel (utile s\'il « parle » au lieu de générer).',
        },
        {
          title: 'Température (0 → 2, défaut 1,0)',
          md:
            'Curseur, pas de 0,1. Règle la créativité :\n\n' +
            '- **0 — Précis** : déterministe, fidèle au prompt/références.\n' +
            '- **2 — Créatif** : plus de liberté et de variation.\n\n' +
            'Reproduire une référence → baisse vers 0 ; explorer → monte vers 2.',
        },
        {
          title: 'Ratio (format)',
          md:
            '`Auto` · `1:1` · `16:9` · `9:16` · `4:3` · `3:4`.\n\n' +
            '- **Auto** _(défaut)_ : le modèle choisit le cadrage adapté au prompt/références (aucune contrainte envoyée).\n' +
            '- Les autres **imposent** le rapport : `1:1` carré (réseaux), `16:9` / `4:3` paysage, `9:16` / `3:4` portrait.',
        },
        {
          title: 'Résolution (1K / 2K / 4K)',
          md: '`1K` _(défaut)_ · `2K` · `4K`. Définition du visuel. ⚠️ **2K et 4K sont 2 à 3× plus lents** — réserve-les au rendu final, reste en 1K pour itérer.',
        },
        {
          title: 'Nombre d\'images (1 / 2 / 4)',
          md: '`1` _(défaut)_ · `2` · `4`. Génère **N variations** en parallèle du même prompt — pour comparer plusieurs propositions d\'un coup.',
        },
        {
          title: 'Générer & actions sur les résultats',
          md:
            'Bouton **« Générer »**. Pour chaque image :\n\n' +
            '- **Télécharger** — PNG en local.\n' +
            '- **Sauvegarder** — vers **« Mes images »** (prompt d\'origine, prompt amélioré et Q/R conservés en métadonnées).\n' +
            '- **Insérer dans l\'éditeur** — place l\'image dans le projet ouvert.\n\n' +
            '**Réinitialiser / Effacer** vide les résultats. Idéal pour visuels d\'ambiance, mockups, illustrations ; pour de **vraies photos produit**, privilégie la banque ou le scraping.',
        },
      ],
    },
    {
      type: 'text',
      md: `### Visualiser & éditer une image

Un clic ouvre la **visionneuse** (lightbox). Outils d'édition non destructive :`,
    },
    {
      type: 'accordion',
      items: [
        { title: 'Zoom · Rotation · Miroir', md: '**Zoom** avant/arrière + ajustement, **Rotation** par 90°, **Miroir** horizontal et vertical.' },
        { title: 'Recadrage (crop)', md: 'Masque interactif à **8 poignées**, grille des **tiers**, **contraintes de ratio** (1:1, 4:3, 16:9…).' },
        { title: 'Colorimétrie', md: 'Sliders **Luminosité**, **Contraste**, **Saturation**, **Teinte** (rendu via filtre CSS, non destructif).' },
        { title: 'Export', md: 'Formats **PNG / JPEG / WebP**, avec réglage de **qualité** (JPEG/WebP) et d\'**échelle** (% de la résolution native).' },
        { title: 'Réinitialiser', md: 'Annule **toutes** les retouches et revient à l\'image d\'origine.' },
      ],
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
