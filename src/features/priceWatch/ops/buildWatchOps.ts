// Ce que l'écran « Suivi » AFFICHE, dérivé des documents. PUR.
//
// ⚠ Aucune lecture de rapport ni de catalogue ici : un rapport dépasse 1 Mo et a déjà
// saturé la mémoire du cron. On n'agrège que de petits documents de méta.
import type { OpsCockpit } from '../dashboard/opsMetrics'
import type { WatchOpsProgress } from './opsTypes'
import { LIVE_BEAT_MS } from '@/lib/liveRun'

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

/** Les volumes qu'une carte sait dire. Une clé = un libellé i18n (cf. `factLabelKey`). */
export type FactKey =
  | 'indexed' | 'pages' | 'lastPassProducts' | 'collecting'
  | 'considered' | 'alreadyDone'

export interface Chantier {
  id: ChantierId
  /** Ce qui est fait — fiches, champs ou sites selon le chantier. */
  done: number
  /** Ce qu'il reste (net du travail déjà fait). */
  remaining: number
  /** 0 → 100. */
  pct: number
  /** Durée estimée, ou null quand elle ne vaudrait rien. */
  etaMs: number | null
  /** Débit mesuré (unités/minute), null avant la première minute ou si le travail s'est arrêté. */
  perMin: number | null
  /**
   * Ce que le chantier a réellement produit, en volumes. PAS une jauge : des nombres.
   *
   * ⚠⚠ Le manque le plus criant de l'écran. Un run collecte ~14 000 fiches sur une dizaine
   * de sites (mesuré dans les traces : « +3 500 produit(s) sur 35 page(s) ») et la carte
   * Moisson n'affichait que « 21 sites bouclés · 63 % · 1 en cours » — trois nombres qui
   * ne bougent pas d'un run à l'autre. Toute la matière était déjà en base, live, et
   * personne ne la montrait.
   */
  facts?: { key: FactKey; value: number }[]
  /** Ventilation par langue — traduction seulement. */
  byLang?: { lang: string | null; count: number }[]
  /** Vrai si le travail s'est TU sans dire pourquoi (inactif depuis plus de LIVE_BEAT_MS,
   *  et sans raison d'arrêt publiée) — la seule vraie anomalie. */
  stale?: boolean
  /** Le passage a rendu la main pour une raison connue : budget, temps imparti, ou borne
   *  du nombre de champs. Pas une panne. */
  stoppedBy?: 'spend' | 'deadline' | 'units'
}

export interface WatchOpsView {
  run: RunView | null
  chantiers: Chantier[]
  /** Dernière écriture d'avancement, tous chantiers confondus. */
  lastBeatAt: number | null
  /** Jamais traité / texte source modifié depuis — global au passage de textes, pas par chantier. */
  textsReasons?: { fresh: number; stale: number }
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
  // ⚠ Rien à faire ⇒ AUCUNE estimation, et surtout pas zéro : `etaParts` plancherait ce
  // zéro à la minute (« au moins une minute tant qu'il reste du travail ») et la carte
  // terminée annoncerait « 1 min restantes » pour toujours.
  if (remaining <= 0) return null
  if (total === 0 || elapsedMs <= 0) return null
  if (done / total < ETA_FLOOR) return null
  const perMs = done / elapsedMs
  return perMs > 0 ? Math.round(remaining / perMs) : null
}

function pctOf(done: number, remaining: number): number {
  const total = done + remaining
  return total === 0 ? 0 : Math.round((done / total) * 100)
}

/** Volumes du passage de textes — les mêmes pour tous ses chantiers : ils décrivent le
 *  passage, pas une nature de travail en particulier. */
function factsOfTexts(t: NonNullable<WatchOpsProgress['texts']>): { key: FactKey; value: number }[] {
  const out: { key: FactKey; value: number }[] = []
  if (t.considered > 0) out.push({ key: 'considered', value: t.considered })
  if (t.alreadyDone > 0) out.push({ key: 'alreadyDone', value: t.alreadyDone })
  return out
}

