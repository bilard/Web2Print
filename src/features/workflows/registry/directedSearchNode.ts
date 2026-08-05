import { getWorkspaceUid } from '@/features/access/useWorkspaceUid'
// Node « Recherche dirigée » (PILOTE). Complément de la moisson par liste : pour chaque
// produit source, interroge le moteur de recherche de chaque concurrent (réf puis EAN) et
// récupère le prix du résultat APPARIÉ PAR PREUVE EXACTE (zéro faux positif). Trouve ce
// que la moisson par liste rate — ex. jardimax n'affiche pas la réf sur ses listes mais
// l'expose en recherche. Sortie = une sheet des prix trouvés (pilote : les N premiers
// produits, sans persistance ; l'intégration à l'index/Comparer viendra après validation).
import { ScanSearch } from 'lucide-react'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import type { ExcelSheet, ExcelRow } from '@/features/excel/types'
import { fetchSourceHtml } from '@/features/scraping-templates/fetchSourceHtml'
import { parseSitesConfig, stableId } from '@/features/priceWatch/core'
import { resolveSitesInput, sitesForRole } from '@/features/priceWatch/sourceSites'
import { savePage, loadCompetitorMeta, saveCompetitorMeta } from '@/features/priceWatch/catalog/store'
import { directedPass, type DirectedSourceProduct, type DirectedSite } from '@/features/priceWatch/catalog/searchDirected'
import { extractOriginRefs } from '@/features/priceWatch/catalog/match'
// `run()` n'est pas un composant : helper `t()` de module (lit la locale courante).
import { t } from '@/lib/i18n'

interface DirectedConfig {
  sites: string
  genericSites: string
  refColumn: string
  eanColumn: string
  nameColumn: string
  descriptionColumn: string
  productBudget: number
  watchId: string
}
type DirectedInputs = { products: ExcelSheet; sites?: unknown }
type DirectedOutputs = { results: ExcelSheet }

const VAT = 0.2

function resultsSheet(rows: ExcelRow[]): ExcelSheet {
  return {
    name: 'Prix trouvés (recherche dirigée)',
    columns: [
      { key: 'produit', label: 'Produit', fieldType: 'text', detectedType: 'text', isPrimary: true, width: 220 },
      { key: 'ref', label: 'Référence', fieldType: 'text', detectedType: 'text', isPrimary: false, width: 120 },
      { key: 'ean', label: 'EAN', fieldType: 'text', detectedType: 'text', isPrimary: false, width: 130 },
      { key: 'site', label: 'Concurrent', fieldType: 'text', detectedType: 'text', isPrimary: false, width: 180 },
      { key: 'prixTtc', label: 'Prix TTC', fieldType: 'currency', detectedType: 'currency', isPrimary: false, width: 100 },
      { key: 'prixHt', label: 'Prix HT', fieldType: 'currency', detectedType: 'currency', isPrimary: false, width: 100 },
      { key: 'preuve', label: 'Appariement', fieldType: 'text', detectedType: 'text', isPrimary: false, width: 110 },
      { key: 'lien', label: 'Lien', fieldType: 'url', detectedType: 'url', isPrimary: false, width: 240 },
    ],
    rows,
    taxonomy: [],
  }
}

