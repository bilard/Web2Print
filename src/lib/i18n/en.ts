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

  // — Navigation: menu groups ————————————————————————————————————————
  'nav.group.create': 'Create',
  'nav.group.product-data': 'Product data',
  'nav.group.web': 'Web & monitoring',
  'nav.group.publish': 'Publishing',
  'nav.group.automation': 'Automation & AI',
  'nav.group.admin': 'Administration',

  // — Navigation: modules ————————————————————————————————————————————
  // Les noms de modules reprennent ceux de la documentation publiée
  // (/docs/en/) : « Studio catalogue », « Price monitoring »…
  'nav.blank': 'New document',
  'nav.import': 'Import',
  'nav.import.excel': 'Import an Excel file',
  'nav.import.idml': 'IDML',
  'nav.import.pptx': 'PPTX',
  'nav.import.image': 'Image',
  'nav.import.svg': 'SVG',
  'nav.import.imageToSvg': 'Image → SVG',
  'nav.import.pdfToSvg': 'PDF → SVG',
  'nav.library': 'Library',
  'nav.library.grid': 'Thumbnail view',
  'nav.library.list': 'List view',
  'nav.images': 'DAM',
  'nav.images.stock': 'Image bank',
  'nav.images.mine': 'My images',
  'nav.images.favorites': 'Favourites',
  'nav.images.collections': 'Collections',
  'nav.images.recent': 'Recent',
  'nav.images.projects': 'Projects',
  'nav.images.generate': 'Generate',
  'nav.images.videos': 'HTML animations',
  'nav.images.gdrive': 'Google Drive',
  'nav.data': 'PIM',
  'nav.data.import': 'Import a file',
  'nav.data.scrape': 'Scrape the web',
  'nav.data.createEmpty': 'Create an empty database',
  'nav.data.update': 'Update',
  'nav.data.exportXlsx': 'Export to Excel',
  'nav.data.exportEc': 'EasyCatalog export',
  'nav.taxonomies': 'Taxonomies',
  'nav.taxonomies.tree': 'Tree',
  'nav.taxonomies.briefs': 'Briefs',
  'nav.taxonomies.import': 'Import a taxonomy',
  'nav.mfrInsights': 'Manufacturer gaps',
  'nav.mfrInsights.overview': 'Overview',
  'nav.mfrInsights.fields': 'By field',
  'nav.mfrInsights.products': 'By product',
  'nav.scrapingTemplates': 'Scraping templates',
  'nav.scrapingTemplates.new': 'New template',
  'nav.scrapingHub': 'Scraping Hub',
  'nav.scrapingHub.rules': 'Rules',
  'nav.scrapingHub.vendors': 'Suppliers & templates',
  'nav.scrapingHub.debug': 'Jina/LLM debug',
  'nav.priceWatch': 'Price monitoring',
  'nav.priceWatch.pending': 'To confirm',
  'nav.priceWatch.comparison': 'Comparison',
  'nav.demoExpress': 'Express demo',
  'nav.demoExpress.new': 'New demo',
  'nav.retailPromo': 'Studio creation',
  'nav.retailPromo.new': 'Create a promo',
  'nav.retailPromo.list': 'My promos',
  'nav.catalog': 'Studio catalogue',
  'nav.catalog.new': 'New catalogue',
  'nav.catalog.list': 'My catalogues',
  'nav.hyperframes': 'Animation',
  'nav.hyperframes.generate': 'Generate an animation',
  'nav.hyperframes.list': 'My animations',
  'nav.workflows': 'Workflows',
  'nav.workflows.new': 'New workflow',
  'nav.workflows.myTemplates': 'My templates',
  'nav.workflows.builtinTemplates': 'Built-in templates',
  'nav.chat': 'AI Chat',
  'nav.chat.new': 'New conversation',
  'nav.chat.writing': 'Write',
  'nav.chat.learning': 'Learn',
  'nav.chat.code': 'Code',
  'nav.chat.daily': 'Everyday life',
  'nav.chat.ideas': 'Ideas',
  'nav.chat.image': 'Image',
  'nav.telegram': 'Telegram',
  'nav.telegram.new': 'New message',
  'nav.finances': 'Finances',
  'nav.access': 'Users & roles',
  'nav.access.users': 'Users',
  'nav.access.roles': 'Roles',
  'nav.access.audit': 'Audit log',
  'nav.access.analytics': 'Analytics',

  // — Navigation: tree & drawer ——————————————————————————————————————
  'nav.tree.expand': 'Expand {module}',
  'nav.tree.collapse': 'Collapse {module}',
  'nav.drawer.title': 'Modules',
  'nav.drawer.menu': 'Modules (menu)',
  'nav.drawer.open': 'Open the modules menu',
  'nav.drawer.close': 'Close the menu',

  // — Command palette (⌘K) ———————————————————————————————————————————
  'palette.title': 'Command palette',
  'palette.placeholder': 'Search for a module or an action…',
  'palette.group.recent': 'Recent projects',
  'palette.group.modules': 'Modules',
  'palette.group.actions': 'Actions',
  'palette.action.settings': 'Open Settings',
  'palette.action.themeLight': 'Switch to light theme',
  'palette.action.themeDark': 'Switch to dark theme',
  'palette.untitled': 'Untitled',
  'palette.noResults': 'No results for “{query}”',
  'palette.esc': 'esc',
  'palette.hint.navigate': 'navigate',
  'palette.hint.open': 'open',
  'palette.hint.close': 'close',

  // — Theme switcher —————————————————————————————————————————————————
  'theme.aria': 'Change theme',
  'theme.hint': '{current} on — {action}',
  'theme.dark': 'Dark mode',
  'theme.light': 'Light mode',
  'theme.system': 'Follow the system',
  'theme.action.toLight': 'switch to light mode',
  'theme.action.toSystem': 'follow the system',
  'theme.action.toDark': 'switch to dark mode',

  // — Notifications ——————————————————————————————————————————————————
  'notif.title': 'Notifications',
  'notif.open': 'Open notifications',
  'notif.markAllRead': 'Mark all as read',
  'notif.clear': 'Clear the history',
  'notif.empty': 'No notifications',

  // — Dashboard: shell ———————————————————————————————————————————————
  'dashboard.mainMenu': 'Main menu',
  'dashboard.moduleNav': 'Module navigation',
  'dashboard.sidebar.open': 'Open the menu',
  'dashboard.sidebar.close': 'Close the menu',
  'dashboard.sidebar.openAria': 'Open the main menu',
  'dashboard.sidebar.closeAria': 'Close the main menu',
  'dashboard.settings': 'Settings',
  'dashboard.signOut': 'Sign out',
  'dashboard.officialApp': "Open the official app — check you're on the right version",
  'dashboard.createDocument': 'Create a document',
  'dashboard.import': 'Import',

  // — Dashboard: library —————————————————————————————————————————————
  'library.title': 'My projects',
  'library.results.one': '({count} result)',
  'library.results.other': '({count} results)',
  'library.viewMode': 'Display mode',
  'library.view.grid': 'Thumbnail view',
  'library.view.list': 'List view',
  'library.view.gridShort': 'Thumbnails',
  'library.view.listShort': 'List',
  'library.selected.one': '{count} selected',
  'library.selected.other': '{count} selected',
  'library.selectAll': 'Select all',
  'library.deselectAll': 'Deselect all',
  'library.clearSelection': 'Clear the selection',
  'library.clear': 'Clear',
  'library.delete': 'Delete ({count})',
  'library.loading': 'Loading projects…',
  'library.error': 'Something went wrong while loading your projects',
  'library.empty.title': 'Your library is empty',
  'library.empty.subtitle': 'Create your first document to get started',
  'library.empty.filtered': 'No projects in this category',
  'library.list': 'Project list',
}
