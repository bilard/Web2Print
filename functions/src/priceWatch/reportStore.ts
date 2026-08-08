// functions/src/priceWatch/reportStore.ts
// Persistance du RAPPORT dashboard — jumeau SERVEUR (admin SDK) de
// src/features/priceWatch/reportStore.ts. La FORME écrite DOIT rester IDENTIQUE au
// client (le dashboard relit indistinctement les rapports écrits par le client ET par
// le cron) : `comp[]` par concurrent dans l'historique, PRODUCT_CAP=1000, ring-buffer 90.
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import {
  reportLatestDoc, reportHistoryDoc, watchRootDoc, REPORT_HISTORY_MAX,
  priceStateCol, priceEventsDoc, PRICE_EVENTS_MAX, PRICE_EVENTS_BYTES, PRICE_STATE_BYTES,
} from './paths'
import { diffPrices, mergeEvents, chunkState, backfillEventUrls, type PriceState, type PriceEvent } from './priceEvents'
import { rankProducts, type CatalogReport, type ProductRow, type CompetitorStat, type FamilyStat, type ReportKpis } from './catalog/report'
import type { SourceProduct } from './catalog/match'
import { retainHistory } from './history'
import { DEFAULT_VAT_RATE } from './catalog/match'

// ── Catalogue SOURCE persisté — jumeau de saveSourceCatalog côté client ─────────────
// Sans lui, un suivi alimenté UNIQUEMENT par le cron n'a pas de catalogue source en
// base : le recalcul mono-site (bouton ▶ de « Sites sources ») ne peut rien reconstruire.
const sourceCol = (uid: string, watchId: string) => `${watchRootDoc(uid, watchId)}/reportSource`
// Tranches bornées en OCTETS, pas en nombre de produits (jumeau du client). Le catalogue
// porte désormais description, visuel et taxonomie : à 2 000 produits par document, une
// base fournie dépasse la limite dure de 1 Mo et l'écriture est REFUSÉE.
const SOURCE_CHUNK = 2000
const SOURCE_CHUNK_BYTES = 900_000

/** Découpe le catalogue en tranches tenant chacune sous la limite d'un document. */
function sliceByBytes<T>(products: T[]): T[][] {
  const out: T[][] = []
  let cur: T[] = []
  let used = 0
  for (const p of products) {
    const size = utf8Bytes(JSON.stringify(p)) + 1
    if (cur.length > 0 && (used + size > SOURCE_CHUNK_BYTES || cur.length >= SOURCE_CHUNK)) {
      out.push(cur); cur = []; used = 0
    }
    cur.push(p); used += size
  }
  if (cur.length > 0 || out.length === 0) out.push(cur)
  return out
}

/** Tranches écrites de front (jumeau du client). */
const SOURCE_WRITE_BATCH = 5

/** Une tranche devenue orpheline : le catalogue a rétréci depuis la dernière écriture. */
function isStaleChunk(id: string, chunks: number): boolean {
  const m = /^chunk_(\d+)$/.exec(id)
  return m != null && Number(m[1]) >= chunks
}

/** Persiste le catalogue source (chunké sous la limite 1 Mo/doc) + la TVA. Remplace tout.
 *  Rend le nombre de TRANCHES écrites : c'est lui qui explique la durée de l'étape. */
