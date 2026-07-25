// src/features/priceWatch/priceEvents.ts
// JOURNAL DES CHANGEMENTS DE PRIX — noyau PUR (dupliqué côté serveur).
//
// Pourquoi un journal plutôt qu'une série de niveaux : on ne peut PAS reconstruire
// l'évolution d'un prix en empilant les snapshots de `reports/latest`, dont la liste
// produit est rangée par écart le plus négatif puis plafonnée. La composition de
// l'échantillon change d'un run à l'autre : un produit qui se réaligne SORT du cap et sa
// courbe s'arrête — ça se lit « le prix ne bouge plus », c'est faux (biais de survie).
//
// On diffe donc, à chaque analyse COMPLÈTE, les prix relevés contre un état persisté, et
// on n'écrit QUE les mouvements. C'est compact (pas de risque de retomber sur le doc
// > 1 Mo déjà vécu) et c'est exactement la question de l'acheteur : qui a bougé, quand,
// de combien.
import type { ProductRow } from './catalog/report'

/** Dernier prix connu d'une cellule produit × concurrent. `t` = date du relevé.
 *  Non exporté : lu uniquement à travers `PriceState` (cf. knip). */
interface PriceStateEntry { p: number; t: number }
/** État : clé `${productId}|${siteId}` → dernier prix HT connu. */
export type PriceState = Record<string, PriceStateEntry>

/** Un mouvement de prix constaté chez un concurrent. Champs courts : le doc est borné. */
export interface PriceEvent {
  /** Date de l'analyse qui a constaté le mouvement. */
  at: number
  /** Identifiants produit (pid) et site (sid) + libellés d'affichage. */
  pid: string
  name: string
  ref: string | null
  sid: string
  dom: string
  /** Prix HT avant → après. */
  from: number
  to: number
  /** Variation en % (arrondie au dixième). Négative = le concurrent a baissé. */
  pctChange: number
  /** Mon prix HT au moment du constat (null si inconnu) — situe le mouvement. */
  mine: number | null
  /** Mon écart % face à CE concurrent APRÈS le mouvement (négatif = il est moins cher). */
  gapAfter: number | null
}

/** Variation minimale retenue (%) : sous ce seuil, c'est du bruit d'arrondi, pas une
 *  décision commerciale. Un vrai repositionnement dépasse toujours 0,5 %. */
const MIN_CHANGE_PCT = 0.5
/** Durée de conservation d'une clé non revue dans l'état (jours). Purge les produits
 *  retirés du catalogue ou les sites abandonnés, sans laisser l'état enfler sans fin. */
const STATE_TTL_DAYS = 90
const DAY_MS = 86_400_000

export const stateKey = (productId: string, siteId: string): string => `${productId}|${siteId}`

/**
 * Diffe les relevés d'une analyse contre l'état connu.
 *
 * ⚠ Un événement n'est émis QUE si les DEUX prix existent. Une cellule absente (site non
 * moissonné à ce tour, produit non apparié) ne produit rien et surtout n'efface pas
 * l'état : sinon la reprise recréerait un « premier prix » et masquerait le vrai
 * mouvement au tour suivant.
 *
 * `rows` doit être la liste COMPLÈTE des produits appariés (avant rankProducts/plafond).
 */
export function diffPrices(prev: PriceState, rows: ProductRow[], at: number): {
  events: PriceEvent[]
  state: PriceState
} {
  // Copie de l'état : les clés absentes de cette analyse sont PRÉSERVÉES (voir ci-dessus).
  const state: PriceState = { ...prev }
  const events: PriceEvent[] = []

  for (const r of rows) {
    for (const c of r.competitors) {
      if (c.priceHt == null || c.priceHt <= 0) continue
      const key = stateKey(r.id, c.siteId)
      const before = state[key]
      state[key] = { p: c.priceHt, t: at }
      if (!before || before.p <= 0) continue // première observation : pas un mouvement
      const pctChange = ((c.priceHt - before.p) / before.p) * 100
      if (Math.abs(pctChange) < MIN_CHANGE_PCT) continue
      events.push({
        at,
        pid: r.id, name: r.name, ref: r.reference, sid: c.siteId, dom: c.domain,
        from: before.p, to: c.priceHt,
        pctChange: Math.round(pctChange * 10) / 10,
        mine: r.myPriceHt, gapAfter: c.gapPct,
      })
    }
  }

  // Purge des clés jamais revues depuis STATE_TTL_DAYS.
  const cutoff = at - STATE_TTL_DAYS * DAY_MS
  for (const [k, v] of Object.entries(state)) if (v.t < cutoff) delete state[k]

  // Mouvement le plus marqué d'abord : c'est ce qu'on veut lire en tête de journal.
  events.sort((a, b) => Math.abs(b.pctChange) - Math.abs(a.pctChange))
  return { events, state }
}

/**
 * Fusionne les nouveaux mouvements dans le journal, plus RÉCENTS d'abord, sous double
 * plafond (nombre + octets — Firestore refuse tout doc > 1 048 576 o, cf. `latest`).
 */
export function mergeEvents(
  prev: PriceEvent[], fresh: PriceEvent[], maxCount: number, maxBytes: number,
): PriceEvent[] {
  const all = [...fresh, ...prev].sort((a, b) => b.at - a.at)
  const kept: PriceEvent[] = []
  let used = 32 // enveloppe { "events": [] }
  for (const e of all) {
    if (kept.length >= maxCount) break
    const size = new TextEncoder().encode(JSON.stringify(e)).length + 1
    if (used + size > maxBytes) break
    kept.push(e)
    used += size
  }
  return kept
}

// --- Dérivations pour le cockpit (pures) ---

export interface MoveSummary {
  /** Nombre de mouvements sur la fenêtre. */
  total: number
  /** Baisses / hausses concurrentes. Une baisse concurrente est une PRESSION sur moi. */
  down: number
  up: number
  /** Variation moyenne des baisses (négative) et des hausses. null si aucune. */
  avgDownPct: number | null
  avgUpPct: number | null
  /** Concurrents les plus mobiles, du plus actif au moins actif. */
  byCompetitor: { sid: string; dom: string; moves: number; down: number; avgPct: number }[]
}

export function summarizeMoves(events: PriceEvent[]): MoveSummary {
  const downs = events.filter((e) => e.pctChange < 0)
  const ups = events.filter((e) => e.pctChange > 0)
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null)

  const by = new Map<string, { dom: string; moves: number; down: number; sum: number }>()
  for (const e of events) {
    const acc = by.get(e.sid) ?? { dom: e.dom, moves: 0, down: 0, sum: 0 }
    acc.moves++
    if (e.pctChange < 0) acc.down++
    acc.sum += e.pctChange
    by.set(e.sid, acc)
  }

  return {
    total: events.length,
    down: downs.length,
    up: ups.length,
    avgDownPct: avg(downs.map((e) => e.pctChange)),
    avgUpPct: avg(ups.map((e) => e.pctChange)),
    byCompetitor: [...by.entries()]
      .map(([sid, a]) => ({ sid, dom: a.dom, moves: a.moves, down: a.down, avgPct: Math.round((a.sum / a.moves) * 10) / 10 }))
      .sort((a, b) => b.moves - a.moves),
  }
}

/** Restreint le journal à une fenêtre glissante (en jours) à partir de `now`. */
export function eventsSince(events: PriceEvent[], days: number, now: number): PriceEvent[] {
  const cutoff = now - days * DAY_MS
  return events.filter((e) => e.at >= cutoff)
}
