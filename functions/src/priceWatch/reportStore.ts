// functions/src/priceWatch/reportStore.ts
// Persistance du RAPPORT dashboard — jumeau SERVEUR (admin SDK) de
// src/features/priceWatch/reportStore.ts. La FORME écrite DOIT rester IDENTIQUE au
// client (le dashboard relit indistinctement les rapports écrits par le client ET par
// le cron) : `comp[]` par concurrent dans l'historique, PRODUCT_CAP=1000, ring-buffer 90.
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { reportLatestDoc, reportHistoryDoc, watchRootDoc, REPORT_HISTORY_MAX } from './paths'
import { rankProducts, type CatalogReport, type ProductRow, type CompetitorStat, type ReportKpis } from './catalog/report'

const PRODUCT_CAP = 1000

interface StoredReport {
  runAt: number
  kpis: ReportKpis
  byCompetitor: CompetitorStat[]
  sites: { siteId: string; domain: string }[]
  products: ProductRow[]
  totalMatched: number
  truncated: boolean
}

interface KpiHistoryPoint {
  at: number
  products: number
  cheaperThanMe: number
  dearerThanMe: number
  aligned: number
  productsUndercut: number
  /** Écart moyen par concurrent (identique au client — alimente la courbe « flux par
   *  concurrent »). Sans ce champ, un run cron n'y contribuerait pas. */
  comp?: { s: string; g: number | null }[]
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
  const ranked = rankProducts(report.products)
  const capped = ranked.slice(0, PRODUCT_CAP)
  const stored: StoredReport = {
    runAt,
    kpis: report.kpis,
    byCompetitor: report.byCompetitor,
    sites,
    products: capped,
    totalMatched: report.products.length,
    truncated: report.products.length > PRODUCT_CAP,
  }
  await db.doc(reportLatestDoc(uid, watchId)).set(stripUndefined(stored))

  // Tendance : ring-buffer de points KPI (read-modify-write, doc minuscule). ⚠ pas de
  // transaction : un run client et un run cron du MÊME suivi simultanés pourraient perdre
  // un point — probabilité négligeable pour 90 points, acceptée.
  const point: KpiHistoryPoint = {
    at: runAt,
    products: report.kpis.products,
    cheaperThanMe: report.kpis.cheaperThanMe,
    dearerThanMe: report.kpis.dearerThanMe,
    aligned: report.kpis.aligned,
    productsUndercut: report.kpis.productsUndercut,
    comp: report.byCompetitor.map((c) => ({ s: c.siteId, g: c.avgGapPct })),
  }
  const hRef = db.doc(reportHistoryDoc(uid, watchId))
  const snap = await hRef.get()
  const prev = (snap.exists ? snap.data()?.points : undefined) as KpiHistoryPoint[] | undefined
  const points = [...(prev ?? []), point].slice(-REPORT_HISTORY_MAX)
  await hRef.set({ points })

  // Méta du suivi (fait exister le doc racine → listé par le sélecteur). serverTimestamp
  // hors stripUndefined pour préserver le sentinelle FieldValue.
  await db.doc(watchRootDoc(uid, watchId)).set(
    { ...stripUndefined({ label: opts.label, lastReportAt: runAt }), updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  )
}
