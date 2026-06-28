// functions/src/analytics/retention.ts
const DAY = 86_400_000
export function cutoffMs(nowMs: number): number {
  return nowMs - 395 * DAY // ~13 mois
}
