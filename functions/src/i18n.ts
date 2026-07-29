// Traduction des messages écrits par le SERVEUR (cron, webhook, Telegram).
//
// Pourquoi ça existe : les logs d'un run atterrissent dans
// `users/{uid}/workflowRunsLive/{workflowId}`, que la console de l'éditeur
// affiche — quel que soit l'exécuteur. Le client et le serveur écrivent donc
// dans le MÊME panneau. Si seul le client était traduit, un workflow lancé à
// la main logerait en anglais et le même workflow lancé par le cron en
// français. C'est cette incohérence que ce module ferme.
//
// Le catalogue est délibérément SÉPARÉ de `src/lib/i18n` : `functions/` est un
// projet TypeScript distinct, sans alias `@/` ni accès à `src/`. On n'y met
// que les messages réellement produits côté serveur.
import { getFirestore } from 'firebase-admin/firestore'

export type Locale = 'fr' | 'en'

/** Repli : le français reste la langue par défaut du produit. */
export const DEFAULT_LOCALE: Locale = 'fr'

const isLocale = (v: unknown): v is Locale => v === 'fr' || v === 'en'

/** Au-delà, on n'attend plus : la langue ne vaut pas de retarder un run. */
const LOOKUP_TIMEOUT_MS = 2_000

/**
 * Langue de l'utilisateur, depuis `users/{uid}.uiSettings.locale`
 * (écrit par `useLocaleSync` côté client).
 *
 * ⚠️ Ne JAMAIS faire échouer NI RETARDER un run pour ça. Deux protections,
 * parce que la première ne suffisait pas :
 *  - `try/catch` pour les erreurs de lecture ;
 *  - une COURSE contre un délai, parce qu'une lecture Firestore peut PENDRE
 *    (Admin non initialisé, réseau) — les tests du workflow expiraient à
 *    5 s avant qu'on ne l'ajoute.
 *
 * Dans les deux cas : repli sur le français.
 */
export async function getUserLocale(uid: string): Promise<Locale> {
  const read = (async (): Promise<Locale> => {
    const snap = await getFirestore().doc(`users/${uid}`).get()
    const raw = (snap.data()?.uiSettings as { locale?: unknown } | undefined)?.locale
    return isLocale(raw) ? raw : DEFAULT_LOCALE
  })()
  const bail = new Promise<Locale>((resolve) => {
    const timer = setTimeout(() => resolve(DEFAULT_LOCALE), LOOKUP_TIMEOUT_MS)
    // Ne retient pas le process Node vivant si le run se termine avant.
    if (typeof timer.unref === 'function') timer.unref()
  })
  return Promise.race([read, bail]).catch(() => DEFAULT_LOCALE)
}

/** Une entrée = le texte français ET sa traduction anglaise. */
type Entry = { fr: string; en: string }

/**
 * Messages de run du serveur. La CLÉ est un identifiant stable, jamais le
 * texte : contrairement à l'aide, il n'existe pas de mapping FR→EN de
 * référence à réutiliser ici.
 */
const MESSAGES = {
  'run.noCompetitor': { fr: 'Aucun site concurrent configuré.', en: 'No competitor site configured.' },
  'run.emptySheet': { fr: 'Feuille de produits vide en entrée.', en: 'Empty product sheet on the input.' },
  'run.noProduct': { fr: 'Aucun produit en entrée.', en: 'No product on the input.' },
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
  'run.matched': {
    fr: '{count} produit(s) source — {matched} apparié(s) chez {sites} concurrent(s)',
    en: '{count} source product(s) — {matched} matched at {sites} competitor(s)',
  },
  'run.aggregatingTraffic': {
    fr: 'Agrégation du trafic ({period}, headless)…',
    en: 'Aggregating the traffic ({period}, headless)…',
  },
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
