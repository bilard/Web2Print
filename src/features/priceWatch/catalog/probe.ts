// Sonde d'ÉLIGIBILITÉ d'un concurrent : scrape quelques pages catégorie témoins SANS
// rien persister, pour mesurer ce que le site expose (prix, stock, nom, image, réf)
// AVANT de lancer la moisson complète. Objectif : ne pas dépenser de tokens à moissonner
// un site qui n'affiche pas ses prix (B2B, JavaScript). PUR (fetch injecté).
import { planCategories, type CompetitorConfig, type HarvestDeps } from './runHarvest'
import { parseListingPage, type CompetitorListing } from './prestashop'
import { auditListings, type CompetitorAudit } from './report'

export interface ProbeResult {
  /** Taux de remplissage des champs sur l'échantillon témoin. */
  audit: CompetitorAudit
  /** Nombre de catégories découvertes depuis l'accueil (0 = accueil injoignable/anti-bot). */
  categoriesFound: number
  /** Verdict synthétique : le site est-il exploitable pour la veille prix ? */
  verdict: 'ok' | 'no-price' | 'blocked'
}

/**
 * Sonde jusqu'à `maxPages` pages catégorie d'un concurrent et audite l'échantillon.
 * `verdict` : `blocked` si rien n'est récupéré (accueil KO / anti-bot), `no-price` si
 * des fiches sortent mais sans prix (B2B / JS), `ok` sinon.
 */
export async function probeCompetitor(
  cfg: CompetitorConfig,
  deps: Pick<HarvestDeps, 'fetchHtml'>,
  maxPages = 3,
): Promise<ProbeResult> {
  const cats = await planCategories(cfg, deps as HarvestDeps)
  const listings: CompetitorListing[] = []
  for (const cat of cats.slice(0, maxPages)) {
    const html = await deps.fetchHtml(cat)
    if (html) listings.push(...parseListingPage(html, cat))
  }
  const audit = auditListings(listings)
  const verdict: ProbeResult['verdict'] =
    audit.indexed === 0 ? 'blocked' : audit.pctPrice === 0 ? 'no-price' : 'ok'
  return { audit, categoriesFound: cats.length, verdict }
}
