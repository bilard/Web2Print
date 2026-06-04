import type { TourStep } from './types'
import { navigateTourSection } from './tour.store'

/** Ouvre une section du dashboard avant d'afficher l'étape. */
const openSection = (section: string) => () => navigateTourSection(section)

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
      description:
        'Choisissez un format prédéfini (A4, réseaux sociaux…) ou des dimensions sur mesure, un fond uni / dégradé / image, puis créez la composition vierge.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '[data-tour="section-import"]',
    prepare: openSection('import'),
    requireSelector: '[data-tour="section-import"]',
    popover: {
      title: '2 · Importer',
      description:
        'Partez d’un fichier existant : IDML (InDesign), PowerPoint, Excel (données), image, SVG, ou PDF. Les conversions image/PDF → SVG sont décomposées en éléments éditables.',
      side: 'right',
      align: 'start',
    },
  },
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
      description:
        'Votre bibliothèque d’images : stock, uploads, générations IA (Nano Banana) et assets de marque. Réutilisables directement sur le canvas.',
      side: 'right',
      align: 'center',
    },
  },
  {
    element: '[data-tour="section-data"]',
    prepare: openSection('data'),
    requireSelector: '[data-tour="section-data"]',
    popover: {
      title: '5 · PIM — données produits',
      description:
        'Vos fiches produits en tableau : import Excel, enrichissement IA (scraping d’URL), gestion des colonnes. Ces données alimentent le publipostage dans l’éditeur.',
      side: 'right',
      align: 'center',
    },
  },
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
      description:
        'Automatisez l’enchaînement des modules (scraping → décomposition → export → Drive/Gmail/Telegram), façon Zapier. Génération possible par IA depuis un prompt.',
      side: 'right',
      align: 'center',
    },
  },
  {
    element: '[data-tour="section-telegram"]',
    prepare: openSection('telegram'),
    requireSelector: '[data-tour="section-telegram"]',
    popover: {
      title: '10 · Telegram',
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
      title: '11 · Animation',
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
      title: '12 · Chat IA',
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
      title: '13 · Utilisateurs & rôles',
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
        'Ouvrez un projet pour découvrir l’éditeur, qui a sa propre visite guidée détaillée. Besoin d’aide ? Bouton « ? » en bas à droite, ou la touche « ? ».',
    },
  },
]
