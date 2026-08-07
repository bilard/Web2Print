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
import { rankProducts, type CatalogReport, type ProductRow, type CompetitorStat, type FamilyStat, type ReportKpis } from './catalog/report'
import type { SourceProduct } from './catalog/match'
import { retainHistory } from './history'
import { DEFAULT_VAT_RATE } from './catalog/match'
import type { KpiHistoryPoint } from './types'
import { diffPrices, mergeEvents, chunkState, backfillEventUrls, type PriceState, type PriceEvent } from './priceEvents'
import { stripUndefined } from '@/lib/stripUndefined'

// ── Catalogue SOURCE persisté (pour recalculer le benchmark hors workflow) ──────────
// Le node « Comparer » écrit ici les produits source + la TVA ; le recalcul mono-site
// (après un ▶) les relit pour reconstruire le rapport sans relancer tout le workflow.
const sourceCol = (uid: string, watchId: string) => `${watchRootDoc(uid, watchId)}/reportSource`
// Tranches bornées en OCTETS, pas en nombre de produits. Le catalogue porte désormais
// description, visuel et taxonomie : à 2 000 produits par document, une base fournie
// dépassait la limite dure de 1 Mo et l'écriture était REFUSÉE — échec qui ne remonte
// qu'en avertissement de fin de run. Le plafond de comptage reste un garde-fou.
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

/** Nombre de produits appariés du rapport en place. null s'il n'y en a pas encore.
 *  Lecture MINIMALE (un doc) : sert de garde-fou de non-régression au recalcul. */
export async function loadCatalogReportKpis(uid: string, watchId: string): Promise<number | null> {
  const snap = await getDoc(doc(db, reportLatestDoc(uid, watchId)))
  if (!snap.exists()) return null
  const kpis = (snap.data() as StoredReport | undefined)?.kpis
  return typeof kpis?.products === 'number' ? kpis.products : null
}

/** Exposés pour le test de découpe : la règle est trop coûteuse à vérifier en écrivant. */
export const SOURCE_CHUNK_BYTES_FOR_TEST = SOURCE_CHUNK_BYTES
export const sliceSourceCatalogForTest = sliceByBytes

/** Tranches écrites de front. Séquentiel, une base F1 mettait plusieurs MINUTES à
 *  s'écrire — et l'écran « Concurrents » lit cette collection pendant tout ce temps. */
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
  opts: {
    /** Lignes REÇUES par le node. Persisté pour répondre, plus tard, à « pourquoi si peu
     *  de produits ? » sans rouvrir le journal du run : 100 retenus sur 100 lignes désigne
     *  la source, 100 sur 74 000 désigne le dédoublonnage. */
    rows?: number
    /** Avancement en TRANCHES : sans lui, le node reste muet pendant toute l'écriture et
     *  un run qui travaille ne se distingue pas d'un run figé. */
    onProgress?: (done: number, total: number) => void
  } = {},
): Promise<number> {
  const col = sourceCol(uid, watchId)
  const slices = sliceByBytes(products)
  const chunks = slices.length
  // ⚠ ÉCRIRE D'ABORD, EFFACER ENSUITE. La purge se faisait AVANT l'écriture : dès sa
  // première milliseconde le catalogue — `_meta` compris — disparaissait, et l'explorateur
  // « Concurrents » n'avait plus rien à apparier pendant toute la réécriture (minutes).
  // Un run interrompu là (onglet fermé, quota, plantage) laissait le suivi SANS catalogue
  // source jusqu'au prochain run complet, avec pour seul symptôme « 0 apparié » sur des
  // centaines de milliers de fiches pourtant collectées. Écraser les tranches en place ne
  // publie jamais d'état vide : au pire un mélange ancien/nouveau, tous deux valides.
  opts.onProgress?.(0, chunks)
  for (let i = 0; i < chunks; i += SOURCE_WRITE_BATCH) {
    await Promise.all(slices.slice(i, i + SOURCE_WRITE_BATCH).map((slice, k) =>
      // ⚠ stripUndefined OBLIGATOIRE : un SourceProduct porte des champs facultatifs posés
      // EXPLICITEMENT à `undefined` par le node « Comparer » (`ref`/`ref2`/`ean` quand la
      // colonne n'est pas mappée, `price` quand la cellule n'est pas un nombre). Firestore
      // refuse alors le doc ENTIER — « Unsupported field value: undefined ». Le jumeau
      // serveur nettoyait déjà ; le client, non : le catalogue source n'était jamais
      // persisté depuis un run navigateur, et le recalcul mono-site (▶) restait aveugle.
      setDoc(doc(db, col, `chunk_${i + k}`), { products: stripUndefined(slice) })))
    opts.onProgress?.(Math.min(i + SOURCE_WRITE_BATCH, chunks), chunks)
  }
  // ⚠ `_meta` est écrit APRÈS les tranches. Écrit en premier, il annoncerait N tranches
  // dont les suivantes peuvent ne jamais arriver : la relecture rendrait un catalogue
  // AMPUTÉ en le présentant comme complet, et le recalcul mono-site réécrirait un rapport
  // avec une poignée d'appariés.
  await setDoc(doc(db, col, '_meta'), {
    vatRate, chunks, count: products.length, at: Date.now(),
    ...(opts.rows != null ? { rows: opts.rows } : {}),
  })
  // Catalogue rétréci : les tranches au-delà du nouveau compte ne sont plus lues (`_meta`
  // fait foi) mais resteraient facturées. Purge non bloquante — leur survie ne fausse rien.
  const existing = await getDocs(collection(db, col)).catch(() => null)
  if (existing) {
    await Promise.all(existing.docs
      .filter((d) => isStaleChunk(d.id, chunks))
      .map((d) => deleteDoc(d.ref)))
  }
  return chunks
}

