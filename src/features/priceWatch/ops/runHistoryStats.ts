// Tendance et ordre de grandeur des durées de run. PUR.
export interface RunRow {
  startedAt: number
  endedAt?: number
  status?: string
  /** Cartes réellement abouties. `undefined` pour les runs écrits avant que l'écran ne le
   *  compte — traités comme ayant travaillé, faute de mieux. */
  succeeded?: number
}

/**
 * Ce run mesure-t-il une durée de TRAVAIL ? PUR.
 *
 * ⚠⚠ Le filtre « pas en erreur » ne suffisait pas, et l'écran l'a montré : l'historique de
 * F1 contient des runs « Terminé » de 1 s, 3 s, 5 s — des runs où la cadence d'envoi a tout
 * suspendu, donc où AUCUNE carte n'a abouti. Comparés à des runs de vingt-cinq minutes, ils
 * produisaient « +2251 % — les runs s'allongent » : une dérive inventée de toutes pièces,
 * affichée en tête d'écran. Une seconde de rien ne se compare pas à une demi-heure de
 * travail.
 */
function didWork(r: RunRow): boolean {
  return typeof r.endedAt === 'number' && r.status !== 'error' && (r.succeeded ?? 1) > 0
}

/** Combien de runs récents servent la durée typique. */
const TYPICAL_SAMPLE = 5

/**
 * Durée MÉDIANE des derniers runs terminés — la seule estimation honnête que cet écran
 * puisse donner. `null` sous trois runs : deux points ne fixent pas un ordre de grandeur.
 *
 * ⚠ Médiane et non moyenne : l'historique mêle des runs de quelques secondes (échec
 * immédiat, flux suspendu) et des runs d'une demi-heure. Une moyenne suivrait l'extrême,
 * la médiane le traverse — même raison qu'ailleurs dans la veille, où « son écart » est
 * une médiane.
 *
 * ⚠ Les runs arrivent du plus récent au plus ancien (tri `endedAt desc` de Firestore) :
 * l'échantillon se prend en tête de liste.
 *
 * ⚠ Les runs EN ERREUR sont écartés, pas seulement absorbés par la médiane : celle-ci
 * protège d'un accident isolé, pas d'une série. Cinq échecs de quatre secondes d'affilée
 * annonceraient « runs récents : ~4 s » pendant qu'un vrai run d'une demi-heure tourne —
 * un run avorté ne mesure pas la durée du travail.
 */
export function typicalDuration(runs: RunRow[]): number | null {
  const durations = runs
    .filter(didWork)
    .slice(0, TYPICAL_SAMPLE)
    .map((r) => (r.endedAt as number) - r.startedAt)
    .sort((a, b) => a - b)
  if (durations.length < 3) return null
  const mid = Math.floor(durations.length / 2)
  return durations.length % 2 === 1
    ? durations[mid]
    : Math.round((durations[mid - 1] + durations[mid]) / 2)
}

/**
 * Écart en pourcentage entre la durée moyenne des runs RÉCENTS et celle des anciens.
 * `null` quand la question n'a pas de réponse honnête : moins de quatre runs terminés,
 * ou une moitié vide.
 *
 * ⚠ Les runs arrivent du plus récent au plus ancien (tri `endedAt desc` de Firestore) :
 * la première moitié est la récente.
 */
export function durationTrend(runs: RunRow[]): number | null {
  // ⚠ Mêmes exclusions que `typicalDuration` (cf. `didWork`), et la tendance y est encore
  // plus sensible : elle compare deux MOYENNES, qu'un seul run d'une seconde suffit à
  // écraser.
  const done = runs.filter(didWork)
  if (done.length < 4) return null
  const half = Math.floor(done.length / 2)
  const avg = (rows: RunRow[]) =>
    rows.reduce((n, r) => n + ((r.endedAt as number) - r.startedAt), 0) / rows.length
  const recent = avg(done.slice(0, half))
  const older = avg(done.slice(half))
  if (older <= 0) return null
  return Math.round(((recent - older) / older) * 100)
}
