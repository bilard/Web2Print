// État LIVE du scraping pour la PWA « radarPrice » — dérivation PURE (aucun React),
// partagée par le badge de l'écran principal, le bandeau du planificateur et le tableau
// live. Source unique : une seule fenêtre de heartbeat, un seul vocabulaire de statuts.
import type { StoredReport } from '../reportStore'
import type { HarvestMeta, OpsCockpit } from '../dashboard/opsMetrics'
import { siteStatus, HARVEST_LIVE_WINDOW_MS, type SiteStatus } from '../sourceSites'
import { hhmm, timeAgo } from './radarFormat'
import { t } from '@/lib/i18n'

/** Fenêtre du battement de moisson — RÉEXPORT de la constante partagée avec l'app
 *  (`sourceSites.ts`) : deux valeurs différentes = deux comptes contradictoires à l'écran. */
export const LIVE_WINDOW_MS = HARVEST_LIVE_WINDOW_MS

/** Doc `workflowSchedules/{workflowId}` — clé = id du WORKFLOW, pas le watchId. */
export interface RadarSchedule {
  enabled: boolean
  nextRunAt: number
  lastRunAt?: number
  /** 'running' | 'stopped' (STOP volontaire) | 'error' | 'success' | 'partial' | 'done'. */
  lastStatus?: string
  /** Cycle de moisson bouclé à 100 % : la relance suit l'échéance calendaire. */
  cycleWaiting?: boolean
  /** Fin du dernier run serveur — un battement de moisson ANTÉRIEUR est mort. */
  lastEndAt?: number
}

/** État live du run serveur (`users/{uid}/workflowRunsLive/{workflowId}`) — écrit pour
 *  TOUT déclencheur (cron, manuel, webhook), contrairement au planning. */
export interface RadarRunLive {
  status?: string
  startedAt?: number
  endedAt?: number
}

/** Au-delà du budget de run + marge, un `status: 'running'` est un zombie (process mort
 *  sans écrire sa fin) : on cesse de le croire, sinon « en cours » à vie.
 *  ⚠️ Partagé avec l'ÉDITEUR (`useServerRunLive`) : deux seuils divergents
 *  afficheraient deux vérités différentes du même run. */
export const STALE_RUN_MS = 31 * 60_000

/** Ce qui tourne VRAIMENT côté serveur, et depuis quand plus rien ne tourne. */
export interface RunPulse {
  active: boolean
  /** Début du run en cours (ou du dernier connu). */
  startedAt: number | null
  /** Fin du dernier run connu (null = aucun run serveur jamais observé). */
  endedAt: number | null
}

export function runPulse(sched: RadarSchedule | null, live: RadarRunLive | null, now: number): RunPulse {
  const liveRunning = live?.status === 'running' && live.startedAt != null && now - live.startedAt < STALE_RUN_MS
  return {
    active: liveRunning || sched?.lastStatus === 'running',
    startedAt: live?.startedAt ?? sched?.lastRunAt ?? null,
    endedAt: live?.endedAt ?? sched?.lastEndAt ?? null,
  }
}

/**
 * Un battement de moisson est-il VIVANT ? L'état du run fait autorité sur le battement :
 * après un STOP (ou une suspension) la dernière méta écrite reste « fraîche » pendant
 * toute la fenêtre de heartbeat, et les cartes continuaient de clignoter alors que plus
 * rien ne tournait. Règles :
 *  - run serveur en cours → vivant (le battement dit seulement QUEL site travaille) ;
 *  - run terminé → vivant seulement si le battement est POSTÉRIEUR à la fin du run ;
 *  - aucun run serveur jamais observé → on garde le battement (moisson d'un site lancée
 *    à la main depuis l'app, qui n'écrit aucun état de run).
 */
function isBeatAlive(beatAt: number | null | undefined, pulse: RunPulse, now: number): boolean {
  if (beatAt == null || now - beatAt >= LIVE_WINDOW_MS) return false
  if (pulse.active) return true
  if (pulse.endedAt == null) return true
  return beatAt > pulse.endedAt
}

/** Docs techniques de la recherche dirigée (`directed-cursor`, `directed-auth-cursor`) :
 *  ce ne sont pas des concurrents — ni ligne de tableau, ni compteur, ni libellé. */
