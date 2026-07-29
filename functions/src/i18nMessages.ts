// Catalogue des messages de run écrits par le SERVEUR — module PUR.
//
// Pourquoi il est séparé de `i18n.ts` : celui-ci importe `firebase-admin` pour
// lire la langue de l'utilisateur. Ce fichier-ci n'importe RIEN, ce qui permet
// au test de parité `src/lib/i18n/runMessages.test.ts` de l'importer depuis le
// projet client sans traîner l'Admin SDK dans le graphe de vitest.
//
// ⚠️ Le catalogue est délibérément DUPLIQUÉ avec les clés `run.*` de
// `src/lib/i18n` : `functions/` est un projet TypeScript distinct, avec
// `rootDir: "src"` — il ne peut importer aucun fichier hors de `functions/src`,
// pas même un JSON partagé. C'est le test de parité qui rend cette duplication
// tenable : toute clé présente ici DOIT exister côté client avec le MÊME texte
// FR et le MÊME texte EN, au byte près.
//
// ⚠️ Un message de run est PERSISTÉ dans Firestore
// (`users/{uid}/workflowRunsLive/{workflowId}`) : il est figé dans la langue du
// run, résolue une fois pour toutes au démarrage (`ServerRunCtx.locale`). Un run
// lancé en anglais reste anglais si l'utilisateur repasse en français ensuite.
// C'est voulu — c'est une trace horodatée, pas de l'UI. Ne PAS « corriger » ça
// en mémorisant les clés : le panneau devrait alors retraduire l'historique.

export type Locale = 'fr' | 'en'

/** Repli : le français reste la langue par défaut du produit. */
export const DEFAULT_LOCALE: Locale = 'fr'

export const isLocale = (v: unknown): v is Locale => v === 'fr' || v === 'en'

/** Une entrée = le texte français ET sa traduction anglaise. */
type Entry = { fr: string; en: string }

/**
 * Messages de run du serveur. La CLÉ est un identifiant stable, jamais le
 * texte : contrairement à l'aide, il n'existe pas de mapping FR→EN de
 * référence à réutiliser ici.
 */
const MESSAGES = {
  // — Entrées vides / configuration manquante (partagé par plusieurs nodes) —
  'run.noCompetitor': { fr: 'Aucun site concurrent configuré.', en: 'No competitor site configured.' },
  'run.emptySheet': { fr: 'Feuille de produits vide en entrée.', en: 'Empty product sheet on the input.' },
  'run.noProduct': {
    fr: 'Aucun produit en entrée (branche les enseignes sur « concurrents »).',
    en: 'No product on the input (connect the retailers to the "competitors" port).',
  },

  // — Rapport dashboard de la Veille tarifaire (`compare-catalog`) —
  'run.sourceCatalogNotPersisted': {
    fr: 'Catalogue source non persisté : {message}',
    en: 'Source catalogue not persisted: {message}',
  },
  'run.dashboardSaved': {
    fr: 'Rapport dashboard enregistré (suivi « {watchId} ») — visible dans Veille tarifaire.',
    en: 'Dashboard report saved (monitoring "{watchId}") — visible in Price monitoring.',
  },
  'run.dashboardNotSaved': {
    fr: 'Rapport dashboard non enregistré : {message}',
    en: 'Dashboard report not saved: {message}',
  },

  // — Comparaison de prix (`compare-prices`) —
  'run.matched': {
    fr: '{count} produit(s) source — {matched} apparié(s) chez {sites} concurrent(s)',
    en: '{count} source product(s) — {matched} matched at {sites} competitor(s)',
  },
  'run.comparePrices.peers': {
    fr: '{count} produit(s) distinct(s) sur {sites} enseigne(s) ({matched} présent(s) chez ≥2) : {list}.',
    en: '{count} distinct product(s) across {sites} retailer(s) ({matched} present at ≥2): {list}.',
  },
  'run.comparePrices.noSourceRows': {
    fr: 'Aucun produit source en entrée (port « source »).',
    en: 'No source product on the input ("source" port).',
  },

  // — Rapport de fréquentation (`analytics-report`) —
  //
  // ⚠️ `run.aggregatingTraffic` porte « headless » : le serveur agrège SANS
  // navigateur, et le dire distingue un run du cron d'un run lancé à la main.
  // Le client a donc sa propre clé (`run.analytics.aggregating`) — c'est la
  // seule divergence de texte assumée de cette paire.
  'run.aggregatingTraffic': {
    fr: 'Agrégation du trafic ({period}, headless)…',
    en: 'Aggregating the traffic ({period}, headless)…',
  },
  'run.analytics.reportGenerated': {
    fr: 'Rapport généré : {pageViews} pages vues · {visitors} visiteurs · {sessions} sessions.',
    en: 'Report generated: {pageViews} page views · {visitors} visitors · {sessions} sessions.',
  },
  'run.analytics.ownerOnly': {
    fr: 'Rapport de fréquentation réservé au propriétaire du site (trafic global).',
    en: 'Traffic report restricted to the site owner (global traffic).',
  },
  // Périodes : interpolées DANS un message, donc traduites comme lui — sinon un
  // log anglais afficherait « (30 derniers jours) ».
  'run.period.7d': { fr: '7 derniers jours', en: 'last 7 days' },
  'run.period.30d': { fr: '30 derniers jours', en: 'last 30 days' },
  'run.period.90d': { fr: '90 derniers jours', en: 'last 90 days' },
  'run.period.12m': { fr: '12 derniers mois', en: 'last 12 months' },
} as const satisfies Record<string, Entry>

export type MessageKey = keyof typeof MESSAGES

/** Interpole `{param}` — même convention que `src/lib/i18n`. */
function interpolate(tpl: string, params?: Record<string, string | number>): string {
  if (!params) return tpl
  return tpl.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m))
}

/** Traduit un message de run dans la langue donnée. */
export function t(locale: Locale, key: MessageKey, params?: Record<string, string | number>): string {
  const entry = MESSAGES[key]
  return interpolate(locale === 'en' ? entry.en : entry.fr, params)
}

/** Le catalogue brut — exposé pour le test de parité client↔serveur UNIQUEMENT. */
export const RUN_MESSAGES: Record<string, Entry> = MESSAGES
