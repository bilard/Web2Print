// Logique pure du node « Sites sources » : la liste des sites concurrents vit dans UN
// node qui l'émet sur un port ; « Moisson concurrents » et « Comparer catalogue » la
// consomment via l'edge (priorité) ou retombent sur leur config locale (rétrocompat).
// Aucune dépendance Firebase/React — tout est testable unitairement.
import type { CompetitorSite, SiteEngine, SiteMode } from './types'
import { parseSitesConfig, stableId } from './core'
import { DEFAULT_WATCH_ID } from './paths'
import type { TranslationKey } from '@/lib/i18n'

/** Ligne de config du node « Sites sources » (JSON-sérialisable dans le workflow). */
export interface SourceSiteRow {
  domain: string
  /** Champs à scraper, séparés par des virgules (même format que « | price, stock »). */
  fields?: string
  enabled: boolean
  /** 'auto' (défaut) | 'jina' | 'firecrawl' | 'brightdata'. Un moteur retiré depuis
   *  (ex. 'browseract') n'est plus reconnu → le site retombe sur 'auto'. */
  engine?: string
  /** Site à prix connectés : identifiants saisis dans l'UI, stockés en Firestore. */
  auth?: boolean
  /** Pages par run réservées à ce site (vide = part du budget commun). */
  pageBudget?: number
  /** 'harvest' | 'directed'. Vide = les deux canaux (comportement historique). */
  mode?: string
}

/** Payload émis sur le port `sites` : identité du suivi + sites ACTIFS uniquement. */
export interface SourceSitesPayload {
  watchId: string
  sites: CompetitorSite[]
}

const ENGINES: readonly SiteEngine[] = ['auto', 'jina', 'firecrawl', 'brightdata']
const MODES: readonly SiteMode[] = ['harvest', 'directed']

/** Nettoie une saisie de domaine (mêmes règles que parseSitesConfig). */
export function normalizeDomain(raw: string): string {
  return raw.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
}

/** Convertit les lignes de config en sites concurrents : actifs seulement, dédupliqués. */
export function rowsToCompetitorSites(rows: SourceSiteRow[]): CompetitorSite[] {
  const out: CompetitorSite[] = []
  const seen = new Set<string>()
  for (const row of rows ?? []) {
    if (!row?.enabled) continue
    const domain = normalizeDomain(row.domain ?? '')
    if (!domain) continue
    const id = stableId(domain)
    if (seen.has(id)) continue
    seen.add(id)
    const fields = (row.fields ?? '').split(',').map((f) => f.trim()).filter(Boolean)
    const engine = ENGINES.includes(row.engine as SiteEngine) ? (row.engine as SiteEngine) : undefined
    out.push({
      id, domain,
      fields: fields.length ? fields : ['price'],
      ...(engine && engine !== 'auto' ? { engine } : {}),
      ...(row.auth ? { auth: true } : {}),
      ...(Number.isFinite(row.pageBudget) && (row.pageBudget as number) > 0
        ? { pageBudget: Math.floor(row.pageBudget as number) } : {}),
      ...(MODES.includes(row.mode as SiteMode) ? { mode: row.mode as SiteMode } : {}),
    })
  }
  return out
}

/** Garde runtime : la valeur reçue sur le port est-elle un payload « Sites sources » ? */
export function isSourceSitesPayload(v: unknown): v is SourceSitesPayload {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return typeof o.watchId === 'string' && o.watchId.length > 0 && Array.isArray(o.sites)
}

/** Reproduit la dérivation du watchId des nodes de veille (config sinon id workflow). */
export function deriveWatchId(configWatchId: string, workflowId: string | undefined): string {
  return stableId((configWatchId || '').trim() || workflowId || DEFAULT_WATCH_ID)
}

/**
 * Fenêtre du battement de moisson (`harvestBeatAt`) au-delà de laquelle un site n'est plus
 * « en cours ». UNIQUE pour toute l'appli : l'app et la PWA radarPrice ont affiché des
 * comptes contradictoires (« 0 en cours » ici, « 2 en cours » là) tant qu'elles avaient
 * chacune la leur. Large (3 min) car le battement n'est écrit que toutes les ~15 pages :
 * plus court, un site lent clignoterait entre deux passes.
 */
