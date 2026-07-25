// src/features/priceWatch/reportStore.ts
// Persistance du RAPPORT de comparaison catalogue (synthèse dashboard). Écrit par le
// node « Comparer catalogue ». Contrat BORNÉ : le doc `latest` porte les KPIs, les
// stats par concurrent (≤ N sites) et une liste produit RANGÉE + PLAFONNÉE ; le doc
// `history` accumule des points KPI minuscules pour la tendance. Jamais 75 000 lignes
// en base — la liste complète, c'est l'export Excel (cf. audit scalabilité).
import { doc, getDoc, getDocs, collection, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { reportLatestDoc, reportHistoryDoc, watchRootDoc, REPORT_HISTORY_MAX } from './paths'
import { rankProducts, type CatalogReport, type ProductRow, type CompetitorStat, type ReportKpis } from './catalog/report'
import type { SourceProduct } from './catalog/match'
import { retainHistory } from './history'

// ── Catalogue SOURCE persisté (pour recalculer le benchmark hors workflow) ──────────
// Le node « Comparer » écrit ici les produits source + la TVA ; le recalcul mono-site
// (après un ▶) les relit pour reconstruire le rapport sans relancer tout le workflow.
const sourceCol = (uid: string, watchId: string) => `${watchRootDoc(uid, watchId)}/reportSource`
const SOURCE_CHUNK = 2000

/** Persiste le catalogue source (chunké sous la limite 1 Mo/doc) + la TVA. Remplace tout. */
export async function saveSourceCatalog(uid: string, watchId: string, products: SourceProduct[], vatRate: number): Promise<void> {
  const col = sourceCol(uid, watchId)
  // Purge les anciens chunks (catalogue plus petit qu'avant → pas d'orphelins).
  const existing = await getDocs(collection(db, col)).catch(() => null)
  if (existing) await Promise.all(existing.docs.map((d) => deleteDoc(d.ref)))
  const chunks = Math.max(1, Math.ceil(products.length / SOURCE_CHUNK))
  await setDoc(doc(db, col, '_meta'), { vatRate, chunks, count: products.length, at: Date.now() })
  for (let i = 0; i < chunks; i++) {
    await setDoc(doc(db, col, `chunk_${i}`), { products: products.slice(i * SOURCE_CHUNK, (i + 1) * SOURCE_CHUNK) })
  }
}

/** Relit le catalogue source persisté. null si jamais écrit (aucun « Comparer » lancé). */
export async function loadSourceCatalog(uid: string, watchId: string): Promise<{ products: SourceProduct[]; vatRate: number } | null> {
  const col = sourceCol(uid, watchId)
  const meta = await getDoc(doc(db, col, '_meta'))
  if (!meta.exists()) return null
  const vatRate = (meta.data()?.vatRate as number) ?? 20
  const chunks = (meta.data()?.chunks as number) ?? 0
  const products: SourceProduct[] = []
  for (let i = 0; i < chunks; i++) {
    const c = await getDoc(doc(db, col, `chunk_${i}`))
    if (c.exists()) products.push(...((c.data()?.products as SourceProduct[]) ?? []))
  }
  return { products, vatRate }
}

/** Plafond de produits persistés dans `latest` (les plus sous-cotés d'abord). Au-delà,
 *  `truncated` est vrai et l'utilisateur bascule sur l'export Excel pour l'exhaustif. */
const PRODUCT_CAP = 1000
// Budget d'octets du doc `latest` : marge sous la limite dure Firestore de 1 048 576 o
// (place laissée aux clés serializées + méta). Un dépassement = écriture REFUSÉE.
const DOC_BYTE_BUDGET = 950_000

/** Taille UTF-8 (universelle client/serveur, contrairement à Buffer). */
function utf8Bytes(s: string): number {
  return new TextEncoder().encode(s).length
}

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
  /** Indice tarif base 100 vs médiane marché (kpis.priceIndex) à cette analyse.
   *  Absent des points antérieurs → trou dans la courbe, jamais 0. */
  pi?: number | null
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
  opts: { label?: string; workflowId?: string; trend?: boolean } = {},
): Promise<void> {
  // Cap par OCTETS, pas seulement par nombre : Firestore REFUSE tout doc > 1 048 576 o
  // (INVALID_ARGUMENT). À l'échelle F1 (des milliers d'appariés × 17 concurrents avec
  // prix/URL/image par cellule), 1000 produits dépassaient 1,1 Mo → écriture rejetée et
  // dashboard figé sur le dernier rapport valide. On garde les mieux classés
  // (rankProducts) tant qu'on tient le budget, et on marque `truncated` dès qu'on coupe.
  const ranked = rankProducts(report.products)
  const overhead = utf8Bytes(JSON.stringify({
    runAt, kpis: report.kpis, byCompetitor: report.byCompetitor, sites,
    products: [], totalMatched: report.products.length, truncated: true,
  }))
  const capped: ProductRow[] = []
  let used = overhead
  for (let i = 0; i < ranked.length && i < PRODUCT_CAP; i++) {
    const size = utf8Bytes(JSON.stringify(ranked[i])) + 1 // +1 : virgule de séparation
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
  await setDoc(doc(db, reportLatestDoc(uid, watchId)), stripUndefined(stored))

  // Tendance : point KPI + rétention (lecture-modif-écriture, doc minuscule).
  //
  // ⚠ `trend: false` = analyse PARTIELLE (recalcul live pendant une moisson, ▶ manuel
  // d'un site) : `latest` est bien réécrit — les tuiles bougent en direct — mais AUCUN
  // point d'historique n'est émis. Sinon l'index encore incomplet ferait bouger la
  // courbe pour une raison qui n'a rien à voir avec les prix, et 90 points de capacité
  // partaient en six heures de moisson.
  if (opts.trend !== false) {
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
    const hRef = doc(db, reportHistoryDoc(uid, watchId))
    const prev = (await getDoc(hRef)).data()?.points as KpiHistoryPoint[] | undefined
    const points = retainHistory([...(prev ?? []), point], runAt, REPORT_HISTORY_MAX)
    await setDoc(hRef, { points })
  }

  // Méta du suivi (fait exister le doc racine → listé par le sélecteur de suivi).
  await setDoc(
    doc(db, watchRootDoc(uid, watchId)),
    // serverTimestamp() HORS de stripUndefined (sinon le sentinel est détruit) — comme le twin serveur.
    // `workflowId` : origine du suivi → le sélecteur « Source » propose un lien « Ouvrir le
    // workflow ». Absent (recalcul mono-site) → stripUndefined le retire, merge préserve l'existant.
    { ...stripUndefined({ label: opts.label, workflowId: opts.workflowId, lastReportAt: runAt }), updatedAt: serverTimestamp() },
    { merge: true },
  )
}
