// functions/src/priceWatch/analyticsParity.test.ts
// `history.ts` et `priceEvents.ts` sont DUPLIQUÉS depuis src/features/priceWatch/ : client
// et cron écrivent dans les MÊMES documents (`reports/history`, `reports/priceEvents`,
// `priceState`). Deux implémentations divergentes se corrompraient mutuellement — un run
// cron pourrait par exemple purger l'historique autrement, ou émettre des mouvements que
// le client n'aurait pas vus. Ce test exerce les fonctions clés côté serveur.
import { describe, it, expect } from 'vitest'
import { retainHistory } from './history'
import { diffPrices, mergeEvents, chunkState, stateKey } from './priceEvents'
import type { ProductRow } from './catalog/report'

const DAY = 86_400_000
const NOW = new Date('2026-07-25T12:00:00').getTime()

const point = (at: number, products = 1) => ({
  at, products, cheaperThanMe: 0, dearerThanMe: 0, aligned: 0, productsUndercut: 0,
})

const cell = (siteId: string, priceHt: number | null) => ({
  siteId, domain: `${siteId}.fr`, name: 'x', url: `https://${siteId}.fr/p.html`, image: null,
  priceTtc: null, priceHt, listPriceTtc: null, gapPct: null, stock: null, match: 'exact-ref' as const,
})

const row = (id: string, myPriceHt: number, competitors: ReturnType<typeof cell>[]): ProductRow => ({
  id, name: `Produit ${id}`, reference: null, ean: null, famille: null,
  myPriceHt, sourceUrl: null, competitors, bestGapPct: null, undercut: false,
})

describe('history (parité serveur)', () => {
  it('conserve la fenêtre de détail et rollupe au-delà', () => {
    const old = NOW - 20 * DAY
    const kept = retainHistory([point(old, 1), point(old + 3600_000, 2), point(NOW, 9)], NOW, 90)
    expect(kept).toHaveLength(2)
    expect(kept[0].products).toBe(2) // dernier point de la journée ancienne
  })

  it('ne dépasse jamais le plafond', () => {
    const pts = Array.from({ length: 150 }, (_, i) => point(NOW - (150 - i) * DAY))
    expect(retainHistory(pts, NOW, 90)).toHaveLength(90)
  })
})

describe('priceEvents (parité serveur)', () => {
  it('première observation : aucun mouvement, état initialisé', () => {
    const { events, state } = diffPrices({}, [row('a', 100, [cell('pm', 80)])], NOW)
    expect(events).toEqual([])
    expect(state[stateKey('a', 'pm')]).toEqual({ p: 80, t: NOW })
  })

  it('mesure une baisse concurrente', () => {
    const prev = { [stateKey('a', 'pm')]: { p: 80, t: NOW - DAY } }
    const { events } = diffPrices(prev, [row('a', 100, [cell('pm', 72)])], NOW)
    expect(events[0]).toMatchObject({ from: 80, to: 72, pctChange: -10 })
  })

  it('une cellule absente n’efface pas l’état', () => {
    const prev = { [stateKey('a', 'pm')]: { p: 80, t: NOW - DAY } }
    const { state } = diffPrices(prev, [row('a', 100, [cell('pm', null)])], NOW)
    expect(state[stateKey('a', 'pm')].p).toBe(80)
  })

  it('chunkState borne par OCTETS (jamais par nombre d’entrées)', () => {
    const state = Object.fromEntries(
      Array.from({ length: 300 }, (_, i) => [`produit-au-nom-tres-long-${i}|concurrent-${i}`, { p: 123.45, t: NOW }]),
    )
    const parts = chunkState(state, 4_000)
    expect(parts.length).toBeGreaterThan(1)
    for (const part of parts) expect(Buffer.byteLength(JSON.stringify(part), 'utf8')).toBeLessThanOrEqual(4_000)
    expect(parts.reduce((n, p) => n + Object.keys(p).length, 0)).toBe(300)
  })

  it('mergeEvents borne par octets (Buffer côté Node, parité de mesure)', () => {
    const ev = (at: number) => ({
      at, pid: 'p', name: 'Produit', ref: null, sid: 'pm', dom: 'pm.fr',
      from: 100, to: 90, pctChange: -10, mine: 100, gapAfter: null,
    })
    const many = Array.from({ length: 500 }, (_, i) => ev(NOW + i))
    expect(mergeEvents([], many, 500, 2_000).length).toBeLessThan(500)
  })

  it('mergeEvents déduplique un mouvement ré-émis (ordre journal-first)', () => {
    const e = {
      at: NOW, pid: 'p', name: 'Produit', ref: null, sid: 'pm', dom: 'pm.fr',
      from: 100, to: 90, pctChange: -10, mine: 100, gapAfter: null,
    }
    expect(mergeEvents([e], [e], 100, 1_000_000)).toHaveLength(1)
  })
})