export const HARVEST_LIVE_WINDOW_MS = 3 * 60_000

/** Statut d'un site dérivé de ses stats, pour le tri et l'affichage. Ordre = priorité
 *  d'attention (le plus urgent en premier). */
export type SiteStatus = 'live' | 'error' | 'empty' | 'waiting' | 'ok' | 'never' | 'disabled'

const STATUS_RANK: Record<SiteStatus, number> = {
  live: 0, error: 1, empty: 2, waiting: 3, ok: 4, never: 5, disabled: 6,
}

export interface SiteStatusInput {
  enabled: boolean
  live: boolean
  lastPassAt?: number
  lastPassPages?: number
  lastPassProducts?: number
  /** Dernière fois que le MODE CYCLE a mis ce site en attente (balayage terminé, on
   *  patiente que les retardataires finissent avant de rouvrir un cycle pour tous). */
  cycleWaitingAt?: number
  /** Fiches déjà indexées pour ce site. Preuve qu'il A ÉTÉ collecté, même si le verdict
   *  de dernière passe manque (méta écrite par une version antérieure, ou passe purgée). */
  productCount?: number
}

/** Statut courant d'un site (fonction pure). Un site désactivé est 'disabled' quel que
 *  soit son historique ; sinon : en cours > échec (0 page) > sans produit > OK > jamais. */
export function siteStatus(s: SiteStatusInput): SiteStatus {
  if (!s.enabled) return 'disabled'
  if (s.live) return 'live'
  // « Jamais scrapé » seulement si RIEN ne prouve le contraire : un site affichant
  // 14 003 fiches et 23 balayages complets a évidemment été collecté, même sans verdict
  // de dernière passe. La contradiction « jamais scrapé · fiches 14 003 · scrape 5 h »
  // décrédibilise tout le tableau.
  if (s.lastPassAt == null) return (s.productCount ?? 0) > 0 ? 'ok' : 'never'
  // ⚠ EN ATTENTE avant tout verdict de contenu : en mode cycle, un site dont le balayage
  // est terminé est SAUTÉ à chaque passe jusqu'à ce que les retardataires finissent. Sans
  // ce statut, il affichait « OK » avec un horodatage vieux de plusieurs jours — on ne
  // pouvait pas distinguer « attend son tour » de « ne se lance plus ». Le marqueur est
  // postérieur à la dernière passe RÉELLE : dès qu'il moissonne, il repasse en OK.
  if ((s.cycleWaitingAt ?? 0) > s.lastPassAt) return 'waiting'
  if ((s.lastPassPages ?? 0) === 0) return 'error'
  if ((s.lastPassProducts ?? 0) === 0) return 'empty'
  return 'ok'
}

export function siteStatusRank(status: SiteStatus): number {
  return STATUS_RANK[status]
}

/** Libellé + tonalité + pastille de chaque statut, pour un affichage LISIBLE sans
 *  survol (badge de ligne + bilan d'en-tête partagent cette source unique). */
// ⚠️ CLÉS, pas `t()` : objet évalué au chargement du module.
export const SITE_STATUS_META: Record<SiteStatus, { labelKey: TranslationKey; shortKey: TranslationKey; icon: string; tone: 'ok' | 'warn' | 'err' | 'mute' }> = {
  live:     { labelKey: 'pw.site.live',    shortKey: 'pw.site.liveShort',    icon: '●', tone: 'ok' },
  ok:       { labelKey: 'pw.site.ok',      shortKey: 'pw.site.ok',           icon: '✓', tone: 'ok' },
  empty:    { labelKey: 'pw.site.empty',   shortKey: 'pw.site.emptyShort',   icon: '⚠', tone: 'warn' },
  waiting:  { labelKey: 'pw.site.waiting', shortKey: 'pw.site.waitingShort', icon: '⏸', tone: 'mute' },
  error:    { labelKey: 'pw.site.error',   shortKey: 'pw.site.errorShort',   icon: '✗', tone: 'err' },
  never:    { labelKey: 'pw.site.never',   shortKey: 'pw.site.neverShort',   icon: '○', tone: 'mute' },
  disabled: { labelKey: 'pw.tail.disabled', shortKey: 'pw.tail.disabledShort', icon: '—', tone: 'mute' },
}

