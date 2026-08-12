// src/features/priceWatch/dashboard/opsCockpit.ts
// Cockpit OPÉRATIONNEL de la veille tarifaire (métaphore tableau de bord voiture).
// Dérivé PUR du rapport (byCompetitor.harvest + audit) — répond à « qui scrape quoi,
// reste à traiter, temps consommé, fiches collectées », SANS recalcul depuis les lignes
// brutes ni changement de schéma (lecture seule, aucun jumeau serveur à toucher).
//
// ⚠ Métrique honnête pour calibrer le cron : la durée d'UN cycle complet =
// `cumulHarvestMs / sweeps`. Un « débit fiches/min » (Σindexed / ΣcumulMs) serait
// TROMPEUR car `indexed` est dédupliqué/courant tandis que `cumulMs` s'accumule à
// chaque re-balayage → il décroîtrait à 1/N après N cycles. On ne le calcule pas.
import { LIVE_BEAT_MS } from '@/lib/liveRun'
import type { StoredReport } from '../reportStore'
import type { CompetitorStat } from '../catalog/report'

/** Un site « collecte maintenant » si sa méta a battu dans la fenêtre du run vivant. Le
 *  MÊME seuil que partout ailleurs (`LIVE_BEAT_MS`) : trois copies d'un seuil de vie ont
 *  déjà divergé une fois dans ce module. */
const HARVEST_LIVE_MS = LIVE_BEAT_MS

/** Méta de moisson LIVE d'un concurrent (doc `competitors/{siteId}`), lue en onSnapshot.
 *  Se met à jour à CHAQUE passe de moisson → prime sur le snapshot figé du rapport. */
export interface HarvestMeta {
  domain?: string
  /** Site coché dans « Sites sources » (cf. CompetitorMeta.enabled). Absent = état
   *  inconnu (aucun run depuis l'introduction du champ) → traité comme actif. */
  enabled?: boolean
  /** Nombre de produits indexés — mis à jour EN COURS de moisson (toutes les N pages) puis
   *  remis à la valeur dédupliquée exacte au « Comparer ». Fait ticker « Fiches collectées ». */
  productCount?: number
  pageCount?: number
  /** Battement de MOISSON (écrit par une passe de scraping seulement, jamais par le
   *  node « Comparer ») — seule preuve honnête que ce site travaille MAINTENANT. */
  harvestBeatAt?: number
  harvestProgress?: number
  harvestSweeps?: number
  cumulHarvestMs?: number
  lastHarvestMs?: number
  /** Moteur ayant fourni le HTML à la dernière passe (cf. CompetitorMeta.lastEngine). */
  lastEngine?: string
  /** Mise en attente par le mode cycle (cf. CompetitorMeta.cycleWaitingAt) : balayage
   *  terminé, on patiente que les retardataires finissent. Distingue « attend son tour »
   *  de « ne se lance plus » — sans lui la carte affichait « OK » depuis des jours. */
  cycleWaitingAt?: number
  /** Résultat de la dernière passe de moisson (cf. CompetitorMeta.lastPass*). */
  lastPassPages?: number
  lastPassProducts?: number
  lastPassAt?: number
  /** % de fiches avec prix (live depuis l'index, cf. CompetitorMeta.pctPrice). */
  pctPrice?: number
  updatedAt?: number
}

interface OpsCompetitor {
  siteId: string
  domain: string
  indexed: number          // fiches indexées (dédupliquées) — snapshot du dernier « Comparer »
  progress: number         // 0..1 balayage du cycle courant (LIVE si méta dispo)
  sweeps: number           // cycles complets du catalogue concurrent (LIVE)
  cumulMs: number          // temps de moisson cumulé, toutes passes (LIVE)
  cycleMs: number | null   // durée d'UN cycle complet = cumulMs / sweeps (null si 0 cycle)
  pctPrice: number         // % des fiches portant un prix (santé du parsing)
  /** Site COCHÉ dans « Sites sources ». Un site décoché garde ses fiches d'hier mais ne
   *  travaille plus : le rail doit pouvoir le montrer ou le masquer à la demande. */
  enabled: boolean
}

