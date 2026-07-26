/**
 * Orchestration pure (sans React) du scrape fabricant → alignement → comparaison.
 * Réutilisée par le flux à la demande (hook) ET par l'action de lot.
 */

import type { EnrichedProduct } from '@/features/excel/ai-enrichment/types'
import { scrapeManufacturerProduct } from '@/features/excel/ai-enrichment/manufacturerScrape'
import { alignUnknownSpecs } from './alignSpecs'
import { compareSourceVsManufacturer, summarize } from './compareProducts'
import { resolveManufacturerCandidates } from './resolveManufacturer'
import type { FieldComparison, LlmSpecPairs, ManufacturerCandidate, VerdictSummary, VerifyLogFn } from './types'

export interface VerifyResult {
  mfr: EnrichedProduct
  alignment: LlmSpecPairs
  comparisons: FieldComparison[]
  summary: VerdictSummary
  /** Vrai si le site fabricant a bloqué l'extraction (SPA/anti-bot) — rien à comparer. */
  blocked: boolean
  /** Correspondance EAN/GTIN source ↔ fabricant : true = certifié même produit,
   *  false = EAN différents (probable mauvaise page), null = un côté sans EAN. */
  eanMatch: boolean | null
}

const digits = (s: string | undefined | null) => (s ?? '').replace(/\D/g, '')

/** Compare deux EAN/GTIN (tolère les zéros de tête, GTIN-13 vs GTIN-14). */
function eanEquals(a: string | undefined, b: string | undefined): boolean {
  const da = digits(a).replace(/^0+/, ''), db = digits(b).replace(/^0+/, '')
  return da.length >= 8 && da === db
}

/**
 * Scrape la page fabricant confirmée, aligne les specs (dico + LLM une seule fois)
 * et compare champ à champ avec la source. Ne persiste rien (au caller de sauver).
 */
export async function verifyAgainstManufacturer(
  source: EnrichedProduct,
  candidate: ManufacturerCandidate,
  onLog: VerifyLogFn = () => {},
): Promise<VerifyResult> {
  onLog(`Extraction de la page fabricant · ${hostOf(candidate.url)}`, 'scrape')
  const mfr = await scrapeManufacturerProduct(candidate.url)
  if (mfr.blockedByAntiBot) {
    onLog('Page bloquée (SPA / anti-bot) — rien à comparer', 'warn')
    return { mfr, alignment: {}, comparisons: [], summary: { confirmed: 0, completed: 0, divergent: 0, total: 0 }, blocked: true, eanMatch: null }
  }
  onLog(`${mfr.specifications.length} caractéristique(s) extraite(s)${mfr.ean ? ` · EAN ${mfr.ean}` : ''}`, 'metric')
  onLog('Alignement des libellés (dictionnaire + IA)…', 'align')
  const alignment = await alignUnknownSpecs(source, mfr)
  const comparisons = compareSourceVsManufacturer(source, mfr, alignment)
  const summary = summarize(comparisons)
  const eanMatch = (source.ean && mfr.ean) ? eanEquals(source.ean, mfr.ean) : null
  onLog(`✓ ${summary.confirmed} confirmés · + ${summary.completed} complétés · ≠ ${summary.divergent} divergents`, 'compare')
  onLog(
    eanMatch === true ? `EAN certifié — même produit (${mfr.ean})`
      : eanMatch === false ? `EAN différents — variante possible (source ${source.ean} ≠ fabricant ${mfr.ean})`
      : 'EAN non vérifiable — un côté sans code',
    eanMatch === true ? 'ok' : eanMatch === false ? 'warn' : 'info',
  )
  return { mfr, alignment, comparisons, summary, blocked: false, eanMatch }
}

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
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
    ean: source.ean,
  })
  if (candidates.length === 0) return { status: 'skipped', reason: 'aucune page fabricant trouvée' }

  // Pivot d'industrialisation : on itère les meilleurs candidats et on ne fusionne
  // automatiquement QUE sur une correspondance EAN/GTIN certifiée (même produit,
  // déterministe). Sans EAN concordant → skip (jamais de mauvaise fusion en masse).
  const MAX_TRY = 3
  let firstPlausible: { candidate: typeof candidates[number]; result: Awaited<ReturnType<typeof verifyAgainstManufacturer>> } | null = null
  for (const candidate of candidates.slice(0, MAX_TRY)) {
    const result = await verifyAgainstManufacturer(source, candidate)
    if (result.blocked) continue
    if (result.eanMatch === true) return { status: 'verified', candidate, result }
    if (!firstPlausible && result.eanMatch !== false) firstPlausible = { candidate, result }
  }
  // Aucun EAN certain : on n'auto-fusionne que si la source n'a PAS d'EAN (donc
  // vérification impossible) et que le meilleur candidat était « high ».
  if (firstPlausible && !source.ean && candidates[0].confidence === 'high') {
    return { status: 'verified', candidate: firstPlausible.candidate, result: firstPlausible.result }
  }
  return { status: 'skipped', reason: source.ean ? 'aucun EAN fabricant concordant — revue manuelle' : 'confiance insuffisante — revue manuelle' }
}