/** Relit le catalogue source persisté. null si jamais écrit (aucun « Comparer » lancé). */
export interface LoadedSourceCatalog {
  products: SourceProduct[]
  vatRate: number
  /** Nombre de produits annoncés par `_meta` à la dernière écriture. */
  expected: number
  /** Lignes reçues par le node lors de cette écriture (0 = non mesuré, écriture ancienne). */
  sourceRows: number
  /** Des tranches manquent : le catalogue relu est AMPUTÉ. Aucun calcul ne doit s'y fier. */
  partial: boolean
  /** Poids relu, en octets (mesuré sur la 1re tranche × nombre de tranches). Ce chiffre
   *  EXPLIQUE le temps d'ouverture de l'explorateur : tout est relu à chaque fois. */
  bytes: number
  /** Part de ces octets tenue par les champs d'AFFICHAGE SEUL (description, visuel,
   *  taxonomie) — ceux dont l'appariement n'a aucun besoin. */
  displayBytes: number
  /** Durée totale de la relecture, en ms. */
  ms: number
}

/** Poids UTF-8 d'une tranche et part qu'y tiennent les champs d'affichage seul.
 *  Mesuré sur UNE tranche : sérialiser les 38 coûterait plus cher que le diagnostic. */
function weighChunk(products: SourceProduct[]): { bytes: number; display: number } {
  const bytes = utf8Bytes(JSON.stringify(products))
  let display = 0
  for (const p of products) {
    if (p.description) display += utf8Bytes(p.description)
    if (p.image) display += utf8Bytes(p.image)
    if (p.taxo?.length) display += utf8Bytes(JSON.stringify(p.taxo))
  }
  return { bytes, display }
}

/** Tranches lues de front. Une tranche pèse jusqu'à 900 Ko : les enchaîner une par une
 *  coûtait un aller-retour réseau complet par tranche (un catalogue de 95 tranches se
 *  lisait en minutes, l'explorateur restant sur son spinner) ; les demander TOUTES d'un
 *  coup ferait entrer ~85 Mo à la fois. */
const SOURCE_READ_BATCH = 8