const directedSearchNode: NodeSpec<DirectedConfig, DirectedInputs, DirectedOutputs> = {
  type: 'directed-search',
  category: 'import',
  labelKey: 'node.directed-search.label',
  descriptionKey: 'node.directed-search.desc',
  icon: ScanSearch,
  connectors: ['jina'],
  // Port `sites` (facultatif) : brancher un node « Sites sources » remplace la textarea
  // ci-dessous ET l'identifiant de suivi (même liste que Moisson/Comparer, garanti).
  inputs: [{ name: 'products', type: 'sheet' }, { name: 'sites', type: 'sites' }],
  outputs: [{ name: 'results', type: 'sheet' }],
  configSchema: [
    {
      name: 'sites', kind: 'textarea', label: 'Sites concurrents (un par ligne)',
      helpKey: 'node.directed-search.f1',
      disabledWhen: (_c, wired) => wired('sites'),
      disabledNoteKey: 'node.directed-search.f2',
    },
    { name: 'genericSites', kind: 'textarea', labelKey: 'node.directed-search.genericSites.label', helpKey: 'node.directed-search.genericSites.help' },
    { name: 'refColumn', kind: 'text', labelKey: 'node.directed-search.refColumn.label', helpKey: 'node.directed-search.refColumn.help' },
    { name: 'eanColumn', kind: 'text', labelKey: 'node.directed-search.eanColumn.label', helpKey: 'node.directed-search.eanColumn.help' },
    { name: 'nameColumn', kind: 'text', labelKey: 'node.directed-search.nameColumn.label', helpKey: 'node.directed-search.nameColumn.help' },
    { name: 'descriptionColumn', kind: 'text', labelKey: 'node.directed-search.descriptionColumn.label', helpKey: 'node.directed-search.descriptionColumn.help' },
    { name: 'productBudget', kind: 'number', labelKey: 'node.directed-search.productBudget.label', helpKey: 'node.directed-search.productBudget.help' },
    {
      name: 'watchId', kind: 'text', labelKey: 'node.directed-search.watchId.label', helpKey: 'node.directed-search.watchId.help',
      disabledWhen: (_c, wired) => wired('sites'),
      disabledNoteKey: 'node.directed-search.f3',
    },
  ],
  defaultConfig: { sites: '', genericSites: '', refColumn: '', eanColumn: '', nameColumn: '', descriptionColumn: '', productBudget: 60, watchId: '' },
  cardSummary: (c) => {
    const n = parseSitesConfig(c.sites).length
    return n ? `${n} site(s) · ${c.productBudget} produits/run` : ''
  },
  runtime: 'client',
  run: async (ctx, config, inputs) => {
    const uid = getWorkspaceUid()
    if (!uid) throw new Error(t('run.notSignedIn'))
    // Sites + identité de suivi : le port `sites` (node « Sites sources ») GAGNE ; sinon
    // repli config locale. Même suivi que « Comparer catalogue » du workflow → les prix
    // trouvés alimentent le même index et remontent dans le dashboard « Comparatif ».
    const resolved = resolveSitesInput(inputs.sites, {
      sitesText: config.sites, watchIdRaw: config.watchId, workflowId: ctx.workflowId,
    })
    const watchId = resolved.watchId
    if (resolved.fromPort) ctx.log('info', t('run.sourceSites.listReceivedActive', { count: resolved.sites.length }))
    const sheet = inputs.products
    if (!sheet?.rows?.length) throw new Error(t('run.directed.noInputData'))
    const bare = (d: string) => d.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').replace(/^www\./i, '')
    // La textarea « Sites GÉNÉRIQUES » reste le MARQUEUR marketplace : les domaines
    // listés ici (qu'ils viennent du port ou de la textarea sites) passent par Firecrawl.
    const genericDomains = new Set((config.genericSites ?? '').split(/[\n,]/).map((d) => bare(d.trim())).filter(Boolean))
    // Un site marqué « moisson » ne passe PAS par la recherche dirigée (payante à la réf).
    const sites: DirectedSite[] = sitesForRole(resolved.sites, 'directed')
      .map((s) => ({ siteId: stableId(s.domain), domain: s.domain, generic: genericDomains.has(bare(s.domain)) }))
    if (sites.length === 0) { ctx.log('warn', t('run.noCompetitor')); return { results: resultsSheet([]) } }

    const refCol = config.refColumn.trim()
    const eanCol = config.eanColumn.trim()
    const nameCol = config.nameColumn.trim()
    const descCol = config.descriptionColumn.trim()
    if (!refCol && !eanCol) throw new Error(t('run.directed.noKeyColumn'))

    // Réf d'ORIGINE : sur un catalogue de pièces adaptables, la référence article et
    // l'EAN sont propres au distributeur — aucun concurrent ne les porte, et chercher
    // ces clés-là ne peut rien rendre. Les réf. d'origine citées dans la description
    // sont les seules universelles (cf. le même mécanisme dans « Comparer catalogue »).
    const products: DirectedSourceProduct[] = sheet.rows
      .map((r, i) => ({
        id: String((r as { _id?: unknown })._id ?? i),
        ref: refCol ? String(r[refCol] ?? '').trim() || undefined : undefined,
        ean: eanCol ? String(r[eanCol] ?? '').trim() || undefined : undefined,
        originRefs: descCol ? extractOriginRefs(String(r[descCol] ?? '')) : undefined,
      }))
      .filter((p) => p.ref || p.ean || p.originRefs?.length)
    // Combien de lignes n'offrent AUCUNE clé interrogeable : c'est la première chose à
    // savoir quand une passe ne rend rien, et le message générique ne le disait pas.
    const keyless = sheet.rows.length - products.length
    const withOrigin = products.filter((p) => p.originRefs?.length).length

    const budget = Math.max(1, config.productBudget)
    // Curseur persistant : on reprend là où le dernier tick s'est arrêté (le cron accumule
    // au fil des passages, comme la moisson). Stocké dans une méta dédiée (pseudo-site ignoré
    // par « Comparer », qui n'itère que les sites configurés).
    const CURSOR_META = 'directed_cursor' // pas de __…__ : Firestore réserve ces ids
    const startCursor = (await loadCompetitorMeta(uid, watchId, CURSOR_META))?.productCount ?? 0
    ctx.reportConnector?.('jina')
    // Disjoncteur par site : un site qui ne répond pas fait payer TOUTE la cascade de
    // repli (~1-2 min) à CHAQUE requête — sur une passe de 20 produits, un seul site
    // mort = plus d'une heure de vide. Après 5 échecs consécutifs, le site est ignoré
    // pour le reste de la passe (réessayé au run suivant).
    const FAILS_MAX = 5
    const fails = new Map<string, number>()
    const skipped = new Set<string>()
    const fetchWithBreaker = async (url: string): Promise<string | null> => {
      const host = (url.match(/^https?:\/\/([^/]+)/i)?.[1] ?? url).toLowerCase()
      if (skipped.has(host)) return null
      const html = await fetchSourceHtml(url)
      if (html) {
        fails.set(host, 0)
      } else {
        const n = (fails.get(host) ?? 0) + 1
        fails.set(host, n)
        if (n >= FAILS_MAX) {
          skipped.add(host)
          ctx.log('warn', t('run.directed.siteBreaker', { host, fails: FAILS_MAX }))
        }
      }
      return html
    }
    const pass = await directedPass(products, sites, startCursor % Math.max(1, products.length), budget, {
      fetchHtml: fetchWithBreaker,
      signal: ctx.signal,
      log: (m) => ctx.log('info', m),
      // Battement de progression : compteur live sur la carte + un log par produit —
      // sans ça la passe semble « tourner dans le vide » entre deux trouvailles.
      onProduct: (processed, total, hits) => {
        ctx.reportCount?.(hits)
        ctx.log('info', skipped.size
          ? t('run.directed.productProgressSkipped', { processed, total, hits, skipped: skipped.size })
          : t('run.directed.productProgress', { processed, total, hits }))
      },
    })

    // Persistance dans l'index concurrent (même store que la moisson) : chaque hit devient
    // une « page » d'un produit → « Comparer catalogue » le relira et l'affichera dans le
    // dashboard, sans faux positif (l'appariement a été prouvé par proveMatch).
    for (const res of pass.results) {
      const l = res.hit.listing
      await savePage(uid, watchId, res.siteId, `search-${res.productId}`, l.url ?? '', 1, [l])
    }
    await saveCompetitorMeta(uid, watchId, CURSOR_META, { domain: 'directed-cursor', productCount: pass.nextCursor })

    const nameById = new Map(sheet.rows.map((r, i) => [String((r as { _id?: unknown })._id ?? i), nameCol ? String(r[nameCol] ?? '') : '']))
    const refById = new Map(products.map((p) => [p.id, p]))
    const domainById = new Map(sites.map((s) => [s.siteId, s.domain]))

    const rows = pass.results.map((res, i) => {
      const l = res.hit.listing
      const src = refById.get(res.productId)
      const ttc = l.price ?? null
      return {
        _id: `hit_${i}`,
        produit: nameById.get(res.productId) || l.name || src?.ref || '',
        ref: src?.ref ?? '', ean: src?.ean ?? '',
        site: domainById.get(res.siteId) ?? res.siteId,
        prixTtc: ttc,
        prixHt: ttc != null ? Math.round((ttc / (1 + VAT)) * 100) / 100 : null,
        preuve: res.hit.evidence,
        lien: l.url ?? '',
      }
    })
    ctx.reportCount?.(rows.length)
    ctx.log('info', t('run.directed.pricesFound', {
      count: rows.length, processed: pass.processed, from: startCursor,
      to: pass.nextCursor, products: products.length, sites: sites.length,
    }))
    if (rows.length === 0) {
      // Chiffrer le vide : « 0 sur 20 produits, 0 avec réf d'origine, 3 sites coupés »
      // oriente vers la bonne cause. Sans ces nombres, les trois explications possibles
      // (clés propres au distributeur, description non mappée, sites injoignables) se
      // valent et on cherche au hasard.
      ctx.log('warn', t('run.directed.noPriceDiag', {
        processed: pass.processed, products: products.length, keyless,
        withOrigin, sites: sites.length, skipped: skipped.size,
      }))
      ctx.log('warn', t('run.directed.noPriceFound'))
    }
    return { results: resultsSheet(rows) }
  },
}

nodeRegistry.register(directedSearchNode)
