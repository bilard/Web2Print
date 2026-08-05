// Recalcule le RAPPORT dashboard (benchmark : appariés, écarts, ruptures) SANS relancer
// tout le workflow — après une moisson manuelle (▶) dans « Sites sources ». Relit le
// catalogue source persisté par le node « Comparer » + l'index frais de chaque site,
// reconstruit le rapport et l'écrit. Sans catalogue source (aucun « Comparer » encore
// lancé) → renvoie null (l'appelant invite à lancer une comparaison une première fois).
import { buildReport } from './report'
import type { SiteRef } from './matrix'
import { loadAllListings, saveCompetitorMeta } from './store'
import { loadSourceCatalog, saveCatalogReport } from '../reportStore'
import type { CompetitorListing } from './prestashop'

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
