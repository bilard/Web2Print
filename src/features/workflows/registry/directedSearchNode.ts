// src/features/workflows/registry/directedSearchNode.ts
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
import { useAuthStore } from '@/stores/auth.store'
import { fetchSourceHtml } from '@/features/scraping-templates/fetchSourceHtml'
import { parseSitesConfig, stableId } from '@/features/priceWatch/core'
import { DEFAULT_WATCH_ID } from '@/features/priceWatch/paths'
import { savePage, loadCompetitorMeta, saveCompetitorMeta } from '@/features/priceWatch/catalog/store'
import { directedPass, type DirectedSourceProduct, type DirectedSite } from '@/features/priceWatch/catalog/searchDirected'

interface DirectedConfig {
  sites: string
  refColumn: string
  eanColumn: string
  nameColumn: string
  productBudget: number
  watchId: string
}
type DirectedInputs = { products: ExcelSheet }
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
  label: 'Recherche dirigée',
  description:
    "Cherche chaque produit (réf puis EAN) sur le moteur de recherche des concurrents et " +
    "récupère le prix — trouve ce que la moisson par liste rate (ex. jardimax n'affiche pas " +
    "la réf sur ses listes mais l'expose en recherche). Appariement par preuve EXACTE, zéro faux positif.",
  icon: ScanSearch,
  connectors: ['jina'],
  inputs: [{ name: 'products', type: 'sheet' }],
  outputs: [{ name: 'results', type: 'sheet' }],
  configSchema: [
    {
      name: 'sites', kind: 'textarea', label: 'Sites concurrents (un par ligne)', required: true,
      help: 'Domaine par ligne. Ex : « jardimax.com ». Le moteur de recherche PrestaShop est interrogé.',
    },
    { name: 'refColumn', kind: 'text', label: 'Colonne Référence', help: 'Ex : ARTICLECODE. Cherchée en premier.' },
    { name: 'eanColumn', kind: 'text', label: 'Colonne EAN', help: 'Ex : EAN. Cherchée si la réf ne donne rien.' },
    { name: 'nameColumn', kind: 'text', label: 'Colonne Nom (affichage)', help: 'Optionnel — pour l’affichage du résultat.' },
    { name: 'productBudget', kind: 'number', label: 'Produits par run', help: 'Nombre de produits testés par exécution. Chacun est cherché sur tous les sites.' },
    { name: 'watchId', kind: 'text', label: 'Identifiant du suivi (avancé)', help: 'Laisse VIDE : le suivi est celui du workflow (partagé avec « Comparer catalogue » du même workflow — les prix trouvés remontent alors dans le dashboard).' },
  ],
  defaultConfig: { sites: '', refColumn: '', eanColumn: '', nameColumn: '', productBudget: 20, watchId: '' },
  cardSummary: (c) => {
    const n = parseSitesConfig(c.sites).length
    return n ? `${n} site(s) · ${c.productBudget} produits/run` : ''
  },
  runtime: 'client',
  run: async (ctx, config, inputs) => {
    const uid = useAuthStore.getState().user?.uid
    if (!uid) throw new Error('Utilisateur non connecté.')
    // Même identité de suivi que « Comparer catalogue » du workflow → les prix trouvés
    // alimentent le même index et remontent dans le dashboard « Comparatif ».
    const watchId = stableId((config.watchId || '').trim() || ctx.workflowId || DEFAULT_WATCH_ID)
    const sheet = inputs.products
    if (!sheet?.rows?.length) throw new Error('Recherche dirigée : aucune donnée produit en entrée.')
    const sites: DirectedSite[] = parseSitesConfig(config.sites).map((s) => ({ siteId: stableId(s.domain), domain: s.domain }))
    if (sites.length === 0) { ctx.log('warn', 'Aucun site concurrent configuré.'); return { results: resultsSheet([]) } }

    const refCol = config.refColumn.trim()
    const eanCol = config.eanColumn.trim()
    const nameCol = config.nameColumn.trim()
    if (!refCol && !eanCol) throw new Error('Recherche dirigée : renseigne au moins une colonne Référence ou EAN.')

    const products: DirectedSourceProduct[] = sheet.rows
      .map((r, i) => ({
        id: String((r as { _id?: unknown })._id ?? i),
        ref: refCol ? String(r[refCol] ?? '').trim() || undefined : undefined,
        ean: eanCol ? String(r[eanCol] ?? '').trim() || undefined : undefined,
      }))
      .filter((p) => p.ref || p.ean)

    const budget = Math.max(1, config.productBudget)
    // Curseur persistant : on reprend là où le dernier tick s'est arrêté (le cron accumule
    // au fil des passages, comme la moisson). Stocké dans une méta dédiée (pseudo-site ignoré
    // par « Comparer », qui n'itère que les sites configurés).
    const CURSOR_META = 'directed_cursor' // pas de __…__ : Firestore réserve ces ids
    const startCursor = (await loadCompetitorMeta(uid, watchId, CURSOR_META))?.productCount ?? 0
    ctx.reportConnector?.('jina')
    const pass = await directedPass(products, sites, startCursor % Math.max(1, products.length), budget, {
      fetchHtml: (url) => fetchSourceHtml(url),
      signal: ctx.signal,
      log: (m) => ctx.log('info', m),
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
    ctx.log('info', `${rows.length} prix trouvé(s) sur ${pass.processed} produit(s) [curseur ${startCursor} → ${pass.nextCursor} / ${products.length}] × ${sites.length} site(s).`)
    return { results: resultsSheet(rows) }
  },
}

nodeRegistry.register(directedSearchNode)