export interface OpsCockpit {
  totalIndexed: number         // Σ fiches, tous concurrents
  totalCumulMs: number         // Σ temps de moisson
  avgProgress: number          // balayage moyen (0..1) sur les concurrents actifs
  sitesActive: number          // concurrents ayant ≥ 1 fiche collectée
  sitesTotal: number
  /** Triplet unifié ACTIFS · INACTIFS · TOTAL (cf. `competitorCounts`). */
  counts: CompetitorCounts
  sitesComplete: number        // concurrents ayant bouclé ≥ 1 cycle complet
  cyclesDone: number           // cycles complets GARANTIS = min(sweeps) sur les actifs
  slowestCycle: { domain: string; cycleMs: number } | null // goulot → calibrage du cron
  runAt: number
  /** Dernière écriture de méta de moisson (heartbeat live) — null si aucune. Distinct de
   *  runAt (dernier « Comparer ») : prouve que la moisson tourne même sans nouveau rapport. */
  lastCollectAt: number | null
  /** Domaine dont la méta a bougé en dernier (le concurrent en cours de collecte). */
  lastCollectDomain: string | null
  /** true dès qu'au moins un concurrent a collecté des fiches (sinon : en attente). */
  hasData: boolean
  /** Pages indexées, tous concurrents — le second volume réel de la moisson, à côté des
   *  fiches. L'écran « Suivi » ne comptait que des SITES : il taisait les 14 000 fiches
   *  qu'un run collecte réellement. */
  totalPages: number
  /** Fiches et pages de la DERNIÈRE passe de chaque site. Σ honnête (contrairement à un
   *  débit calculé sur `cumulMs`, qui décroît à 1/N après N cycles — cf. l'en-tête) :
   *  c'est ce que le dernier passage a rapporté. */
  lastPassProducts: number
  lastPassPages: number
  /** Concurrents dont la moisson bat MAINTENANT (`harvestBeatAt` récent). */
  sitesCollecting: number
  competitors: OpsCompetitor[] // triés par fiches décroissantes
}

function opsCompetitorOf(s: CompetitorStat, live?: HarvestMeta): OpsCompetitor {
  // Compte LIVE de la moisson en cours s'il existe (tick pendant le run), sinon le
  // snapshot dédupliqué du dernier Comparer.
  const indexed = live?.productCount ?? s.audit?.indexed ?? 0
  const h = s.harvest
  // La méta LIVE prime sur le snapshot du rapport (elle bouge pendant la moisson).
  const cumulMs = live?.cumulHarvestMs ?? h?.cumulMs ?? 0
  const progress = Math.max(0, Math.min(1, live?.harvestProgress ?? h?.progress ?? 0))
  // ⚠ `sweeps` (curseur) n'est incrémenté qu'à la RÉOUVERTURE du balayage suivant
  // (openSweep) : en mode cycle calendaire, un site 100 % bouclé qui ATTEND la relance
  // resterait à ×0 pendant toute l'attente. Un balayage terminé (progress=1) compte
  // donc comme cycle bouclé — et son temps est déjà dans cumulMs (durée plus exacte).
  const sweeps = (live?.harvestSweeps ?? h?.sweeps ?? 0) + (progress >= 1 ? 1 : 0)
  return {
    siteId: s.siteId, domain: s.domain, indexed,
    progress, sweeps, cumulMs,
    cycleMs: sweeps > 0 ? Math.round(cumulMs / sweeps) : null,
    // % prix LIVE (mis à jour au scrape depuis l'index) prioritaire sur le rapport figé.
    pctPrice: live?.pctPrice ?? s.audit?.pctPrice ?? 0,
    // Valeur PROVISOIRE : `buildOpsCockpit` la réécrit avec l'état coché réel, qu'il est
    // seul à connaître (il compare toutes les métas d'un coup).
    enabled: true,
  }
}

/**
 * Compte unifié des concurrents : ACTIFS · INACTIFS · TOTAL.
 *
 *   ACTIF   = SUIVI, c'est-à-dire retenu pour la dernière analyse (`report.sites`). Le
 *             node « Comparer catalogue » ne reçoit que les sites cochés : cette liste
 *             EST la décision de l'utilisateur, constatée plutôt que devinée ;
 *   TOTAL   = tous les concurrents connus du suivi — ceux de l'analyse plus ceux qui ont
 *             une méta de moisson, donc les sites mis en pause depuis ;
 *   INACTIF = la différence : suivis autrefois, plus aujourd'hui.
 *
 * ⚠ NE PAS repasser par un champ `enabled` en base : il n'est pas écrit pour tous les
 * sites, et son absence faisait passer tout le monde pour actif — « 24/24 » dans le
 * cockpit, « 14/14 » dans le bandeau, pour un suivi qui compte 14 sites sur 24 connus.
 *
 * ⚠ Ce qu'un site RAPPORTE est une autre question, avec ses propres signaux : badges
 * « OK » / « sans catalogue » de la liste, compteurs d'appariement. Un site coché qui ne
 * rapporte rien reste ACTIF — il est suivi, il ne produit simplement pas.
 */
