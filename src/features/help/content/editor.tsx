import {
  Save, Download, Type, Image as ImageIcon, Layers,
  MousePointer2, Square, Circle, Minus,
  Undo2, Redo2, ZoomIn, ZoomOut, Grid3X3, Magnet, Settings2,
} from 'lucide-react'
import type { HelpSection } from './types'
import { ExportButtonMock } from './mockups/ExportButtonMock'
import { ToolBarMock } from './mockups/ToolBarMock'
import { EditorHeaderMock } from './mockups/EditorHeaderMock'
import { EditorFooterMock } from './mockups/EditorFooterMock'
import { LayersPanelMock } from './mockups/LayersPanelMock'

export const editorSection: HelpSection = {
  id: 'editor',
  title: "L'éditeur",
  category: 'Édition',
  intro: 'Canvas, outils, calques et sauvegarde du projet.',
  blocks: [
    {
      type: 'text',
      md: `L'éditeur se compose d'un **header** (titre, sauvegarde, export), d'une **barre d'outils** à gauche, du **canvas** au centre, des **panneaux** à droite (Propriétés, Calques, Palette, Images, Assets, Données, Page, Impression, Versions, Animation 3D) et d'une **barre inférieure** (zoom, taille page, grille, snap).`,
    },
    { type: 'text', md: '### Header' },
    { type: 'mockup', Component: EditorHeaderMock },
    {
      type: 'text',
      md: `Le header affiche le titre du projet et son état de sauvegarde, les boutons **Annuler / Rétablir**, **Sauvegarder** (commit manuel — la sauvegarde est sinon automatique) et **Exporter**.`,
    },
    {
      type: 'menu-link',
      target: { path: '/editor/:id', highlightId: 'editor-header.undo' },
      label: 'Annuler',
      icon: Undo2,
    },
    {
      type: 'menu-link',
      target: { path: '/editor/:id', highlightId: 'editor-header.redo' },
      label: 'Rétablir',
      icon: Redo2,
    },
    {
      type: 'menu-link',
      target: { path: '/editor/:id', highlightId: 'editor-header.save' },
      label: 'Sauvegarder',
      icon: Save,
    },
    {
      type: 'menu-link',
      target: { path: '/editor/:id', highlightId: 'editor-header.export' },
      label: 'Exporter',
      icon: Download,
    },
    { type: 'text', md: '### Barre d\'outils' },
    { type: 'mockup', Component: ToolBarMock },
    {
      type: 'text',
      md: `Les outils de création (Texte, Rectangle, Ellipse, Ligne) ajoutent immédiatement une forme sur le canvas puis reviennent à l'outil Sélection. L'outil **Image** ouvre un petit menu — **Stock images**, **Mes images**, **Uploader** ou **Générer (IA)** — puis le sélecteur d'images correspondant.`,
    },
    {
      type: 'menu-link',
      target: { path: '/editor/:id', highlightId: 'toolbar.select' },
      label: 'Sélection',
      icon: MousePointer2,
    },
    {
      type: 'menu-link',
      target: { path: '/editor/:id', highlightId: 'toolbar.text' },
      label: 'Texte',
      icon: Type,
    },
    {
      type: 'menu-link',
      target: { path: '/editor/:id', highlightId: 'toolbar.rect' },
      label: 'Rectangle',
      icon: Square,
    },
    {
      type: 'menu-link',
      target: { path: '/editor/:id', highlightId: 'toolbar.ellipse' },
      label: 'Ellipse',
      icon: Circle,
    },
    {
      type: 'menu-link',
      target: { path: '/editor/:id', highlightId: 'toolbar.line' },
      label: 'Ligne',
      icon: Minus,
    },
    {
      type: 'menu-link',
      target: { path: '/editor/:id', highlightId: 'toolbar.image' },
      label: 'Image / DAM',
      icon: ImageIcon,
    },
    { type: 'text', md: '### Propriétés des objets' },
    {
      type: 'text',
      md: `Le panneau **Propriétés** (à droite) s'adapte à la sélection :

- **Position / taille / rotation** : valeurs X, Y, L, H et angle éditables au chiffre près.
- **Remplissage** : couleur unie, **dégradé** ou **image** (choisie depuis le DAM : Stock, Mes images, Favoris, Collections, Récents ou génération IA).
- **Contour, opacité, ombre portée** et **coins arrondis** (rectangles).
- **Modes de fusion** : 14 modes (Multiplier, Écran, Superposition, Lumière douce/crue, Différence, Teinte, Saturation, Couleur, Luminosité…).
- **Miroir** horizontal / vertical et **verrou** (cadenas — l'objet ne peut plus être sélectionné ni déplacé).
- **Cadrage image** : pour une image (ou une forme remplie d'image), recadre la zone visible et zoome dans le cadre sans déformer.
- **Texte** : police (les polices du projet sont chargées), taille, gras/italique/souligné, alignement, **interligne**, **espacement des caractères**, couleur — et des **styles par caractère** en édition (sélectionne une portion du texte avant d'appliquer). Le bouton **Ajuster au contenu** recale la largeur du bloc sur le texte.
- **Alignement multi-objets** : six boutons (gauche, centre H, droite, haut, centre V, bas — par rapport à la page) + **distribution** horizontale/verticale pour espacer uniformément 3 objets ou plus.

Pendant les déplacements, des **guides magnétiques** (smart guides) apparaissent : aimantation aux bords/centres de la page et aux autres objets.`,
    },
    { type: 'text', md: '### Calques' },
    { type: 'mockup', Component: LayersPanelMock },
    {
      type: 'text',
      md: `Le panneau **Calques** liste tous les objets du canvas. Tu peux masquer (œil), supprimer (poubelle) ou réordonner un calque par drag-and-drop. Les textes se déplient pour éditer chaque segment séparément.`,
    },
    {
      type: 'menu-link',
      target: { path: '/editor/:id', highlightId: 'layers-panel' },
      label: 'Panneau Calques',
      icon: Layers,
    },
    { type: 'text', md: '### Naviguer dans le canvas' },
    { type: 'mockup', Component: EditorFooterMock },
    {
      type: 'text',
      md: `La barre inférieure pilote la navigation :

- **Zoom** : boutons − / + (pas relatif au zoom courant) ou molette. Plage **1 % → 400 %** — utile pour voir l'ensemble d'un grand format (jusqu'à plusieurs milliers de pixels) ou détailler au pixel près. Clic sur la valeur (ex: \`100%\`) pour revenir à 100 %.
- **Pan** : maintenir **espace** + glisser à la souris.
- **Taille de la page** affichée à côté du zoom — clic ouvre les paramètres de page.
- **Grille** : repère visuel pour aligner.
- **Snap** : aimantation aux objets et à la grille pendant le déplacement.`,
    },
    {
      type: 'menu-link',
      target: { path: '/editor/:id', highlightId: 'editor-footer.zoom-out' },
      label: 'Zoom arrière',
      icon: ZoomOut,
    },
    {
      type: 'menu-link',
      target: { path: '/editor/:id', highlightId: 'editor-footer.zoom-reset' },
      label: 'Zoom 100 %',
    },
    {
      type: 'menu-link',
      target: { path: '/editor/:id', highlightId: 'editor-footer.zoom-in' },
      label: 'Zoom avant',
      icon: ZoomIn,
    },
    {
      type: 'menu-link',
      target: { path: '/editor/:id', highlightId: 'editor-footer.page-settings' },
      label: 'Paramètres de la page',
      icon: Settings2,
    },
    {
      type: 'menu-link',
      target: { path: '/editor/:id', highlightId: 'editor-footer.grid' },
      label: 'Grille',
      icon: Grid3X3,
    },
    {
      type: 'menu-link',
      target: { path: '/editor/:id', highlightId: 'editor-footer.snap' },
      label: 'Snap',
      icon: Magnet,
    },
    { type: 'text', md: '### Les autres panneaux de droite' },
    {
      type: 'accordion',
      items: [
        {
          title: 'Images',
          md: 'Insertion d\'images sans quitter l\'éditeur : onglets **Galerie**, **Upload**, **IA** (génération depuis un prompt, 5 ratios, image-to-image si un objet est sélectionné), **Stock**, **Mes images**, **Favoris**, **Collections**, **Récents** — les mêmes sources que le DAM.',
        },
        {
          title: 'Assets',
          md: 'Les **images et polices du projet** (onglets avec compteurs). Glisse une image sur le canvas, ou utilise les polices importées (IDML) dans tes textes.',
        },
        {
          title: 'Page',
          md: 'Format de page : **presets** (A4/A3/A5, Full HD, 4K, 16:9, post & story Instagram, couverture Facebook) ou dimensions personnalisées en mm. **Fond de page** : couleur unie, dégradé ou image (upload ou glisser-déposer). C\'est aussi ici que se gèrent les pages multiples.',
        },
        {
          title: 'Impression',
          md: 'Tout le pré-presse : **DPI**, **fond perdu** (bleed), **traits de coupe** (longueur 2–10 mm, décalage 0–3 mm, épaisseur, couleur), **hirondelles de repérage** (registration marks), **zone de sécurité** (marge, pointillés paramétrables) et la section **Preflight** (voir plus bas).',
        },
        {
          title: 'Animation 3D',
          md: 'Applique des **animations 3D** à un objet (flip 3D, relief, particules…) via des presets, avec lecture/arrêt et **enregistrement vidéo** (export MP4/WebM) du rendu animé.',
        },
        {
          title: 'Palette · Données · Versions',
          md: 'Détaillés dans leurs sections dédiées plus bas (kit de marque & styles d\'objets, re-skin PIM / publipostage, snapshots).',
        },
      ],
    },
    { type: 'text', md: '### Menu contextuel (clic droit)' },
    {
      type: 'text',
      md: `Le **clic droit** sur un objet ouvre un menu rapide : dupliquer, ordre d'empilement, grouper/dégrouper, **miroir H/V**, verrouiller, supprimer — et sur un document multi-pages, **« Répéter sur toutes les pages »** / **« Retirer des autres pages »** (éléments maîtres, voir plus bas).`,
    },
    { type: 'text', md: '### Barre contextuelle & repères de manipulation' },
    {
      type: 'text',
      md: `Sélectionner un objet fait apparaître une **barre flottante sous la sélection** avec les actions fréquentes : dupliquer, avancer/reculer d'un plan, grouper/dégrouper, verrouiller, supprimer — sans aller-retour vers le panneau de droite.

Pendant une manipulation, un **badge temps réel** remplace la barre : position **X, Y** pendant un déplacement, **L × H** pendant un redimensionnement, **angle** pendant une rotation.`,
    },
    { type: 'text', md: '### Preflight d\'impression' },
    {
      type: 'text',
      md: `Dans le panneau **Impression**, la section **Preflight** (bouton _Analyser_) contrôle le document avant export :

- images sous **150 DPI effectifs** (erreur) ou 225 DPI (avertissement) ;
- objets débordant de la page **au-delà du fond perdu**, ou entièrement hors page ;
- textes **< 5 pt** ou à moins de **3 mm du bord de coupe**.

Cliquer un problème **sélectionne l'objet** concerné sur le canvas.`,
    },
    { type: 'text', md: '### Re-skin par les données PIM' },
    {
      type: 'text',
      md: `Le panneau **Données** accepte la source **« Produits PIM (re-skin) »** : chaque produit du projet devient une ligne. Décompose un flyer (Image/PDF → SVG), pose des \`{{champ}}\` sur les textes (ou des liaisons image), puis **navigue de produit en produit** : le visuel se re-skinne instantanément avec les données du produit courant.

Sur un flyer décomposé, la section **« Fond IA (Nano Banana) »** du même panneau **régénère le fond verrouillé** à partir d'un prompt (le fond actuel sert de référence) — vos textes et images liés restent éditables au-dessus. Nécessite une clé Gemini.

Le bouton **« Lier automatiquement »** détecte le **prix** (motif monétaire le plus gros), le **titre** (plus grande taille restante) et la **description** (texte long) puis pose les \`{{champs}}\` correspondants en un clic.

Bon à savoir, côté publipostage : les liaisons acceptent des **formules** (syntaxe \`[colonne]\` combinable, ex. \`[prix] € TTC\`), les **flèches ◀ ▶** parcourent les lignes de la source (le canvas se met à jour), le bouton **rafraîchir** recharge la source si elle a changé, et un badge **IDML** signale qu'une source IDML est branchée (export multi-produits).`,
    },
    { type: 'text', md: '### Éléments maîtres & kit de marque' },
    {
      type: 'text',
      md: `- **Répéter sur toutes les pages** (clic droit sur un objet) : l'élément (logo, pagination, mentions…) est copié sur chaque page du document ; ré-appliquer **resynchronise** position et style partout. « Retirer des autres pages » supprime les copies. Les pages jamais ouvertes doivent être visitées une fois d'abord.
- **Kit de marque (global)** : en tête du panneau **Palette**, vos couleurs de marque sont partagées entre **tous vos projets** — « Vers le projet » les importe dans la palette courante, « Depuis le projet » capture la palette dans le kit.
- **Styles d'objets (global)** : dans le panneau **Palette**, capturez le style d'un objet (couleurs, contour, opacité, typo) et ré-appliquez-le en un clic sur n'importe quelle sélection, dans tous vos projets.`,
    },
    { type: 'text', md: '### Versions du document' },
    {
      type: 'text',
      md: `Le panneau **Versions** garde des **snapshots** du document (miniature + horodatage, 20 max). Créez une version avant un gros changement ; **Restaurer** ré-écrit le contenu puis recharge l'éditeur. Pensez à créer une version de l'état actuel avant de restaurer une ancienne.`,
    },
    { type: 'text', md: '### Sauvegarder & exporter' },
    {
      type: 'text',
      md: `La sauvegarde est **automatique** mais le bouton Sauvegarder permet un commit manuel. Le bouton Exporter (voir _Header_ plus haut) ouvre la fenêtre de choix de format (PDF, IDML, PPTX, SVG, PNG, HTML) — détaillée dans la section _Export multi-format_.`,
    },
    { type: 'mockup', Component: ExportButtonMock },
    { type: 'text', md: '### Raccourcis de l\'éditeur' },
    { type: 'shortcut', keys: ['V'], label: 'Outil Sélection' },
    { type: 'shortcut', keys: ['T'], label: 'Outil Texte' },
    { type: 'shortcut', keys: ['R'], label: 'Outil Rectangle' },
    { type: 'shortcut', keys: ['E'], label: 'Outil Ellipse' },
    { type: 'shortcut', keys: ['L'], label: 'Outil Ligne' },
    { type: 'shortcut', keys: ['I'], label: 'Outil Image / DAM' },
    { type: 'shortcut', keys: ['Espace', '⇧ Glisser'], label: 'Pan du canvas' },
    { type: 'shortcut', keys: ['⌘', '0'], label: 'Zoom 100 %' },
    { type: 'shortcut', keys: ['⌘', 'S'], label: 'Sauvegarder (commit manuel)' },
    { type: 'shortcut', keys: ['⌘', 'Z'], label: 'Annuler' },
    { type: 'shortcut', keys: ['⌘', 'Y'], label: 'Rétablir' },
    { type: 'shortcut', keys: ['⌘', 'A'], label: 'Tout sélectionner' },
    { type: 'shortcut', keys: ['⌘', 'D'], label: 'Dupliquer la sélection' },
    { type: 'shortcut', keys: ['⌘', 'G'], label: 'Grouper' },
    { type: 'shortcut', keys: ['⌘', '⇧', 'G'], label: 'Dégrouper' },
    { type: 'shortcut', keys: ['⌘', ']'], label: 'Avancer d\'un plan' },
    { type: 'shortcut', keys: ['⌘', '['], label: 'Reculer d\'un plan' },
    { type: 'shortcut', keys: ['⌘', '⇧', ']'], label: 'Premier plan' },
    { type: 'shortcut', keys: ['⌘', '⇧', '['], label: 'Arrière-plan' },
    { type: 'shortcut', keys: ['←↑→↓'], label: 'Déplacer de 1 px (⇧ : 10 px)' },
    { type: 'shortcut', keys: ['Suppr'], label: 'Supprimer la sélection' },
    { type: 'shortcut', keys: ['Échap'], label: 'Désélectionner' },
    { type: 'shortcut', keys: ['⌘', '↵'], label: 'Ajouter une page' },
  ],
}
