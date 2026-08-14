// Ce que les DERNIERS RUNS d'un suivi racontent : combien ont abouti, lequel a échoué,
// à quel rythme ils s'enchaînent. PUR.
//
// ⚠ Raison d'être : le cockpit ne montrait que l'INSTANT — barres d'avancement, cartes en
// cours, prochain déclenchement. Un run terminé ne laissait aucune trace visible : rien ne
// disait si les dix passages précédents avaient abouti, ni depuis quand ça marche. Un
// balayage qui échoue une fois sur deux ressemble alors exactement à un balayage sain, en
// deux fois plus lent.
//
// La source est l'historique DURABLE déjà écrit par les deux moteurs
// (`users/{uid}/workflowRuns`, vingt runs conservés, client et serveur) : rien à collecter
// de plus, il n'était simplement lu nulle part dans ce module.

/** Un run, réduit à ce qu'un tableau de bord en montre. */
export interface RunEntry {
  id: string
  startedAt: number
  endedAt: number
  /** `success` | `partial` | `error` — le vocabulaire de `runHistoryClient`. */
  status: string
  /** `manual` (navigateur) ou `cron` (planifié). */
  trigger?: string
}

export interface RunHistorySummary {
  /** Du plus RÉCENT au plus ancien, borné à `limit`. */
  runs: RunEntry[]
  ok: number
  partial: number
  error: number
  /** Fin du dernier run connu, `null` si aucun. */
  lastEndedAt: number | null
  /** Durée MÉDIANE d'un run abouti. La moyenne est trompeuse ici : un run tué au bout de
   *  quelques secondes et un run de trois heures cohabitent dans la même liste. */
  medianMs: number | null
  /** Runs consécutifs en échec depuis le plus récent. Deux d'affilée, ce n'est plus un
   *  accident — c'est ce qu'il faut voir sans compter les pastilles à l'œil. */
  failStreak: number
}

const FAILED = (s: string) => s === 'error'

export function summarizeRuns(entries: RunEntry[], limit = 12): RunHistorySummary {
  const runs = [...entries]
    .filter((r) => Number.isFinite(r.endedAt) && r.endedAt > 0)
    .sort((a, b) => b.endedAt - a.endedAt)
    .slice(0, limit)

  const durations = runs
    .filter((r) => !FAILED(r.status) && r.endedAt > r.startedAt)
    .map((r) => r.endedAt - r.startedAt)
    .sort((a, b) => a - b)

  let failStreak = 0
  for (const r of runs) {
    if (!FAILED(r.status)) break
    failStreak++
  }

  return {
    runs,
    ok: runs.filter((r) => r.status === 'success').length,
    partial: runs.filter((r) => r.status === 'partial').length,
    error: runs.filter((r) => FAILED(r.status)).length,
    lastEndedAt: runs[0]?.endedAt ?? null,
    medianMs: durations.length ? durations[Math.floor(durations.length / 2)] : null,
    failStreak,
  }
}
