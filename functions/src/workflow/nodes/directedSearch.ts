// functions/src/workflow/nodes/directedSearch.ts
// Jumeau SERVEUR (headless/cron) du node « Recherche dirigée »
// (src/features/workflows/registry/directedSearchNode.ts). Pour chaque produit source,
// interroge le moteur de recherche de chaque concurrent (réf puis EAN) et apparie par
// PREUVE EXACTE (proveMatch), puis persiste le hit dans l'index → « Comparer catalogue »
// l'affiche dans le dashboard. Curseur persistant : le cron accumule tick après tick.
//
// Différences client : fetch HTML DIRECT (même IP CF), store admin-SDK, pas de
// reportConnector/reportCount. Logique partagée via les modules purs dupliqués.
import { registerServerNode } from '../registry'
import { fetchHtml } from '../../scraper/fetchHtml'
import { buildServerFetcher } from '../../priceWatch/catalog/serverFetcher'
import { stableId } from '../../priceWatch/helpers'
import { resolveSitesInput, sitesForRole } from '../../priceWatch/sourceSites'
import { savePage, loadCompetitorMeta, saveCompetitorMeta } from '../../priceWatch/catalog/store'
import { directedPass, type DirectedSourceProduct, type DirectedSite, type DirectedHit } from '../../priceWatch/catalog/searchDirected'
import { parseProductPage, parsePriceFragment, type CompetitorListing } from '../../priceWatch/catalog/competitorListing'
import { extractOriginRefs } from '../../priceWatch/catalog/match'
import { jinaSearch, jinaRead } from '../jina'
import { brightDataRead } from '../brightData'
import { firecrawlScrapeProduct } from '../../scraper/firecrawlProduct'
import { creditsExhausted } from '../../scraper/creditBreaker'
import { getUserApiKey } from '../apiKeys'
import { getSiteCredentials } from '../../scraper/siteCredentials'
import { krampBatchScrape } from '../../scraper/krampFirecrawl'
import { krampAuthPass } from '../../priceWatch/catalog/krampAuthPass'
import { t } from '../../i18n'
import { loadPairingRules } from '../../priceWatch/pairingRulesStore'
import { rulesDifferFromDefault, summarizeRules } from '../../priceWatch/catalog/pairingRules'

const VAT = 0.2

/** Domaine nu (pour l'opérateur `site:` et la comparaison). */
const bare = (d: string): string => d.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').replace(/^www\./i, '')

const RESULT_COLUMNS = [
  { key: 'produit', label: 'Produit', fieldType: 'text', detectedType: 'text', isPrimary: true, width: 220 },
  { key: 'ref', label: 'Référence', fieldType: 'text', detectedType: 'text', isPrimary: false, width: 120 },
  { key: 'ean', label: 'EAN', fieldType: 'text', detectedType: 'text', isPrimary: false, width: 130 },
  { key: 'site', label: 'Concurrent', fieldType: 'text', detectedType: 'text', isPrimary: false, width: 180 },
  { key: 'prixTtc', label: 'Prix TTC', fieldType: 'currency', detectedType: 'currency', isPrimary: false, width: 100 },
  { key: 'prixHt', label: 'Prix HT', fieldType: 'currency', detectedType: 'currency', isPrimary: false, width: 100 },
  { key: 'preuve', label: 'Appariement', fieldType: 'text', detectedType: 'text', isPrimary: false, width: 110 },
  { key: 'lien', label: 'Lien', fieldType: 'url', detectedType: 'url', isPrimary: false, width: 240 },
]

function resultsSheet(rows: Record<string, unknown>[]) {
  return { name: 'Prix trouvés (recherche dirigée)', columns: RESULT_COLUMNS, rows, taxonomy: [] }
}

interface SheetLike { rows?: Record<string, unknown>[] }