export async function saveSourceCatalog(
  uid: string, watchId: string, products: SourceProduct[], vatRate: number,
  /** Lignes REÇUES par le node — jumeau du client (diagnostic « pourquoi si peu ? »). */
  opts: { rows?: number } = {},
): Promise<number> {
  const db = getFirestore()
  const col = sourceCol(uid, watchId)
  const slices = sliceByBytes(products)
  const chunks = slices.length
  // ⚠ ÉCRIRE D'ABORD, EFFACER ENSUITE (jumeau du client). La purge se faisait AVANT
  // l'écriture : le catalogue — `_meta` compris — disparaissait dès la première
  // milliseconde, et l'écran « Concurrents » n'avait plus rien à apparier pendant toute la
  // réécriture. Un run interrompu là laissait le suivi SANS catalogue source.
  for (let i = 0; i < chunks; i += SOURCE_WRITE_BATCH) {
    await Promise.all(slices.slice(i, i + SOURCE_WRITE_BATCH).map((slice, k) =>
      db.doc(`${col}/chunk_${i + k}`).set({ products: stripUndefined(slice) })))
  }
  // ⚠ `_meta` APRÈS les tranches : écrit en premier, il annoncerait des tranches qui
  // peuvent ne jamais arriver, et la relecture rendrait un catalogue amputé en le
  // présentant comme complet.
  await db.doc(`${col}/_meta`).set({
    vatRate, chunks, count: products.length, at: Date.now(),
    ...(opts.rows != null ? { rows: opts.rows } : {}),
  })
  // Tranches excédentaires d'un catalogue rétréci : plus lues (`_meta` fait foi), purgées
  // après coup — leur survie ne fausse rien.
  const existing = await db.collection(col).get().catch(() => null)
  if (existing) {
    await Promise.all(existing.docs
      .filter((d) => isStaleChunk(d.id, chunks))
      .map((d) => d.ref.delete()))
  }
  return chunks
}

/**
 * Relit le catalogue source persisté. Jumeau de `loadSourceCatalog` côté client, y
 * compris la détection d'un catalogue AMPUTÉ : recalculer sur des tranches manquantes
 * écraserait un rapport juste par un rapport à quelques appariés.
 */
export async function loadSourceCatalog(
  uid: string, watchId: string,
): Promise<{ products: SourceProduct[]; vatRate: number; expected: number; partial: boolean } | null> {
  const db = getFirestore()
  const col = sourceCol(uid, watchId)
  const meta = await db.doc(`${col}/_meta`).get()
  if (!meta.exists) return null
  const data = meta.data() ?? {}
  // ⚠ TAUX (0,2), pas pourcentage — cf. jumeau client. Un défaut à 20 divise chaque
  // prix concurrent par 21 et vide toutes les comparaisons.
  const rawVat = data.vatRate
  const vatRate = typeof rawVat === 'number' && rawVat > 0 && rawVat < 1 ? rawVat : DEFAULT_VAT_RATE
  const chunks = typeof data.chunks === 'number' ? data.chunks : 0
  const expected = typeof data.count === 'number' ? data.count : 0
  const products: SourceProduct[] = []
  for (let i = 0; i < chunks; i++) {
    const c = await db.doc(`${col}/chunk_${i}`).get()
    if (c.exists) products.push(...((c.data()?.products as SourceProduct[]) ?? []))
  }
  return { products, vatRate, expected, partial: expected > 0 && products.length < expected - 5 }
}

// ── Journal des changements de prix (jumeau du client) ─────────────────────────────
// Sans ce bloc, un suivi piloté UNIQUEMENT par le cron n'aurait jamais de journal : le
// dashboard afficherait « aucun mouvement » alors que les prix bougent à chaque nuit.

/** Relit l'état des prix (toutes tranches fusionnées). Objet vide si jamais écrit. */
async function loadPriceState(uid: string, watchId: string): Promise<PriceState> {
  const snap = await getFirestore().collection(priceStateCol(uid, watchId)).get().catch(() => null)
  if (!snap) return {}
  const state: PriceState = {}
  for (const d of snap.docs) Object.assign(state, (d.data()?.entries as PriceState) ?? {})
  return state
}

/** Réécrit l'état par tranches (budget d'OCTETS), en purgeant les tranches excédentaires. */
async function savePriceState(uid: string, watchId: string, state: PriceState): Promise<void> {
  const db = getFirestore()
  const col = priceStateCol(uid, watchId)
  const parts = chunkState(state, PRICE_STATE_BYTES)
  const chunks = parts.length
  for (let i = 0; i < chunks; i++) {
    await db.doc(`${col}/chunk_${i}`).set({ entries: parts[i] })
  }
  const existing = await db.collection(col).get().catch(() => null)
  if (existing) {
    await Promise.all(existing.docs
      .filter((d) => { const n = Number(d.id.replace('chunk_', '')); return Number.isFinite(n) && n >= chunks })
      .map((d) => d.ref.delete()))
  }
}

