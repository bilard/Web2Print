// Politique de RÉTENTION de l'historique KPI. PUR (testable, dupliqué côté serveur).
//
// Le ring-buffer brut (`slice(-90)`) avait deux défauts qui rendaient toute courbe
// d'évolution mensongère :
//
//  1. TOUS les appels de `saveCatalogReport` écrivaient un point — y compris le recalcul
//     LIVE relancé toutes les 4 min pendant une moisson (useLiveReportRefresh). Or à ce
//     moment l'index concurrent GROSSIT : l'écart moyen bouge parce que l'échantillon
//     change, pas parce qu'un prix a bougé. Corrigé à la source (`trend: false` sur les
//     recalculs partiels) — ici on ne traite que la rétention.
//  2. À 90 points de capacité, six heures de moisson suffisaient à effacer l'historique.
//     Un acheteur regarde des SEMAINES.
//
// D'où le rollup : détail complet sur les 14 derniers jours, puis un point par journée
// civile au-delà. À cadence quotidienne, 90 points ≈ 3 mois d'historique lisible, et le
// doc reste minuscule.
import type { KpiHistoryPoint } from './reportStore'

/** Fenêtre de détail : en deçà, TOUS les points sont conservés. */
export const DETAIL_WINDOW_DAYS = 14

const DAY_MS = 86_400_000

/** Clé de journée civile UTC (« 2026-07-25 ») — le rollup regroupe par journée. */
function dayKey(ts: number): string {
  // UTC obligatoire : le client tourne en Europe/Paris, le cron en UTC, et les deux
  // écrivent le MÊME doc `history`. En heure locale, un point à 00h30 Paris serait le
  // jour D pour l'un et D−1 pour l'autre → le rollup garderait un point différent selon
  // qui a tourné en dernier. (Un test de parité mono-fuseau ne peut pas voir ça.)
  const d = new Date(ts)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/** Ne garde que le DERNIER point de chaque journée (le plus représentatif : il porte
 *  l'index le plus complet de la journée). Entrée supposée triée par `at` croissant. */
function rollupDaily(points: KpiHistoryPoint[]): KpiHistoryPoint[] {
  const byDay = new Map<string, KpiHistoryPoint>()
  for (const p of points) byDay.set(dayKey(p.at), p)
  return [...byDay.values()]
}

/**
 * Applique la rétention à l'historique augmenté du nouveau point.
 *
 * Cascade (chaque étape ne s'applique que si la précédente ne suffit pas) :
 *   1. rollup journalier des points ANTÉRIEURS à la fenêtre de détail ;
 *   2. si encore trop long, rollup journalier de TOUT (y compris la fenêtre récente) ;
 *   3. si encore trop long, on coupe les plus anciens.
 */
export function retainHistory(points: KpiHistoryPoint[], now: number, max: number): KpiHistoryPoint[] {
  const sorted = [...points].sort((a, b) => a.at - b.at)
  const cutoff = now - DETAIL_WINDOW_DAYS * DAY_MS
  const old = sorted.filter((p) => p.at < cutoff)
  const recent = sorted.filter((p) => p.at >= cutoff)

  let kept = [...rollupDaily(old), ...recent]
  if (kept.length > max) kept = rollupDaily(kept)
  return kept.slice(-max)
}
