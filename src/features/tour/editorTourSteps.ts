import type { TourStep } from './types'
import { useUIStore } from '@/stores/ui.store'
import { globalFabricCanvas } from '@/features/editor/globalCanvas'
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
      titleKey: 'tour.ed.0.title',
      descriptionKey: 'tour.ed.0.desc',
    },
  },
  {
    element: '[data-tour="header"]',
    popover: {
      titleKey: 'tour.ed.1.title',
      descriptionKey: 'tour.ed.1.desc',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="save"]',
    popover: {
      titleKey: 'tour.ed.2.title',
      descriptionKey: 'tour.ed.2.desc',
      side: 'bottom',
      align: 'end',
    },
  },
  {
    element: '[data-tour="export"]',
    popover: {
      titleKey: 'tour.ed.3.title',
      descriptionKey: 'tour.ed.3.desc',
      side: 'bottom',
      align: 'end',
    },
  },
  {
    element: '[data-tour="video-ai"]',
    popover: {
      titleKey: 'tour.ed.4.title',
      descriptionKey: 'tour.ed.4.desc',
      side: 'bottom',
      align: 'end',
    },
  },
  {
    element: '[data-tour="toolbar"]',
    popover: {
      titleKey: 'tour.ed.5.title',
      descriptionKey: 'tour.ed.5.desc',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '[data-help-id="toolbar.select"]',
    popover: {
      titleKey: 'tour.ed.6.title',
      descriptionKey: 'tour.ed.6.desc',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '[data-help-id="toolbar.text"]',
    popover: {
      titleKey: 'tour.ed.7.title',
      descriptionKey: 'tour.ed.7.desc',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '[data-help-id="toolbar.rect"]',
    popover: {
      titleKey: 'tour.ed.8.title',
      descriptionKey: 'tour.ed.8.desc',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '[data-tour="tool-image"]',
    popover: {
      titleKey: 'tour.ed.9.title',
      descriptionKey: 'tour.ed.9.desc',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '[data-tour="canvas"]',
    popover: {
      titleKey: 'tour.ed.10.title',
      descriptionKey: 'tour.ed.10.desc',
      side: 'left',
      align: 'center',
    },
  },
  {
    element: '[data-tour="properties"]',
    prepare: prepareProps,
    requireSelector: '[data-tour="properties"]',
    popover: {
      titleKey: 'tour.ed.11.title',
      descriptionKey: 'tour.ed.11.desc',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="opt-prop-fill"]',
    prepare: prepareProps,
    requireSelector: '[data-tour="opt-prop-fill"]',
    popover: {
      titleKey: 'tour.ed.12.title',
      descriptionKey: 'tour.ed.12.desc',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="opt-prop-stroke"]',
    requireSelector: '[data-tour="opt-prop-stroke"]',
    popover: {
      titleKey: 'tour.ed.13.title',
      descriptionKey: 'tour.ed.13.desc',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="opt-prop-opacity"]',
    requireSelector: '[data-tour="opt-prop-opacity"]',
    popover: {
      titleKey: 'tour.ed.14.title',
      descriptionKey: 'tour.ed.14.desc',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="opt-prop-shadow"]',
    requireSelector: '[data-tour="opt-prop-shadow"]',
    popover: {
      titleKey: 'tour.ed.15.title',
      descriptionKey: 'tour.ed.15.desc',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="opt-prop-transform"]',
    requireSelector: '[data-tour="opt-prop-transform"]',
    popover: {
      titleKey: 'tour.ed.16.title',
      descriptionKey: 'tour.ed.16.desc',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="opt-prop-conditional"]',
    prepare: prepareProps,
    requireSelector: '[data-tour="opt-prop-conditional"]',
    popover: {
      titleKey: 'tour.ed.17.title',
      descriptionKey: 'tour.ed.17.desc',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="opt-prop-arrange"]',
    requireSelector: '[data-tour="opt-prop-arrange"]',
    popover: {
      titleKey: 'tour.ed.18.title',
      descriptionKey: 'tour.ed.18.desc',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="panel-page"]',
    prepare: openPanel('page'),
    requireSelector: '[data-tour="panel-page"]',
    popover: {
      titleKey: 'tour.ed.19.title',
      descriptionKey: 'tour.ed.19.desc',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="opt-page-dims"]',
    prepare: openPanel('page'),
    requireSelector: '[data-tour="opt-page-dims"]',
    popover: {
      titleKey: 'tour.ed.20.title',
      descriptionKey: 'tour.ed.20.desc',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="opt-page-bg"]',
    prepare: openPanel('page'),
    requireSelector: '[data-tour="opt-page-bg"]',
    popover: {
      titleKey: 'tour.ed.21.title',
      descriptionKey: 'tour.ed.21.desc',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="panel-print"]',
    prepare: openPanel('print'),
    requireSelector: '[data-tour="panel-print"]',
    popover: {
      titleKey: 'tour.ed.22.title',
      descriptionKey: 'tour.ed.22.desc',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="opt-print-presets"]',
    prepare: openPanel('print'),
    requireSelector: '[data-tour="opt-print-presets"]',
    popover: {
      titleKey: 'tour.ed.23.title',
      descriptionKey: 'tour.ed.23.desc',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="opt-print-dpi"]',
    prepare: openPanel('print'),
    requireSelector: '[data-tour="opt-print-dpi"]',
    popover: {
      titleKey: 'tour.ed.24.title',
      descriptionKey: 'tour.ed.24.desc',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="opt-print-bleed"]',
    prepare: openPanel('print'),
    requireSelector: '[data-tour="opt-print-bleed"]',
    popover: {
      titleKey: 'tour.ed.25.title',
      descriptionKey: 'tour.ed.25.desc',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="opt-print-marks"]',
    prepare: openPanel('print'),
    requireSelector: '[data-tour="opt-print-marks"]',
    popover: {
      titleKey: 'tour.ed.26.title',
      descriptionKey: 'tour.ed.26.desc',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="opt-print-safe"]',
    prepare: openPanel('print'),
    requireSelector: '[data-tour="opt-print-safe"]',
    popover: {
      titleKey: 'tour.ed.27.title',
      descriptionKey: 'tour.ed.27.desc',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="panel-data"]',
    prepare: openPanel('data'),
    requireSelector: '[data-tour="panel-data"]',
    popover: {
      titleKey: 'tour.ed.28.title',
      descriptionKey: 'tour.ed.28.desc',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="panel-layers"]',
    prepare: openPanel('layers'),
    requireSelector: '[data-tour="panel-layers"]',
    popover: {
      titleKey: 'tour.ed.29.title',
      descriptionKey: 'tour.ed.29.desc',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="panel-images"]',
    prepare: openPanel('images'),
    requireSelector: '[data-tour="panel-images"]',
    popover: {
      titleKey: 'tour.ed.30.title',
      descriptionKey: 'tour.ed.30.desc',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="panel-palette"]',
    prepare: openPanel('palette'),
    requireSelector: '[data-tour="panel-palette"]',
    popover: {
      titleKey: 'tour.ed.31.title',
      descriptionKey: 'tour.ed.31.desc',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="opt-palette-colors"]',
    prepare: openPanel('palette'),
    requireSelector: '[data-tour="opt-palette-colors"]',
    popover: {
      titleKey: 'tour.ed.32.title',
      descriptionKey: 'tour.ed.32.desc',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="opt-palette-gradients"]',
    prepare: openPanel('palette'),
    requireSelector: '[data-tour="opt-palette-gradients"]',
    popover: {
      titleKey: 'tour.ed.33.title',
      descriptionKey: 'tour.ed.33.desc',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="panel-assets"]',
    prepare: openPanel('assets'),
    requireSelector: '[data-tour="panel-assets"]',
    popover: {
      titleKey: 'tour.ed.34.title',
      descriptionKey: 'tour.ed.34.desc',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="panel-animation3d"]',
    prepare: prepareAnimPanel,
    requireSelector: '[data-tour="panel-animation3d"]',
    popover: {
      titleKey: 'tour.ed.35.title',
      descriptionKey: 'tour.ed.35.desc',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="opt-anim-duration"]',
    prepare: prepareAnimPanel,
    requireSelector: '[data-tour="opt-anim-duration"]',
    popover: {
      titleKey: 'tour.ed.36.title',
      descriptionKey: 'tour.ed.36.desc',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="opt-anim-intensity"]',
    prepare: prepareAnimPanel,
    requireSelector: '[data-tour="opt-anim-intensity"]',
    popover: {
      titleKey: 'tour.ed.37.title',
      descriptionKey: 'tour.ed.37.desc',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="panel-versions"]',
    prepare: openPanel('versions'),
    requireSelector: '[data-tour="panel-versions"]',
    popover: {
      titleKey: 'tour.ed.38.title',
      descriptionKey: 'tour.ed.38.desc',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="footer"]',
    popover: {
      titleKey: 'tour.ed.39.title',
      descriptionKey: 'tour.ed.39.desc',
      side: 'top',
      align: 'start',
    },
  },
  {
    element: '[data-tour="editor-nav"]',
    requireSelector: '[data-tour="editor-nav"]',
    popover: {
      titleKey: 'tour.ed.40.title',
      descriptionKey: 'tour.ed.40.desc',
      side: 'top',
      align: 'start',
    },
  },
  {
    popover: {
      titleKey: 'tour.ed.41.title',
      descriptionKey: 'tour.ed.41.desc',
    },
  },
]