export function isCursorDomain(domain: string | undefined | null): boolean {
  return !!domain && /(^|[-_])cursor$/.test(domain)
}

type ScrapeState = 'running' | 'waiting' | 'idle'

export interface ScrapeStatus {
  state: ScrapeState
  /** Libellé prêt à afficher (badge). */
  label: string
}

/** État du scraping en 3 valeurs claires : EN COURS (run serveur actif ou passe de
 *  moisson récente) / EN ATTENTE (cron actif, pause entre deux runs — normal) /
 *  ARRÊTÉ (aucune planification). Miroir du Cockpit opérationnel de l'app. */
export function scrapeStatus(ops: OpsCockpit | null, sched: RadarSchedule | null, pulse: RunPulse, now: number): ScrapeStatus {
  const collecting = isBeatAlive(ops?.lastCollectAt, pulse, now)
  if (collecting || pulse.active) {
    // Le domaine n'est nommé que si c'est un vrai concurrent (jamais un doc curseur).
    const domain = collecting && !isCursorDomain(ops?.lastCollectDomain) ? ops?.lastCollectDomain ?? null : null
    const site = domain ? ops?.competitors.find((c) => c.domain === domain) : null
    const suffix = domain ? ` · ${domain.replace(/^www\./, '')}${site && site.indexed === 0 ? ' · bloqué' : ''}` : ''
    return { state: 'running', label: `Scraping en cours${suffix}` }
  }
  if (sched?.enabled) {
    const overdue = sched.nextRunAt <= now
    return { state: 'waiting', label: `En attente du prochain run · ${overdue ? 'imminent' : hhmm(sched.nextRunAt)}` }
  }
  const last = ops?.lastCollectAt != null ? ` · dernière ${timeAgo(ops.lastCollectAt, now)}` : ''
  return { state: 'idle', label: t('pw.tail.scrapeIdle', { last }) }
}

/** Une ligne du tableau live : l'état d'un concurrent, méta LIVE prioritaire sur le
 *  snapshot figé du dernier « Comparer catalogue ». */
export interface ScrapeRow {
  siteId: string
  domain: string
  status: SiteStatus
  /** Site coché dans le node « Sites sources ». false = exclu de TOUT (cf. buildScrapeRows). */
  enabled: boolean
  /** Heartbeat récent → moisson en cours sur ce site. */
  live: boolean
  products: number
  pctPrice: number | null
  /** Paires produit×concurrent trouvées CHEZ CE SITE (figé au dernier « Comparer »). */
  matched: number | null
  progress: number
  sweeps: number
  lastEngine?: string
  /** Dernier battement de MOISSON (le chip « scrape » ; `updatedAt` mentirait). */
  harvestBeatAt?: number
  updatedAt?: number
  lastPassPages?: number
  lastPassProducts?: number
}

/** Nom tel qu'il est AFFICHÉ — c'est lui qui doit gouverner le tri alphabétique. */
function displayDomain(domain: string): string {
  return domain.replace(/^www\./, '')
}

/** Ce que la config du node « Sites sources » apprend au tableau live. */
export interface ScrapeSiteConfig {
  domain: string
  enabled: boolean
}

/** Lignes du tableau live : union des concurrents du rapport, des métas LIVE (un site
 *  fraîchement scrapé apparaît sans attendre un « Comparer ») et de la CONFIG (un site
 *  ajouté ou désactivé existe avant d'avoir la moindre donnée). Tri = les désactivés en
 *  dernier, puis ce qui bouge, puis le plus gros catalogue. */