/** Diffe l'analyse contre l'état persisté et journalise les mouvements. Best-effort :
 *  un échec ici ne doit jamais faire échouer l'écriture du rapport. */
async function recordPriceMoves(uid: string, watchId: string, rows: ProductRow[], at: number): Promise<void> {
  try {
    const db = getFirestore()
    const prev = await loadPriceState(uid, watchId)
    const { events, state } = diffPrices(prev, rows, at)
    // ⚠ ORDRE : le JOURNAL d'abord, l'état ensuite (cf. jumeau client). Un échec de l'état
    // fait ré-émettre les mêmes mouvements au tour suivant — mergeEvents les déduplique.
    // L'ordre inverse perdrait le mouvement DÉFINITIVEMENT.
    // Journal relu à CHAQUE run, même sans mouvement : rattrapage des URLs manquantes sur
    // les mouvements écrits avant `u` (cf. jumeau client).
    const jRef = db.doc(priceEventsDoc(uid, watchId))
    const snap = await jRef.get()
    const journal = ((snap.exists ? snap.data()?.events : undefined) as PriceEvent[] | undefined) ?? []
    const { events: healed, filled } = backfillEventUrls(journal, rows)
    if (events.length > 0 || filled > 0) {
      await jRef.set({ events: mergeEvents(healed, events, PRICE_EVENTS_MAX, PRICE_EVENTS_BYTES) })
    }
    await savePriceState(uid, watchId, state)
  } catch (e) {
    console.warn('[veille] journal des changements de prix non écrit :', e instanceof Error ? e.message : e)
  }
}

const PRODUCT_CAP = 1000
// Budget d'octets du doc `latest` : marge sous la limite dure Firestore de 1 048 576 o.
// Un dépassement = écriture REFUSÉE (INVALID_ARGUMENT) → dashboard figé.
const DOC_BYTE_BUDGET = 950_000

/** Taille UTF-8 (universelle, parité avec le client). */
function utf8Bytes(s: string): number {
  return Buffer.byteLength(s, 'utf8')
}

/** Forme du rapport persisté. Exporté : le rendu HTML du mail le relit tel quel. */
export interface StoredReport {
  runAt: number
  kpis: ReportKpis
  byCompetitor: CompetitorStat[]
  /** Familles du catalogue, comptées sur TOUS les appariés (pas sur `products`, plafonné).
   *  Absent des rapports antérieurs : la navigation retombe alors sur l'échantillon. */
  byFamily?: FamilyStat[]
  sites: { siteId: string; domain: string }[]
  products: ProductRow[]
  totalMatched: number
  truncated: boolean
}

export interface KpiHistoryPoint {
  at: number
  products: number
  cheaperThanMe: number
  dearerThanMe: number
  aligned: number
  productsUndercut: number
  /** Écart moyen par concurrent (identique au client — alimente la courbe « flux par
   *  concurrent »). Sans ce champ, un run cron n'y contribuerait pas. */
  comp?: { s: string; g: number | null }[]
  /** Indice tarif base 100 vs médiane marché (kpis.priceIndex) à cette analyse.
   *  Sans lui, un run cron ne contribuerait pas à la courbe d'indice. */
  pi?: number | null
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripUndefined) as unknown as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) out[k] = stripUndefined(v)
    }
    return out as T
  }
  return value
}

/**
 * Persiste le rapport (doc `latest` borné + point de tendance + méta du suivi). Appelé
 * par le node serveur « Comparer catalogue » sous cron → alimente le dashboard sans
 * ouvrir l'app. `runAt` fourni par l'appelant.
 */