export interface CompetitorCounts { active: number; inactive: number; total: number }

export function competitorCounts(watchedIds: Iterable<string>, knownIds: Iterable<string>): CompetitorCounts {
  const watched = new Set(watchedIds)
  const total = new Set([...knownIds, ...watched])
  const active = [...total].filter((id) => watched.has(id)).length
  return { active, inactive: total.size - active, total: total.size }
}

/** Libellé commun des trois nombres — même phrase partout, jamais deux formulations. */
export function competitorCountsLabel(c: CompetitorCounts): string {
  return c.inactive > 0
    ? `${c.active} actifs · ${c.inactive} inactifs · ${c.total} au total`
    : `${c.active} actifs · ${c.total} au total`
}

/**
 * Recalcule le cockpit sur un PÉRIMÈTRE choisi.
 *
 * ⚠⚠ La bascule « Actifs / Tous » ne peut pas se contenter de filtrer une liste : tout le
 * panneau raconterait alors une histoire et le rail une autre. « 442 773 fiches collectées »
 * au-dessus de trois lignes de concurrents actifs additionne en réalité vingt-quatre sites,
 * dont vingt et un ne tournent plus depuis des jours — le chiffre est juste et la lecture
 * fausse. Chaque agrégat suit donc le périmètre affiché : volume, temps de moisson, durée
 * d'un cycle, avancement, goulot.
 *
 * PUR, et volontairement séparé de `buildOpsCockpit` : celui-ci compose le cockpit COMPLET
 * (c'est lui qui connaît les métas), celle-ci n'en restreint que la lecture.
 */
export function scopeCockpit(ck: OpsCockpit, scope: 'active' | 'all'): OpsCockpit {
  if (scope === 'all') return ck
  const kept = ck.competitors.filter((c) => c.enabled)
  const withFiches = kept.filter((c) => c.indexed > 0)
  let slowestCycle: OpsCockpit['slowestCycle'] = null
  for (const c of withFiches) {
    if (c.cycleMs == null) continue
    if (!slowestCycle || c.cycleMs > slowestCycle.cycleMs) slowestCycle = { domain: c.domain, cycleMs: c.cycleMs }
  }
  return {
    ...ck,
    competitors: kept,
    totalIndexed: kept.reduce((n, c) => n + c.indexed, 0),
    totalCumulMs: kept.reduce((n, c) => n + c.cumulMs, 0),
    avgProgress: withFiches.length
      ? withFiches.reduce((n, c) => n + c.progress, 0) / withFiches.length
      : 0,
    sitesComplete: withFiches.filter((c) => c.sweeps >= 1).length,
    cyclesDone: withFiches.length ? Math.min(...withFiches.map((c) => c.sweeps)) : 0,
    slowestCycle,
  }
}