function textChantiers(p: WatchOpsProgress, now: number): { chantiers: Chantier[]; reasons?: { fresh: number; stale: number } } {
  const t = p.texts
  if (!t) return { chantiers: [] }
  // ⚠ Le temps écoulé est borné par le dernier signe de vie : si l'écran reste ouvert
  // longtemps après l'arrêt du travail, l'estimation ne s'éternise pas.
  const elapsedMs = Math.max(0, Math.min(now, t.beatAt) - t.startedAt)
  // ⚠⚠ Silence n'est pas panne. Le passage rend la main sur son budget, son temps imparti
  // ou sa borne de champs — mesuré en prod : 504 champs sur 207 802, plafond de dépense
  // atteint, à CHAQUE run. L'écran criait pourtant « passage arrêté » en orange sur un
  // traitement parfaitement sain. La raison ne pouvait pas se déduire du flux (une première
  // tentative via `maxUnits` fut inerte, ce flux le réglant à 0) : elle n'existe que dans le
  // passage, qui la PUBLIE désormais (`stoppedBy`, cf. `textsSnapshot` et ses deux jumeaux).
  // Reste `stale` pour ce qu'il aurait toujours dû désigner : un silence SANS explication.
  const idle = now - t.beatAt > LIVE_BEAT_MS
  const isStalework = idle && !t.stoppedBy
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
      id, done, remaining: effectiveRemaining,
      pct: pctOf(done, effectiveRemaining),
      // ⚠ `idle` et non `isStalework` : un passage arrêté pour une BONNE raison n'écrit
      // pas davantage qu'un passage en panne — extrapoler sa durée restante sur un débit
      // figé annoncerait une fin qui ne viendra pas avant le prochain run.
      etaMs: idle ? null : eta(done, effectiveRemaining, elapsedMs),
      perMin: idle || elapsedMs < 60_000 || done === 0 ? null : Math.round(done / (elapsedMs / 60_000)),
      // ⚠ Publiés par le passage depuis l'origine (`TextsProgress`), jamais montrés : le
      // dénominateur honnête (« examinés ») et ce que la mémoire a épargné (« déjà faits »).
      ...(factsOfTexts(t).length ? { facts: factsOfTexts(t) } : {}),
      ...(id === 'translate' && t.byLang ? { byLang: t.byLang } : {}),
      // ⚠ « Arrêté » se lit « interrompu ». Un chantier TERMINÉ n'a plus rien à écrire :
      // trois minutes après sa dernière ligne, une carte à 100 % et 0 restant portait le
      // badge « passage arrêté » — et c'est l'état le plus fréquent de l'écran, puisque la
      // plupart du temps rien ne tourne. On croyait à une panne là où le travail est fini.
      // Le silence n'est une anomalie que s'il reste quelque chose à faire.
      ...(isStalework && effectiveRemaining > 0 ? { stale: true } : {}),
      ...(idle && t.stoppedBy && effectiveRemaining > 0 ? { stoppedBy: t.stoppedBy } : {}),
    })
  }
  return { chantiers: out, reasons: t.reasons }
}

function harvestChantier(c: OpsCockpit): Chantier | null {
  if (!c.hasData && c.sitesActive === 0) return null
  const done = c.sitesComplete
  const remaining = Math.max(0, c.sitesActive - c.sitesComplete)
  const facts: { key: FactKey; value: number }[] = []
  if (c.totalIndexed > 0) facts.push({ key: 'indexed', value: c.totalIndexed })
  if (c.totalPages > 0) facts.push({ key: 'pages', value: c.totalPages })
  if (c.lastPassProducts > 0) facts.push({ key: 'lastPassProducts', value: c.lastPassProducts })
  if (c.sitesCollecting > 0) facts.push({ key: 'collecting', value: c.sitesCollecting })
  return {
    id: 'harvest', done, remaining,
    ...(facts.length ? { facts } : {}),
    // ⚠ Le pourcentage vient du BALAYAGE moyen, pas du compte de sites : un site à moitié
    // moissonné avance, et un écran qui reste à 0 % pendant vingt minutes fait croire à
    // un blocage.
    pct: Math.round(c.avgProgress * 100),
    // ⚠ Pas d'estimation pour la moisson : lastCollectAt est quasi instantané pendant
    // une moisson active (battement à chaque site visité), le débit exploserait. Mieux
    // vaut pas d'estimation qu'une invention.
    etaMs: null,
    perMin: null,
  }
}

export function buildWatchOps(input: WatchOpsInput): WatchOpsView {
  const { progress, cockpit, run, now } = input
  const chantiers: Chantier[] = []
  let textsReasons: { fresh: number; stale: number } | undefined

  if (cockpit) {
    const h = harvestChantier(cockpit)
    if (h) chantiers.push(h)
  }
  if (progress) {
    const { chantiers: textChants, reasons } = textChantiers(progress, now)
    chantiers.push(...textChants)
    textsReasons = reasons
  }

  const runView: RunView | null = run
    ? (() => {
        const alive = run.status === 'running' && now - run.beatAt <= LIVE_BEAT_MS
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
    ...(textsReasons ? { textsReasons } : {}),
  }
}
