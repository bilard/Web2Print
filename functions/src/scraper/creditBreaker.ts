// functions/src/scraper/creditBreaker.ts
// Circuit-breaker « crédits épuisés » par fournisseur de scraping (Firecrawl, Jina,
// Bright Data). Sans lui, un compte à sec fait payer un aller-retour réseau voué à
// l'échec (402) à CHAQUE produit : le run cron déborde son budget de 28 min et le
// cycle de veille paraît figé (constaté 2026-07-23, ~40 s/fiche en 402 Firecrawl).
// Au premier signal « plus de crédits », le breaker s'ouvre : tous les appels suivants
// au même fournisseur sont sautés immédiatement, avec UN log d'alerte visible (jamais
// de warn silencieux répété — cf. reference_price_watch_report_1mb_and_cron_oom).
// TTL plutôt que flag définitif : une instance Cloud Function vit des heures ; après
// recharge des crédits, les appels reprennent seuls au bout du TTL.
import * as logger from 'firebase-functions/logger'

export type CreditProvider = 'firecrawl' | 'jina' | 'brightdata'

/** Durée d'ouverture du circuit après un « crédits épuisés ». */
export const CREDIT_TRIP_MS = 15 * 60_000

const trippedAt = new Map<CreditProvider, number>()

/**
 * Vrai si la réponse signale un épuisement de crédits/solde (et PAS une erreur
 * ordinaire) : 402 Payment Required, ou message explicite de solde/suspension.
 * Les 403 anti-bot, 429 rate-limit et 5xx transitoires ne déclenchent PAS.
 */
export function isCreditError(status: number, body: string): boolean {
  if (status === 402) return true
  return /insufficient\s?(credits|balance)|balance insuffisante|balance (is )?too low|out of credits|no credits left|account is suspended|compte suspendu/i.test(body)
}

/** Ouvre le circuit pour `provider` et journalise UNE alerte visible. */
export function tripCredits(provider: CreditProvider, detail: string): void {
  const already = creditsExhausted(provider)
  trippedAt.set(provider, Date.now())
  if (!already) {
    logger.error(`[credits] ${provider} : crédits épuisés — appels suspendus ${Math.round(CREDIT_TRIP_MS / 60_000)} min (${detail.slice(0, 160)}). Recharger le compte pour reprendre.`)
  }
}

/** Vrai si le circuit est ouvert (crédits épuisés il y a moins de CREDIT_TRIP_MS). */
export function creditsExhausted(provider: CreditProvider): boolean {
  const at = trippedAt.get(provider)
  if (at == null) return false
  if (Date.now() - at >= CREDIT_TRIP_MS) { trippedAt.delete(provider); return false }
  return true
}

/** Réinitialise tout (tests). */
export function resetCreditBreaker(): void {
  trippedAt.clear()
}
