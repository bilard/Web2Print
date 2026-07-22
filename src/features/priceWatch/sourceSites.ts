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
  /** 'auto' (défaut) | 'jina' | 'brightdata'. */
  engine?: string
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
