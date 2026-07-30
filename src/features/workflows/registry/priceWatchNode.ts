// Node « Veille prix » : compare les valeurs (prix) de la sheet d'entrée avec
// celles mémorisées au run précédent (users/{uid}/priceWatch/{watchId}) et
// n'émet le port `changes` QUE s'il y a des variations au-delà du seuil —
// le downstream (ex : Envoyer via Telegram) est donc skippé sinon.
import { TrendingUpDown } from 'lucide-react'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import { useAuthStore } from '@/stores/auth.store'
// `run()` n'est pas un composant : helper `t()` de module (lit la locale courante).
import { t } from '@/lib/i18n'

interface PriceWatchConfig {
  watchId: string
  keyColumn: string
  valueColumn: string
  thresholdPct: number
}

interface SheetLike {
  name?: string
  columns?: unknown[]
  rows?: Record<string, unknown>[]
}

interface StoredValue {
  key: string
  value: number
}

export interface PriceDiff {
  changes: Record<string, unknown>[]
  nextValues: StoredValue[]
}

/** Parse un prix depuis une cellule : « 1 299,90 € » → 1299.9. NaN si illisible. */
export function parsePrice(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v !== 'string') return NaN
  const cleaned = v.replace(/[\s€$£]/g, '').replace(',', '.').replace(/[^0-9.+-]/g, '')
  return cleaned ? parseFloat(cleaned) : NaN
}

/**
 * Cœur pur : compare les lignes aux valeurs précédentes. Une ligne « change »
 * si sa valeur diffère de plus de thresholdPct % (0 = tout changement). Les
 * clés inconnues au run précédent n'alertent pas (premier relevé).
 */
export function diffPriceRows(
  rows: Record<string, unknown>[],
  previous: StoredValue[],
  keyColumn: string,
  valueColumn: string,
  thresholdPct: number,
): PriceDiff {
  const prevMap = new Map(previous.map((p) => [p.key, p.value]))
  const changes: Record<string, unknown>[] = []
  const nextValues: StoredValue[] = []
  for (const row of rows) {
    const key = String(row[keyColumn] ?? '').trim()
    const value = parsePrice(row[valueColumn])
    if (!key || isNaN(value)) continue
    nextValues.push({ key, value })
    const prev = prevMap.get(key)
    if (prev === undefined || prev === value) continue
    const deltaPct = prev === 0 ? 100 : Math.abs((value - prev) / prev) * 100
    if (deltaPct >= thresholdPct) {
      changes.push({
        ...row,
        ancien_prix: prev,
        nouveau_prix: value,
        variation_pct: Math.round(((value - prev) / (prev || 1)) * 1000) / 10,
      })
    }
  }
  return { changes, nextValues }
}

const priceWatchNode: NodeSpec<
  PriceWatchConfig,
  { sheet: SheetLike },
  { changes?: SheetLike; all: SheetLike }
> = {
  type: 'price-watch',
  category: 'logic',
  labelKey: 'node.price-watch.label',
  descriptionKey: 'node.price-watch.desc',
  icon: TrendingUpDown,
  inputs: [{ name: 'sheet', type: 'sheet', required: true }],
  outputs: [
    { name: 'changes', type: 'sheet' },
    { name: 'all', type: 'sheet' },
  ],
  configSchema: [
    { name: 'watchId', kind: 'text', labelKey: 'node.price-watch.watchId.label', helpKey: 'node.price-watch.watchId.help' },
    { name: 'keyColumn', kind: 'columnRef', labelKey: 'node.price-watch.keyColumn.label', helpKey: 'node.price-watch.keyColumn.help' },
    { name: 'valueColumn', kind: 'columnRef', labelKey: 'node.price-watch.valueColumn.label', helpKey: 'node.price-watch.valueColumn.help' },
    { name: 'thresholdPct', kind: 'number', labelKey: 'node.price-watch.thresholdPct.label', helpKey: 'node.price-watch.thresholdPct.help' },
  ],
  defaultConfig: { watchId: 'veille-1', keyColumn: 'url', valueColumn: 'price', thresholdPct: 0 },
  runtime: 'client',
  run: async (ctx, config, inputs) => {
    const uid = useAuthStore.getState().user?.uid
    if (!uid) throw new Error(t('run.pw.notSignedIn'))
    const watchId = (config.watchId || 'veille-1').trim().replace(/[/#?[\]]/g, '_')
    const rows = inputs.sheet?.rows ?? []
    if (rows.length === 0) {
      ctx.log('warn', t('run.pw.emptySheet'))
      return { all: inputs.sheet }
    }

    const stateRef = doc(db, 'users', uid, 'priceWatch', watchId)
    const snap = await getDoc(stateRef)
    const previous = (snap.data()?.values ?? []) as StoredValue[]
    const firstRun = !snap.exists()

    const { changes, nextValues } = diffPriceRows(
      rows, previous, config.keyColumn, config.valueColumn, Math.max(0, config.thresholdPct),
    )
    await setDoc(stateRef, { values: nextValues, updatedAt: serverTimestamp() })

    if (firstRun) {
      ctx.log('info', t('run.pw.firstReading', { count: nextValues.length }))
      return { all: inputs.sheet }
    }
    if (changes.length === 0) {
      ctx.log('info', t('run.pw.noChange', { count: nextValues.length, threshold: config.thresholdPct }))
      return { all: inputs.sheet }
    }
    ctx.log('info', t('run.pw.changes', { count: changes.length }))
    return {
      changes: { name: 'Variations de prix', columns: inputs.sheet.columns, rows: changes },
      all: inputs.sheet,
    }
  },
}

nodeRegistry.register(priceWatchNode)
