import type { DriveStep } from 'driver.js'

/**
 * Étapes du tour guidé de l'Éditeur (français).
 * Les `element` ciblent des ancres `data-tour="…"` posées sur les grandes
 * régions de l'interface ; une étape sans `element` s'affiche centrée (intro/outro).
 */
export const editorTourSteps: DriveStep[] = [
  {
    popover: {
      title: 'Bienvenue dans l’éditeur 👋',
      description:
        'Visite rapide des zones principales. Utilisez « Suivant » pour avancer, ou « Échap » pour quitter à tout moment.',
    },
  },
  {
    element: '[data-tour="header"]',
    popover: {
      title: 'Barre supérieure',
      description:
        'Renommez le projet, suivez son rattachement taxonomique, annulez/rétablissez vos actions et gérez l’export.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="save"]',
    popover: {
      title: 'Sauvegarde',
      description:
        'L’enregistrement est automatique, mais vous pouvez forcer une sauvegarde ici (⌘S). La couleur indique l’état du document.',
      side: 'bottom',
      align: 'end',
    },
  },
  {
    element: '[data-tour="export"]',
    popover: {
      title: 'Export multi-format',
      description:
        'Exportez votre composition en PDF, image, PowerPoint, etc. avec les paramètres d’impression (fond perdu, repères de coupe).',
      side: 'bottom',
      align: 'end',
    },
  },
  {
    element: '[data-tour="toolbar"]',
    popover: {
      title: 'Outils de création',
      description:
        'Sélection, texte, formes (rectangle, ellipse, ligne) et insertion d’images (stock, DAM, upload ou génération IA).',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '[data-tour="canvas"]',
    popover: {
      title: 'Plan de travail',
      description:
        'Votre zone d’édition. Déplacez, redimensionnez et stylez les objets directement ; les imports PDF/IDML/SVG s’y affichent.',
      side: 'left',
      align: 'center',
    },
  },
  {
    element: '[data-tour="right-panel"]',
    popover: {
      title: 'Panneaux latéraux',
      description:
        'Propriétés de l’objet sélectionné, calques, pages, palette, impression… Réorganisables par glisser-déposer.',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="footer"]',
    popover: {
      title: 'Zoom, pages & repères',
      description:
        'Réglez le zoom, naviguez entre les pages, ouvrez les paramètres de la page et activez la grille ou le magnétisme.',
      side: 'top',
      align: 'start',
    },
  },
  {
    popover: {
      title: 'C’est tout pour l’essentiel 🎉',
      description:
        'Besoin d’aide à tout moment ? Cliquez sur le bouton « ? » en bas à droite ou appuyez sur la touche « ? ».',
    },
  },
]
