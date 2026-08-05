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
  /**
   * URL de la fiche concurrent qui porte ce prix — vérifier le mouvement sur la page.
   *
   * PERSISTÉE (nom court, à la manière de `pid`/`sid`/`dom`) plutôt que résolue depuis
   * `reports/latest` : ce rapport est RANGÉ par écart le plus négatif puis plafonné, donc
   * un mouvement sur un produit où JE suis moins cher — le bas du classement — n'y trouve
   * jamais sa cellule. C'est précisément le biais de survie de l'invariant 1.
   *
   * Coût maîtrisé : à 2000 mouvements, le plafond BINDING est le nombre (~600 ko contre
   * 900 ko de budget), donc aucun mouvement n'est perdu en échange. FACULTATIVE : les
   * journaux écrits avant son introduction n'en ont pas (repli sur l'index du rapport).
   */
  u?: string
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
        // Spread conditionnel : Firestore REJETTE `undefined` dans un setDoc.
        ...(c.url ? { u: c.url } : {}),
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
 * Complète l'URL (`u`) des mouvements DÉJÀ journalisés, depuis les relevés de l'analyse
 * courante.
 *
 * Sans ça, ajouter `u` ne répare que l'avenir : le journal conserve 2000 mouvements sur
 * 90 jours, donc l'écran resterait sans liens pendant des semaines. `rows` est la liste
 * COMPLÈTE des appariés (avant `rankProducts` et tout plafond) — c'est ce qui permet de
 * combler les produits que `reports/latest` ne contient pas.
 *
 * Retourne le nombre d'entrées comblées : à 0, l'appelant n'a RIEN à réécrire.
 */
export function backfillEventUrls(
  events: PriceEvent[], rows: ProductRow[],
): { events: PriceEvent[]; filled: number } {
  const byKey = new Map<string, string>()
  for (const r of rows) for (const c of r.competitors) if (c.url) byKey.set(stateKey(r.id, c.siteId), c.url)
  let filled = 0
  const out = events.map((e) => {
    if (e.u) return e
    const url = byKey.get(stateKey(e.pid, e.sid))
    if (!url) return e
    filled++
    return { ...e, u: url }
  })
  return { events: out, filled }
}

/** Taille UTF-8 (identique côté client et serveur). */
const utf8Bytes = (s: string): number => new TextEncoder().encode(s).length

/**
 * Fusionne les nouveaux mouvements dans le journal, plus RÉCENTS d'abord, sous double
 * plafond (nombre + octets — Firestore refuse tout doc > 1 048 576 o, cf. `latest`).
 *
 * DÉDUPLIQUE sur (at, pid, sid) : le journal est écrit AVANT l'état (cf. recordPriceMoves),
 * donc si l'écriture de l'état échoue, l'analyse suivante rediffe contre les mêmes prix et
 * ré-émet les mêmes mouvements. Ce choix est délibéré — un doublon se rattrape, une baisse
 * de prix manquée ne se rattrape pas — et la dédup le rend indolore.
 */
export function mergeEvents(
  prev: PriceEvent[], fresh: PriceEvent[], maxCount: number, maxBytes: number,
): PriceEvent[] {
  const all = [...fresh, ...prev].sort((a, b) => b.at - a.at)
  const seen = new Set<string>()
  const kept: PriceEvent[] = []
  let used = 32 // enveloppe { "events": [] }
  for (const e of all) {
    if (kept.length >= maxCount) break
    const id = `${e.at}|${e.pid}|${e.sid}`
    if (seen.has(id)) continue
    const size = utf8Bytes(JSON.stringify(e)) + 1
    if (used + size > maxBytes) break
    seen.add(id)
    kept.push(e)
    used += size
  }
  return kept
}

/**
 * Découpe l'état en tranches sous un budget d'OCTETS (pas un nombre d'entrées).
 *
 * ⚠ Un cap par comptage a DÉJÀ fait rejeter un doc à l'échelle F1 : Firestore refuse tout
 * doc > 1 048 576 o (INVALID_ARGUMENT), et la clé d'une entrée est de longueur variable
 * (`stableId` retombe sur le NOM du produit quand ni réf ni EAN n'existent). Comme
 * l'écriture de l'état est best-effort, l'échec serait silencieux : « le journal reste
 * vide » sans rien d'autre à voir.
 */
export function chunkState(state: PriceState, maxBytes: number): PriceState[] {
  const chunks: PriceState[] = []
  let cur: PriceState = {}
  let used = 16 // enveloppe { "entries": {} }
  for (const [k, v] of Object.entries(state)) {
    const size = utf8Bytes(JSON.stringify({ [k]: v })) + 1
    if (used + size > maxBytes && Object.keys(cur).length > 0) {
      chunks.push(cur)
      cur = {}
      used = 16
    }
    cur[k] = v
    used += size
  }
  // Toujours au moins une tranche : un état vide doit écraser l'ancien chunk_0, sinon de
  // vieux prix ressusciteraient au prochain diff.
  if (Object.keys(cur).length > 0 || chunks.length === 0) chunks.push(cur)
  return chunks
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
