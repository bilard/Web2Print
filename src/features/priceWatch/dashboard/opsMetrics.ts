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
import type { StoredReport } from '../reportStore'
import type { CompetitorStat } from '../catalog/report'

/** Méta de moisson LIVE d'un concurrent (doc `competitors/{siteId}`), lue en onSnapshot.
 *  Se met à jour à CHAQUE passe de moisson → prime sur le snapshot figé du rapport. */
export interface HarvestMeta {
  domain?: string
  pageCount?: number
  harvestProgress?: number
  harvestSweeps?: number
  cumulHarvestMs?: number
  lastHarvestMs?: number
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
}

export interface OpsCockpit {
  totalIndexed: number         // Σ fiches, tous concurrents
  totalCumulMs: number         // Σ temps de moisson
  avgProgress: number          // balayage moyen (0..1) sur les concurrents actifs
  sitesActive: number          // concurrents ayant ≥ 1 fiche collectée
  sitesTotal: number
  sitesComplete: number        // concurrents ayant bouclé ≥ 1 cycle complet
  cyclesDone: number           // cycles complets GARANTIS = min(sweeps) sur les actifs
  slowestCycle: { domain: string; cycleMs: number } | null // goulot → calibrage du cron
  runAt: number
  /** Dernière écriture de méta de moisson (heartbeat live) — null si aucune. Distinct de
   *  runAt (dernier « Comparer ») : prouve que la moisson tourne même sans nouveau rapport. */
  lastCollectAt: number | null
  /** true dès qu'au moins un concurrent a collecté des fiches (sinon : en attente). */
  hasData: boolean
  competitors: OpsCompetitor[] // triés par fiches décroissantes
}

function opsCompetitorOf(s: CompetitorStat, live?: HarvestMeta): OpsCompetitor {
  const indexed = s.audit?.indexed ?? 0
  const h = s.harvest
  // La méta LIVE prime sur le snapshot du rapport (elle bouge pendant la moisson).
  const sweeps = live?.harvestSweeps ?? h?.sweeps ?? 0
  const cumulMs = live?.cumulHarvestMs ?? h?.cumulMs ?? 0
  const progress = Math.max(0, Math.min(1, live?.harvestProgress ?? h?.progress ?? 0))
  return {
    siteId: s.siteId, domain: s.domain, indexed,
    progress, sweeps, cumulMs,
    cycleMs: sweeps > 0 ? Math.round(cumulMs / sweeps) : null,
    pctPrice: s.audit?.pctPrice ?? 0,
  }
}

export function buildOpsCockpit(report: StoredReport, liveMeta?: Map<string, HarvestMeta>): OpsCockpit {
  const competitors = report.byCompetitor
    .map((s) => opsCompetitorOf(s, liveMeta?.get(s.siteId)))
    .sort((a, b) => b.indexed - a.indexed || a.domain.localeCompare(b.domain))
  // « Actif » = a collecté ≥ 1 fiche. Garde-fou : un site à 0 fiche mais `progress=1`
  // (balayage « complet » de rien) ne doit ni compter comme bouclé ni verdir la jauge.
  const active = competitors.filter((c) => c.indexed > 0)
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

  // Heartbeat de moisson : la plus récente écriture de méta (bouge à chaque passe).
  let lastCollectAt: number | null = null
  if (liveMeta) for (const m of liveMeta.values()) {
    if (m.updatedAt != null && (lastCollectAt == null || m.updatedAt > lastCollectAt)) lastCollectAt = m.updatedAt
  }

  return {
    totalIndexed, totalCumulMs, avgProgress,
    sitesActive: active.length, sitesTotal: competitors.length, sitesComplete,
    cyclesDone, slowestCycle, runAt: report.runAt, lastCollectAt,
    hasData: totalIndexed > 0,
    competitors,
  }
}
