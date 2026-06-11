// functions/src/workflow/nodes/priceWatch.ts
// Réimplémentation SERVEUR du node « Veille prix » — wire-compatible avec le
// node client (src/features/workflows/registry/priceWatchNode.ts) : mêmes clés
// de config, même état users/{uid}/priceWatch/{watchId}, mêmes ports. Permet
// au template « Veille prix → alerte Telegram » de tourner en cron sans navigateur.
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { registerServerNode } from '../registry'

interface StoredValue {
  key: string
  value: number
}

interface SheetLike {
  name?: string
  columns?: unknown[]
  rows?: Record<string, unknown>[]
}

/** Parse un prix depuis une cellule : « 1 299,90 € » → 1299.9. NaN si illisible. */
export function parsePrice(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v !== 'string') return NaN
  const cleaned = v.replace(/[\s€$£]/g, '').replace(',', '.').replace(/[^0-9.+-]/g, '')
  return cleaned ? parseFloat(cleaned) : NaN
}

/** Même contrat que le client : changes si variation ≥ seuil, premier relevé silencieux. */
export function diffPriceRows(
  rows: Record<string, unknown>[],
  previous: StoredValue[],
  keyColumn: string,
  valueColumn: string,
  thresholdPct: number,
): { changes: Record<string, unknown>[]; nextValues: StoredValue[] } {
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

registerServerNode({
  type: 'price-watch',
  run: async (ctx, config, inputs) => {
    const watchId = String(config.watchId || 'veille-1').trim().replace(/[/#?[\]]/g, '_')
    const keyColumn = String(config.keyColumn || 'url')
    const valueColumn = String(config.valueColumn || 'price')
    const thresholdPct = Math.max(0, Number(config.thresholdPct) || 0)
    const sheet = (inputs.sheet ?? {}) as SheetLike
    const rows = sheet.rows ?? []
    if (rows.length === 0) {
      ctx.log('warn', 'Sheet vide — aucun prix à surveiller.')
      return { all: sheet }
    }

    const stateRef = getFirestore().doc(`users/${ctx.uid}/priceWatch/${watchId}`)
    const snap = await stateRef.get()
    const previous = (snap.data()?.values ?? []) as StoredValue[]
    const firstRun = !snap.exists

    const { changes, nextValues } = diffPriceRows(rows, previous, keyColumn, valueColumn, thresholdPct)
    await stateRef.set({ values: nextValues, updatedAt: FieldValue.serverTimestamp() })

    if (firstRun) {
      ctx.log('info', `Premier relevé : ${nextValues.length} prix mémorisés (aucune alerte).`)
      return { all: sheet }
    }
    if (changes.length === 0) {
      ctx.log('info', `Aucune variation (${nextValues.length} prix comparés, seuil ${thresholdPct} %).`)
      return { all: sheet }
    }
    ctx.log('info', `${changes.length} variation(s) détectée(s) — port « changes » émis.`)
    return {
      changes: { name: 'Variations de prix', columns: sheet.columns, rows: changes },
      all: sheet,
    }
  },
})