export interface ResolvedSites {
  watchId: string
  sites: CompetitorSite[]
  /** true si la liste vient du port (node « Sites sources » branché). */
  fromPort: boolean
}

/**
 * Résout sites + watchId pour un node consommateur : le payload du port GAGNE
 * (sites ET watchId — supprime le footgun « watchId à l'octet près ») ; sinon
 * repli sur la config locale historique (textarea + champ watchId).
 */
export function resolveSitesInput(
  input: unknown,
  fallback: { sitesText: string; watchIdRaw: string; workflowId: string | undefined },
): ResolvedSites {
  if (isSourceSitesPayload(input)) {
    return { watchId: input.watchId, sites: input.sites, fromPort: true }
  }
  return {
    watchId: deriveWatchId(fallback.watchIdRaw, fallback.workflowId),
    sites: parseSitesConfig(fallback.sitesText),
    fromPort: false,
  }
}

/**
 * Sites concernés par UN canal de relevé. Le node « Sites sources » alimente à la fois
 * la moisson, la recherche dirigée et le comparatif : sans ce filtre, un généraliste
 * ajouté pour la recherche dirigée était AUSSI balayé par catégories. Relevé en prod :
 * leroymerlin.fr faisait moissonner 250 catégories de salle de bains face à un catalogue
 * de pièces de motoculture — 32 min de Bright Data pour 14 produits indexés.
 *
 * Un site sans `mode` reste servi aux DEUX canaux (rétrocompatibilité : toutes les
 * configs existantes fonctionnent à l'identique). Le comparatif, lui, ne filtre jamais —
 * il lit l'index, quelle que soit la façon dont il a été alimenté.
 */
export function sitesForRole<T extends { mode?: SiteMode }>(sites: T[], role: SiteMode): T[] {
  return sites.filter((s) => !s.mode || s.mode === role)
}

/**
 * Importe une liste collée (« un site par ligne », format textarea historique) dans
 * les lignes existantes. Les lignes déjà présentes gardent leur état (enabled,
 * moteur) ; les nouvelles arrivent activées.
 */
export function importSitesIntoRows(text: string, existing: SourceSiteRow[]): SourceSiteRow[] {
  const known = new Set(existing.map((r) => stableId(normalizeDomain(r.domain))))
  const added: SourceSiteRow[] = []
  for (const site of parseSitesConfig(text)) {
    if (known.has(site.id)) continue
    known.add(site.id)
    const fields = (site.fields ?? []).join(', ')
    added.push({ domain: site.domain, enabled: true, ...(fields && fields !== 'price' ? { fields } : {}) })
  }
  return [...existing, ...added]
}

/**
 * Répartit le budget de pages d'un run entre les sites. Un site qui déclare son propre
 * `pageBudget` est servi EN PREMIER et à sa valeur exacte ; le reste du budget est partagé
 * équitablement entre les autres. Sans cette réservation, un concurrent coûteux
 * (Bright Data, facturé à la requête) recevait la même part qu'un site gratuit.
 *
 * Garde-fous : au moins 1 page par site (sinon un site ne serait jamais visité), et les
 * budgets explicites ne sont PAS rognés quand ils dépassent le total — c'est un choix
 * assumé de l'utilisateur, on ne le contredit pas en silence.
 */
export function splitPageBudget(
  sites: { id: string; pageBudget?: number }[], totalBudget: number,
): Map<string, number> {
  const out = new Map<string, number>()
  const total = Math.max(1, Math.floor(totalBudget))
  const explicit = sites.filter((s) => Number.isFinite(s.pageBudget) && (s.pageBudget as number) > 0)
  const shared = sites.filter((s) => !explicit.includes(s))
  let reserved = 0
  for (const s of explicit) {
    const b = Math.max(1, Math.floor(s.pageBudget as number))
    out.set(s.id, b)
    reserved += b
  }
  const rest = Math.max(0, total - reserved)
  const per = shared.length > 0 ? Math.max(1, Math.floor(rest / shared.length)) : 0
  for (const s of shared) out.set(s.id, per)
  return out
}
