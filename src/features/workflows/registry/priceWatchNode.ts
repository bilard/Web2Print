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
  label: 'Veille prix',
  description:
    "Compare les prix de la sheet avec ceux du run précédent (état mémorisé) et n'émet « changes » que si des prix ont varié au-delà du seuil — idéal avant un node Telegram.",
  icon: TrendingUpDown,
  inputs: [{ name: 'sheet', type: 'sheet', required: true }],
  outputs: [
    { name: 'changes', type: 'sheet' },
    { name: 'all', type: 'sheet' },
  ],
  configSchema: [
    { name: 'watchId', kind: 'text', label: 'Identifiant du suivi', help: "L'état (derniers prix vus) est mémorisé par identifiant — un suivi par liste surveillée." },
    { name: 'keyColumn', kind: 'columnRef', label: 'Colonne clé', help: 'Identifie chaque produit entre deux runs (url, sku, ean…).' },
    { name: 'valueColumn', kind: 'columnRef', label: 'Colonne prix', help: 'Valeur surveillée (parse « 1 299,90 € »).' },
    { name: 'thresholdPct', kind: 'number', label: 'Seuil de variation (%)', help: '0 = signaler tout changement.' },
  ],
  defaultConfig: { watchId: 'veille-1', keyColumn: 'url', valueColumn: 'price', thresholdPct: 0 },
  runtime: 'client',
  run: async (ctx, config, inputs) => {
    const uid = useAuthStore.getState().user?.uid
    if (!uid) throw new Error('Utilisateur non connecté — état de veille indisponible.')
    const watchId = (config.watchId || 'veille-1').trim().replace(/[/#?[\]]/g, '_')
    const rows = inputs.sheet?.rows ?? []
    if (rows.length === 0) {
      ctx.log('warn', 'Sheet vide — aucun prix à surveiller.')
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
      ctx.log('info', `Premier relevé : ${nextValues.length} prix mémorisés (aucune alerte).`)
      return { all: inputs.sheet }
    }
    if (changes.length === 0) {
      ctx.log('info', `Aucune variation (${nextValues.length} prix comparés, seuil ${config.thresholdPct} %).`)
      return { all: inputs.sheet }
    }
    ctx.log('info', `${changes.length} variation(s) détectée(s) — port « changes » émis.`)
    return {
      changes: { name: 'Variations de prix', columns: inputs.sheet.columns, rows: changes },
      all: inputs.sheet,
    }
  },
}

nodeRegistry.register(priceWatchNode)
