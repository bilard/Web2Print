// src/features/priceWatch/sourceSites.ts
// Logique pure du node « Sites sources » : la liste des sites concurrents vit dans UN
// node qui l'émet sur un port ; « Moisson concurrents » et « Comparer catalogue » la
// consomment via l'edge (priorité) ou retombent sur leur config locale (rétrocompat).
// Aucune dépendance Firebase/React — tout est testable unitairement.
import type { CompetitorSite, SiteEngine } from './types'
import { parseSitesConfig, stableId } from './core'
import { DEFAULT_WATCH_ID } from './paths'

/** Ligne de config du node « Sites sources » (JSON-sérialisable dans le workflow). */
export interface SourceSiteRow {
  domain: string
  /** Champs à scraper, séparés par des virgules (même format que « | price, stock »). */
  fields?: string
  enabled: boolean
  /** 'auto' (défaut) | 'jina' | 'firecrawl' | 'brightdata'. */
  engine?: string
  /** Site à prix connectés : identifiants saisis dans l'UI, stockés en Firestore. */
  auth?: boolean
}

/** Payload émis sur le port `sites` : identité du suivi + sites ACTIFS uniquement. */
export interface SourceSitesPayload {
  watchId: string
  sites: CompetitorSite[]
}

const ENGINES: readonly SiteEngine[] = ['auto', 'jina', 'firecrawl', 'brightdata']

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
export type SiteStatus = 'live' | 'error' | 'empty' | 'ok' | 'never' | 'disabled'

const STATUS_RANK: Record<SiteStatus, number> = {
  live: 0, error: 1, empty: 2, ok: 3, never: 4, disabled: 5,
}

export interface SiteStatusInput {
  enabled: boolean
  live: boolean
  lastPassAt?: number
  lastPassPages?: number
  lastPassProducts?: number
}

/** Statut courant d'un site (fonction pure). Un site désactivé est 'disabled' quel que
 *  soit son historique ; sinon : en cours > échec (0 page) > sans produit > OK > jamais. */
export function siteStatus(s: SiteStatusInput): SiteStatus {
  if (!s.enabled) return 'disabled'
  if (s.live) return 'live'
  if (s.lastPassAt == null) return 'never'
  if ((s.lastPassPages ?? 0) === 0) return 'error'
  if ((s.lastPassProducts ?? 0) === 0) return 'empty'
  return 'ok'
}

export function siteStatusRank(status: SiteStatus): number {
  return STATUS_RANK[status]
}

/** Libellé + tonalité + pastille de chaque statut, pour un affichage LISIBLE sans
 *  survol (badge de ligne + bilan d'en-tête partagent cette source unique). */
export const SITE_STATUS_META: Record<SiteStatus, { label: string; short: string; icon: string; tone: 'ok' | 'warn' | 'err' | 'mute' }> = {
  live:     { label: 'En cours',     short: 'en cours',     icon: '●', tone: 'ok' },
  ok:       { label: 'OK',           short: 'OK',           icon: '✓', tone: 'ok' },
  empty:    { label: 'Sans produit', short: 'sans produit', icon: '⚠', tone: 'warn' },
  error:    { label: 'Sans catalogue', short: 'sans catalogue', icon: '✗', tone: 'err' },
  never:    { label: 'Jamais',       short: 'jamais',       icon: '○', tone: 'mute' },
  disabled: { label: 'Désactivé',    short: 'désactivés',   icon: '—', tone: 'mute' },
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
