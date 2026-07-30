// Node « Veille tarifaire » : prend une FEUILLE DE PRODUITS en entrée (depuis
// n'importe quelle source du flux — Upload, PIM, Scrape) + une liste de sites
// concurrents en config (domaine | champs), retrouve chaque produit chez les
// concurrents, compare les prix, et n'émet « changes » que s'il y a des alertes
// (positionnement / variation). Implémentation CLIENT (aperçu éditeur) ; jumeau
// serveur dans functions/.../priceWatchTrack.ts pour le Cron headless.
import { TrendingUpDown } from 'lucide-react'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import type { ExcelSheet } from '@/features/excel/types'
import { useAuthStore } from '@/stores/auth.store'
import { runPriceWatch } from '@/features/priceWatch/runPriceWatch'
import { parseProductsFromSheet, parseSitesConfig } from '@/features/priceWatch/core'
import { DEFAULT_WATCH_ID } from '@/features/priceWatch/paths'
import type { PriceWatchAlert } from '@/features/priceWatch/types'
// `run()` n'est pas un composant : helper `t()` de module (lit la locale courante).
import { t } from '@/lib/i18n'

interface TrackConfig {
  watchId: string
  thresholdPct: number
  sites: string
  skuColumn: string
  eanColumn: string
  nameColumn: string
  brandColumn: string
  priceColumn: string
}
interface TrackInputs { products?: ExcelSheet }

function alertsToSheet(alerts: PriceWatchAlert[]): ExcelSheet {
  return {
    name: 'Alertes veille tarifaire',
    columns: [
      { key: 'product', label: 'Produit', fieldType: 'text', detectedType: 'text', isPrimary: true, width: 200 },
      { key: 'domain', label: 'Site', fieldType: 'text', detectedType: 'text', isPrimary: false, width: 160 },
      { key: 'kind', label: 'Type', fieldType: 'text', detectedType: 'text', isPrimary: false, width: 140 },
      { key: 'message', label: 'Détail', fieldType: 'text', detectedType: 'text', isPrimary: false, width: 320 },
    ],
    rows: alerts.map((a, i) => ({
      _id: `alert_${i}`, product: a.productName, domain: a.domain, kind: a.kind, message: a.message,
    })),
    taxonomy: [],
  }
}

const priceWatchTrackNode: NodeSpec<TrackConfig, TrackInputs, { changes?: ExcelSheet; all: ExcelSheet }> = {
  type: 'price-watch-track',
  // DÉPRÉCIÉ (2026-07-22) : veille v1 à appariement LLM, supplantée par le module
  // catalogue (Sites sources → Moisson/Comparer/Recherche dirigée, preuve exacte).
  // Masqué de la palette ; reste exécutable pour les workflows existants. Le flux
  // d'alertes (port `changes` → Telegram) sera réintroduit côté Comparer.
  hidden: true,
  category: 'logic',
  labelKey: 'node.price-watch-track.label',
  descriptionKey: 'node.price-watch-track.desc',
  icon: TrendingUpDown,
  inputs: [{ name: 'products', type: 'sheet', required: true }],
  outputs: [
    { name: 'changes', type: 'sheet' },
    { name: 'all', type: 'sheet' },
  ],
  configSchema: [
    {
      name: 'sites',
      kind: 'textarea',
      labelKey: 'node.price-watch-track.f1',
      required: true,
      helpKey: 'node.price-watch-track.f2',
    },
    { name: 'nameColumn', kind: 'columnRef', label: 'Colonne Nom', help: 'Colonne du nom produit dans la feuille d’entrée.' },
    { name: 'brandColumn', kind: 'columnRef', label: 'Colonne Marque', help: 'Repli relationnel avec le nom si pas de SKU/EAN.' },
    { name: 'skuColumn', kind: 'columnRef', label: 'Colonne SKU' },
    { name: 'eanColumn', kind: 'columnRef', label: 'Colonne EAN' },
    { name: 'priceColumn', kind: 'columnRef', label: 'Colonne Mon prix', help: 'Pour l’alerte de positionnement.' },
    { name: 'watchId', kind: 'text', label: 'Identifiant du suivi', help: 'Mémorise les URLs épinglées et l’historique entre deux runs.' },
    { name: 'thresholdPct', kind: 'number', label: 'Seuil de variation (%)', help: '0 = signaler tout changement.' },
  ],
  defaultConfig: {
    watchId: DEFAULT_WATCH_ID, thresholdPct: 0, sites: '',
    skuColumn: 'sku', eanColumn: 'ean', nameColumn: 'name', brandColumn: 'brand', priceColumn: 'price',
  },
  runtime: 'client',
  run: async (ctx, config, inputs) => {
    const uid = useAuthStore.getState().user?.uid
    if (!uid) throw new Error(t('run.notSignedIn'))
    const rows = (inputs.products?.rows ?? []) as Record<string, unknown>[]
    const products = parseProductsFromSheet(rows, {
      sku: config.skuColumn, ean: config.eanColumn, name: config.nameColumn,
      brand: config.brandColumn, price: config.priceColumn,
    })
    const sites = parseSitesConfig(config.sites)
    if (products.length === 0) {
      ctx.log('warn', t('run.pwt.noProduct'))
      return { all: alertsToSheet([]) }
    }
    if (sites.length === 0) {
      ctx.log('warn', t('run.noCompetitor'))
      return { all: alertsToSheet([]) }
    }
    ctx.log('info', t('run.pwt.scanning', { products: products.length, sites: sites.length }))
    const alerts = await runPriceWatch({
      uid, watchId: (config.watchId || DEFAULT_WATCH_ID).trim(), thresholdPct: Math.max(0, config.thresholdPct),
      products, sites, log: (m) => ctx.log('info', m), signal: ctx.signal,
    })
    const all = alertsToSheet(alerts)
    if (alerts.length === 0) {
      ctx.log('info', t('run.pwt.noAlert'))
      return { all }
    }
    ctx.log('info', t('run.pwt.alerts', { count: alerts.length }))
    return { changes: all, all }
  },
}

nodeRegistry.register(priceWatchTrackNode)
