// src/features/workflows/registry/priceWatchTrackNode.ts
// Node « Veille tarifaire » : exécute un suivi enregistré (catalogue + sites
// Firestore) → découverte/scrape/validation/diff → port `changes` (alertes) si
// variations/positionnement. Implémentation CLIENT (aperçu éditeur) ; jumeau
// serveur dans functions/.../priceWatchTrack.ts pour le Cron headless.
import { TrendingUpDown } from 'lucide-react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import type { ExcelSheet } from '@/features/excel/types'
import { useAuthStore } from '@/stores/auth.store'
import { runPriceWatch } from '@/features/priceWatch/runPriceWatch'
import { productsCol, sitesCol, DEFAULT_WATCH_ID } from '@/features/priceWatch/paths'
import type { TrackedProduct, CompetitorSite, PriceWatchAlert } from '@/features/priceWatch/types'

interface TrackConfig { watchId: string; thresholdPct: number }

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
      _id: `alert_${i}`,
      product: a.productName,
      domain: a.domain,
      kind: a.kind,
      message: a.message,
    })),
    taxonomy: [],
  }
}

const priceWatchTrackNode: NodeSpec<TrackConfig, Record<string, never>, { changes?: ExcelSheet; all: ExcelSheet }> = {
  type: 'price-watch-track',
  category: 'logic',
  label: 'Veille tarifaire',
  description:
    "Exécute un suivi tarifaire enregistré (catalogue + concurrents) : retrouve chaque produit chez les concurrents, compare les prix, et n'émet « changes » que s'il y a des alertes (positionnement / variation).",
  icon: TrendingUpDown,
  inputs: [],
  outputs: [
    { name: 'changes', type: 'sheet' },
    { name: 'all', type: 'sheet' },
  ],
  configSchema: [
    { name: 'watchId', kind: 'text', label: 'Identifiant du suivi', help: 'Suivi configuré dans le module Veille tarifaire.' },
    { name: 'thresholdPct', kind: 'number', label: 'Seuil de variation (%)', help: '0 = signaler tout changement.' },
  ],
  defaultConfig: { watchId: DEFAULT_WATCH_ID, thresholdPct: 0 },
  runtime: 'client',
  run: async (ctx, config, _inputs) => {
    const uid = useAuthStore.getState().user?.uid
    if (!uid) throw new Error('Utilisateur non connecté.')
    const watchId = (config.watchId || DEFAULT_WATCH_ID).trim()
    const [productsSnap, sitesSnap] = await Promise.all([
      getDocs(collection(db, productsCol(uid, watchId))),
      getDocs(collection(db, sitesCol(uid, watchId))),
    ])
    const products = productsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as TrackedProduct[]
    const sites = sitesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as CompetitorSite[]
    if (products.length === 0 || sites.length === 0) {
      ctx.log('warn', 'Catalogue ou sites vides — rien à surveiller.')
      return { all: alertsToSheet([]) }
    }
    const alerts = await runPriceWatch({
      uid,
      watchId,
      thresholdPct: Math.max(0, config.thresholdPct),
      products,
      sites,
      log: (m) => ctx.log('info', m),
      signal: ctx.signal,
    })
    const all = alertsToSheet(alerts)
    if (alerts.length === 0) {
      ctx.log('info', 'Aucune alerte.')
      return { all }
    }
    ctx.log('info', `${alerts.length} alerte(s) — port « changes » émis.`)
    return { changes: all, all }
  },
}

nodeRegistry.register(priceWatchTrackNode)
