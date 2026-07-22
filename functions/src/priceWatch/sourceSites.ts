// functions/src/priceWatch/sourceSites.ts
// Jumeau SERVEUR (headless/cron) du module pur `src/features/priceWatch/sourceSites.ts`.
// Résout la liste des sites concurrents : le port `sites` (node « Sites sources ») GAGNE,
// sinon repli sur la config locale (textarea + watchId). Émission/consommation identiques
// au client pour que le cron se comporte comme le run interactif.
import type { CompetitorSite, SiteEngine } from './helpers'
import { parseSitesConfig, stableId } from './helpers'
import { DEFAULT_WATCH_ID } from './paths'

export interface SourceSiteRow {
  domain: string
  fields?: string
  enabled: boolean
  engine?: string
}

export interface SourceSitesPayload {
  watchId: string
  sites: CompetitorSite[]
}

const ENGINES: readonly SiteEngine[] = ['auto', 'jina', 'firecrawl', 'brightdata']

export function normalizeDomain(raw: string): string {
  return (raw ?? '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
}

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
      ...((row as { auth?: boolean }).auth ? { auth: true } : {}),
    })
  }
  return out
}

export function isSourceSitesPayload(v: unknown): v is SourceSitesPayload {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return typeof o.watchId === 'string' && o.watchId.length > 0 && Array.isArray(o.sites)
}

export function deriveWatchId(configWatchId: string, workflowId: string | undefined): string {
  return stableId((configWatchId || '').trim() || workflowId || DEFAULT_WATCH_ID)
}

export interface ResolvedSites {
  watchId: string
  sites: CompetitorSite[]
  fromPort: boolean
}

/** Le port `sites` GAGNE (sites ET watchId) ; sinon repli config locale (textarea + watchId). */
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
