import type { TourStep } from './types'
import { useUIStore } from '@/stores/ui.store'
import { globalFabricCanvas } from '@/features/editor/CanvasContainer'

/** Sélectionne le premier objet éditable du canvas pour peupler le panneau Propriétés. */
function selectFirstObject() {
  const canvas = globalFabricCanvas
  if (!canvas) return
  const obj = canvas.getObjects().find((o) => (o as { selectable?: boolean }).selectable !== false)
  if (obj) {
    canvas.setActiveObject(obj)
    canvas.requestRenderAll()
  }
}

/** Ouvre le stack droit ET sélectionne un objet (Propriétés vide sans sélection). */
const prepareProps = () => {
  useUIStore.getState().setRightPanelOpen(true)
  selectFirstObject()
}

/** Déplie le panneau Animation 3D ET sélectionne un objet (panneau vide sans sélection). */
const prepareAnimPanel = () => {
  const ui = useUIStore.getState()
  ui.setRightPanelOpen(true)
  ui.setRightPanels(ui.rightPanels.map((p) => ({ ...p, collapsed: p.id !== 'animation3d' })))
  selectFirstObject()
}

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
    prepare: prepareProps,
    requireSelector: '[data-tour="properties"]',
    popover: {
      title: 'Propriétés',
      description:
        'Toujours en haut à droite : tous les réglages de l’objet sélectionné (un objet est sélectionné pour la démo). S’adapte au type d’objet. Détaillons chaque section — survolez les « ? » pour l’aide en continu.',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="opt-prop-fill"]',
    prepare: prepareProps,
    requireSelector: '[data-tour="opt-prop-fill"]',
    popover: {
      title: 'Remplissage',
      description: 'Couleur intérieure : aplat, dégradé, image ou transparent. Cliquez la section pour la déplier.',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="opt-prop-stroke"]',
    requireSelector: '[data-tour="opt-prop-stroke"]',
    popover: {
      title: 'Contour',
      description: 'Bordure de l’objet : couleur, épaisseur, style de trait (continu, tirets, points) et angles.',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="opt-prop-opacity"]',
    requireSelector: '[data-tour="opt-prop-opacity"]',
    popover: {
      title: 'Opacité & Fusion',
      description: 'Transparence et mode de fusion (multiplier, écran…) qui définit le mélange avec le dessous.',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="opt-prop-shadow"]',
    requireSelector: '[data-tour="opt-prop-shadow"]',
    popover: {
      title: 'Ombre',
      description: 'Ombre portée : couleur, flou et décalage horizontal/vertical.',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="opt-prop-transform"]',
    requireSelector: '[data-tour="opt-prop-transform"]',
    popover: {
      title: 'Taille & Position',
      description: 'X/Y, largeur/hauteur, rotation, arrondi, verrou de ratio, miroir H/V et verrou de position.',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="opt-prop-arrange"]',
    requireSelector: '[data-tour="opt-prop-arrange"]',
    popover: {
      title: 'Arranger',
      description: 'Ordre de superposition, alignement et répartition sur la page, duplication et suppression.',
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
      description: 'Gérez les pages / plans de travail. Détaillons ses options — survolez les « ? » pour l’aide en continu.',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="opt-page-dims"]',
    prepare: openPanel('page'),
    requireSelector: '[data-tour="opt-page-dims"]',
    popover: {
      title: 'Dimensions',
      description: 'Taille de la page en mm : saisie largeur/hauteur ou format prédéfini (A4, Instagram…).',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="opt-page-bg"]',
    prepare: openPanel('page'),
    requireSelector: '[data-tour="opt-page-bg"]',
    popover: {
      title: 'Arrière-plan',
      description: 'Fond de la page : couleur unie, dégradé paramétrable, ou image verrouillée derrière les objets.',
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
      description: 'Paramètres pour un export prêt à imprimer. Détaillons chaque réglage.',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="opt-print-presets"]',
    prepare: openPanel('print'),
    requireSelector: '[data-tour="opt-print-presets"]',
    popover: {
      title: 'Famille de paramètres',
      description: 'Enregistrez vos réglages d’impression comme preset réutilisable d’un projet à l’autre.',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="opt-print-dpi"]',
    prepare: openPanel('print'),
    requireSelector: '[data-tour="opt-print-dpi"]',
    popover: {
      title: 'Résolution (DPI)',
      description: 'Densité de l’export. 300 DPI = standard offset/impression ; 72 DPI = web.',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="opt-print-bleed"]',
    prepare: openPanel('print'),
    requireSelector: '[data-tour="opt-print-bleed"]',
    popover: {
      title: 'Fond perdu (bleed)',
      description: 'Marge de débord rognée après impression : évite les liserés blancs. 3 mm offset, 5 mm numérique.',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="opt-print-marks"]',
    prepare: openPanel('print'),
    requireSelector: '[data-tour="opt-print-marks"]',
    popover: {
      title: 'Repères d’impression',
      description: 'Traits de coupe, repères de fond perdu et hirondelles (calage des couleurs) pour l’imprimeur.',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="opt-print-safe"]',
    prepare: openPanel('print'),
    requireSelector: '[data-tour="opt-print-safe"]',
    popover: {
      title: 'Zone de sécurité',
      description: 'Marge intérieure où garder le texte et les éléments importants pour ne pas qu’ils soient coupés.',
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
    element: '[data-tour="panel-images"]',
    prepare: openPanel('images'),
    requireSelector: '[data-tour="panel-images"]',
    popover: {
      title: 'Panneau Images',
      description:
        'Surface persistante pour parcourir, générer et insérer des images : banque libre de droits, vos uploads, génération IA, favoris, collections et récents. (L’outil Image de la barre n’est qu’un menu rapide ; ce panneau est l’atelier complet.)',
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
      description: 'Vos couleurs et dégradés de marque. Détaillons ses deux sections.',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="opt-palette-colors"]',
    prepare: openPanel('palette'),
    requireSelector: '[data-tour="opt-palette-colors"]',
    popover: {
      title: 'Couleurs du projet',
      description: 'Vos couleurs de marque enregistrées, réutilisables en un clic. Sauvegardées avec le projet.',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="opt-palette-gradients"]',
    prepare: openPanel('palette'),
    requireSelector: '[data-tour="opt-palette-gradients"]',
    popover: {
      title: 'Dégradés du projet',
      description: 'Vos dégradés enregistrés (linéaires/radiaux), applicables aux objets et aux fonds.',
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
    prepare: prepareAnimPanel,
    requireSelector: '[data-tour="panel-animation3d"]',
    popover: {
      title: 'Panneau Animation 3D',
      description: 'Effets et transformations 3D (un objet est sélectionné pour la démo). Choisissez un preset puis réglez les paramètres.',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="opt-anim-duration"]',
    prepare: prepareAnimPanel,
    requireSelector: '[data-tour="opt-anim-duration"]',
    popover: {
      title: 'Durée par cycle',
      description: 'Temps d’une boucle complète de l’animation, en secondes. Plus court = mouvement plus rapide.',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="opt-anim-intensity"]',
    prepare: prepareAnimPanel,
    requireSelector: '[data-tour="opt-anim-intensity"]',
    popover: {
      title: 'Intensité',
      description: 'Amplitude de l’effet (× le mouvement de base). Plus élevé = animation plus marquée.',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="panel-versions"]',
    prepare: openPanel('versions'),
    requireSelector: '[data-tour="panel-versions"]',
    popover: {
      title: 'Panneau Versions',
      description:
        'Historique du document : créez une version avant un gros changement et restaurez-la en un clic (l’éditeur se recharge). 20 versions manuelles + 10 snapshots automatiques (badge « auto », pris à la sauvegarde, au plus toutes les 10 min).',
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
        'Vous maîtrisez l’éditeur. Astuce : ⌘K (Ctrl+K) ouvre partout la palette pour sauter vers un module ou lancer une action. Relancez cette visite via le bouton 🧭, ou ouvrez l’aide « ? » en bas à droite à tout moment.',
    },
  },
]
