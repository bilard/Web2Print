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
  // — Moisson des concurrents (`harvest-competitor`) —
  'run.harvest.directedOnly': {
    fr: '{skipped} site(s) en recherche dirigée seule — non moissonné(s).',
    en: '{skipped} site(s) on directed search only — not harvested.',
  },
  'run.harvest.familiesRead': {
    fr: '{count} famille(s) lues dans la colonne « {column} ».',
    en: '{count} family/families read from the "{column}" column.',
  },
  'run.harvest.newCycle': {
    fr: 'Nouveau cycle : réouverture des balayages de tous les sites.',
    en: 'New cycle: reopening the sweeps of every site.',
  },
  'run.harvest.siteSweepDone': {
    fr: '{domain} : balayage terminé — en attente de la fin du cycle.',
    en: '{domain}: sweep finished — waiting for the end of the cycle.',
  },
  'run.harvest.siteIndexed': {
    fr: '{domain} : +{indexed} produit(s) sur {pages} page(s) (index : {total} pages).',
    en: '{domain}: +{indexed} product(s) over {pages} page(s) (index: {total} pages).',
  },
  'run.harvest.budgetReserved': {
    fr: 'Budget réservé au comparatif — {skipped} site(s) non démarré(s) ce run, la suite au prochain tick.',
    en: 'Budget reserved for the comparison — {skipped} site(s) not started on this run, the rest on the next tick.',
  },
  'run.harvest.cycleComplete': {
    fr: "Cycle complet : {count} site(s) à 100 % — prochaine relance à l'échéance calendaire.",
    en: 'Cycle complete: {count} site(s) at 100% — next start on the calendar due date.',
  },

  // — Moteur de moisson (`priceWatch/catalog/runHarvest.ts`, jumeau du client) —
  //
  // ⚠️ Ces messages ne sortent PAS d'un node : le moteur les émet via le
  // rappel `deps.log`, que le node branche sur `ctx.log`. Ils atterrissent donc
  // dans le même panneau. Un node « fait » dont le moteur logue en dur reste
  // à moitié traduit — c'est pour ça que le moteur est dans le même lot.
  'run.harvest.unknownUrlPattern': {
    fr: "{domain} : motif d'URL inconnu — sondage de {count} lien(s) candidat(s).",
    en: '{domain}: unknown URL pattern — probing {count} candidate link(s).',
  },
  'run.harvest.listPagesConfirmed': {
    fr: '{domain} : {confirmed} page(s) liste confirmée(s) → plan de {plan} (+{children} sous-rayon(s), +{mates} de même gabarit).',
    en: '{domain}: {confirmed} listing page(s) confirmed → plan of {plan} (+{children} sub-aisle(s), +{mates} of the same shape).',
  },
  'run.harvest.aiTargeting': {
    fr: '{domain} : ciblage IA — {kept}/{total} catégorie(s) retenue(s).',
    en: '{domain}: AI targeting — {kept}/{total} category/categories kept.',
  },
  'run.harvest.aiTargetingUnavailable': {
    fr: '{domain} : ciblage IA indisponible ({message}) — catalogue complet.',
    en: '{domain}: AI targeting unavailable ({message}) — full catalogue.',
  },
  'run.harvest.discoveryCoolingDown': {
    fr: '{domain} : découverte en veille (aucune catégorie trouvée il y a moins de {minutes} min) — relance manuelle ▶ pour re-sonder.',
    en: '{domain}: discovery on hold (no category found less than {minutes} min ago) — start manually with ▶ to probe again.',
  },
  'run.harvest.noCategory': {
    fr: '{domain} : aucune catégorie cible trouvée (accueil injoignable ou familles absentes).',
    en: '{domain}: no target category found (home page unreachable or families missing).',
  },
  'run.harvest.sweepingCategories': {
    fr: '{domain} : balayage de {count} catégorie(s).',
    en: '{domain}: sweeping {count} category/categories.',
  },
  'run.harvest.runWindowReached': {
    fr: '{domain} : fenêtre de run atteinte après {pages} page(s) — reprise au prochain passage.',
    en: '{domain}: run window reached after {pages} page(s) — resuming on the next pass.',
  },

  // — Sonde de pages liste (`priceWatch/catalog/probeListings.ts`) —
  'run.probe.listingFound': {
    fr: 'sonde : {url} → {count} produit(s), retenue comme page liste.',
    en: 'probe: {url} → {count} product(s), kept as a listing page.',
  },
  'run.probe.noListing': {
    fr: 'sonde : {probes} page(s) ouverte(s), aucune ne contient de liste produit.',
    en: 'probe: {probes} page(s) opened, none holds a product listing.',
  },

  // — Moteur de recherche dirigée (`priceWatch/catalog/searchDirected.ts`) —
  'run.directed.genericHit': {
    fr: '{domain} (générique) : « {query} » → {name} (preuve {evidence})',
    en: '{domain} (generic): "{query}" → {name} (evidence {evidence})',
  },
  'run.directed.hit': {
    fr: '{domain} : « {query} » → {name} (preuve {evidence})',
    en: '{domain}: "{query}" → {name} (evidence {evidence})',
  },

  // — Comparatif de catalogue (`compare-catalog`) —
  'run.compareCatalog.sourceKept': {
    fr: '{count} produit(s) source retenus sur {rows} ligne(s).',
    en: '{count} source product(s) kept out of {rows} row(s).',
  },
  'run.compareCatalog.duplicatesDropped': {
    fr: '{count} ligne(s) source écartées comme doublons — vérifie la « Colonne Référence » (identité repliée sur le nom si elle est absente).',
    en: '{count} source row(s) dropped as duplicates — check the "Reference column" (identity falls back to the name when it is missing).',
  },
  'run.compareCatalog.siteIndexCount': {
    fr: "{domain} : {count} produit(s) dans l'index.",
    en: '{domain}: {count} product(s) in the index.',
  },
  'run.compareCatalog.emptyIndex': {
    fr: 'Index concurrent vide pour les {sites} site(s) sous le suivi « {watchId} ». Vérifie que le node « Moisson concurrents » utilise le MÊME identifiant de suivi (« {watchId} ») et qu\'il a bien été lancé avant.',
    en: 'Competitor index empty for the {sites} site(s) under the "{watchId}" monitoring. Check that the "Harvest competitors" node uses the SAME monitoring identifier ("{watchId}") and that it ran first.',
  },
  'run.compareCatalog.matchedBreakdown': {
    fr: "{matched} produit(s) apparié(s) : {exact} même produit, {originOnly} pièce d'origine (adaptable ↔ OEM). {unmatched} sans correspondance, {noKey} sans clé.",
    en: '{matched} product(s) matched: {exact} same product, {originOnly} original part (aftermarket ↔ OEM). {unmatched} without a match, {noKey} without a key.',
  },

  // — Recherche dirigée (`directed-search`) —
  'run.directed.budgetReserved': {
    fr: 'Budget réservé au comparatif — recherche dirigée repoussée au prochain tick.',
    en: 'Budget reserved for the comparison — directed search postponed to the next tick.',
  },
  'run.directed.genericNoFirecrawlKey': {
    fr: 'Sites génériques sans clé Firecrawl — extraction via les replis Bright Data puis Jina.',
    en: 'Generic sites without a Firecrawl key — extraction through the Bright Data then Jina fallbacks.',
  },
  'run.directed.authNoFirecrawlKey': {
    fr: 'Site authentifié {host} mais aucune clé Firecrawl — ignoré.',
    en: 'Authenticated site {host} but no Firecrawl key — skipped.',
  },
  'run.directed.authMatched': {
    fr: 'Auth {host} : {hits}/{total} prix apparié(s) [curseur auth {from} → {to} / {products}].',
    en: 'Auth {host}: {hits}/{total} price(s) matched [auth cursor {from} → {to} / {products}].',
  },
  'run.directed.pricesFound': {
    fr: '{count} prix trouvé(s) sur {processed} produit(s) [curseur {from} → {to} / {products}] × {sites} site(s).',
    en: '{count} price(s) found over {processed} product(s) [cursor {from} → {to} / {products}] × {sites} site(s).',
  },
  'run.directed.noPriceFound': {
    fr: "Aucun prix trouvé sur cette passe. Vérifie que les clés interrogées existent CHEZ LES CONCURRENTS : une référence article et un EAN propres au distributeur sont introuvables ailleurs. Sur un catalogue de pièces adaptables, renseigne « Colonne Description (réf. d’origine) ».",
    en: 'No price found on this pass. Check that the keys queried exist AT THE COMPETITORS: an item reference and an EAN specific to the distributor cannot be found anywhere else. On an aftermarket parts catalogue, fill in "Description column (original ref.)".',
  },
  'run.directed.genericSummary': {
    fr: 'Générique ({sites} site(s)) : {queries} recherche(s) web · {noUrls} sans résultat (réf non vendue / 422) · {extracted} fiche(s) extraite(s){fallback} · {matched} appariée(s) par preuve exacte.',
    en: 'Generic ({sites} site(s)): {queries} web search(es) · {noUrls} with no result (ref not sold / 422) · {extracted} page(s) extracted{fallback} · {matched} matched by exact evidence.',
  },
  'run.directed.genericViaFallback': {
    fr: ' (dont {bd} Bright Data · {jina} Jina)',
    en: ' (of which {bd} Bright Data · {jina} Jina)',
  },
  'run.directed.krampHit': {
    fr: 'kramp : {name} {price}€ (preuve {evidence})',
    en: 'kramp: {name} {price}€ (evidence {evidence})',
  },
  'run.directed.creditsFirecrawl': {
    fr: 'Crédits Firecrawl ÉPUISÉS — extraction générique suspendue (appels sautés). Recharger sur firecrawl.dev.',
    en: 'Firecrawl credits EXHAUSTED — generic extraction suspended (calls skipped). Top up at firecrawl.dev.',
  },
  'run.directed.creditsJina': {
    fr: 'Crédits Jina ÉPUISÉS — recherches web suspendues (appels sautés). Recharger sur jina.ai.',
    en: 'Jina credits EXHAUSTED — web searches suspended (calls skipped). Top up at jina.ai.',
  },

  // — Périodes du rapport de fréquentation : interpolées DANS un message, donc
  // traduites comme lui — sinon un log anglais afficherait « (30 derniers jours) ».
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
