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
import { fetchSourceHtml } from '@/features/scraping-templates/fetchSourceHtml'
import { parseSitesConfig, stableId } from '@/features/priceWatch/core'
import { directedPass, type DirectedSourceProduct, type DirectedSite } from '@/features/priceWatch/catalog/searchDirected'

interface DirectedConfig {
  sites: string
  refColumn: string
  eanColumn: string
  nameColumn: string
  productBudget: number
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
    { name: 'productBudget', kind: 'number', label: 'Produits par run', help: 'Nombre de produits testés par exécution (pilote). Chacun est cherché sur tous les sites.' },
  ],
  defaultConfig: { sites: '', refColumn: '', eanColumn: '', nameColumn: '', productBudget: 20 },
  cardSummary: (c) => {
    const n = parseSitesConfig(c.sites).length
    return n ? `${n} site(s) · ${c.productBudget} produits/run` : ''
  },
  runtime: 'client',
  run: async (ctx, config, inputs) => {
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
    ctx.reportConnector?.('jina')
    const pass = await directedPass(products, sites, 0, budget, {
      fetchHtml: (url) => fetchSourceHtml(url),
      signal: ctx.signal,
      log: (m) => ctx.log('info', m),
    })

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
    ctx.log('info', `${rows.length} prix trouvé(s) sur ${pass.processed} produit(s) × ${sites.length} site(s).`)
    return { results: resultsSheet(rows) }
  },
}

nodeRegistry.register(directedSearchNode)
