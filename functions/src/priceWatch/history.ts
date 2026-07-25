// functions/src/priceWatch/history.ts
// Politique de RÉTENTION de l'historique KPI. PUR. Jumeau SERVEUR de
// src/features/priceWatch/history.ts — garder IDENTIQUE (client et cron écrivent dans
// le MÊME doc `history` : deux politiques divergentes se corrompraient mutuellement).
//
// Détail complet sur les 14 derniers jours, puis un point par journée civile au-delà :
// à cadence quotidienne, 90 points ≈ 3 mois d'historique lisible. Le ring-buffer brut
// (`slice(-90)`) laissait six heures de moisson effacer l'historique entier.
import type { KpiHistoryPoint } from './reportStore'

/** Fenêtre de détail : en deçà, TOUS les points sont conservés. Non exporté côté serveur
 *  (usage interne) — la constante est exportée côté client pour la suite de tests. */
const DETAIL_WINDOW_DAYS = 14

const DAY_MS = 86_400_000

/** Clé de journée civile LOCALE (« 2026-07-25 »). */
function dayKey(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Ne garde que le DERNIER point de chaque journée. Entrée triée par `at` croissant. */
function rollupDaily(points: KpiHistoryPoint[]): KpiHistoryPoint[] {
  const byDay = new Map<string, KpiHistoryPoint>()
  for (const p of points) byDay.set(dayKey(p.at), p)
  return [...byDay.values()]
}

/** Applique la rétention à l'historique augmenté du nouveau point (cf. jumeau client). */
export function retainHistory(points: KpiHistoryPoint[], now: number, max: number): KpiHistoryPoint[] {
  const sorted = [...points].sort((a, b) => a.at - b.at)
  const cutoff = now - DETAIL_WINDOW_DAYS * DAY_MS
  const old = sorted.filter((p) => p.at < cutoff)
  const recent = sorted.filter((p) => p.at >= cutoff)

  let kept = [...rollupDaily(old), ...recent]
  if (kept.length > max) kept = rollupDaily(kept)
  return kept.slice(-max)
}
