// Ce que l'écran « Suivi » AFFICHE, dérivé des documents. PUR.
//
// ⚠ Aucune lecture de rapport ni de catalogue ici : un rapport dépasse 1 Mo et a déjà
// saturé la mémoire du cron. On n'agrège que de petits documents de méta.
import type { OpsCockpit } from '../dashboard/opsMetrics'
import type { WatchOpsProgress } from './opsTypes'

/**
 * Silence au-delà duquel un run n'est plus vivant.
 *
 * ⚠ Le statut ne prouve rien : une Cloud Function tuée laisse `running` pour toujours.
 * Ce qui prouve qu'un run vit, c'est qu'il ÉCRIT. Même valeur que `LIVE_BEAT_MS` de
 * `workflows/runtime/useServerRunLive` — surtout ne pas inventer un troisième seuil, deux
 * écrans se contrediraient sur « est-ce que ça tourne ».
 */
export const OPS_BEAT_MS = 3 * 60_000

/** Sous ce niveau d'avancement, toute estimation de durée est une invention. */
const ETA_FLOOR = 0.1

export interface RunSnapshot {
  status: string
  startedAt: number
  /** Dernière écriture, quelle qu'elle soit. */
  beatAt: number
  trigger: string | null
}

export interface RunView {
  status: string
  trigger: string | null
  alive: boolean
  startedAt: number
  elapsedMs: number
}

export type ChantierId = 'harvest' | 'translate' | 'improve' | 'structure'

export interface Chantier {
  id: ChantierId
  /** Ce qui est fait — fiches, champs ou sites selon le chantier. */
  done: number
  /** Ce qu'il reste. */
  remaining: number
  /** 0 → 100. */
  pct: number
  /** Durée estimée, ou null quand elle ne vaudrait rien. */
  etaMs: number | null
  /** Débit mesuré (unités/minute), null avant la première minute. */
  perMin: number | null
  /** Ventilation par langue — traduction seulement. */
  byLang?: { lang: string | null; count: number }[]
  /** Jamais traité / texte source modifié depuis. Absent quand la source ne le dit pas. */
  reasons?: { fresh: number; stale: number }
}

export interface WatchOpsView {
  run: RunView | null
  chantiers: Chantier[]
  /** Dernière écriture d'avancement, tous chantiers confondus. */
  lastBeatAt: number | null
}

export interface WatchOpsInput {
  progress: WatchOpsProgress | null
  cockpit: OpsCockpit | null
  run: RunSnapshot | null
  now: number
}

/** Durée restante extrapolée sur le débit MESURÉ, jamais sur une part incluant le travail
 *  en cours — celle-ci annoncerait « restant = écoulé » à mi-parcours. */
function eta(done: number, remaining: number, elapsedMs: number): number | null {
  const total = done + remaining
  if (total === 0 || elapsedMs <= 0) return null
  if (done / total < ETA_FLOOR) return null
  const perMs = done / elapsedMs
  return perMs > 0 ? Math.round(remaining / perMs) : null
}

function pctOf(done: number, remaining: number): number {
  const total = done + remaining
  return total === 0 ? 0 : Math.round((done / total) * 100)
}

function textChantiers(p: WatchOpsProgress, now: number): Chantier[] {
  const t = p.texts
  if (!t) return []
  const elapsedMs = Math.max(0, now - t.startedAt)
  const out: Chantier[] = []
  for (const [kind, remaining] of Object.entries(t.pending)) {
    if (!remaining) continue
    const id = kind as ChantierId
    // `done` du passage est global aux natures de travail : on l'attribue au prorata,
    // faute de compteur par nature — et on le DIT plutôt que d'inventer un chiffre exact.
    const share = remaining / Object.values(t.pending).reduce((n, v) => n + (v ?? 0), 0)
    const done = Math.round(t.done * share)
    const effectiveRemaining = Math.max(0, remaining - done)
    out.push({
      id, done, remaining,
      pct: pctOf(done, effectiveRemaining),
      etaMs: eta(done, effectiveRemaining, elapsedMs),
      perMin: elapsedMs >= 60_000 && done > 0 ? Math.round(done / (elapsedMs / 60_000)) : null,
      ...(id === 'translate' && t.byLang ? { byLang: t.byLang } : {}),
      ...(t.reasons ? { reasons: t.reasons } : {}),
    })
  }
  return out
}

function harvestChantier(c: OpsCockpit, now: number): Chantier | null {
  if (!c.hasData && c.sitesActive === 0) return null
  const done = c.sitesComplete
  const remaining = Math.max(0, c.sitesActive - c.sitesComplete)
  const elapsedMs = c.lastCollectAt ? Math.max(0, now - c.lastCollectAt) : 0
  return {
    id: 'harvest', done, remaining,
    // ⚠ Le pourcentage vient du BALAYAGE moyen, pas du compte de sites : un site à moitié
    // moissonné avance, et un écran qui reste à 0 % pendant vingt minutes fait croire à
    // un blocage.
    pct: Math.round(c.avgProgress * 100),
    etaMs: eta(done, remaining, elapsedMs),
    perMin: null,
  }
}

export function buildWatchOps(input: WatchOpsInput): WatchOpsView {
  const { progress, cockpit, run, now } = input
  const chantiers: Chantier[] = []
  if (cockpit) {
    const h = harvestChantier(cockpit, now)
    if (h) chantiers.push(h)
  }
  if (progress) chantiers.push(...textChantiers(progress, now))

  const runView: RunView | null = run
    ? (() => {
        const alive = run.status === 'running' && now - run.beatAt <= OPS_BEAT_MS
        return {
          // Un run périmé n'est ni un succès ni un échec : interrompu.
          status: run.status === 'running' && !alive ? 'stopped' : run.status,
          trigger: run.trigger, alive,
          startedAt: run.startedAt,
          elapsedMs: Math.max(0, now - run.startedAt),
        }
      })()
    : null

  const beats = [progress?.texts?.beatAt, cockpit?.lastCollectAt].filter(
    (v): v is number => typeof v === 'number',
  )
  return {
    run: runView, chantiers,
    lastBeatAt: beats.length ? Math.max(...beats) : null,
  }
}
