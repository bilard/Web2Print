import type { TranslationKey } from './fr'

/**
 * Catalogue ANGLAIS — orthographe BRITANNIQUE (en-GB).
 *
 * Règles d'écriture appliquées ici, à tenir pour toute clé ajoutée :
 *   -ise / -isation  → organise, centralise, customise (jamais -ize)
 *   colour, behaviour, centre, licence (nom) / license (verbe)
 *   catalogue, dialogue, programme (sauf « computer program »)
 *   dates JJ/MM/AAAA — cf. `formatDate()` dans `lib/i18n/index.ts`
 *
 * Le type `Record<TranslationKey, string>` garantit qu'AUCUNE clé FR ne peut
 * rester sans traduction : un oubli casse `tsc -b` au lieu de vider l'écran.
 */
export const en: Record<TranslationKey, string> = {
  // — Sign-in screen —————————————————————————————————————————————————
  'login.badge': '18 modules · 1 platform · 0 software to install',
  'login.headline.line1': 'Create, import,',
  'login.headline.line2': 'export in one flow.',
  'login.tagline':
    'The professional design editor that turns your print files and product data into ready-to-publish creative — from brief to printer, with nothing to install.',

  'login.feature.import.label': 'Professional print import',
  'login.feature.import.desc':
    'PDF, IDML (InDesign) & SVG (Illustrator), editable straight in your browser',
  'login.feature.svg.label': 'Block-editable SVG',
  'login.feature.svg.desc':
    'Text, shapes and images cut out automatically, each one editable separately',
  'login.feature.pim.label': 'Built-in PIM & DAM',
  'login.feature.pim.desc':
    'Centralised product data and media, reusable across all your artwork',
  'login.feature.merge.label': 'Data mail merge',
  'login.feature.merge.desc':
    'Hundreds of variants generated from a spreadsheet or a product database',
  'login.feature.export.label': 'Multi-format export',
  'login.feature.export.desc':
    'Print-ready PDF (bleed, crop marks), PPTX and high-resolution images',
  'login.feature.workflows.label': 'No-code AI workflows',
  'login.feature.workflows.desc':
    'Scraping, design and delivery (Telegram, Drive, Gmail) chained automatically',

  'login.workspace': 'Workspace',
  'login.welcome': 'Welcome',
  'login.subtitle': 'Sign in to access your projects.',
  'login.cta': 'Sign in with Google',
  'login.cta.loading': 'Signing in…',
  'login.secure': 'secure sign-in',
  'login.legal': 'By signing in, you agree to our terms of use and our privacy policy.',

  'login.error.cancelled': 'Sign-in cancelled.',
  'login.error.popupBlocked':
    'The sign-in window was blocked by your browser. Please allow pop-ups and try again.',
  'login.error.network': 'Network problem. Please check your connection and try again.',
  'login.error.unauthorizedDomain':
    'This domain is not authorised for sign-in. Please contact your administrator.',
  'login.error.generic': 'Sign-in failed. Please try again in a moment.',
  'login.error.unexpected': 'An unexpected error occurred.',

  // — Language switcher ——————————————————————————————————————————————
  'locale.label': 'Language',
  'locale.fr': 'Français',
  'locale.en': 'English',
}