export async function saveCatalogReport(
  uid: string,
  watchId: string,
  report: CatalogReport,
  sites: { siteId: string; domain: string }[],
  runAt: number,
  /** `trend: false` = analyse PARTIELLE (index encore en cours de remplissage) : le
   *  tableau de bord est rafraîchi, mais AUCUN point d'historique n'est émis — sinon la
   *  courbe raconterait la progression du scraping, pas le mouvement des prix. */
  /** `rules` = résumé des RÈGLES d'appariement en vigueur. Sans lui, deux rapports du
   *  même suivi peuvent être incomparables sans que rien ne le dise (jumeau client). */
  opts: { label?: string; trend?: boolean; rules?: Record<string, unknown> } = {},
): Promise<void> {
  const db = getFirestore()
  // Cap par OCTETS (pas seulement par nombre) : Firestore refuse tout doc > 1 048 576 o.
  // À l'échelle F1 (milliers d'appariés × 17 concurrents) 1000 produits dépassaient 1,1 Mo
  // → écriture rejetée, dashboard figé. On garde les mieux classés tant qu'on tient.
  const ranked = rankProducts(report.products)
  const overhead = utf8Bytes(JSON.stringify({
    runAt, kpis: report.kpis, byCompetitor: report.byCompetitor, byFamily: report.byFamily, sites,
    products: [], totalMatched: report.products.length, truncated: true,
  }))
  const capped: ProductRow[] = []
  let used = overhead
  for (let i = 0; i < ranked.length && i < PRODUCT_CAP; i++) {
    const size = utf8Bytes(JSON.stringify(ranked[i])) + 1
    if (used + size > DOC_BYTE_BUDGET) break
    capped.push(ranked[i])
    used += size
  }
  const stored: StoredReport = {
    runAt,
    kpis: report.kpis,
    byCompetitor: report.byCompetitor,
    byFamily: report.byFamily,
    sites,
    products: capped,
    totalMatched: report.products.length,
    truncated: capped.length < report.products.length,
    ...(opts.rules ? { rules: opts.rules } : {}),
  }
  await db.doc(reportLatestDoc(uid, watchId)).set(stripUndefined(stored))

  // Tendance : point KPI + rétention journalière (read-modify-write, doc minuscule).
  // ⚠ pas de transaction : un run client et un run cron du MÊME suivi simultanés
  // pourraient perdre un point — probabilité négligeable, acceptée.
  // ⚠ Le cron produit désormais AUSSI des analyses partielles : le filet de fin de
  // moisson recalcule le benchmark quand la fenêtre du run est épuisée (« Comparer
  // catalogue » n'aurait pas son tour). Ces recalculs ne doivent pas entrer dans
  // l'historique — parité avec le jumeau client.
  if (opts.trend === false) return
  // Journal des mouvements : diffé sur `report.products` COMPLET (avant rankProducts et
  // le plafond d'octets) — sur la liste tronquée, un produit qui se réaligne sortirait de
  // l'échantillon et son mouvement serait invisible.
  await recordPriceMoves(uid, watchId, report.products, runAt)

  const point: KpiHistoryPoint = {
    at: runAt,
    products: report.kpis.products,
    cheaperThanMe: report.kpis.cheaperThanMe,
    dearerThanMe: report.kpis.dearerThanMe,
    aligned: report.kpis.aligned,
    productsUndercut: report.kpis.productsUndercut,
    comp: report.byCompetitor.map((c) => ({ s: c.siteId, g: c.avgGapPct, gm: c.medGapPct ?? null })),
    pi: report.kpis.priceIndex ?? null,
  }
  const hRef = db.doc(reportHistoryDoc(uid, watchId))
  const snap = await hRef.get()
  const prev = (snap.exists ? snap.data()?.points : undefined) as KpiHistoryPoint[] | undefined
  const points = retainHistory([...(prev ?? []), point], runAt, REPORT_HISTORY_MAX)
  await hRef.set({ points })

  // Méta du suivi (fait exister le doc racine → listé par le sélecteur). serverTimestamp
  // hors stripUndefined pour préserver le sentinelle FieldValue.
  await db.doc(watchRootDoc(uid, watchId)).set(
    { ...stripUndefined({ label: opts.label, lastReportAt: runAt }), updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  )
}
