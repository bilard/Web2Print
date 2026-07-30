import type { TourStep } from './types'
import type { TranslationKey } from '@/lib/i18n'
import { navigateTourSection } from './tour.store'

/** Ouvre une section du dashboard avant d'afficher l'étape. */
const openSection = (section: string) => () => navigateTourSection(section)

/** Sous-étape « option » : ouvre la section puis surligne une option précise.
 *  ⚠️ Prend des CLÉS de traduction, pas du texte : ce tableau est une constante
 *  de MODULE, un `t()` ici figerait la langue au chargement. `useGuidedTour`
 *  résout au moment d'afficher l'étape. */
const optStep = (section: string, anchor: string, titleKey: TranslationKey, descriptionKey: TranslationKey): TourStep => ({
  element: `[data-tour="${anchor}"]`,
  prepare: openSection(section),
  requireSelector: `[data-tour="${anchor}"]`,
  popover: { titleKey, descriptionKey, side: 'right', align: 'start' },
})

/**
 * Tour guidé du tableau de bord (français), navigation automatique.
 * Chaque étape ouvre sa section (`prepare`) puis attend son conteneur
 * (`requireSelector`) avant de surligner. Les sections masquées par
 * permission sont ignorées (bulle centrée — dégradation gracieuse).
 * L'ordre suit les thèmes du menu (cf. MODULE_GROUPS dans modules.ts) :
 * Création · Données produits · Web & veille · Publication ·
 * Automatisation & IA · Administration.
 */
