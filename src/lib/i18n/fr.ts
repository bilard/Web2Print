/**
 * Catalogue FRANÇAIS — source de vérité de l'i18n.
 *
 * Toute clé ajoutée ici DOIT l'être aussi dans `en.ts` : `en` est typé
 * `Record<TranslationKey, string>`, donc une clé manquante casse `tsc -b`.
 * C'est le garde-fou qui empêche un écran de se retrouver à moitié traduit.
 *
 * Convention de nommage : `<écran>.<bloc>.<élément>`.
 * ⚠️ On ne renomme JAMAIS une clé pour traduire — seules les VALEURS changent.
 */
export const fr = {
  // — Écran de connexion —————————————————————————————————————————————
  'login.badge': '18 modules · 1 plateforme · 0 logiciel à installer',
  'login.headline.line1': 'Créez, importez,',
  'login.headline.line2': 'exportez en un flux.',
  'login.tagline':
    "L'éditeur graphique professionnel qui transforme vos fichiers print et vos données produit en créations prêtes à diffuser — du brief à l'imprimeur, sans rien installer.",

  'login.feature.import.label': 'Import print pro',
  'login.feature.import.desc':
    'PDF, IDML (InDesign) & SVG (Illustrator) éditables directement dans le navigateur',
  'login.feature.svg.label': 'SVG éditable par blocs',
  'login.feature.svg.desc':
    'Textes, formes et images détourés automatiquement, chacun modifiable séparément',
  'login.feature.pim.label': 'PIM & DAM intégrés',
  'login.feature.pim.desc':
    'Données produit et médias centralisés, réutilisables dans tous vos visuels',
  'login.feature.merge.label': 'Publipostage données',
  'login.feature.merge.desc':
    'Des centaines de déclinaisons générées depuis un tableau ou une base produit',
  'login.feature.export.label': 'Export multi-format',
  'login.feature.export.desc':
    'PDF print (fond perdu, traits de coupe), PPTX et images haute définition',
  'login.feature.workflows.label': 'Workflows IA no-code',
  'login.feature.workflows.desc':
    'Scraping, design et envoi (Telegram, Drive, Gmail) enchaînés automatiquement',

  'login.workspace': 'Espace de travail',
  'login.welcome': 'Bienvenue',
  'login.subtitle': 'Connectez-vous pour accéder à vos projets.',
  'login.cta': 'Se connecter avec Google',
  'login.cta.loading': 'Connexion…',
  'login.secure': 'connexion sécurisée',
  'login.legal': "En vous connectant, vous acceptez nos conditions d'utilisation et notre politique de confidentialité.",

  'login.error.cancelled': 'Connexion annulée.',
  'login.error.popupBlocked':
    'La fenêtre de connexion a été bloquée par le navigateur. Autorisez les pop-ups puis réessayez.',
  'login.error.network': 'Problème de réseau. Vérifiez votre connexion et réessayez.',
  'login.error.unauthorizedDomain':
    "Ce domaine n'est pas autorisé pour la connexion. Contactez l'administrateur.",
  'login.error.generic': 'La connexion a échoué. Réessayez dans un instant.',
  'login.error.unexpected': 'Une erreur inattendue est survenue.',

  // — Sélecteur de langue ————————————————————————————————————————————
  'locale.label': 'Langue',
  'locale.fr': 'Français',
  'locale.en': 'English',

  // — Navigation : thèmes du menu ————————————————————————————————————
  'nav.group.create': 'Création',
  'nav.group.product-data': 'Données produits',
  'nav.group.web': 'Web & veille',
  'nav.group.publish': 'Publication',
  'nav.group.automation': 'Automatisation & IA',
  'nav.group.admin': 'Administration',

  // — Navigation : modules ———————————————————————————————————————————
  'nav.blank': 'Nouveau document',
  'nav.import': 'Importer',
  'nav.import.excel': 'Importer un Excel',
  'nav.import.idml': 'IDML',
  'nav.import.pptx': 'PPTX',
  'nav.import.image': 'Image',
  'nav.import.svg': 'SVG',
  'nav.import.imageToSvg': 'Image → SVG',
  'nav.import.pdfToSvg': 'PDF → SVG',
  'nav.library': 'Bibliothèque',
  'nav.library.grid': 'Vue vignettes',
  'nav.library.list': 'Vue liste',
  'nav.images': 'DAM',
  'nav.images.stock': "Banque d'images",
  'nav.images.mine': 'Mes images',
  'nav.images.favorites': 'Favoris',
  'nav.images.collections': 'Collections',
  'nav.images.recent': 'Récents',
  'nav.images.projects': 'Projets',
  'nav.images.generate': 'Générer',
  'nav.images.videos': 'Animations HTML',
  'nav.images.gdrive': 'Google Drive',
  'nav.data': 'PIM',
  'nav.data.import': 'Importer un fichier',
  'nav.data.scrape': 'Scraper le web',
  'nav.data.createEmpty': 'Créer BDD vide',
  'nav.data.update': 'Mise à jour',
  'nav.data.exportXlsx': 'Exporter Excel',
  'nav.data.exportEc': 'Export EasyCatalog',
  'nav.taxonomies': 'Taxonomies',
  'nav.taxonomies.tree': 'Arbre',
  'nav.taxonomies.briefs': 'Briefs',
  'nav.taxonomies.import': 'Importer une taxonomie',
  'nav.mfrInsights': 'Écarts fabricant',
  'nav.mfrInsights.overview': "Vue d'ensemble",
  'nav.mfrInsights.fields': 'Par champ',
  'nav.mfrInsights.products': 'Par produit',
  'nav.scrapingTemplates': 'Templates scraping',
  'nav.scrapingTemplates.new': 'Nouveau template',
  'nav.scrapingHub': 'Scraping Hub',
  'nav.scrapingHub.rules': 'Règles',
  'nav.scrapingHub.vendors': 'Fournisseurs & Templates',
  'nav.scrapingHub.debug': 'Debug Jina/LLM',
  'nav.priceWatch': 'Veille tarifaire',
  'nav.priceWatch.pending': 'À confirmer',
  'nav.priceWatch.comparison': 'Comparatif',
  'nav.demoExpress': 'Démo express',
  'nav.demoExpress.new': 'Nouvelle démo',
  'nav.retailPromo': 'Création studio',
  'nav.retailPromo.new': 'Créer une promo',
  'nav.retailPromo.list': 'Mes promos',
  'nav.catalog': 'Catalogue studio',
  'nav.catalog.new': 'Nouveau catalogue',
  'nav.catalog.list': 'Mes catalogues',
  'nav.hyperframes': 'Animation',
  'nav.hyperframes.generate': 'Générer une animation',
  'nav.hyperframes.list': 'Mes animations',
  'nav.workflows': 'Workflows',
  'nav.workflows.new': 'Nouveau workflow',
  'nav.workflows.myTemplates': 'Mes modèles',
  'nav.workflows.builtinTemplates': 'Modèles intégrés',
  'nav.chat': 'Chat IA',
  'nav.chat.new': 'Nouvelle conversation',
  'nav.chat.writing': 'Écrire',
  'nav.chat.learning': 'Apprendre',
  'nav.chat.code': 'Code',
  'nav.chat.daily': 'Vie quotidienne',
  'nav.chat.ideas': 'Idées',
  'nav.chat.image': 'Image',
  'nav.telegram': 'Telegram',
  'nav.telegram.new': 'Nouveau message',
  'nav.finances': 'Finances',
  'nav.access': 'Utilisateurs & rôles',
  'nav.access.users': 'Utilisateurs',
  'nav.access.roles': 'Rôles',
  'nav.access.audit': 'Journal',
  'nav.access.analytics': 'Analytics',

  // — Navigation : arbre & tiroir ————————————————————————————————————
  // Phrase entière paramétrée : recoller « Déplier » + le nom du module
  // produirait un ordre de mots faux dans d'autres langues.
  'nav.tree.expand': 'Déplier {module}',
  'nav.tree.collapse': 'Replier {module}',
  'nav.drawer.title': 'Modules',
  'nav.drawer.menu': 'Modules (menu)',
  'nav.drawer.open': 'Ouvrir le menu des modules',
  'nav.drawer.close': 'Fermer le menu',

  // — Palette de commandes (⌘K) ——————————————————————————————————————
  'palette.title': 'Palette de commandes',
  'palette.placeholder': 'Rechercher un module ou une action…',
  'palette.group.recent': 'Projets récents',
  'palette.group.modules': 'Modules',
  'palette.group.actions': 'Actions',
  'palette.action.settings': 'Ouvrir les Réglages',
  'palette.action.themeLight': 'Passer en thème clair',
  'palette.action.themeDark': 'Passer en thème sombre',
  'palette.untitled': 'Sans titre',
  'palette.noResults': 'Aucun résultat pour « {query} »',
  'palette.esc': 'esc',

  // — Notifications ——————————————————————————————————————————————————
  'notif.title': 'Notifications',
  'notif.open': 'Ouvrir les notifications',
  'notif.markAllRead': 'Tout marquer comme lu',
  'notif.clear': "Vider l'historique",
  'notif.empty': 'Aucune notification',

  // — Dashboard : ossature ———————————————————————————————————————————
  'dashboard.mainMenu': 'Menu principal',
  'dashboard.moduleNav': 'Navigation des modules',
  'dashboard.sidebar.open': 'Ouvrir le menu',
  'dashboard.sidebar.close': 'Fermer le menu',
  'dashboard.sidebar.openAria': 'Ouvrir le menu principal',
  'dashboard.sidebar.closeAria': 'Fermer le menu principal',
  'dashboard.settings': 'Paramètres',
  'dashboard.signOut': 'Se déconnecter',
  'dashboard.officialApp': "Ouvrir l'app officielle — vérifier que vous êtes sur la bonne version",
  'dashboard.createDocument': 'Créer un document',
  'dashboard.import': 'Importer',

  // — Dashboard : bibliothèque ———————————————————————————————————————
  'library.title': 'Mes projets',
  'library.results.one': '({count} résultat)',
  'library.results.other': '({count} résultats)',
  'library.viewMode': "Mode d'affichage",
  'library.view.grid': 'Vue vignettes',
  'library.view.list': 'Vue liste',
  'library.view.gridShort': 'Vignettes',
  'library.view.listShort': 'Liste',
  'library.selected.one': '{count} sélectionné',
  'library.selected.other': '{count} sélectionnés',
  'library.selectAll': 'Tout sélectionner',
  'library.deselectAll': 'Tout désélectionner',
  'library.clearSelection': 'Effacer la sélection',
  'library.clear': 'Effacer',
  'library.delete': 'Supprimer ({count})',
  'library.loading': 'Chargement des projets…',
  'library.error': 'Erreur lors du chargement des projets',
  'library.empty.title': 'Bibliothèque vide',
  'library.empty.subtitle': 'Créez votre premier document pour commencer',
  'library.empty.filtered': 'Aucun projet dans cette catégorie',
  'library.list': 'Liste des projets',
} as const

/** Clé de traduction valide — dérivée du catalogue FR. */
export type TranslationKey = keyof typeof fr
