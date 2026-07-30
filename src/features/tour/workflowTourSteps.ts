import type { TourStep } from './types'

/**
 * Tour guidé de l'éditeur de workflow (français), navigation automatique.
 *
 * Parcourt la barre supérieure, la palette de blocs (gating par étapes), le
 * plan de montage, le panneau de configuration, l'exécution et les résultats.
 *
 * Robustesse : on ne cible que des éléments TOUJOURS présents (header, palette,
 * `<li>` d'étape rendu même verrouillé, canvas, inspector, run logs). Les
 * boutons conditionnels (Modèle, Run — soumis aux droits/état d'exécution)
 * utilisent `element` SANS `requireSelector` : si absents, driver.js centre la
 * bulle (dégradation gracieuse, comme les sections masquées du tour Dashboard).
 * On ne cible donc aucun node individuel : la palette est gatée par étapes et
 * spawn de nodes polluerait le graphe de l'utilisateur.
 */
export const workflowTourSteps: TourStep[] = [
  {
    popover: {
      titleKey: 'tour.wf.0.title',
      descriptionKey: 'tour.wf.0.desc',
    },
  },
  {
    element: '[data-tour="wf-name"]',
    requireSelector: '[data-tour="wf-name"]',
    popover: {
      titleKey: 'tour.wf.1.title',
      descriptionKey: 'tour.wf.1.desc',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="wf-palette"]',
    requireSelector: '[data-tour="wf-palette"]',
    popover: {
      titleKey: 'tour.wf.2.title',
      descriptionKey: 'tour.wf.2.desc',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '[data-tour="wf-step-import"]',
    requireSelector: '[data-tour="wf-step-import"]',
    popover: {
      titleKey: 'tour.wf.3.title',
      descriptionKey: 'tour.wf.3.desc',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '[data-tour="wf-step-transformation"]',
    requireSelector: '[data-tour="wf-step-transformation"]',
    popover: {
      titleKey: 'tour.wf.4.title',
      descriptionKey: 'tour.wf.4.desc',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '[data-tour="wf-step-export"]',
    requireSelector: '[data-tour="wf-step-export"]',
    popover: {
      titleKey: 'tour.wf.5.title',
      descriptionKey: 'tour.wf.5.desc',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '[data-tour="wf-step-communication"]',
    requireSelector: '[data-tour="wf-step-communication"]',
    popover: {
      titleKey: 'tour.wf.6.title',
      descriptionKey: 'tour.wf.6.desc',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '[data-tour="wf-canvas"]',
    requireSelector: '[data-tour="wf-canvas"]',
    popover: {
      titleKey: 'tour.wf.7.title',
      descriptionKey: 'tour.wf.7.desc',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '[data-tour="wf-inspector"]',
    requireSelector: '[data-tour="wf-inspector"]',
    popover: {
      titleKey: 'tour.wf.8.title',
      descriptionKey: 'tour.wf.8.desc',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="wf-generate-ai"]',
    popover: {
      titleKey: 'tour.wf.9.title',
      descriptionKey: 'tour.wf.9.desc',
      side: 'bottom',
      align: 'end',
    },
  },
  {
    element: '[data-tour="wf-save-template"]',
    popover: {
      titleKey: 'tour.wf.10.title',
      descriptionKey: 'tour.wf.10.desc',
      side: 'bottom',
      align: 'end',
    },
  },
  {
    element: '[data-tour="wf-run"]',
    popover: {
      titleKey: 'tour.wf.11.title',
      descriptionKey: 'tour.wf.11.desc',
      side: 'bottom',
      align: 'end',
    },
  },
  {
    element: '[data-tour="wf-run-logs"]',
    requireSelector: '[data-tour="wf-run-logs"]',
    popover: {
      titleKey: 'tour.wf.12.title',
      descriptionKey: 'tour.wf.12.desc',
      side: 'top',
      align: 'start',
    },
  },
  {
    element: '[data-tour="wf-results"]',
    popover: {
      titleKey: 'tour.wf.13.title',
      descriptionKey: 'tour.wf.13.desc',
      side: 'bottom',
      align: 'end',
    },
  },
  {
    popover: {
      titleKey: 'tour.wf.14.title',
      descriptionKey: 'tour.wf.14.desc',
    },
  },
]
