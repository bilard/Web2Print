import { describe, it, expect } from 'vitest'
import { diffPrices, mergeEvents, chunkState, summarizeMoves, eventsSince, stateKey, type PriceEvent, type PriceState } from './priceEvents'
import type { ProductRow } from './catalog/report'

const T0 = new Date('2026-07-01T09:00:00').getTime()
const DAY = 86_400_000

const cell = (siteId: string, priceHt: number | null, gapPct: number | null = null) => ({
  siteId, domain: `${siteId}.fr`, name: 'x', url: `https://${siteId}.fr/p.html`, image: null,
  priceTtc: priceHt == null ? null : priceHt * 1.2, priceHt, listPriceTtc: null,
  gapPct, stock: null, match: 'exact-ref' as const,
})

const row = (id: string, myPriceHt: number | null, competitors: ReturnType<typeof cell>[]): ProductRow => ({
  id, name: `Produit ${id}`, reference: `REF-${id}`, ean: null, famille: null,
  myPriceHt, sourceUrl: null, competitors, bestGapPct: null, undercut: false,
})

describe('diffPrices', () => {
  it('première observation : état initialisé, aucun mouvement', () => {
    const { events, state } = diffPrices({}, [row('a', 100, [cell('pm', 80)])], T0)
    expect(events).toEqual([])
    expect(state[stateKey('a', 'pm')]).toEqual({ p: 80, t: T0 })
  })

  it('détecte une baisse concurrente et la chiffre', () => {
    const prev: PriceState = { [stateKey('a', 'pm')]: { p: 80, t: T0 } }
    const { events } = diffPrices(prev, [row('a', 100, [cell('pm', 72, -28)])], T0 + DAY)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ pid: 'a', sid: 'pm', from: 80, to: 72, pctChange: -10, mine: 100, gapAfter: -28 })
  })

  it('ignore le bruit sous le seuil de 0,5 %', () => {
    const prev: PriceState = { [stateKey('a', 'pm')]: { p: 80, t: T0 } }
    const { events } = diffPrices(prev, [row('a', 100, [cell('pm', 80.2)])], T0 + DAY)
    expect(events).toEqual([])
  })

  it('une cellule absente n’efface PAS l’état (site non moissonné ce tour)', () => {
    const prev: PriceState = { [stateKey('a', 'pm')]: { p: 80, t: T0 } }
    const { events, state } = diffPrices(prev, [row('a', 100, [cell('pm', null)])], T0 + DAY)
    expect(events).toEqual([])
    expect(state[stateKey('a', 'pm')]).toEqual({ p: 80, t: T0 })
  })

  it('reprend le fil après une analyse manquée (pas de faux « premier prix »)', () => {
    let state: PriceState = diffPrices({}, [row('a', 100, [cell('pm', 80)])], T0).state
    // Tour 2 : le site n'a rien remonté.
    state = diffPrices(state, [row('a', 100, [cell('pm', null)])], T0 + DAY).state
    // Tour 3 : le prix a bougé — le mouvement est bien mesuré depuis 80, pas perdu.
    const { events } = diffPrices(state, [row('a', 100, [cell('pm', 70)])], T0 + 2 * DAY)
    expect(events).toHaveLength(1)
    expect(events[0].from).toBe(80)
  })

  it('purge les clés non revues au-delà du TTL', () => {
    const prev: PriceState = { [stateKey('vieux', 'pm')]: { p: 10, t: T0 } }
    const { state } = diffPrices(prev, [], T0 + 100 * DAY)
    expect(state[stateKey('vieux', 'pm')]).toBeUndefined()
  })

  it('classe les mouvements les plus marqués en tête', () => {
    const prev: PriceState = {
      [stateKey('a', 'pm')]: { p: 100, t: T0 },
      [stateKey('b', 'pm')]: { p: 100, t: T0 },
    }
    const { events } = diffPrices(prev, [
      row('a', 100, [cell('pm', 95)]),  // −5 %
      row('b', 100, [cell('pm', 70)]),  // −30 %
    ], T0 + DAY)
    expect(events.map((e) => e.pid)).toEqual(['b', 'a'])
  })

  it('ignore un prix nul ou négatif (donnée de scraping cassée)', () => {
    const prev: PriceState = { [stateKey('a', 'pm')]: { p: 80, t: T0 } }
    const { events, state } = diffPrices(prev, [row('a', 100, [cell('pm', 0)])], T0 + DAY)
    expect(events).toEqual([])
    expect(state[stateKey('a', 'pm')].p).toBe(80)
  })
})

