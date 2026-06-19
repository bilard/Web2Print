import type { TourStep } from './types'
import { navigateTourSection } from './tour.store'

/** Ouvre une section du dashboard avant d'afficher l'étape. */
const openSection = (section: string) => () => navigateTourSection(section)

/** Sous-étape « option » : ouvre la section puis surligne une option précise. */
const optStep = (section: string, anchor: string, title: string, description: string): TourStep => ({
  element: `[data-tour="${anchor}"]`,
  prepare: openSection(section),
  requireSelector: `[data-tour="${anchor}"]`,
  popover: { title, description, side: 'right', align: 'start' },
})

/**
 * Tour guidé du tableau de bord (français), navigation automatique.
 * Chaque étape ouvre sa section (`prepare`) puis attend son conteneur
 * (`requireSelector`) avant de surligner. Les sections masquées par
 * permission sont ignorées (bulle centrée — dégradation gracieuse).
 */
export const dashboardTourSteps: TourStep[] = [
  {
    popover: {
      title: 'Bienvenue sur votre tableau de bord 👋',
      description:
        'Visite complète des espaces de travail. Le tour ouvre chaque module pour vous montrer ses options. « Suivant » pour avancer, « Échap » pour quitter.',
    },
  },
  {
    element: '[data-tour="sidebar"]',
    popover: {
      title: 'Menu principal',
      description:
        'Chaque entrée ouvre un grand espace de l’app. Le menu se replie en cliquant sur le logo. Nous allons les parcourir un par un.',
      side: 'right',
      align: 'center',
    },
  },
  {
    element: '[data-tour="section-blank"]',
    prepare: openSection('blank'),
    requireSelector: '[data-tour="section-blank"]',
    popover: {
      title: '1 · Nouveau document',
      description: 'Créez une composition vierge. Détaillons ses options.',
      side: 'right',
      align: 'start',
    },
  },
  optStep('blank', 'opt-newdoc-name', 'Nom du document', 'Le nom du projet, affiché dans la Bibliothèque. Modifiable ensuite.'),
  optStep('blank', 'opt-newdoc-format', 'Format', 'Dimensions : preset (Impression, Écran, Réseaux sociaux) ou taille personnalisée en pixels.'),
  optStep('blank', 'opt-newdoc-bg', 'Arrière-plan', 'Fond initial : couleur unie, dégradé ou image.'),
  {
    element: '[data-tour="section-import"]',
    prepare: openSection('import'),
    requireSelector: '[data-tour="section-import"]',
    popover: {
      title: '2 · Importer',
      description: 'Partez d’un fichier existant. Voici les formats supportés.',
      side: 'right',
      align: 'start',
    },
  },
  optStep('import', 'opt-import-idml', 'Import IDML', 'Projet Adobe InDesign (IDML + PDF + polices) : conserve la mise en page et le texte éditable.'),
  optStep('import', 'opt-import-pptx', 'Importer PPTX', 'Présentation PowerPoint : chaque diapositive devient une page éditable.'),
  optStep('import', 'opt-import-image', 'Importer une image', 'Crée un projet à partir d’une image (PNG, JPG, SVG, WebP).'),
  optStep('import', 'opt-import-svg', 'Importer SVG', 'Vectoriel SVG : chaque forme/texte reste éditable.'),
  optStep('import', 'opt-import-excel', 'Importer Excel', 'Tableau Excel/CSV dans le PIM : alimente le publipostage.'),
  optStep('import', 'opt-import-image-to-svg', 'Image → SVG éditable', 'Image verrouillée en fond + textes détectés (Vision) éditables par-dessus.'),
  optStep('import', 'opt-import-pdf-to-svg', 'PDF → SVG éditable', 'Page 1 du PDF rasterisée en fond + textes éditables en surimpression.'),
  {
    element: '[data-tour="section-library"]',
    prepare: openSection('library'),
    requireSelector: '[data-tour="section-library"]',
    popover: {
      title: '3 · Bibliothèque',
      description:
        'Tous vos projets, en vue vignettes ou liste, filtrables par taxonomie (colonne de gauche). Sélection multiple pour suppression groupée ; cliquez une vignette pour éditer.',
      side: 'right',
      align: 'center',
    },
  },
  {
    element: '[data-tour="section-images"]',
    prepare: openSection('images'),
    requireSelector: '[data-tour="section-images"]',
    popover: {
      title: '4 · DAM — médias',
      description: 'Votre bibliothèque d’images. Parcourons ses rubriques.',
      side: 'right',
      align: 'center',
    },
  },
  optStep('images', 'opt-dam-stock', 'Banque d’images', 'Images libres de droits (Pexels, Unsplash) à insérer sur le canvas.'),
  optStep('images', 'opt-dam-my-images', 'Mes images', 'Vos images uploadées, réutilisables dans tous vos projets.'),
  optStep('images', 'opt-dam-favorites', 'Favoris', 'Les images marquées d’une étoile.'),
  optStep('images', 'opt-dam-collections', 'Collections', 'Vos images regroupées par thème ou campagne.'),
  optStep('images', 'opt-dam-recent', 'Récents', 'Les dernières images utilisées ou ajoutées.'),
  optStep('images', 'opt-dam-projects', 'Projets', 'Les visuels rattachés à chaque projet.'),
  optStep('images', 'opt-dam-generate', 'Création d’image', 'Génération d’images par IA (Image IA) depuis une description.'),
  optStep('images', 'opt-dam-videos', 'Animations HTML', 'Vos animations / vidéos HTML (HyperFrames).'),
  optStep('images', 'opt-dam-gdrive', 'Google Drive', 'Importez des fichiers depuis votre Drive connecté.'),
  {
    element: '[data-tour="section-data"]',
    prepare: openSection('data'),
    requireSelector: '[data-tour="section-data"]',
    popover: {
      title: '5 · PIM — données produits',
      description: 'Vos fiches produits en tableau. Voici les actions principales (sélectionnez d’abord une base à gauche).',
      side: 'right',
      align: 'center',
    },
  },
  optStep('data', 'opt-pim-import', 'Importer un fichier', 'Charge un Excel/CSV dans la base : chaque ligne = une fiche produit.'),
  optStep('data', 'opt-pim-scrape', 'Scraper le web', 'Enrichit les produits depuis des URL (specs, images, descriptions via Jina + IA).'),
  optStep('data', 'opt-pim-create', 'Créer vide', 'Crée un tableau vierge pour saisir des produits ou définir vos colonnes.'),
  {
    element: '[data-tour="section-taxonomies"]',
    prepare: openSection('taxonomies'),
    requireSelector: '[data-tour="section-taxonomies"]',
    popover: {
      title: '6 · Taxonomies',
      description:
        'Arborescence de classification (catégories, gammes…). Reliez-y vos projets pour les filtrer dans la Bibliothèque et structurer vos exports.',
      side: 'right',
      align: 'center',
    },
  },
  {
    element: '[data-tour="section-scraping-templates"]',
    prepare: openSection('scraping-templates'),
    requireSelector: '[data-tour="section-scraping-templates"]',
    popover: {
      title: '7 · Templates scraping',
      description:
        'Définissez les règles d’extraction (sélecteurs, mapping des champs) réutilisées pour enrichir automatiquement vos données produits.',
      side: 'right',
      align: 'center',
    },
  },
  {
    element: '[data-tour="section-scraping-hub"]',
    prepare: openSection('scraping-hub'),
    requireSelector: '[data-tour="section-scraping-hub"]',
    popover: {
      title: '8 · Scraping Hub',
      description:
        'Lancez et suivez les extractions à grande échelle. Centralise les sources, les lots et les résultats du scraping.',
      side: 'right',
      align: 'center',
    },
  },
  {
    element: '[data-tour="section-workflows"]',
    prepare: openSection('workflows'),
    requireSelector: '[data-tour="section-workflows"]',
    popover: {
      title: '9 · Workflows',
      description: 'Automatisez l’enchaînement des modules, façon Zapier.',
      side: 'right',
      align: 'center',
    },
  },
  optStep('workflows', 'opt-wf-title', 'À quoi ça sert', 'Enchaînez scraping → décomposition → export → Drive/Gmail/Telegram. Un workflow peut être généré par IA depuis un prompt, réutilisé via vos modèles enregistrés, et son dernier résultat se consulte sur un écran dédié (tableau, galerie, graphique).'),
  optStep('workflows', 'opt-wf-new', 'Nouveau workflow', 'Crée un workflow vierge et ouvre l’éditeur de graphe (nodes + liens).'),
  {
    element: '[data-tour="section-price-watch"]',
    prepare: openSection('price-watch'),
    requireSelector: '[data-tour="section-price-watch"]',
    popover: {
      title: '10 · Veille tarifaire',
      description:
        'Tableau de bord de vos suivis de prix concurrents : écarts par produit, positionnement et alertes. La collecte (produits en entrée, sites concurrents, champs) se configure dans un workflow, via le node « Veille tarifaire ».',
      side: 'right',
      align: 'center',
    },
  },
  {
    element: '[data-tour="section-telegram"]',
    prepare: openSection('telegram'),
    requireSelector: '[data-tour="section-telegram"]',
    popover: {
      title: '11 · Telegram',
      description:
        'Pilotez l’app depuis un bot Telegram : envoyez une demande, un workflow est généré puis exécuté, et le fichier vous est renvoyé.',
      side: 'right',
      align: 'center',
    },
  },
  {
    element: '[data-tour="section-hyperframes"]',
    prepare: openSection('hyperframes'),
    requireSelector: '[data-tour="section-hyperframes"]',
    popover: {
      title: '12 · Animation',
      description:
        'Créez des vidéos et animations (HyperFrames) : compositions animées, transitions, sous-titres synchronisés.',
      side: 'right',
      align: 'center',
    },
  },
  {
    element: '[data-tour="section-chat"]',
    prepare: openSection('chat'),
    requireSelector: '[data-tour="section-chat"]',
    popover: {
      title: '13 · Chat IA',
      description:
        'Un assistant conversationnel pour interroger vos données, générer du contenu et déclencher des actions dans l’app.',
      side: 'right',
      align: 'center',
    },
  },
  {
    element: '[data-tour="section-access"]',
    prepare: openSection('access'),
    requireSelector: '[data-tour="section-access"]',
    popover: {
      title: '14 · Utilisateurs & rôles',
      description:
        'Administration des accès : approuvez les comptes en attente et attribuez des rôles/permissions par module (réservé aux administrateurs).',
      side: 'right',
      align: 'center',
    },
  },
  {
    element: '[data-tour="user-menu"]',
    prepare: openSection('library'),
    requireSelector: '[data-tour="user-menu"]',
    popover: {
      title: 'Profil & paramètres',
      description:
        'En bas de la barre : votre compte, l’icône ⚙️ ouvre les Réglages (clés IA, intégrations Drive/Telegram, modèles), et la déconnexion.',
      side: 'right',
      align: 'end',
    },
  },
  {
    popover: {
      title: 'À vous de jouer 🎉',
      description:
        'Ouvrez un projet pour découvrir l’éditeur, qui a sa propre visite guidée détaillée. Astuce : ⌘K (Ctrl+K) ouvre partout la palette pour sauter vers un module ou lancer une action. Besoin d’aide ? Bouton « ? » en bas à droite, ou la touche « ? ».',
    },
  },
]