registerServerNode({
  type: 'directed-search',
  run: async (ctx, config, inputs) => {
    // Sites + watchId : le port `sites` (node « Sites sources ») GAGNE, sinon config locale.
    const resolved = resolveSitesInput(inputs.sites, {
      sitesText: String(config.sites ?? ''), watchIdRaw: String(config.watchId ?? ''), workflowId: ctx.workflowId,
    })
    const watchId = resolved.watchId
    const sheet = (inputs.products ?? {}) as SheetLike
    if (!sheet.rows || sheet.rows.length === 0) {
      throw new Error(t(ctx.locale, 'run.directed.noInputData'))
    }
    // Sites « génériques » (marketplaces non-PrestaShop) : recherche web + Firecrawl.
    const genericDomains = new Set(String(config.genericSites ?? '').split(/[\n,]/).map((d) => bare(d.trim())).filter(Boolean))
    // Un site marqué « moisson » ne passe PAS par la recherche dirigée (payante à la réf).
    const directedSites = sitesForRole(resolved.sites, 'directed')
    const sites: DirectedSite[] = directedSites.map((s) => ({
      siteId: stableId(s.domain), domain: s.domain, generic: genericDomains.has(bare(s.domain)),
    }))
    // ⚠ Jumeau du client : le moteur choisi par site (Firecrawl, Bright Data, Jina) vaut
    // AUSSI pour la recherche dirigée. Sans cela, un site réglé sur Firecrawl restait servi
    // par la cascade automatique, qui s'arrête au premier HTML « utilisable » — sur une
    // grille lazy-load, aucun prix n'en sort.
    const fetcherByHost = new Map<string, ReturnType<typeof buildServerFetcher>>()
    for (const s of directedSites) {
      if (!s.engine && !s.auth) continue
      fetcherByHost.set(bare(s.domain), buildServerFetcher(ctx.uid, s))
    }
    if (fetcherByHost.size > 0) {
      ctx.log('info', t(ctx.locale, 'run.directed.enginesForced', { count: fetcherByHost.size }))
    }
    if (sites.length === 0) { ctx.log('warn', t(ctx.locale, 'run.noCompetitor')); return { results: resultsSheet([]) } }

    // Fenêtre AVAL déjà atteinte (la moisson a consommé la part des nodes à curseur) :
    // passe repoussée au prochain tick — le curseur ne bouge pas, « Comparer » garde sa
    // fenêtre CE run. Une passe démarrée avant l'échéance va au bout (bornée par
    // productBudget), la réserve absorbe ce débordement.
    // Signal composite : le curseur n'étant écrit qu'APRÈS la passe, un run tué à
    // l'échéance ne fait avancer RIEN. En s'arrêtant proprement, `directedPass` avance au
    // plus grand préfixe traité — un gros budget ne coûte donc plus rien en dépassement.
    const timedSignal = { get aborted() { return ctx.signal?.aborted === true || (ctx.deadlineAt != null && Date.now() > ctx.deadlineAt) } }
    if (ctx.deadlineAt && Date.now() > ctx.deadlineAt) {
      ctx.log('info', t(ctx.locale, 'run.directed.budgetReserved'))
      return { results: resultsSheet([]) }
    }

    // Dépendances du mode générique (chargées seulement si ≥ 1 site générique → pas de coût sinon).
    const hasGeneric = sites.some((s) => s.generic)
    const firecrawlKey = hasGeneric ? (await getUserApiKey(ctx.uid, 'firecrawl')) : ''
    if (hasGeneric && !firecrawlKey) ctx.log('warn', t(ctx.locale, 'run.directed.genericNoFirecrawlKey'))
    // Compteurs de diagnostic du mode générique : sans eux, une couverture marketplace
    // faible (les réfs OEM ne sont pas vendues sur amazon/cdiscount…) est indistinguable
    // d'une panne. On les journalise en fin de passe pour rendre la réalité VISIBLE.
    let genQueries = 0, genNoUrls = 0, genExtracted = 0, genViaBd = 0, genViaJina = 0
    // ⚠ « 0 résultat » et « la recherche a ÉCHOUÉ » étaient comptés ensemble : un
    // « 60 sans résultat » se lisait alors « ces réfs ne sont vendues nulle part »
    // alors que le moteur pouvait être HS (quota, 4xx, timeout). Les deux mènent à
    // 0 fiche, mais l'un est une réalité du marché et l'autre une panne à réparer.
    let genFailed = 0
    let firstFailure = ''
    const searchWeb = async (query: string): Promise<string[]> => {
      genQueries++
      try {
        const urls = (await jinaSearch(ctx.uid, query, ctx.signal)).map((r) => r.url).filter(Boolean)
        if (urls.length === 0) genNoUrls++ // 0 URL = réf non référencée sur ce marketplace
        return urls
      } catch (e) {
        genFailed++
        if (!firstFailure) firstFailure = e instanceof Error ? e.message : String(e)
        return []
      }
    }
    // Extraction d'UNE fiche marketplace, en CASCADE : Firecrawl (rendu JS + schéma) →
    // Bright Data (Web Unlocker/Scraping Browser + parseurs déterministes JSON-LD/microdata)
    // → Jina Reader (markdown, dernier recours). On ne cascade que si le palier est
    // INDISPONIBLE (clé absente / crédits épuisés — circuit breaker), pas quand il a
    // répondu « pas une fiche produit » : sinon chaque échec légitime paierait 3 fetchs.
    const extractProduct = async (url: string): Promise<CompetitorListing | null> => {
      if (firecrawlKey && !creditsExhausted('firecrawl')) {
        const p = await firecrawlScrapeProduct(url, firecrawlKey)
        if (p && p.price != null) {
          genExtracted++
          return {
            url, name: p.name ?? '', ref: p.reference, price: p.price, listPrice: p.listPrice,
            currency: p.currency,
            taxIncluded: true, // prix affiché B2C = TTC
            availability: p.inStock == null ? undefined : (p.inStock ? 'in-stock' : 'out-of-stock'),
            // Visuel et vendeur : ce palier ne les remontait pas, alors que le repli
            // Bright Data (parseProductPage) le faisait déjà — d'où des lignes marketplace
            // sans vignette et sans marchand, sans rien pour l'expliquer.
            // ⚠ `seller` est extrait par MODÈLE : affichage seul, il n'entre pas dans
            // `toIdentity` et ne peut donc ni prouver ni condamner un appariement.
            image: p.image, seller: p.seller,
          }
        }
        // Firecrawl a répondu (pas une fiche / rien d'extrait) → pas de cascade.
        // S'il vient de disjoncter (402 pendant CET appel), on enchaîne sur les replis.
        if (!creditsExhausted('firecrawl')) return null
      }
      try {
        const { html } = await brightDataRead(url)
        const fiche = parseProductPage(html, url)
        if (fiche && fiche.price != null) {
          genExtracted++; genViaBd++
          return { ...fiche, taxIncluded: fiche.taxIncluded ?? true }
        }
      } catch { /* Bright Data indisponible (non configuré / crédits) → Jina */ }
      try {
        const { title, content } = await jinaRead(ctx.uid, url)
        // Markdown : 1er montant « € » du contenu = prix principal de la fiche (le prix
        // produit précède les blocs de recommandations). Identité prouvée ensuite par
        // proveMatch (réf/EAN dans titre ou URL) — jamais le nom seul.
        const price = parsePriceFragment(content.match(/\d[\d\s.,\u00a0\u202f]*\s*€/)?.[0] ?? '')
        if (title && price != null && price > 0) {
          genExtracted++; genViaJina++
          return { url, name: title, price, currency: 'EUR', taxIncluded: true }
        }
      } catch { /* Jina indisponible aussi → null */ }
      return null
    }

    const refCol = String(config.refColumn ?? '').trim()
    const eanCol = String(config.eanColumn ?? '').trim()
    const nameCol = String(config.nameColumn ?? '').trim()
    const descCol = String(config.descriptionColumn ?? '').trim()
    if (!refCol && !eanCol) throw new Error(t(ctx.locale, 'run.directed.noKeyColumn'))

    // Réf d'ORIGINE (jumeau du client) : sur un catalogue de pièces adaptables, la réf
    // article et l'EAN sont propres au distributeur — aucun concurrent ne les porte.
    // Sans cette colonne, la recherche dirigée interroge des clés introuvables et rend 0.
    const products: DirectedSourceProduct[] = sheet.rows
      .map((r, i) => ({
        id: String((r as { _id?: unknown })._id ?? i),
        ref: refCol ? String(r[refCol] ?? '').trim() || undefined : undefined,
        ean: eanCol ? String(r[eanCol] ?? '').trim() || undefined : undefined,
        originRefs: descCol ? extractOriginRefs(String(r[descCol] ?? '')) : undefined,
        // Le libellé ne sert pas à CHERCHER (aucune requête ne part dessus) mais à
        // REFUSER : une fiche qui nomme une pièce incompatible est écartée, même quand
        // la référence figure dans son adresse.
        name: nameCol ? String(r[nameCol] ?? '').trim() || undefined : undefined,
      }))
      .filter((p) => p.ref || p.ean || p.originRefs?.length)
    // Jumeau du client : chiffrer le vide (lignes sans clé, produits porteurs d'une réf
    // d'origine) — c'est le cron qui tourne la nuit, et c'est LUI qu'on lit au réveil.
    const keyless = (sheet.rows?.length ?? 0) - products.length
    const withOrigin = products.filter((p) => p.originRefs?.length).length

    const budget = Math.max(1, Number(config.productBudget) || 60)
    const CURSOR_META = 'directed_cursor' // pas de __…__ : Firestore réserve ces ids
    const startCursor = (await loadCompetitorMeta(ctx.uid, watchId, CURSOR_META))?.productCount ?? 0

    // Sites AUTHENTIFIÉS (identifiants dans siteCredentials) : traités par krampAuthPass
    // (login Firecrawl), PAS par la passe générique. Les autres sites suivent le flux existant.
    const authByDomain = new Map<string, Awaited<ReturnType<typeof getSiteCredentials>>>()
    for (const s of sites) {
      const cred = await getSiteCredentials(ctx.uid, bare(s.domain))
      if (cred) authByDomain.set(s.siteId, cred)
    }
    const regularSites = sites.filter((s) => !authByDomain.has(s.siteId))

    // Index de départ du tick pour la passe générique (la passe auth a son propre curseur).
    const startIdx = startCursor % Math.max(1, products.length)

    // Règles du suivi — la recherche dirigée SERVEUR les applique comme le comparatif,
    // sinon elle enregistre des fiches qui seront écartées ensuite.
    const rules = await loadPairingRules(ctx.uid, watchId)
    if (rulesDifferFromDefault(rules)) {
      ctx.log('info', t(ctx.locale, 'run.compareCatalog.rules', { summary: JSON.stringify(summarizeRules(rules)) }))
    }
    const pass = await directedPass(products, regularSites, startIdx, budget, {
      rules,
      fetchHtml: async (url) => {
        const host = (url.match(/^https?:\/\/([^/]+)/i)?.[1] ?? url).toLowerCase()
        const forced = fetcherByHost.get(bare(host))
        if (forced) { try { return await forced.fetchHtml(url) } catch { return null } }
        try { return await fetchHtml(url, 20000) } catch { return null }
      },
      ...(hasGeneric ? { searchWeb, extractProduct } : {}),
      signal: timedSignal,
      log: (m) => ctx.log('info', m),
      locale: ctx.locale,
    })

    // Passe AUTHENTIFIÉE (kramp…) : budget PETIT dédié (chaque login Firecrawl coûte des
    // crédits) et CURSEUR PROPRE avancé À CHAQUE tick — même si le run est interrompu — pour
    // ne jamais rejouer la même tranche en boucle (garde anti-gouffre à crédits + progression
    // garantie sur tout le catalogue). Le signal du run est transmis jusqu'au fetch Firecrawl.
    if (authByDomain.size > 0) {
      const authBudget = Math.max(1, Number(config.authBudget) || 5)
      const AUTH_CURSOR_META = 'directed_auth_cursor'
      const authStart = ((await loadCompetitorMeta(ctx.uid, watchId, AUTH_CURSOR_META))?.productCount ?? 0) % Math.max(1, products.length)
      const authSlice = products.slice(authStart, authStart + authBudget)
      const key = firecrawlKey || (await getUserApiKey(ctx.uid, 'firecrawl'))
      for (const [siteId, cred] of authByDomain) {
        // ⚠⚠ `timedSignal`, PAS `ctx.signal` — c'est-à-dire l'ÉCHÉANCE de restitution, pas
        // seulement l'arrêt d'urgence du run. Cette boucle a longtemps regardé le seul
        // `ctx.signal` : elle ne s'arrêtait donc qu'à l'abort global (28 min), et mangeait
        // la réserve que le scheduler garde pour l'aval. Vécu le 2026-08-12 : trois sites
        // authentifiés × un fournisseur Firecrawl en `402` × 90 s de délai par lot ont tenu
        // la fenêtre de 18:47 à 19:14, et « Comparer catalogue » n'a jamais eu son tour —
        // le rapport de veille est resté figé toute la journée. Le budget réservé ne vaut
        // que si TOUS les chemins le regardent.
        if (timedSignal.aborted) {
          ctx.log('info', t(ctx.locale, 'run.directed.authBudgetReserved'))
          break
        }
        if (!key) { ctx.log('warn', t(ctx.locale, 'run.directed.authNoFirecrawlKey', { host: cred!.host })); break }
        const authHits = await krampAuthPass(authSlice, {
          rules,
          // ⚠ Deux signaux, et ce n'est pas une inattention. `krampBatchScrape` interrompt
          // un fetch EN VOL : il lui faut un vrai `AbortSignal` (il s'abonne à `abort`), et
          // seul celui du run en est un — un lot déjà parti va donc au bout de ses 90 s.
          // `krampAuthPass`, lui, consulte `{ aborted }` entre deux produits : c'est là que
          // l'échéance se fait respecter, au prix d'un lot de dépassement au pire.
          scrape: (urls) => krampBatchScrape(urls, cred!, key, 90_000, ctx.signal),
          signal: timedSignal,
          log: (m) => ctx.log('info', m),
          locale: ctx.locale,
        })
        for (const h of authHits) pass.results.push({ productId: h.productId, siteId, hit: { listing: h.listing, evidence: h.evidence as DirectedHit['evidence'], query: h.listing.ref ?? '' } })
        ctx.log('info', t(ctx.locale, 'run.directed.authMatched', {
          host: cred!.host, hits: authHits.length, total: authSlice.length,
          from: authStart, to: authStart + authBudget, products: products.length,
        }))
      }
      const authNext = authStart + authBudget >= products.length ? 0 : authStart + authBudget
      await saveCompetitorMeta(ctx.uid, watchId, AUTH_CURSOR_META, { domain: 'directed-auth-cursor', productCount: authNext })
    }

    for (const res of pass.results) {
      const l = res.hit.listing
      await savePage(ctx.uid, watchId, res.siteId, `search-${res.productId}`, l.url ?? '', 1, [l])
    }
    await saveCompetitorMeta(ctx.uid, watchId, CURSOR_META, { domain: 'directed-cursor', productCount: pass.nextCursor })

    const nameById = new Map(sheet.rows.map((r, i) => [String((r as { _id?: unknown })._id ?? i), nameCol ? String(r[nameCol] ?? '') : '']))
    const srcById = new Map(products.map((p) => [p.id, p]))
    const domainById = new Map(sites.map((s) => [s.siteId, s.domain]))

    const rows = pass.results.map((res, i) => {
      const l = res.hit.listing
      const src = srcById.get(res.productId)
      // Respecte la base de taxe du listing : kramp = HT (taxIncluded false), marketplaces
      // B2C = TTC. On dérive l'autre montant, sans jamais présenter un HT comme du TTC.
      const price = l.price ?? null
      const isHt = l.taxIncluded === false
      const prixHt = price == null ? null : (isHt ? price : Math.round((price / (1 + VAT)) * 100) / 100)
      const prixTtc = price == null ? null : (isHt ? Math.round(price * (1 + VAT) * 100) / 100 : price)
      return {
        _id: `hit_${i}`,
        produit: nameById.get(res.productId) || l.name || src?.ref || '',
        ref: src?.ref ?? '', ean: src?.ean ?? '',
        site: domainById.get(res.siteId) ?? res.siteId,
        prixTtc,
        prixHt,
        preuve: res.hit.evidence,
        lien: l.url ?? '',
      }
    })
    ctx.log('info', t(ctx.locale, 'run.directed.pricesFound', {
      count: rows.length, processed: pass.processed, from: startCursor,
      to: pass.nextCursor, products: products.length, sites: sites.length,
    }))
    if (rows.length === 0) {
      ctx.log('warn', t(ctx.locale, 'run.directed.noPriceDiag', {
        processed: pass.processed, products: products.length, keyless,
        withOrigin, sites: sites.length, skipped: 0,
      }))
      if (withOrigin === 0) {
        ctx.log('warn', descCol
          ? t(ctx.locale, 'run.directed.originColumnNoMatch', { col: descCol })
          : t(ctx.locale, 'run.directed.originColumnMissing'))
      }
      ctx.log('warn', t(ctx.locale, 'run.directed.noPriceFound'))
    }
    if (hasGeneric) {
      const genericSiteIds = new Set(sites.filter((s) => s.generic).map((s) => s.siteId))
      const genMatched = pass.results.filter((r) => genericSiteIds.has(r.siteId)).length
      const viaRepli = genViaBd + genViaJina > 0
        ? t(ctx.locale, 'run.directed.genericViaFallback', { bd: genViaBd, jina: genViaJina })
        : ''
      ctx.log('info', t(ctx.locale, 'run.directed.genericSummary', {
        sites: [...genericSiteIds].length, queries: genQueries, noUrls: genNoUrls,
        failed: genFailed, extracted: genExtracted, fallback: viaRepli, matched: genMatched,
      }))
      // Une recherche en échec n'est pas une absence d'offre : le dire, avec la cause.
      if (genFailed > 0) {
        ctx.log('warn', t(ctx.locale, 'run.directed.searchChannelDown', {
          failed: genFailed, queries: genQueries, reason: firstFailure.slice(0, 200),
        }))
      }
      // Alerte VISIBLE dans le rail de logs : sans elle, « 0 fiche extraite » à cause d'un
      // compte à sec est indistinguable d'une couverture marketplace réellement éparse.
      if (creditsExhausted('firecrawl')) ctx.log('warn', t(ctx.locale, 'run.directed.creditsFirecrawl'))
      if (creditsExhausted('jina')) ctx.log('warn', t(ctx.locale, 'run.directed.creditsJina'))
    }
    return { results: resultsSheet(rows) }
  },
})