export function buildScrapeRows(
  report: StoredReport | null,
  meta: Map<string, HarvestMeta>,
  now: number,
  /** Ce qui tourne côté serveur : arbitre « ça bouge encore ? » (cf. isBeatAlive). */
  pulse: RunPulse = { active: false, startedAt: null, endedAt: null },
  /** Config du node « Sites sources », par `stableId(domaine)`. Un site ABSENT de cette
   *  carte reste actif : l'index peut porter des concurrents retirés de la liste depuis,
   *  et un suivi sans node « Sites sources » n'a aucune activation à lire. */
  config?: ReadonlyMap<string, ScrapeSiteConfig>,
): ScrapeRow[] {
  const byId = new Map<string, { domain: string; matched: number | null; indexed: number; pctPrice: number | null }>()
  for (const c of report?.byCompetitor ?? []) {
    byId.set(c.siteId, {
      domain: c.domain,
      matched: c.matched ?? null,
      indexed: c.audit?.indexed ?? 0,
      pctPrice: c.audit?.pctPrice ?? null,
    })
  }
  for (const [siteId, m] of meta.entries()) {
    if (!byId.has(siteId) && m.domain) byId.set(siteId, { domain: m.domain, matched: null, indexed: 0, pctPrice: null })
  }
  // Un concurrent DÉSACTIVÉ n'est plus émis sur le port `sites` : ni moissonné, ni
  // recherché, ni comparé — il finit donc par disparaître du rapport ET des métas. Sans
  // cette union, le désactiver le faisait s'ÉVAPORER du tableau, et on ne pouvait plus
  // le réactiver depuis le mobile. La config le maintient visible.
  for (const [siteId, c] of config?.entries() ?? []) {
    if (!byId.has(siteId) && c.domain) byId.set(siteId, { domain: c.domain, matched: null, indexed: 0, pctPrice: null })
  }

  const rows: ScrapeRow[] = []
  for (const [siteId, base] of byId.entries()) {
    if (isCursorDomain(base.domain)) continue
    const m = meta.get(siteId)
    const enabled = config?.get(siteId)?.enabled !== false
    // ⚠ « En cours » se lit sur `harvestBeatAt` — écrit UNIQUEMENT par une passe de
    // scraping. `updatedAt` bouge aussi quand le node « Comparer » réécrit la méta de TOUS
    // les concurrents dans la même rafale (constaté : 13 sites à la même milliseconde),
    // ce qui les allumait tous. Plusieurs sites peuvent être actifs à la fois : les nodes
    // « Moisson » et « Recherche dirigée » tournent en parallèle.
    const live = enabled && isBeatAlive(m?.harvestBeatAt, pulse, now)
    const products = m?.productCount ?? base.indexed
    rows.push({
      siteId,
      domain: base.domain,
      // `productCount` est indispensable au statut « Recherche seule » : une marketplace
      // n'est pas moissonnable (0 page) mais porte des fiches — sans lui, elle s'affichait
      // « ✗ Sans catalogue » en rouge à côté de son propre compteur de fiches.
      status: siteStatus({
        enabled, live, lastPassAt: m?.lastPassAt, lastPassPages: m?.lastPassPages,
        lastPassProducts: m?.lastPassProducts, productCount: products,
      }),
      enabled,
      live,
      products,
      pctPrice: m?.pctPrice ?? base.pctPrice,
      matched: base.matched,
      progress: Math.max(0, Math.min(1, m?.harvestProgress ?? 0)),
      sweeps: m?.harvestSweeps ?? 0,
      lastEngine: m?.lastEngine,
      harvestBeatAt: m?.harvestBeatAt,
      updatedAt: m?.updatedAt,
      lastPassPages: m?.lastPassPages,
      lastPassProducts: m?.lastPassProducts,
    })
  }
  // Les désactivés en bas — ils ne participent plus à rien — puis ordre ALPHABÉTIQUE.
  // Un tri par activité ou par catalogue faisait sauter les cartes d'une position à
  // l'autre entre deux rafraîchissements : on ne retrouvait plus un site du regard. La
  // carte qui moissonne se repère à son halo vert, elle n'a pas besoin d'être en tête.
  // ⚠ Tri sur le nom AFFICHÉ (`www.` retiré) : sinon « www.cdiscount.com » se range à W.
  return rows.sort((a, b) =>
    Number(a.status === 'disabled') - Number(b.status === 'disabled')
    || displayDomain(a.domain).localeCompare(displayDomain(b.domain), 'fr'))
}

/** Compte des lignes par statut (pastilles de filtre de l'onglet Scraping). */
export function countByStatus(rows: ScrapeRow[]): Record<SiteStatus, number> {
  const out = { live: 0, error: 0, empty: 0, waiting: 0, directed: 0, ok: 0, never: 0, disabled: 0 }
  for (const r of rows) out[r.status] += 1
  return out
}
