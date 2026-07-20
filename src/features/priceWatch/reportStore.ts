// src/features/priceWatch/reportStore.ts
// Persistance du RAPPORT de comparaison catalogue (synthèse dashboard). Écrit par le
// node « Comparer catalogue ». Contrat BORNÉ : le doc `latest` porte les KPIs, les
// stats par concurrent (≤ N sites) et une liste produit RANGÉE + PLAFONNÉE ; le doc
// `history` accumule des points KPI minuscules pour la tendance. Jamais 75 000 lignes
// en base — la liste complète, c'est l'export Excel (cf. audit scalabilité).
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { reportLatestDoc, reportHistoryDoc, watchRootDoc, REPORT_HISTORY_MAX } from './paths'
import { rankProducts, type CatalogReport, type ProductRow, type CompetitorStat, type ReportKpis } from './catalog/report'

/** Plafond de produits persistés dans `latest` (les plus sous-cotés d'abord). Au-delà,
 *  `truncated` est vrai et l'utilisateur bascule sur l'export Excel pour l'exhaustif. */
const PRODUCT_CAP = 1000

export interface StoredReport {
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
  /** Écart moyen (avgGapPct FIABLE, agrégé serveur) par concurrent à cette analyse.
   *  `s` = siteId, `g` = écart % (null si aucun prix). ABSENT des points écrits avant
   *  cette feature → à traiter comme un trou dans la courbe (jamais 0). */
  comp?: { s: string; g: number | null }[]
}

/**
 * Supprime un suivi du sélecteur : doc racine + rapports `latest`/`history`. La
 * sous-collection `competitors/{siteId}/pages` reste orpheline (Firestore client ne
 * supprime pas récursivement) — sans impact : le watchId auto = workflowId est unique,
 * donc jamais réutilisé, et le menu (alimenté par priceWatchCol) ne le liste plus.
 */
export async function deleteWatch(uid: string, watchId: string): Promise<void> {
  // watchId = l'id RÉEL du doc (d.id du sélecteur) — à utiliser TEL QUEL. NE PAS passer
  // par les helpers paths (qui normalisent via stableId) : les suivis créés AVANT la
  // canonicalisation portent un id BRUT (espaces/majuscules, ex « F1 Moisson »), et le
  // normaliser viserait un chemin inexistant → suppression no-op silencieuse.
  const root = `users/${uid}/priceWatch/${watchId}`
  await Promise.all([
    deleteDoc(doc(db, root)),
    deleteDoc(doc(db, `${root}/reports/latest`)),
    deleteDoc(doc(db, `${root}/reports/history`)),
  ])
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
 * Persiste le rapport : doc `latest` (borné) + point de tendance + méta du suivi
 * (pour le sélecteur). `runAt` est fourni par l'appelant (déterministe/testable).
 */
export async function saveCatalogReport(
  uid: string,
  watchId: string,
  report: CatalogReport,
  sites: { siteId: string; domain: string }[],
  runAt: number,
  opts: { label?: string } = {},
): Promise<void> {
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
  await setDoc(doc(db, reportLatestDoc(uid, watchId)), stripUndefined(stored))

  // Tendance : ring-buffer de points KPI (lecture-modif-écriture, doc minuscule).
  const point: KpiHistoryPoint = {
    at: runAt,
    products: report.kpis.products,
    cheaperThanMe: report.kpis.cheaperThanMe,
    dearerThanMe: report.kpis.dearerThanMe,
    aligned: report.kpis.aligned,
    productsUndercut: report.kpis.productsUndercut,
    comp: report.byCompetitor.map((c) => ({ s: c.siteId, g: c.avgGapPct })),
  }
  const hRef = doc(db, reportHistoryDoc(uid, watchId))
  const prev = (await getDoc(hRef)).data()?.points as KpiHistoryPoint[] | undefined
  const points = [...(prev ?? []), point].slice(-REPORT_HISTORY_MAX)
  await setDoc(hRef, { points })

  // Méta du suivi (fait exister le doc racine → listé par le sélecteur de suivi).
  await setDoc(
    doc(db, watchRootDoc(uid, watchId)),
    stripUndefined({ label: opts.label, updatedAt: serverTimestamp(), lastReportAt: runAt }),
    { merge: true },
  )
}
