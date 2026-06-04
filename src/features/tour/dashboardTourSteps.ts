import type { DriveStep } from 'driver.js'

/**
 * Étapes du tour guidé du tableau de bord (français).
 * Cible les ancres `data-help-id="dashboard.sidebar.*"` déjà présentes sur les
 * items de menu, plus deux ancres `data-tour` posées sur la nav et le bloc user.
 * Les items masqués par permissions sont simplement ignorés par driver.js.
 */
export const dashboardTourSteps: DriveStep[] = [
  {
    popover: {
      title: 'Bienvenue sur votre tableau de bord 👋',
      description:
        'Petit tour des espaces de travail. « Suivant » pour avancer, « Échap » pour quitter à tout moment.',
    },
  },
  {
    element: '[data-tour="sidebar"]',
    popover: {
      title: 'Menu principal',
      description:
        'Chaque entrée ouvre un grand espace de l’application. Le menu se replie en cliquant sur le logo en haut.',
      side: 'right',
      align: 'center',
    },
  },
  {
    element: '[data-help-id="dashboard.sidebar.blank"]',
    popover: {
      title: 'Nouveau document',
      description: 'Créez une composition vierge en choisissant son format (print ou présentation).',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '[data-help-id="dashboard.sidebar.import"]',
    popover: {
      title: 'Importer',
      description: 'Partez d’un fichier existant : IDML, PowerPoint, Excel, image, SVG ou PDF.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '[data-help-id="dashboard.sidebar.library"]',
    popover: {
      title: 'Bibliothèque',
      description:
        'Tous vos projets, filtrables par taxonomie. Cliquez une vignette pour ouvrir l’éditeur.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '[data-help-id="dashboard.sidebar.images"]',
    popover: {
      title: 'DAM — vos médias',
      description: 'Bibliothèque d’images : stock, uploads, générations IA et assets de marque.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '[data-help-id="dashboard.sidebar.data"]',
    popover: {
      title: 'PIM — données produits',
      description:
        'Gérez vos fiches produits et enrichissez-les ; ces données alimentent le publipostage dans l’éditeur.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '[data-help-id="dashboard.sidebar.workflows"]',
    popover: {
      title: 'Workflows',
      description:
        'Automatisez l’enchaînement des modules (scraping, décomposition, export, Drive, Telegram…).',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '[data-tour="user-menu"]',
    popover: {
      title: 'Profil & paramètres',
      description: 'Votre compte, l’accès aux réglages (clés IA, intégrations) et la déconnexion.',
      side: 'right',
      align: 'end',
    },
  },
  {
    popover: {
      title: 'À vous de jouer 🎉',
      description:
        'Ouvrez un projet pour découvrir l’éditeur (qui a aussi sa propre visite guidée). Besoin d’aide ? Bouton « ? » en bas à droite, ou la touche « ? ».',
    },
  },
]
