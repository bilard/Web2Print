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
import { stableId } from '../../priceWatch/helpers'
import { resolveSitesInput } from '../../priceWatch/sourceSites'
import { savePage, loadCompetitorMeta, saveCompetitorMeta } from '../../priceWatch/catalog/store'
import { directedPass, type DirectedSourceProduct, type DirectedSite, type DirectedHit } from '../../priceWatch/catalog/searchDirected'
import { parseProductPage, parsePriceFragment, type CompetitorListing } from '../../priceWatch/catalog/prestashop'
import { jinaSearch, jinaRead } from '../jina'
import { brightDataRead } from '../brightData'
import { firecrawlScrapeProduct } from '../../scraper/firecrawlProduct'
import { creditsExhausted } from '../../scraper/creditBreaker'
import { getUserApiKey } from '../apiKeys'
import { getSiteCredentials } from '../../scraper/siteCredentials'
import { krampBatchScrape } from '../../scraper/krampFirecrawl'
import { krampAuthPass } from '../../priceWatch/catalog/krampAuthPass'

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
      throw new Error('Recherche dirigée : aucune donnée produit en entrée.')
    }
    // Sites « génériques » (marketplaces non-PrestaShop) : recherche web + Firecrawl.
    const genericDomains = new Set(String(config.genericSites ?? '').split(/[\n,]/).map((d) => bare(d.trim())).filter(Boolean))
    const sites: DirectedSite[] = resolved.sites.map((s) => ({
      siteId: stableId(s.domain), domain: s.domain, generic: genericDomains.has(bare(s.domain)),
    }))
    if (sites.length === 0) { ctx.log('warn', 'Aucun site concurrent configuré.'); return { results: resultsSheet([]) } }

    // Fenêtre AVAL déjà atteinte (la moisson a consommé la part des nodes à curseur) :
    // passe repoussée au prochain tick — le curseur ne bouge pas, « Comparer » garde sa
    // fenêtre CE run. Une passe démarrée avant l'échéance va au bout (bornée par
    // productBudget), la réserve absorbe ce débordement.
    if (ctx.deadlineAt && Date.now() > ctx.deadlineAt) {
      ctx.log('info', 'Budget réservé au comparatif — recherche dirigée repoussée au prochain tick.')
      return { results: resultsSheet([]) }
    }

    // Dépendances du mode générique (chargées seulement si ≥ 1 site générique → pas de coût sinon).
    const hasGeneric = sites.some((s) => s.generic)
    const firecrawlKey = hasGeneric ? (await getUserApiKey(ctx.uid, 'firecrawl')) : ''
    if (hasGeneric && !firecrawlKey) ctx.log('warn', 'Sites génériques sans clé Firecrawl — extraction via les replis Bright Data puis Jina.')
    // Compteurs de diagnostic du mode générique : sans eux, une couverture marketplace
    // faible (les réfs OEM ne sont pas vendues sur amazon/cdiscount…) est indistinguable
    // d'une panne. On les journalise en fin de passe pour rendre la réalité VISIBLE.
    let genQueries = 0, genNoUrls = 0, genExtracted = 0, genViaBd = 0, genViaJina = 0
    const searchWeb = async (query: string): Promise<string[]> => {
      genQueries++
      try {
        const urls = (await jinaSearch(ctx.uid, query, ctx.signal)).map((r) => r.url).filter(Boolean)
        if (urls.length === 0) genNoUrls++ // 0 URL = réf non référencée sur ce marketplace (ou 422 Jina)
        return urls
      } catch { genNoUrls++; return [] }
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
            url, name: p.name ?? '', ref: p.reference, price: p.price, currency: p.currency,
            taxIncluded: true, // prix affiché B2C = TTC
            availability: p.inStock == null ? undefined : (p.inStock ? 'in-stock' : 'out-of-stock'),
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
    if (!refCol && !eanCol) throw new Error('Recherche dirigée : renseigne au moins une colonne Référence ou EAN.')

    const products: DirectedSourceProduct[] = sheet.rows
      .map((r, i) => ({
        id: String((r as { _id?: unknown })._id ?? i),
        ref: refCol ? String(r[refCol] ?? '').trim() || undefined : undefined,
        ean: eanCol ? String(r[eanCol] ?? '').trim() || undefined : undefined,
      }))
      .filter((p) => p.ref || p.ean)

    const budget = Math.max(1, Number(config.productBudget) || 20)
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

    const pass = await directedPass(products, regularSites, startIdx, budget, {
      fetchHtml: async (url) => { try { return await fetchHtml(url, 20000) } catch { return null } },
      ...(hasGeneric ? { searchWeb, extractProduct } : {}),
      signal: ctx.signal,
      log: (m) => ctx.log('info', m),
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
        if (ctx.signal?.aborted) break
        if (!key) { ctx.log('warn', `Site authentifié ${cred!.host} mais aucune clé Firecrawl — ignoré.`); break }
        const authHits = await krampAuthPass(authSlice, {
          scrape: (urls) => krampBatchScrape(urls, cred!, key, 90_000, ctx.signal),
          signal: ctx.signal,
          log: (m) => ctx.log('info', m),
        })
        for (const h of authHits) pass.results.push({ productId: h.productId, siteId, hit: { listing: h.listing, evidence: h.evidence as DirectedHit['evidence'], query: h.listing.ref ?? '' } })
        ctx.log('info', `Auth ${cred!.host} : ${authHits.length}/${authSlice.length} prix apparié(s) [curseur auth ${authStart} → ${authStart + authBudget} / ${products.length}].`)
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
    ctx.log('info', `${rows.length} prix trouvé(s) sur ${pass.processed} produit(s) [curseur ${startCursor} → ${pass.nextCursor} / ${products.length}] × ${sites.length} site(s).`)
    if (hasGeneric) {
      const genericSiteIds = new Set(sites.filter((s) => s.generic).map((s) => s.siteId))
      const genMatched = pass.results.filter((r) => genericSiteIds.has(r.siteId)).length
      const viaRepli = genViaBd + genViaJina > 0 ? ` (dont ${genViaBd} Bright Data · ${genViaJina} Jina)` : ''
      ctx.log('info', `Générique (${[...genericSiteIds].length} site(s)) : ${genQueries} recherche(s) web · ${genNoUrls} sans résultat (réf non vendue / 422) · ${genExtracted} fiche(s) extraite(s)${viaRepli} · ${genMatched} appariée(s) par preuve exacte.`)
      // Alerte VISIBLE dans le rail de logs : sans elle, « 0 fiche extraite » à cause d'un
      // compte à sec est indistinguable d'une couverture marketplace réellement éparse.
      if (creditsExhausted('firecrawl')) ctx.log('warn', 'Crédits Firecrawl ÉPUISÉS — extraction générique suspendue (appels sautés). Recharger sur firecrawl.dev.')
      if (creditsExhausted('jina')) ctx.log('warn', 'Crédits Jina ÉPUISÉS — recherches web suspendues (appels sautés). Recharger sur jina.ai.')
    }
    return { results: resultsSheet(rows) }
  },
})
