/**
 * Orchestration pure (sans React) du scrape fabricant → alignement → comparaison.
 * Réutilisée par le flux à la demande (hook) ET par l'action de lot.
 */

import type { EnrichedProduct } from '@/features/excel/ai-enrichment/types'
import { scrapeManufacturerProduct } from '@/features/excel/ai-enrichment/useProductEnrichment'
import { alignUnknownSpecs } from './alignSpecs'
import { compareSourceVsManufacturer, summarize } from './compareProducts'
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