export const dashboardTourSteps: TourStep[] = [
  {
    popover: {
      titleKey: 'tour.db.0.title',
      descriptionKey: 'tour.db.0.desc',
    },
  },
  {
    element: '[data-tour="sidebar"]',
    popover: {
      titleKey: 'tour.db.1.title',
      descriptionKey: 'tour.db.1.desc',
      side: 'right',
      align: 'center',
    },
  },
  // ── Création ──
  {
    element: '[data-tour="section-blank"]',
    prepare: openSection('blank'),
    requireSelector: '[data-tour="section-blank"]',
    popover: {
      titleKey: 'tour.db.2.title',
      descriptionKey: 'tour.db.2.desc',
      side: 'right',
      align: 'start',
    },
  },
  optStep('blank', 'opt-newdoc-name', 'tour.opt.0.title', 'tour.opt.0.desc'),
  optStep('blank', 'opt-newdoc-format', 'tour.opt.1.title', 'tour.opt.1.desc'),
  optStep('blank', 'opt-newdoc-bg', 'tour.opt.2.title', 'tour.opt.2.desc'),
  {
    element: '[data-tour="section-import"]',
    prepare: openSection('import'),
    requireSelector: '[data-tour="section-import"]',
    popover: {
      titleKey: 'tour.db.3.title',
      descriptionKey: 'tour.db.3.desc',
      side: 'right',
      align: 'start',
    },
  },
  optStep('import', 'opt-import-idml', 'tour.opt.3.title', 'tour.opt.3.desc'),
  optStep('import', 'opt-import-pptx', 'tour.opt.4.title', 'tour.opt.4.desc'),
  optStep('import', 'opt-import-svg', 'tour.opt.5.title', 'tour.opt.5.desc'),
  optStep('import', 'opt-import-excel', 'tour.opt.6.title', 'tour.opt.6.desc'),
  optStep('import', 'opt-import-image-to-svg', 'tour.opt.7.title', 'tour.opt.7.desc'),
  optStep('import', 'opt-import-pdf-to-svg', 'tour.opt.8.title', 'tour.opt.8.desc'),
  optStep('import', 'opt-import-folder-to-drive', 'tour.opt.9.title', 'tour.opt.9.desc'),
  {
    element: '[data-tour="section-library"]',
    prepare: openSection('library'),
    requireSelector: '[data-tour="section-library"]',
    popover: {
      titleKey: 'tour.db.4.title',
      descriptionKey: 'tour.db.4.desc',
      side: 'right',
      align: 'center',
    },
  },
  // ── Données produits ──
  {
    element: '[data-tour="section-images"]',
    prepare: openSection('images'),
    requireSelector: '[data-tour="section-images"]',
    popover: {
      titleKey: 'tour.db.5.title',
      descriptionKey: 'tour.db.5.desc',
      side: 'right',
      align: 'center',
    },
  },
  optStep('images', 'opt-dam-stock', 'tour.opt.10.title', 'tour.opt.10.desc'),
  optStep('images', 'opt-dam-my-images', 'tour.opt.11.title', 'tour.opt.11.desc'),
  optStep('images', 'opt-dam-favorites', 'tour.opt.12.title', 'tour.opt.12.desc'),
  optStep('images', 'opt-dam-collections', 'tour.opt.13.title', 'tour.opt.13.desc'),
  optStep('images', 'opt-dam-recent', 'tour.opt.14.title', 'tour.opt.14.desc'),
  optStep('images', 'opt-dam-projects', 'tour.opt.15.title', 'tour.opt.15.desc'),
  optStep('images', 'opt-dam-generate', 'tour.opt.16.title', 'tour.opt.16.desc'),
  optStep('images', 'opt-dam-videos', 'tour.opt.17.title', 'tour.opt.17.desc'),
  optStep('images', 'opt-dam-gdrive', 'tour.opt.18.title', 'tour.opt.18.desc'),
  {
    element: '[data-tour="section-data"]',
    prepare: openSection('data'),
    requireSelector: '[data-tour="section-data"]',
    popover: {
      titleKey: 'tour.db.6.title',
      descriptionKey: 'tour.db.6.desc',
      side: 'right',
      align: 'center',
    },
  },
  optStep('data', 'opt-pim-import', 'tour.opt.19.title', 'tour.opt.19.desc'),
  optStep('data', 'opt-pim-scrape', 'tour.opt.20.title', 'tour.opt.20.desc'),
  optStep('data', 'opt-pim-ai-completion', 'tour.opt.21.title', 'tour.opt.21.desc'),
  optStep('data', 'opt-pim-ai-visuals', 'tour.opt.22.title', 'tour.opt.22.desc'),
  optStep('data', 'opt-pim-create', 'tour.opt.23.title', 'tour.opt.23.desc'),
  {
    element: '[data-tour="section-taxonomies"]',
    prepare: openSection('taxonomies'),
    requireSelector: '[data-tour="section-taxonomies"]',
    popover: {
      titleKey: 'tour.db.7.title',
      descriptionKey: 'tour.db.7.desc',
      side: 'right',
      align: 'center',
    },
  },
  // ── Web & veille ──
  {
    element: '[data-tour="section-scraping-templates"]',
    prepare: openSection('scraping-templates'),
    requireSelector: '[data-tour="section-scraping-templates"]',
    popover: {
      titleKey: 'tour.db.8.title',
      descriptionKey: 'tour.db.8.desc',
      side: 'right',
      align: 'center',
    },
  },
  {
    element: '[data-tour="section-scraping-hub"]',
    prepare: openSection('scraping-hub'),
    requireSelector: '[data-tour="section-scraping-hub"]',
    popover: {
      titleKey: 'tour.db.9.title',
      descriptionKey: 'tour.db.9.desc',
      side: 'right',
      align: 'center',
    },
  },
  {
    element: '[data-tour="section-price-watch"]',
    prepare: openSection('price-watch'),
    requireSelector: '[data-tour="section-price-watch"]',
    popover: {
      titleKey: 'tour.db.10.title',
      descriptionKey: 'tour.db.10.desc',
      side: 'right',
      align: 'center',
    },
  },
  // ── Publication ──
  {
    element: '[data-tour="section-demo-express"]',
    prepare: openSection('demo-express'),
    requireSelector: '[data-tour="section-demo-express"]',
    popover: {
      titleKey: 'tour.db.11.title',
      descriptionKey: 'tour.db.11.desc',
      side: 'right',
      align: 'center',
    },
  },
  {
    element: '[data-tour="section-retail-promo"]',
    prepare: openSection('retail-promo'),
    requireSelector: '[data-tour="section-retail-promo"]',
    popover: {
      titleKey: 'tour.db.12.title',
      descriptionKey: 'tour.db.12.desc',
      side: 'right',
      align: 'center',
    },
  },
  {
    element: '[data-tour="section-catalog"]',
    prepare: openSection('catalog'),
    requireSelector: '[data-tour="section-catalog"]',
    popover: {
      titleKey: 'tour.db.13.title',
      descriptionKey: 'tour.db.13.desc',
      side: 'right',
      align: 'center',
    },
  },
  {
    element: '[data-tour="section-hyperframes"]',
    prepare: openSection('hyperframes'),
    requireSelector: '[data-tour="section-hyperframes"]',
    popover: {
      titleKey: 'tour.db.14.title',
      descriptionKey: 'tour.db.14.desc',
      side: 'right',
      align: 'center',
    },
  },
  // ── Automatisation & IA ──
  {
    element: '[data-tour="section-workflows"]',
    prepare: openSection('workflows'),
    requireSelector: '[data-tour="section-workflows"]',
    popover: {
      titleKey: 'tour.db.15.title',
      descriptionKey: 'tour.db.15.desc',
      side: 'right',
      align: 'center',
    },
  },
  optStep('workflows', 'opt-wf-title', 'tour.opt.24.title', 'tour.opt.24.desc'),
  optStep('workflows', 'opt-wf-new', 'tour.opt.25.title', 'tour.opt.25.desc'),
  {
    element: '[data-tour="section-chat"]',
    prepare: openSection('chat'),
    requireSelector: '[data-tour="section-chat"]',
    popover: {
      titleKey: 'tour.db.16.title',
      descriptionKey: 'tour.db.16.desc',
      side: 'right',
      align: 'center',
    },
  },
  {
    element: '[data-tour="section-telegram"]',
    prepare: openSection('telegram'),
    requireSelector: '[data-tour="section-telegram"]',
    popover: {
      titleKey: 'tour.db.17.title',
      descriptionKey: 'tour.db.17.desc',
      side: 'right',
      align: 'center',
    },
  },
  // ── Administration ──
  {
    element: '[data-tour="section-access"]',
    prepare: openSection('access'),
    requireSelector: '[data-tour="section-access"]',
    popover: {
      titleKey: 'tour.db.18.title',
      descriptionKey: 'tour.db.18.desc',
      side: 'right',
      align: 'center',
    },
  },
  {
    element: '[data-tour="user-menu"]',
    prepare: openSection('library'),
    requireSelector: '[data-tour="user-menu"]',
    popover: {
      titleKey: 'tour.db.19.title',
      descriptionKey: 'tour.db.19.desc',
      side: 'right',
      align: 'end',
    },
  },
  {
    popover: {
      titleKey: 'tour.db.20.title',
      descriptionKey: 'tour.db.20.desc',
    },
  },
]
