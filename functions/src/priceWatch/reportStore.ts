// functions/src/priceWatch/reportStore.ts
// Persistance du RAPPORT dashboard — jumeau SERVEUR (admin SDK) de
// src/features/priceWatch/reportStore.ts. La FORME écrite DOIT rester IDENTIQUE au
// client (le dashboard relit indistinctement les rapports écrits par le client ET par
// le cron) : `comp[]` par concurrent dans l'historique, PRODUCT_CAP=1000, ring-buffer 90.
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { reportLatestDoc, reportHistoryDoc, watchRootDoc, REPORT_HISTORY_MAX } from './paths'
import { rankProducts, type CatalogReport, type ProductRow, type CompetitorStat, type ReportKpis } from './catalog/report'
import type { SourceProduct } from './catalog/match'
import { retainHistory } from './history'

// ── Catalogue SOURCE persisté — jumeau de saveSourceCatalog côté client ─────────────
// Sans lui, un suivi alimenté UNIQUEMENT par le cron n'a pas de catalogue source en
// base : le recalcul mono-site (bouton ▶ de « Sites sources ») ne peut rien reconstruire.
const sourceCol = (uid: string, watchId: string) => `${watchRootDoc(uid, watchId)}/reportSource`
const SOURCE_CHUNK = 2000

/** Persiste le catalogue source (chunké sous la limite 1 Mo/doc) + la TVA. Remplace tout. */
export async function saveSourceCatalog(
  uid: string, watchId: string, products: SourceProduct[], vatRate: number,
): Promise<void> {
  const db = getFirestore()
  const col = sourceCol(uid, watchId)
  // Purge des anciens chunks (catalogue rétréci → pas d'orphelins).
  const existing = await db.collection(col).get().catch(() => null)
  if (existing) await Promise.all(existing.docs.map((d) => d.ref.delete()))
  const chunks = Math.max(1, Math.ceil(products.length / SOURCE_CHUNK))
  await db.doc(`${col}/_meta`).set({ vatRate, chunks, count: products.length, at: Date.now() })
  for (let i = 0; i < chunks; i++) {
    await db.doc(`${col}/chunk_${i}`).set(
      { products: stripUndefined(products.slice(i * SOURCE_CHUNK, (i + 1) * SOURCE_CHUNK)) },
    )
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
  const point: KpiHistoryPoint = {
    at: runAt,
    products: report.kpis.products,
    cheaperThanMe: report.kpis.cheaperThanMe,
    dearerThanMe: report.kpis.dearerThanMe,
    aligned: report.kpis.aligned,
    productsUndercut: report.kpis.productsUndercut,
    comp: report.byCompetitor.map((c) => ({ s: c.siteId, g: c.avgGapPct })),
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
