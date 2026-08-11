// Recalcule le RAPPORT dashboard (benchmark : appariés, écarts, ruptures) SANS relancer
// tout le workflow — après une moisson manuelle (▶) dans « Sites sources ». Relit le
// catalogue source persisté par le node « Comparer » + l'index frais de chaque site,
// reconstruit le rapport et l'écrit. Sans catalogue source (aucun « Comparer » encore
// lancé) → renvoie null (l'appelant invite à lancer une comparaison une première fois).
import { buildReport } from './report'
import type { SiteRef } from './matrix'
import { loadAllListings, saveCompetitorMeta } from './store'
import { loadSourceCatalog, saveCatalogReport, loadCatalogReportKpis } from '../reportStore'
import type { CompetitorListing } from './competitorListing'

export interface RecomputeResult {
  matched: number
  sites: number
}

/** Levée quand le catalogue source relu est incomplet — voir `loadSourceCatalog`. */
export class PartialSourceCatalogError extends Error {
  constructor(readonly read: number, readonly expected: number) {
    super(`Catalogue source incomplet : ${read} produits relus sur ${expected} attendus`)
    this.name = 'PartialSourceCatalogError'
  }
}

/** Levée quand le recalcul apparierait BEAUCOUP moins que le rapport en place. */
export class ReportRegressionError extends Error {
  constructor(readonly next: number, readonly previous: number) {
    super(`Recalcul refusé : ${next} appariés contre ${previous} au rapport en place`)
    this.name = 'ReportRegressionError'
  }
}

/**
 * Un recalcul ne doit JAMAIS remplacer un rapport riche par un rapport dérisoire.
 *
 * Le cas vécu : un run lancé sur une feuille de test a réécrit le catalogue source avec
 * 100 produits ; le rafraîchissement live a recalculé dans la foulée et 20 980 appariés
 * sont devenus 72, sans un message. Le node « Comparer catalogue », lui, reste souverain
 * — c'est un geste explicite de l'utilisateur, il écrit toujours.
 *
 * Seuil : on tolère une baisse jusqu'à la moitié (un catalogue peut légitimement maigrir,
 * des sites peuvent être désactivés) ; en dessous, on garde et on alerte.
 */
const REGRESSION_FLOOR = 0.5
const REGRESSION_MIN_PREVIOUS = 50

/**
 * Reconstruit et persiste le rapport pour l'ensemble des `siteRefs` fournis, à partir du
 * catalogue source persisté et de l'index Firestore courant. `null` si pas de catalogue
 * source (il faut avoir lancé « Comparer catalogue » au moins une fois).
 */
export async function recomputeReport(
  uid: string, watchId: string, siteRefs: SiteRef[], opts: { label?: string } = {},
): Promise<RecomputeResult | null> {
  const src = await loadSourceCatalog(uid, watchId)
  if (!src || src.products.length === 0) return null
  // ⚠ FAIL-CLOSED. Recalculer sur un catalogue amputé écraserait un rapport JUSTE par un
  // rapport à quelques dizaines d'appariés — et rien ne le dirait, puisque l'écriture,
  // elle, réussit. Mieux vaut garder le dernier rapport valide et remonter l'anomalie.
  if (src.partial) throw new PartialSourceCatalogError(src.products.length, src.expected)

  const indexBySite = new Map<string, CompetitorListing[]>()
  for (const s of siteRefs) indexBySite.set(s.siteId, await loadAllListings(uid, watchId, s.siteId))

  const report = buildReport(src.products, siteRefs, indexBySite, { vatRate: src.vatRate })

  // ⚠ FAIL-CLOSED n°2 : garde-fou de non-régression (cf. ReportRegressionError).
  const previous = await loadCatalogReportKpis(uid, watchId)
  if (previous != null
    && previous >= REGRESSION_MIN_PREVIOUS
    && report.kpis.products < previous * REGRESSION_FLOOR) {
    throw new ReportRegressionError(report.kpis.products, previous)
  }
  // `trend: false` — ce recalcul est PARTIEL par nature : il tombe au milieu d'une
  // moisson (index concurrent encore incomplet) ou juste après le ▶ d'un seul site.
  // Il rafraîchit le dashboard, mais ne doit PAS marquer l'historique : la courbe
  // raconterait la progression du scraping, pas le mouvement des prix.
  await saveCatalogReport(uid, watchId, report, siteRefs, Date.now(), { ...opts, trend: false })
  // Recale le compteur « fiches » sur le compte dédupliqué exact (comme le node Comparer).
  await Promise.all(report.byCompetitor.map((c) =>
    saveCompetitorMeta(uid, watchId, c.siteId, { productCount: c.audit.indexed })))

  return { matched: report.kpis.products, sites: siteRefs.length }
}
