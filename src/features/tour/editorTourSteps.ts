import type { TourStep } from './types'
import { useUIStore } from '@/stores/ui.store'

/**
 * Ouvre le stack de panneaux droits et déplie un panneau précis (les autres
 * sont repliés pour garder la cible visible). Les panneaux ne sont pas lazy ;
 * `requireSelector` garantit néanmoins la présence avant surlignage.
 */
const openPanel = (target: string) => () => {
  const ui = useUIStore.getState()
  ui.setRightPanelOpen(true)
  ui.setRightPanels(ui.rightPanels.map((p) => ({ ...p, collapsed: p.id !== target })))
}

/** Ouvre simplement le stack de panneaux droits (sans toucher aux replis). */
const openRightStack = () => {
  useUIStore.getState().setRightPanelOpen(true)
}

/**
 * Tour guidé de l'éditeur (français), navigation automatique.
 * Parcourt la barre supérieure, chaque outil de création, le canvas, puis
 * chaque panneau de droite (déplié à la volée) et le pied de page.
 */
export const editorTourSteps: TourStep[] = [
  {
    popover: {
      title: 'Bienvenue dans l’éditeur 👋',
      description:
        'Visite détaillée : barre d’outils, plan de travail et tous les panneaux. « Suivant » pour avancer, « Échap » pour quitter à tout moment.',
    },
  },
  {
    element: '[data-tour="header"]',
    popover: {
      title: 'Barre supérieure',
      description:
        'Renommez le projet, suivez son rattachement taxonomique, annulez/rétablissez (⌘Z / ⌘Y) et accédez à l’export.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="save"]',
    popover: {
      title: 'Sauvegarde',
      description:
        'Enregistrement automatique, ou forcé ici (⌘S). La couleur indique l’état : à jour, en cours, ou modifications non sauvegardées.',
      side: 'bottom',
      align: 'end',
    },
  },
  {
    element: '[data-tour="export"]',
    popover: {
      title: 'Export multi-format',
      description:
        'Exportez en PDF, image, PowerPoint… avec les paramètres d’impression (fond perdu, repères de coupe) définis dans le panneau Impression.',
      side: 'bottom',
      align: 'end',
    },
  },
  {
    element: '[data-tour="toolbar"]',
    popover: {
      title: 'Barre d’outils',
      description: 'Les outils de création, du haut vers le bas. Détaillons-les un par un.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '[data-help-id="toolbar.select"]',
    popover: {
      title: 'Sélection (V)',
      description: 'Déplacez, redimensionnez et faites pivoter les objets. L’outil par défaut.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '[data-help-id="toolbar.text"]',
    popover: {
      title: 'Texte (T)',
      description:
        'Ajoute un bloc de texte éditable. Mise en forme via la barre de texte qui apparaît en haut quand un texte est sélectionné.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '[data-help-id="toolbar.rect"]',
    popover: {
      title: 'Formes (R / E / L)',
      description: 'Rectangle, ellipse et ligne. Couleur, contour et coins se règlent dans le panneau Propriétés.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '[data-tour="tool-image"]',
    popover: {
      title: 'Image (I)',
      description: 'Insérez depuis le stock, vos images (DAM), un upload, ou une génération IA.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '[data-tour="canvas"]',
    popover: {
      title: 'Plan de travail',
      description:
        'Votre zone d’édition. Déplacez/redimensionnez les objets, double-cliquez un texte pour l’éditer ; les imports s’affichent ici.',
      side: 'left',
      align: 'center',
    },
  },
  {
    element: '[data-tour="properties"]',
    prepare: openRightStack,
    requireSelector: '[data-tour="properties"]',
    popover: {
      title: 'Propriétés',
      description:
        'Toujours en haut à droite : position, taille, couleurs, opacité, contour… de l’objet sélectionné. S’adapte au type d’objet.',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="panel-page"]',
    prepare: openPanel('page'),
    requireSelector: '[data-tour="panel-page"]',
    popover: {
      title: 'Panneau Page',
      description: 'Gérez les pages / plans de travail : ajout, suppression, format et fond de chaque page.',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="panel-print"]',
    prepare: openPanel('print'),
    requireSelector: '[data-tour="panel-print"]',
    popover: {
      title: 'Panneau Impression',
      description: 'DPI, fond perdu (bleed) et repères de coupe — en dimensions physiques (mm) pour un export prêt à imprimer.',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="panel-data"]',
    prepare: openPanel('data'),
    requireSelector: '[data-tour="panel-data"]',
    popover: {
      title: 'Panneau Données (publipostage)',
      description: 'Liez une source PIM/Excel et associez les champs aux éléments pour générer en masse une variante par ligne.',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="panel-layers"]',
    prepare: openPanel('layers'),
    requireSelector: '[data-tour="panel-layers"]',
    popover: {
      title: 'Panneau Calques',
      description: 'Arborescence des objets : réorganisez l’ordre (glisser-déposer), masquez ou verrouillez chaque calque.',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="panel-palette"]',
    prepare: openPanel('palette'),
    requireSelector: '[data-tour="panel-palette"]',
    popover: {
      title: 'Panneau Palette',
      description: 'Vos couleurs et dégradés de marque, applicables en un clic aux objets sélectionnés.',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="panel-assets"]',
    prepare: openPanel('assets'),
    requireSelector: '[data-tour="panel-assets"]',
    popover: {
      title: 'Panneau Assets',
      description: 'Polices et ressources disponibles pour la composition.',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="panel-animation3d"]',
    prepare: openPanel('animation3d'),
    requireSelector: '[data-tour="panel-animation3d"]',
    popover: {
      title: 'Panneau Animation 3D',
      description: 'Effets et transformations 3D applicables aux objets pour des rendus dynamiques.',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="footer"]',
    popover: {
      title: 'Zoom, pages & repères',
      description: 'Réglez le zoom, naviguez entre les pages, ouvrez les paramètres de page et activez la grille ou le magnétisme (snap).',
      side: 'top',
      align: 'start',
    },
  },
  {
    popover: {
      title: 'C’est tout 🎉',
      description:
        'Vous maîtrisez l’éditeur. Relancez cette visite via le bouton 🧭, ou ouvrez l’aide « ? » en bas à droite à tout moment.',
    },
  },
]
