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
import { rankProducts, type CatalogReport, type ProductRow, type CompetitorStat, type ReportKpis } from './catalog/report'
import type { SourceProduct } from './catalog/match'
import { retainHistory } from './history'

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

/** Persiste le catalogue source (chunké sous la limite 1 Mo/doc) + la TVA. Remplace tout. */
export async function saveSourceCatalog(
  uid: string, watchId: string, products: SourceProduct[], vatRate: number,
): Promise<void> {
  const db = getFirestore()
  const col = sourceCol(uid, watchId)
  // Purge des anciens chunks (catalogue rétréci → pas d'orphelins).
  const existing = await db.collection(col).get().catch(() => null)
  if (existing) await Promise.all(existing.docs.map((d) => d.ref.delete()))
  const slices = sliceByBytes(products)
  const chunks = slices.length
  // ⚠ `_meta` EN DERNIER (jumeau du client) : écrit en premier, il annonçait des tranches
  // qui pouvaient ne jamais arriver, et la relecture rendait un catalogue amputé en le
  // présentant comme complet.
  for (let i = 0; i < chunks; i++) {
    await db.doc(`${col}/chunk_${i}`).set({ products: stripUndefined(slices[i]) })
  }
  await db.doc(`${col}/_meta`).set({ vatRate, chunks, count: products.length, at: Date.now() })
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

interface StoredReport {
  runAt: number
  kpis: ReportKpis
  byCompetitor: CompetitorStat[]
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
  opts: { label?: string } = {},
): Promise<void> {
  const db = getFirestore()
  // Cap par OCTETS (pas seulement par nombre) : Firestore refuse tout doc > 1 048 576 o.
  // À l'échelle F1 (milliers d'appariés × 17 concurrents) 1000 produits dépassaient 1,1 Mo
  // → écriture rejetée, dashboard figé. On garde les mieux classés tant qu'on tient.
  const ranked = rankProducts(report.products)
  const overhead = utf8Bytes(JSON.stringify({
    runAt, kpis: report.kpis, byCompetitor: report.byCompetitor, sites,
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
    sites,
    products: capped,
    totalMatched: report.products.length,
    truncated: capped.length < report.products.length,
  }
  await db.doc(reportLatestDoc(uid, watchId)).set(stripUndefined(stored))

  // Tendance : point KPI + rétention journalière (read-modify-write, doc minuscule).
  // ⚠ pas de transaction : un run client et un run cron du MÊME suivi simultanés
  // pourraient perdre un point — probabilité négligeable, acceptée.
  // Le cron ne produit QUE des analyses complètes : pas de `trend: false` ici (le
  // recalcul partiel est un geste client, cf. jumeau).
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
