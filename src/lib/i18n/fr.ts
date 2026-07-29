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
} as const

/** Clé de traduction valide — dérivée du catalogue FR. */
export type TranslationKey = keyof typeof fr