const ev = (at: number, pctChange: number, sid = 'pm'): PriceEvent => ({
  at, pid: 'p', name: 'P', ref: null, sid, dom: `${sid}.fr`,
  from: 100, to: 100 + pctChange, pctChange, mine: 100, gapAfter: null,
})

describe('mergeEvents', () => {
  it('place les plus récents en tête et respecte le plafond de nombre', () => {
    const kept = mergeEvents([ev(T0, -5)], [ev(T0 + DAY, -8), ev(T0 + 2 * DAY, -2)], 2, 1_000_000)
    expect(kept).toHaveLength(2)
    expect(kept[0].at).toBe(T0 + 2 * DAY)
  })

  it('respecte le plafond d’octets même sous le plafond de nombre', () => {
    const many = Array.from({ length: 500 }, (_, i) => ev(T0 + i, -1))
    expect(mergeEvents([], many, 500, 2_000).length).toBeLessThan(500)
  })
})

describe('summarizeMoves', () => {
  it('sépare baisses et hausses et classe les concurrents les plus mobiles', () => {
    const s = summarizeMoves([ev(T0, -10, 'pm'), ev(T0, -6, 'pm'), ev(T0, 4, 'wm')])
    expect(s).toMatchObject({ total: 3, down: 2, up: 1, avgDownPct: -8, avgUpPct: 4 })
    expect(s.byCompetitor[0]).toMatchObject({ sid: 'pm', moves: 2, down: 2, avgPct: -8 })
  })

  it('journal vide : aucune moyenne inventée', () => {
    expect(summarizeMoves([])).toMatchObject({ total: 0, avgDownPct: null, avgUpPct: null })
  })
})

describe('eventsSince', () => {
  it('retient la fenêtre glissante', () => {
    const now = T0 + 30 * DAY
    const kept = eventsSince([ev(now - 2 * DAY, -5), ev(now - 20 * DAY, -5)], 7, now)
    expect(kept).toHaveLength(1)
  })
})

describe('chunkState', () => {
  it('découpe sous le budget d’octets, jamais un doc au-delà', () => {
    const state = Object.fromEntries(
      Array.from({ length: 300 }, (_, i) => [`produit-au-nom-tres-long-${i}|concurrent-${i}`, { p: 123.45, t: T0 }]),
    )
    const parts = chunkState(state, 4_000)
    expect(parts.length).toBeGreaterThan(1)
    for (const part of parts) {
      expect(new TextEncoder().encode(JSON.stringify(part)).length).toBeLessThanOrEqual(4_000)
    }
    // Aucune entrée perdue ni dupliquée.
    expect(parts.reduce((n, p) => n + Object.keys(p).length, 0)).toBe(300)
  })

  it('état vide → une tranche vide (écrase l’ancien chunk_0)', () => {
    expect(chunkState({}, 900_000)).toEqual([{}])
  })

  it('une entrée plus grosse que le budget reste écrite (jamais silencieusement perdue)', () => {
    const parts = chunkState({ 'a|b': { p: 1, t: T0 } }, 4)
    expect(parts.flatMap((p) => Object.keys(p))).toEqual(['a|b'])
  })
})

describe('mergeEvents — déduplication', () => {
  it('un mouvement ré-émis après un échec d’état n’apparaît qu’une fois', () => {
    const e = ev(T0, -10)
    expect(mergeEvents([e], [e], 100, 1_000_000)).toHaveLength(1)
  })

  it('deux concurrents au même instant restent deux mouvements distincts', () => {
    expect(mergeEvents([], [ev(T0, -10, 'pm'), ev(T0, -10, 'wm')], 100, 1_000_000)).toHaveLength(2)
  })
})