export function buildOpsCockpit(report: StoredReport, liveMeta?: Map<string, HarvestMeta>): OpsCockpit {
  const inReport = new Set(report.byCompetitor.map((s) => s.siteId))
  // Sites présents dans le LIVE mais pas (encore) dans le rapport « Comparer » (ex.
  // fraîchement scrapés / réinitialisés) → on les ajoute pour que le tableau bouge en
  // direct sans attendre une comparaison. Doc curseur (recherche dirigée) ignoré.
  const liveOnly: CompetitorStat[] = liveMeta
    ? [...liveMeta.entries()]
        .filter(([siteId, m]) => !inReport.has(siteId) && m.domain && m.domain !== 'directed-cursor')
        .map(([siteId, m]) => ({
          siteId, domain: m.domain as string, matched: 0, cheaper: 0, ruptures: 0, avgGapPct: null,
          audit: { indexed: 0, pctPrice: 0, pctListPrice: 0, pctStock: 0, pctName: 0, pctImage: 0, pctRef: 0 },
        }))
    : []
  const competitorsRaw = [...report.byCompetitor, ...liveOnly]
    .map((s) => opsCompetitorOf(s, liveMeta?.get(s.siteId)))
    .sort((a, b) => b.indexed - a.indexed || a.domain.localeCompare(b.domain))
  // ⚠ Un site DÉCOCHÉ ne doit plus peser : il gardait ses fiches d'hier, donc il
  // continuait d'alimenter les jauges et pouvait même s'afficher comme « le plus lent du
  // cycle » alors qu'il ne tourne plus. L'état vient de la méta (écrite par le node) ;
  // absent = inconnu, on le garde plutôt que de vider le tableau.
  const disabled = new Set(
    liveMeta ? [...liveMeta.entries()].filter(([, m]) => m.enabled === false).map(([id]) => id) : [],
  )
  // « Actif » = coché ET a collecté ≥ 1 fiche. Garde-fou : un site à 0 fiche mais
  // `progress=1` (balayage « complet » de rien) ne doit ni compter comme bouclé ni
  // verdir la jauge.
  // L'état coché est reporté sur chaque ligne : le rail du cockpit s'en sert pour
  // basculer entre « les concurrents qui travaillent » et « tout ce qu'on a collecté ».
  const competitors = competitorsRaw.map((c) => ({ ...c, enabled: !disabled.has(c.siteId) }))
  const active = competitors.filter((c) => c.indexed > 0 && c.enabled)
  const totalIndexed = competitors.reduce((n, c) => n + c.indexed, 0)
  const totalCumulMs = competitors.reduce((n, c) => n + c.cumulMs, 0)
  const avgProgress = active.length
    ? active.reduce((n, c) => n + c.progress, 0) / active.length
    : 0
  const sitesComplete = active.filter((c) => c.sweeps >= 1).length
  const cyclesDone = active.length ? Math.min(...active.map((c) => c.sweeps)) : 0

  // Goulot pour régler la fréquence du cron : le concurrent dont un cycle complet
  // dure le plus longtemps (rafraîchir tout le monde prend au moins ça).
  let slowestCycle: OpsCockpit['slowestCycle'] = null
  for (const c of active) {
    if (c.cycleMs == null) continue
    if (!slowestCycle || c.cycleMs > slowestCycle.cycleMs) slowestCycle = { domain: c.domain, cycleMs: c.cycleMs }
  }

  // Heartbeat de moisson : le plus récent battement de SCRAPING. ⚠ `updatedAt` ne convient
  // PAS — le node « Comparer » réécrit la méta de tous les concurrents dans une seule
  // rafale (même milliseconde), ce qui faisait passer tout le monde pour « en cours ».
  // Repli sur updatedAt tant qu'aucune passe n'a écrit le nouveau champ (métas anciennes).
  let lastCollectAt: number | null = null
  let lastCollectDomain: string | null = null
  if (liveMeta) for (const [siteId, m] of liveMeta.entries()) {
    const beat = m.harvestBeatAt ?? m.updatedAt
    if (beat != null && (lastCollectAt == null || beat > lastCollectAt)) {
      lastCollectAt = beat
      lastCollectDomain = m.domain ?? competitors.find((c) => c.siteId === siteId)?.domain ?? null
    }
  }

  // Volumes RÉELS de la moisson, lus sur les métas live (elles tiquent toutes les quinze
  // pages pendant la passe). Un run collecte de l'ordre de quatorze mille fiches — l'écran
  // « Suivi » n'en montrait aucune, il ne comptait que des sites bouclés.
  const liveOf = (siteId: string) => liveMeta?.get(siteId)
  const kept = competitors.filter((c) => !disabled.has(c.siteId))
  const totalPages = kept.reduce((n, c) => n + (liveOf(c.siteId)?.pageCount ?? 0), 0)
  const lastPassProducts = kept.reduce((n, c) => n + (liveOf(c.siteId)?.lastPassProducts ?? 0), 0)
  const lastPassPages = kept.reduce((n, c) => n + (liveOf(c.siteId)?.lastPassPages ?? 0), 0)
  const sitesCollecting = kept.filter((c) => {
    const beat = liveOf(c.siteId)?.harvestBeatAt
    return beat != null && report.runAt >= 0 && Date.now() - beat < HARVEST_LIVE_MS
  }).length

  return {
    totalIndexed, totalCumulMs, avgProgress,
    totalPages, lastPassProducts, lastPassPages, sitesCollecting,
    sitesActive: active.length,
    sitesTotal: competitors.filter((c) => !disabled.has(c.siteId)).length,
    // ⚠ Repli sur les sites AYANT DES DONNÉES quand le rapport ne porte pas sa liste :
    // les analyses écrites avant que `sites` soit persisté rendraient sinon « 0 actif sur
    // 24 », un chiffre spectaculairement faux là où l'on n'a simplement pas l'information.
    counts: competitorCounts(
      report.sites?.length ? report.sites.map((s) => s.siteId) : active.map((c) => c.siteId),
      competitors.map((c) => c.siteId),
    ),
    sitesComplete,
    cyclesDone, slowestCycle, runAt: report.runAt, lastCollectAt, lastCollectDomain,
    hasData: totalIndexed > 0,
    competitors,
  }
}