export async function loadSourceCatalog(
  uid: string, watchId: string,
  /** Progression de la relecture. `expected` (produits annoncés par `_meta`) est connu
   *  AVANT la première tranche : c'est lui qui dit si le découpage bute sur le plafond
   *  de 2 000 produits ou sur celui de 900 Ko — donc ce que pèse vraiment le catalogue. */
  onProgress?: (done: number, total: number, expected: number) => void,
): Promise<LoadedSourceCatalog | null> {
  const col = sourceCol(uid, watchId)
  const meta = await getDoc(doc(db, col, '_meta'))
  if (!meta.exists()) return null
  // ⚠ TAUX (0,2), pas pourcentage. Le défaut était 20 — soit 2 000 % de TVA : chaque
  // prix concurrent était divisé par 21, passait sous le garde-fou anti-prix-aberrant
  // de `comparePrices`, et le rapport sortait avec « 0 comparaison » sur des dizaines
  // de milliers de produits pourtant appariés. Tuiles Tenue prix / Indice tarif / Écart
  // toutes vides, sans un message.
  const rawVat = meta.data()?.vatRate
  const vatRate = typeof rawVat === 'number' && rawVat > 0 && rawVat < 1 ? rawVat : DEFAULT_VAT_RATE
  const chunks = (meta.data()?.chunks as number) ?? 0
  const expected = (meta.data()?.count as number) ?? 0
  const sourceRows = (meta.data()?.rows as number) ?? 0
  const products: SourceProduct[] = []
  const t0 = performance.now()
  let weight: { bytes: number; display: number } | null = null
  onProgress?.(0, chunks, expected)
  // Lots parallèles, remis dans l'ORDRE des tranches : le catalogue garde l'ordre du
  // node « Comparer », et une tranche absente est ignorée exactement comme avant (c'est
  // ce que le contrôle `products.length < expected - 5` en dessous doit voir).
  for (let start = 0; start < chunks; start += SOURCE_READ_BATCH) {
    const batch = Array.from(
      { length: Math.min(SOURCE_READ_BATCH, chunks - start) },
      (_, k) => getDoc(doc(db, col, `chunk_${start + k}`)),
    )
    for (const c of await Promise.all(batch)) {
      if (!c.exists()) continue
      const slice = (c.data()?.products as SourceProduct[]) ?? []
      if (!weight && slice.length > 0) weight = weighChunk(slice)
      products.push(...slice)
    }
    onProgress?.(Math.min(start + SOURCE_READ_BATCH, chunks), chunks, expected)
  }
  // Tolérance : le compte doit coller à quelques unités près (une tranche manquante en
  // coûte des centaines). Sous ce seuil, tout consommateur doit s'abstenir.
  const partial = expected > 0 && products.length < expected - 5
  return {
    products, vatRate, expected, partial, sourceRows,
    bytes: (weight?.bytes ?? 0) * chunks,
    displayBytes: (weight?.display ?? 0) * chunks,
    ms: Math.round(performance.now() - t0),
  }
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
/** Journal des mouvements de prix. Exposé : le mail de veille en tire « ce qui a bougé
 *  depuis le dernier relevé », que le rapport `latest` ne porte pas. */
export async function loadPriceEvents(uid: string, watchId: string): Promise<PriceEvent[]> {
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
    // Le journal est relu à CHAQUE analyse, même sans mouvement : c'est l'occasion de
    // combler l'URL des mouvements écrits avant l'introduction de `u`. Sans ce rattrapage,
    // l'écran resterait sans liens jusqu'à ce que le TTL de 90 j ait tout renouvelé.
    const journal = await loadPriceEvents(uid, watchId)
    const { events: healed, filled } = backfillEventUrls(journal, rows)
    if (events.length > 0 || filled > 0) {
      await setDoc(doc(db, priceEventsDoc(uid, watchId)), {
        events: mergeEvents(healed, events, PRICE_EVENTS_MAX, PRICE_EVENTS_BYTES),
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
  /** Familles du catalogue, comptées sur TOUS les appariés (pas sur `products`, plafonné).
   *  Absent des rapports antérieurs : la navigation retombe alors sur l'échantillon. */
  byFamily?: FamilyStat[]
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
    runAt, kpis: report.kpis, byCompetitor: report.byCompetitor, byFamily: report.byFamily, sites,
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
    byFamily: report.byFamily,
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
      comp: report.byCompetitor.map((c) => ({ s: c.siteId, g: c.avgGapPct, gm: c.medGapPct ?? null })),
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
