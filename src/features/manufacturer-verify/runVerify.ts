/**
 * Orchestration pure (sans React) du scrape fabricant → alignement → comparaison.
 * Réutilisée par le flux à la demande (hook) ET par l'action de lot.
 */

import type { EnrichedProduct } from '@/features/excel/ai-enrichment/types'
import { scrapeManufacturerProduct } from '@/features/excel/ai-enrichment/useProductEnrichment'
import { alignUnknownSpecs } from './alignSpecs'
import { compareSourceVsManufacturer, summarize } from './compareProducts'
import { resolveManufacturerCandidates } from './resolveManufacturer'
import type { FieldComparison, LlmSpecPairs, ManufacturerCandidate, VerdictSummary } from './types'

export interface VerifyResult {
  mfr: EnrichedProduct
  alignment: LlmSpecPairs
  comparisons: FieldComparison[]
  summary: VerdictSummary
  /** Vrai si le site fabricant a bloqué l'extraction (SPA/anti-bot) — rien à comparer. */
  blocked: boolean
}

/**
 * Scrape la page fabricant confirmée, aligne les specs (dico + LLM une seule fois)
 * et compare champ à champ avec la source. Ne persiste rien (au caller de sauver).
 */
export async function verifyAgainstManufacturer(
  source: EnrichedProduct,
  candidate: ManufacturerCandidate,
): Promise<VerifyResult> {
  const mfr = await scrapeManufacturerProduct(candidate.url)
  if (mfr.blockedByAntiBot) {
    return { mfr, alignment: {}, comparisons: [], summary: { confirmed: 0, completed: 0, divergent: 0, total: 0 }, blocked: true }
  }
  const alignment = await alignUnknownSpecs(source, mfr)
  const comparisons = compareSourceVsManufacturer(source, mfr, alignment)
  return { mfr, alignment, comparisons, summary: summarize(comparisons), blocked: false }
}

/** Résultat d'une vérification automatique (lot, sans confirmation manuelle). */
export type AutoVerifyOutcome =
  | { status: 'verified'; candidate: ManufacturerCandidate; result: VerifyResult }
  | { status: 'skipped'; reason: string }
  | { status: 'blocked'; reason: string }

/**
 * Vérifie une ligne SANS confirmation manuelle : n'accepte QUE le meilleur
 * candidat en confiance « high » (les medium/low sont skippés et journalisés —
 * jamais d'association silencieuse d'un mauvais produit). Ne persiste rien.
 */
export async function verifyRowAuto(source: EnrichedProduct): Promise<AutoVerifyOutcome> {
  const candidates = await resolveManufacturerCandidates({
    url: source.sourceUrl ?? '',
    brand: source.brand,
    manufacturerRef: source.manufacturerRef,
    name: source.name,
  })
  const top = candidates[0]
  if (!top) return { status: 'skipped', reason: 'aucune page fabricant trouvée' }
  if (top.confidence !== 'high') return { status: 'skipped', reason: `confiance ${top.confidence} — revue manuelle requise` }
  const result = await verifyAgainstManufacturer(source, top)
  if (result.blocked) return { status: 'blocked', reason: 'site fabricant anti-bot' }
  return { status: 'verified', candidate: top, result }
}
