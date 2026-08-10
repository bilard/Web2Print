// Tendance des durées de run. PUR.
export interface RunRow { startedAt: number; endedAt?: number }

/**
 * Écart en pourcentage entre la durée moyenne des runs RÉCENTS et celle des anciens.
 * `null` quand la question n'a pas de réponse honnête : moins de quatre runs terminés,
 * ou une moitié vide.
 *
 * ⚠ Les runs arrivent du plus récent au plus ancien (tri `endedAt desc` de Firestore) :
 * la première moitié est la récente.
 */
export function durationTrend(runs: RunRow[]): number | null {
  const done = runs.filter((r) => typeof r.endedAt === 'number')
  if (done.length < 4) return null
  const half = Math.floor(done.length / 2)
  const avg = (rows: RunRow[]) =>
    rows.reduce((n, r) => n + ((r.endedAt as number) - r.startedAt), 0) / rows.length
  const recent = avg(done.slice(0, half))
  const older = avg(done.slice(half))
  if (older <= 0) return null
  return Math.round(((recent - older) / older) * 100)
}
