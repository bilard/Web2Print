// Persistance du RAPPORT de comparaison catalogue (synthèse dashboard). Écrit par le
// node « Comparer catalogue ». Contrat BORNÉ : le doc `latest` porte les KPIs, les
// stats par concurrent (≤ N sites) et une liste produit RANGÉE + PLAFONNÉE ; le doc
// `history` accumule des points KPI minuscules pour la tendance. Jamais 75 000 lignes
// en base — la liste complète, c'est l'export Excel (cf. audit scalabilité).
import { doc, getDoc, getDocs, collection, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import {
  reportLatestDoc, reportHistoryDoc, watchRootDoc, REPORT_HISTORY_MAX,
  priceStateCol, priceEventsDoc, PRICE_EVENTS_MAX, PRICE_EVENTS_BYTES, PRICE_STATE_BYTES,
} from './paths'
import { rankProducts, type CatalogReport, type ProductRow, type CompetitorStat, type ReportKpis } from './catalog/report'
import type { SourceProduct } from './catalog/match'
import { retainHistory } from './history'
import type { KpiHistoryPoint } from './types'
import { diffPrices, mergeEvents, chunkState, type PriceState, type PriceEvent } from './priceEvents'
import { stripUndefined } from '@/lib/stripUndefined'

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
    // ⚠ stripUndefined OBLIGATOIRE : un SourceProduct porte des champs facultatifs posés
    // EXPLICITEMENT à `undefined` par le node « Comparer » (`ref`/`ref2`/`ean` quand la
    // colonne n'est pas mappée, `price` quand la cellule n'est pas un nombre). Firestore
    // refuse alors le doc ENTIER — « Unsupported field value: undefined ». Le jumeau
    // serveur nettoyait déjà ; le client, non : le catalogue source n'était jamais
    // persisté depuis un run navigateur, et le recalcul mono-site (▶) restait aveugle.
    await setDoc(doc(db, col, `chunk_${i}`), {
      products: stripUndefined(products.slice(i * SOURCE_CHUNK, (i + 1) * SOURCE_CHUNK)),
    })
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

// ── Journal des changements de prix ────────────────────────────────────────────────
// L'état (dernier prix connu par cellule) est chunké : à l'échelle F1 (milliers
// d'appariés × N concurrents) il dépasse largement 1 Mo. Le journal, lui, est un seul
// doc borné — c'est lui que le dashboard lit.

/** Relit l'état des prix (toutes tranches fusionnées). Objet vide si jamais écrit. */
async function loadPriceState(uid: string, watchId: string): Promise<PriceState> {
  const snap = await getDocs(collection(db, priceStateCol(uid, watchId))).catch(() => null)
  if (!snap) return {}
  const state: PriceState = {}
  for (const d of snap.docs) Object.assign(state, (d.data()?.entries as PriceState) ?? {})
  return state
}

/** Réécrit l'état par tranches (budget d'OCTETS), en purgeant les tranches excédentaires. */
async function savePriceState(uid: string, watchId: string, state: PriceState): Promise<void> {
  const col = priceStateCol(uid, watchId)
  const parts = chunkState(state, PRICE_STATE_BYTES)
  const chunks = parts.length
  for (let i = 0; i < chunks; i++) {
    await setDoc(doc(db, col, `chunk_${i}`), { entries: parts[i] })
  }
  // Purge des tranches au-delà du besoin courant (état rétréci → pas d'orphelins qui
  // ressusciteraient de vieux prix au prochain diff).
  const existing = await getDocs(collection(db, col)).catch(() => null)
  if (existing) {
    await Promise.all(existing.docs
      .filter((d) => { const n = Number(d.id.replace('chunk_', '')); return Number.isFinite(n) && n >= chunks })
      .map((d) => deleteDoc(d.ref)))
  }
}

/** Relit le journal des mouvements (plus récents d'abord). Le dashboard, lui, s'abonne
 *  au doc en direct (usePriceEvents) — cette lecture ponctuelle sert au diff. */
async function loadPriceEvents(uid: string, watchId: string): Promise<PriceEvent[]> {
  const snap = await getDoc(doc(db, priceEventsDoc(uid, watchId))).catch(() => null)
  return (snap?.data()?.events as PriceEvent[] | undefined) ?? []
}

/**
 * Diffe les relevés d'une analyse COMPLÈTE contre l'état persisté et journalise les
 * mouvements. Best-effort : un échec ici ne doit jamais faire échouer l'écriture du
 * rapport lui-même (le journal est un plus, le rapport est le cœur).
 */
async function recordPriceMoves(uid: string, watchId: string, rows: ProductRow[], at: number): Promise<void> {
  try {
    const prev = await loadPriceState(uid, watchId)
    const { events, state } = diffPrices(prev, rows, at)
    // ⚠ ORDRE : le JOURNAL d'abord, l'état ensuite. Si l'état avançait en premier et que
    // le journal échouait, le mouvement serait perdu DÉFINITIVEMENT (le prix de référence
    // aurait déjà bougé). Dans l'ordre inverse, un échec de l'état fait ré-émettre les
    // mêmes mouvements au tour suivant — et mergeEvents les déduplique.
    if (events.length > 0) {
      const journal = await loadPriceEvents(uid, watchId)
      await setDoc(doc(db, priceEventsDoc(uid, watchId)), {
        events: mergeEvents(journal, events, PRICE_EVENTS_MAX, PRICE_EVENTS_BYTES),
      })
    }
    await savePriceState(uid, watchId, state)
  } catch (e) {
    console.warn('[veille] journal des changements de prix non écrit :', e instanceof Error ? e.message : e)
  }
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
    // Journal des mouvements : diffé sur `report.products` COMPLET (avant rankProducts et
    // le plafond d'octets) — sur la liste tronquée, un produit qui se réaligne sortirait
    // de l'échantillon et son mouvement serait invisible.
    await recordPriceMoves(uid, watchId, report.products, runAt)

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
