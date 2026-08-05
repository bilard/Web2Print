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
  'run.directed.noInputData': {
    fr: 'Recherche dirigée : aucune donnée produit en entrée.',
    en: 'Directed search: no product data on the input.',
  },
  'run.directed.noKeyColumn': {
    fr: 'Recherche dirigée : renseigne au moins une colonne Référence ou EAN.',
    en: 'Directed search: fill in at least a Reference or an EAN column.',
  },
  'run.directed.budgetReserved': {
    fr: 'Budget réservé au comparatif — recherche dirigée repoussée au prochain tick.',
    en: 'Budget reserved for the comparison — directed search postponed to the next tick.',
  },
  'run.directed.enginesForced': {
    fr: '{count} site(s) avec moteur forcé (Firecrawl / Bright Data / Jina) : la recherche dirigée l’utilise aussi.',
    en: '{count} site(s) with a forced engine (Firecrawl / Bright Data / Jina): directed search uses it too.',
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

  // — Veille de prix simple (`price-watch`) —
  'run.pw.emptySheet': { fr: 'Sheet vide — aucun prix à surveiller.', en: 'Empty sheet — no price to monitor.' },
  'run.pw.firstReading': {
    fr: 'Premier relevé : {count} prix mémorisés (aucune alerte).',
    en: 'First reading: {count} price(s) recorded (no alert).',
  },
  'run.pw.noChange': {
    fr: 'Aucune variation ({count} prix comparés, seuil {threshold} %).',
    en: 'No change ({count} price(s) compared, threshold {threshold}%).',
  },
  'run.pw.changes': {
    fr: '{count} variation(s) détectée(s) — port « changes » émis.',
    en: '{count} change(s) detected — "changes" port emitted.',
  },

  // — Suivi de prix concurrents (`price-watch-track`) —
  'run.pwt.noProduct': {
    fr: 'Aucun produit exploitable en entrée — vérifie le branchement et le mapping des colonnes.',
    en: 'No usable product on the input — check the wiring and the column mapping.',
  },
  'run.pwt.noAlert': { fr: 'Aucune alerte.', en: 'No alert.' },
  'run.pwt.alerts': {
    fr: '{count} alerte(s) — port « changes » émis.',
    en: '{count} alert(s) — "changes" port emitted.',
  },
  'run.pwt.noPage': { fr: 'Aucune page trouvée : {name} @ {domain}', en: 'No page found: {name} @ {domain}' },
  'run.pwt.blocked': {
    fr: 'Page bloquée/vide (anti-bot), aucun relevé : {url}',
    en: 'Page blocked/empty (anti-bot), nothing read: {url}',
  },
  'run.pwt.unreadablePrice': { fr: 'Prix illisible : {url}', en: 'Unreadable price: {url}' },
  'run.pwt.toConfirm': {
    fr: 'À confirmer ({verdict}) : {name} @ {domain}',
    en: 'To confirm ({verdict}): {name} @ {domain}',
  },

  // — Rapport de coûts IA (`cost-report`) —
  // Comme le rapport de fréquentation : le serveur agrège SANS navigateur et le dit.
  'run.cost.aggregatingHeadless': {
    fr: 'Agrégation des coûts IA & scraping du mois (headless)…',
    en: 'Aggregating the AI & scraping costs of the month (headless)…',
  },
  'run.cost.reportGenerated': {
    fr: 'Rapport généré : total {total} € · {tokensIn} in / {tokensOut} out{size}.',
    en: 'Report generated: total €{total} · {tokensIn} in / {tokensOut} out{size}.',
  },

  // — Webhook sortant (`webhook-post`) —
  'run.wh.urlMissing': { fr: 'webhook-post : URL du webhook manquante.', en: 'webhook-post: webhook URL missing.' },
  'run.wh.noRowToSend': {
    fr: 'Mode « 1 requête par ligne » : aucune ligne reçue — rien à envoyer.',
    en: 'Mode "1 request per row": no row received — nothing to send.',
  },
  'run.wh.rowFailed': { fr: 'Ligne {i} échouée : {message}', en: 'Row {i} failed: {message}' },
  'run.wh.httpError': { fr: 'Webhook : HTTP {status}{body}', en: 'Webhook: HTTP {status}{body}' },
  'run.wh.sent': { fr: 'Webhook envoyé → {url} (HTTP {status}).', en: 'Webhook sent → {url} (HTTP {status}).' },
  'run.wh.invalidUrl': { fr: 'webhook-post : URL invalide « {url} ».', en: 'webhook-post: invalid URL "{url}".' },
  'run.wh.badScheme': {
    fr: 'webhook-post : schéma non autorisé ({scheme}).',
    en: 'webhook-post: scheme not allowed ({scheme}).',
  },
  'run.wh.internalTarget': { fr: 'webhook-post : cible interne refusée.', en: 'webhook-post: internal target refused.' },
  'run.wh.internalIp': {
    fr: 'webhook-post : cible interne refusée (IP privée/link-local).',
    en: 'webhook-post: internal target refused (private/link-local IP).',
  },

  // — Sites sources (`source-sites`) —
  'run.ss.noActiveSite': {
    fr: 'Aucun site actif — les nodes branchés ne scraperont rien.',
    en: 'No active site — the wired nodes will scrape nothing.',
  },
  'run.ss.emitted': {
    fr: '{count} site(s) actif(s) émis (suivi « {watchId} »){suffix}',
    en: '{count} active site(s) emitted (monitoring "{watchId}"){suffix}',
  },
  'run.ss.forcedEngine': {
    fr: ' — {count} avec moteur forcé.',
    en: ' — {count} with a forced engine.',
  },

  // — Produits d'une page liste (`list-products`) —
  //
  // La paire diverge beaucoup : le serveur détaille l'escalade Jina → Bright Data,
  // le client la résume. Les clés communes sont celles dont le TEXTE est identique
  // au byte ; les autres restent propres à un côté.
  'run.lp.retryExtract': {
    fr: '{label} : 0 produit sur {chars} chars → nouvelle tentative d’extraction ({try}/{max}) — le LLM rend parfois une liste vide à tort.',
    en: '{label}: 0 product over {chars} chars → new extraction attempt ({try}/{max}) — the LLM sometimes returns an empty list wrongly.',
  },
  'run.lp.deterministic': {
    fr: '{site} : {count} produit(s) déterministes (JSON-LD ItemList + datalayer).',
    en: '{site}: {count} deterministic product(s) (JSON-LD ItemList + datalayer).',
  },
  'run.lp.llmFailed': {
    fr: 'Extraction LLM échouée pour {site} : {message}',
    en: 'LLM extraction failed for {site}: {message}',
  },
  'run.lp.thinViaJina': {
    fr: '{site} : {count} produit(s) de marque (maigre) via Jina/Web Unlocker → escalade Scraping Browser (rendu JS).',
    en: '{site}: {count} brand product(s) (thin) through Jina/Web Unlocker → escalating to Scraping Browser (JS rendering).',
  },
  'run.lp.viaScrapingBrowser': {
    fr: '{site} : {count} produit(s) de marque via Scraping Browser — grille rendue en JS (Web Unlocker insuffisant : {before}).',
    en: '{site}: {count} brand product(s) through Scraping Browser — grid rendered in JS (Web Unlocker insufficient: {before}).',
  },
  'run.lp.enriching': {
    fr: 'Enrichissement de {count} fiche(s) (EAN/marque/prix)…',
    en: 'Enriching {count} record(s) (EAN/brand/price)…',
  },
  'run.lp.enriched': { fr: 'Fiches enrichies : {count}/{total}.', en: 'Records enriched: {count}/{total}.' },
  'run.lp.brandFilter': {
    fr: 'Filtre marque « {brand} » : {count} produit(s) hors-marque écarté(s).',
    en: 'Brand filter "{brand}": {count} off-brand product(s) dropped.',
  },
  'run.lp.viaModels': { fr: ' — extraction via {models}', en: ' — extraction through {models}' },
  'run.lp.jinaFailed': { fr: 'Lecture Jina échouée {url} : {message}', en: 'Jina read failed {url}: {message}' },
  'run.lp.jinaNoContent': {
    fr: 'Jina sans contenu pour {url} → escalade Bright Data.',
    en: 'Jina returned no content for {url} → escalating to Bright Data.',
  },
  'run.lp.jinaThin': {
    fr: 'Jina maigre ({markers} prix) pour {url} → escalade Bright Data.',
    en: 'Jina thin ({markers} prices) for {url} → escalating to Bright Data.',
  },
  'run.lp.brightDataFailed': { fr: 'Bright Data échoué {url} : {message}', en: 'Bright Data failed {url}: {message}' },
  'run.lp.directParse': {
    fr: '{label} : {count} produit(s), parse direct [{model}, stop={stop}, markdown {chars} chars].',
    en: '{label}: {count} product(s), direct parse [{model}, stop={stop}, markdown {chars} chars].',
  },
  'run.lp.recovered': {
    fr: '{label} : {count} produit(s) extrait(s) [{model}] — réponse tronquée ({chars} chars), récupération OK.',
    en: '{label}: {count} product(s) extracted [{model}] — response truncated ({chars} chars), recovery OK.',
  },
  'run.lp.zeroProduct': {
    fr: '{label} : 0 produit [{model}, stop={stop}, {chars} chars, markdown {mdChars}].',
    en: '{label}: 0 product [{model}, stop={stop}, {chars} chars, markdown {mdChars}].',
  },
  'run.lp.noListingOnDomain': {
    fr: 'Aucune page liste « {family} » sur {domain}.',
    en: 'No listing page "{family}" on {domain}.',
  },
  'run.lp.searchFailed': { fr: 'Recherche échouée sur {domain} : {message}', en: 'Search failed on {domain}: {message}' },
  'run.lp.discoveryEmpty': {
    fr: 'Découverte « {family} » : aucune page liste trouvée.',
    en: 'Discovery "{family}": no listing page found.',
  },
  'run.lp.noValidUrl': { fr: 'Aucune URL de page liste valide.', en: 'No valid listing page URL.' },
  'run.lp.noContent': { fr: 'Aucun contenu pour {url}.', en: 'No content for {url}.' },
  'run.lp.noNextPage': {
    fr: '{site} : pas de page suivante exploitable (param « {param} » ?) — 1 page lue.',
    en: '{site}: no usable next page (parameter "{param}"?) — 1 page read.',
  },
  'run.lp.paginationEnd': {
    fr: '{site} : fin de pagination à la page ~{page}.',
    en: '{site}: end of pagination at page ~{page}.',
  },
  'run.lp.totalDeduped': {
    fr: 'Total : {count} produit(s) dédupliqué(s){cap}{model}.',
    en: 'Total: {count} deduplicated product(s){cap}{model}.',
  },
  'run.lp.cap': { fr: ' (cap {max})', en: ' (cap {max})' },
  'run.lp.noProductExtracted': { fr: 'Aucun produit extrait.', en: 'No product extracted.' },

  // — PIM, Telegram, Higgsfield —
  'run.pim.missingProject': { fr: 'save-pim : projectId manquant.', en: 'save-pim: projectId missing.' },
  'run.pim.projectNotFound': {
    fr: 'save-pim : projet PIM introuvable ou non autorisé.',
    en: 'save-pim: PIM project not found or not allowed.',
  },
  'run.pim.written': {
    fr: 'save-pim : {count} produit(s) écrit(s) dans {project} (source {source}).',
    en: 'save-pim: {count} product(s) written to {project} (source {source}).',
  },
  'run.tg.noRowToSend': {
    fr: 'Mode « 1 message par ligne » : aucune ligne reçue — rien à envoyer.',
    en: 'Mode "1 message per row": no row received — nothing to send.',
  },
  'run.tg.rowSkipped': {
    fr: 'Ligne {i} ignorée : token, chat ou message manquant.',
    en: 'Row {i} skipped: token, chat or message missing.',
  },
  'run.tg.rowSent': { fr: '[{i}/{total}] → {chat} (msg {id}).', en: '[{i}/{total}] → {chat} (msg {id}).' },
  'run.tg.noBotToken': {
    fr: 'send-telegram : bot token introuvable (config ou users/{uid}.telegram.botToken).',
    en: 'send-telegram: bot token not found (config or users/{uid}.telegram.botToken).',
  },
  'run.tg.noChatId': {
    fr: 'send-telegram : chatId introuvable (config ou users/{uid}.telegram.chatId).',
    en: 'send-telegram: chatId not found (config or users/{uid}.telegram.chatId).',
  },
  'run.tg.emptyMessage': {
    fr: 'send-telegram : message vide (champ Message ou port data).',
    en: 'send-telegram: empty message (Message field or data port).',
  },
  'run.tg.sent': { fr: 'Telegram envoyé à {chat} (msg {id}).', en: 'Telegram sent to {chat} (msg {id}).' },
  'run.tg.apiError': { fr: 'send-telegram : Telegram {detail}', en: 'send-telegram: Telegram {detail}' },
  'run.hf.noKey': {
    fr: 'Clé Higgsfield absente du profil (Paramètres → Connecteurs).',
    en: 'Higgsfield key missing from the profile (Settings → Connectors).',
  },
  'run.hf.generating': { fr: 'Higgsfield {mode} — génération en cours…', en: 'Higgsfield {mode} — generating…' },
  'run.hf.generated': {
    fr: 'Higgsfield : {count} asset(s) généré(s).',
    en: 'Higgsfield: {count} asset(s) generated.',
  },
  'run.hf.notDownloadableServer': {
    fr: 'Fichier non téléchargeable côté serveur — utilise « Save DAM » via le port assets.',
    en: 'File not downloadable on the server — use "Save DAM" through the assets port.',
  },

  // — Famille Google (Sheets / Drive / Gmail) —
  //
  // ⚠️ UNE clé de STRUCTURE pour tous les diagnostics d'API HTTP. Leur donner une
  // clé chacun (`Sheets get`, `batchUpdate`, `addChart`…) serait du bruit : ce qui
  // se traduit ici c'est la PONCTUATION autour, pas le nom de l'opération, qui est
  // un identifiant technique et reste littéral.
  'run.ws.modeNotServer': {
    fr: 'Web Scraping : mode « {mode} » non exécutable côté serveur.',
    en: 'Web Scraping: mode "{mode}" cannot run on the server.',
  },
  'run.api.error': { fr: '{api} {status}: {body}', en: '{api} {status}: {body}' },
  // Repli quand l'API ne renvoie AUCUN détail. Le message englobant dit déjà ce qui
  // a échoué (« gdrive-export : Drive 403 — … »), d'où un seul mot générique.
  'run.api.noDetail': { fr: 'échec', en: 'failure' },

  'run.gs.workbookFull': {
    fr: 'Classeur Google plein (10 millions de cellules, tous onglets confondus). Les onglets gardent les cellules des exports précédents même vidées : supprimez les onglets obsolètes, ou les lignes/colonnes vides (« Supprimer », pas « Effacer »), ou exportez vers un classeur dédié.',
    en: 'Google workbook full (10 million cells across all tabs). Tabs keep the cells of previous exports even once emptied: delete the obsolete tabs, or the empty rows/columns ("Delete", not "Clear"), or export to a dedicated workbook.',
  },
  'run.gs.chartAxisMissing': {
    fr: 'axe X ou colonnes de valeurs introuvables',
    en: 'X axis or value columns not found',
  },
  'run.gs.emptySheetInput': {
    fr: 'gsheets-export : sheet vide en entrée.',
    en: 'gsheets-export: empty sheet on the input.',
  },
  'run.gs.driveCreateFailed': {
    fr: 'gsheets-export : création Drive {status} — {message}',
    en: 'gsheets-export: Drive creation {status} — {message}',
  },
  'run.gs.tzIgnored': { fr: 'Fuseau horaire ignoré : {message}', en: 'Time zone skipped: {message}' },
  'run.gs.formulasIgnored': { fr: 'Colonnes formule ignorées : {message}', en: 'Formula columns skipped: {message}' },
  'run.gs.formulasAdded': { fr: '{count} colonne(s) formule ajoutée(s).', en: '{count} formula column(s) added.' },
  'run.gs.formatIgnored': { fr: 'Formatage colonnes ignoré : {message}', en: 'Column formatting skipped: {message}' },
  'run.gs.condColorsIgnored': {
    fr: 'Couleurs conditionnelles ignorées : {message}',
    en: 'Conditional colours skipped: {message}',
  },
  'run.gs.gridTrimmed': {
    fr: 'Grille ajustée : {count} cellule(s) rendue(s) au classeur.',
    en: 'Grid trimmed: {count} cell(s) returned to the workbook.',
  },
  'run.gs.gridTrimIgnored': {
    fr: 'Ajustement de la grille ignoré : {message}',
    en: 'Grid trimming skipped: {message}',
  },
  'run.gs.grouped': { fr: 'Colonnes groupées par concurrent (repliables).', en: 'Columns grouped per competitor (collapsible).' },
  'run.gs.groupIgnored': { fr: 'Groupes de colonnes ignorés : {message}', en: 'Column groups skipped: {message}' },
  'run.gs.styled': { fr: 'Tableau mis en forme (en-tête figé, colonnes ajustées).', en: 'Table styled (frozen header, fitted columns).' },
  'run.gs.styleIgnored': { fr: 'Mise en forme ignorée : {message}', en: 'Styling skipped: {message}' },
  'run.gs.chartInserted': { fr: 'Graphique inséré.', en: 'Chart inserted.' },
  'run.gs.chartIgnored': { fr: 'Graphique ignoré : {message}', en: 'Chart skipped: {message}' },
  'run.gs.chartSkipped': {
    fr: 'Graphique ignoré : axe X / colonnes de valeurs manquants (ou aucune donnée).',
    en: 'Chart skipped: X axis / value columns missing (or no data).',
  },
  // ⚠️ Deux clés au lieu d'un verbe interpolé : « créé » servait AUSSI de valeur de
  // contrôle (`if (verb === 'créé')`). Un littéral affiché qui pilote une branche est
  // toujours à sortir du texte — cf. le piège du lot 2.
  'run.gs.sheetCreated': {
    fr: 'Google Sheet « {name} » créé ({rows} lignes) — {link}',
    en: 'Google Sheet "{name}" created ({rows} rows) — {link}',
  },
  'run.gs.sheetUpdated': {
    fr: 'Google Sheet « {name} » mis à jour ({rows} lignes) — {link}',
    en: 'Google Sheet "{name}" updated ({rows} rows) — {link}',
  },
  'run.gs.noFileSelected': {
    fr: 'gsheets-import : aucun Google Sheets sélectionné (config.fileId vide).',
    en: 'gsheets-import: no Google Sheets selected (config.fileId empty).',
  },
  'run.gs.noTab': {
    fr: 'gsheets-import : le classeur ne contient aucun onglet.',
    en: 'gsheets-import: the workbook contains no tab.',
  },
  'run.gs.importing': {
    fr: 'Import GSheet {name} — onglet #{index} « {title} »…',
    en: 'Importing GSheet {name} — tab #{index} "{title}"…',
  },
  'run.gs.tabEmpty': {
    fr: "gsheets-import : l'onglet « {title} » est vide.",
    en: 'gsheets-import: the tab "{title}" is empty.',
  },
  'run.gs.imported': {
    fr: '{rows} ligne(s) × {columns} colonne(s) chargée(s) depuis « {title} ».',
    en: '{rows} row(s) × {columns} column(s) loaded from "{title}".',
  },

  'run.gd.missingFile': {
    fr: 'gdrive-export : fichier manquant en entrée — branche un node qui produit un fichier (port « file »).',
    en: 'gdrive-export: file missing on the input — wire a node that produces a file ("file" port).',
  },
  'run.gd.uploading': { fr: 'Upload Drive « {name} » ({size} KB)…', en: 'Drive upload "{name}" ({size} KB)…' },
  'run.gd.uploadFailed': {
    fr: 'gdrive-export : Drive {status} — {message}',
    en: 'gdrive-export: Drive {status} — {message}',
  },
  'run.gd.ok': { fr: 'OK — {link}', en: 'OK — {link}' },

  'run.gm.apiError': { fr: 'send-gmail : Gmail {status} — {message}', en: 'send-gmail: Gmail {status} — {message}' },
  'run.gm.noSourceFile': {
    fr: 'Mode « Fichier source » actif mais aucun fichier en entrée (relie une sortie « file » au port « attachment » ou « data »). Envoi sans pièce jointe.',
    en: 'Mode "Source file" active but no file on the input (wire a "file" output to the "attachment" or "data" port). Sending without an attachment.',
  },
  'run.gm.noRowToSend': {
    fr: 'Mode « 1 email par ligne » : aucune ligne reçue — rien à envoyer.',
    en: 'Mode "1 email per row": no row received — nothing to send.',
  },
  'run.gm.rowNoRecipient': { fr: 'Ligne {i} ignorée : destinataire vide.', en: 'Row {i} skipped: empty recipient.' },
  'run.gm.rowSent': { fr: '[{i}/{total}] email → {to}', en: '[{i}/{total}] email → {to}' },
  'run.gm.noRecipient': {
    fr: 'send-gmail : destinataire (« to ») manquant.',
    en: 'send-gmail: recipient ("to") missing.',
  },
  'run.gm.sent': { fr: 'Email envoyé à {to} (id {id}).', en: 'Email sent to {to} (id {id}).' },

  // — Exécuteur : arrêt et type inconnu (client ET serveur) —
  'run.stopped': { fr: 'Run arrêté', en: 'Run stopped' },
  'run.unknownType': { fr: 'Type inconnu : {type}', en: 'Unknown type: {type}' },
  'run.unknownTypeInLoop': {
    fr: 'Type inconnu dans le body de loop : {type}',
    en: 'Unknown type in the loop body: {type}',
  },

  // — Logique et transformations (`pure.ts` : if-else, pipe, loop-*, text-input, transform-*) —
  'run.pure.emptyText': { fr: 'Le texte saisi est vide.', en: 'The text entered is empty.' },
  'run.pure.evalError': { fr: 'Erreur d’évaluation "{expr}" : {message}', en: 'Evaluation error "{expr}": {message}' },
  'run.pure.condition': { fr: 'Condition "{expr}" = {result}', en: 'Condition "{expr}" = {result}' },
  'run.pure.stepError': { fr: 'Étape {step} "{expr}" : {message}', en: 'Step {step} "{expr}": {message}' },
  'run.pure.itemsNotArray': {
    fr: "Loop each : l'entrée 'items' doit être un tableau.",
    en: "Loop each: the 'items' input must be an array.",
  },
  // Texte unifié sur la version CLIENT, plus explicite (« sans Loop Collect en aval »).
  'run.pure.loopIsolated': {
    fr: 'Loop each isolé (sans Loop Collect en aval) — forwarde le premier élément seulement.',
    en: 'Loop each on its own (no Loop Collect downstream) — forwards the first item only.',
  },
  'run.pure.setColumns': {
    fr: 'Définit {columns} colonne(s) sur {rows} ligne(s).',
    en: 'Sets {columns} column(s) on {rows} row(s).',
  },
  'run.pure.filterInvalid': {
    fr: 'Filtre : expression invalide "{expr}" — {message}',
    en: 'Filter: invalid expression "{expr}" — {message}',
  },
  'run.pure.filterKept': { fr: 'Filtre : {kept}/{total} ligne(s).', en: 'Filter: {kept}/{total} row(s).' },
  'run.pure.sorted': { fr: 'Tri {direction} sur "{column}".', en: 'Sort {direction} on "{column}".' },
  'run.pure.renamed': { fr: 'Renommage de {count} colonne(s).', en: 'Renamed {count} column(s).' },
  'run.pure.badRegex': { fr: 'Regex invalide — {message}', en: 'Invalid regex — {message}' },
  'run.pure.textOp': { fr: '{op} sur "{source}" → "{target}".', en: '{op} on "{source}" → "{target}".' },

  // — Réseau (`network.ts` : web-search, scrape-url, enrichment) —
  'run.net.emptyQuery': { fr: 'Requête vide.', en: 'Empty query.' },
  'run.net.searching': { fr: 'Recherche web : « {query} »', en: 'Web search: "{query}"' },
  'run.net.results': { fr: '{count} résultat(s).', en: '{count} result(s).' },
  'run.net.noValidUrl': { fr: 'Aucune URL valide.', en: 'No valid URL.' },
  'run.net.scraping': { fr: 'Scrape {url}', en: 'Scrape {url}' },
  'run.net.scrapeFailed': { fr: 'Échec {url} : {message}', en: 'Failed {url}: {message}' },
  'run.net.enriching': { fr: 'Enrichissement {url}', en: 'Enriching {url}' },
  'run.net.enrichFailed': { fr: 'Enrichissement échoué {url} : {message}', en: 'Enrichment failed {url}: {message}' },
  'run.net.enriched': { fr: 'Enrichi {count} ligne(s).', en: 'Enriched {count} row(s).' },

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
