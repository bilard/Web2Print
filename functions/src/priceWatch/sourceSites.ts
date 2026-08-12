// functions/src/priceWatch/sourceSites.ts
// Jumeau SERVEUR (headless/cron) du module pur `src/features/priceWatch/sourceSites.ts`.
// Résout la liste des sites concurrents : le port `sites` (node « Sites sources ») GAGNE,
// sinon repli sur la config locale (textarea + watchId). Émission/consommation identiques
// au client pour que le cron se comporte comme le run interactif.
import type { CompetitorSite, SiteEngine, SiteMode } from './helpers'
import { parseSitesConfig, stableId } from './helpers'
import { DEFAULT_WATCH_ID } from './paths'

export interface SourceSiteRow {
  domain: string
  fields?: string
  enabled: boolean
  engine?: string
  /** Site à prix connectés (identifiants en Firestore siteCredentials). */
  auth?: boolean
  /** Pages par run réservées à ce site (vide = part du budget commun). */
  pageBudget?: number
  /** 'harvest' | 'directed'. Vide = les deux canaux (comportement historique). */
  mode?: string
}

export interface SourceSitesPayload {
  watchId: string
  sites: CompetitorSite[]
}

const ENGINES: readonly SiteEngine[] = ['auto', 'jina', 'firecrawl', 'brightdata']
const MODES: readonly SiteMode[] = ['harvest', 'directed']

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
      ...(row.auth ? { auth: true } : {}),
      // ⚠ Ce champ manquait au jumeau serveur : le budget réservé d'un site (saisi dans
      // « Sites sources ») était perdu à la conversion, donc `splitPageBudget` ne voyait
      // AUCUN site explicite et partageait tout équitablement. Relevé en prod :
      // leroymerlin.fr réservé à 5 pages recevait 33 pages/tick (500 ÷ 15 sites) à
      // 13,5 s la page en Bright Data — 7,4 min de cycle mangées par un seul concurrent.
      ...(Number.isFinite(row.pageBudget) && (row.pageBudget as number) > 0
        ? { pageBudget: Math.floor(row.pageBudget as number) } : {}),
      ...(MODES.includes(row.mode as SiteMode) ? { mode: row.mode as SiteMode } : {}),
    })
  }
  return out
}

/**
 * Sites concernés par UN canal de relevé (jumeau serveur — cf. le module client pour le
 * détail). Un site sans `mode` est servi aux DEUX canaux ; le comparatif ne filtre jamais.
 */
export function sitesForRole<T extends { mode?: SiteMode }>(sites: T[], role: SiteMode): T[] {
  return sites.filter((s) => !s.mode || s.mode === role)
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
/**
 * Part d'un site SATURÉ : un catalogue dont un balayage entier n'a plus rien apporté.
 *
 * ⚠⚠ Mesuré une nuit entière : granit-parts.fr moissonnait 1 603 fiches par run pour ZÉRO
 * référence nouvelle, et progarden 5 571 pour zéro — chacun consommant 166 pages de budget
 * toutes les douze minutes pour réécrire ce qui existait déjà, pendant que swap-europe, lui,
 * progressait encore. Le budget est la ressource rare d'un tick de cron : il doit aller là
 * où il reste quelque chose à trouver.
 *
 * Un quart, pas zéro : les prix, eux, continuent de bouger, et un catalogue saturé en
 * NOMBRE de fiches doit rester rafraîchi. On ralentit, on n'abandonne pas.
 */
const SATURATED_SHARE = 0.25

/** Balayages complets sans gain avant de considérer un site saturé. Deux, pas un : un
 *  balayage peut finir à sec par hasard (fenêtre de run, panne passagère du site). */
export const SATURATED_AFTER_SWEEPS = 2

export function splitPageBudget(
  sites: { id: string; pageBudget?: number; saturatedSweeps?: number }[], totalBudget: number,
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
  // Répartition PONDÉRÉE : un site saturé ne prend qu'un quart de part, et ce qu'il laisse
  // revient aux autres. À parts égales, le site le plus stérile coûtait autant que celui
  // qui découvrait encore des milliers de fiches.
  const weightOf = (s: { saturatedSweeps?: number }) =>
    (s.saturatedSweeps ?? 0) >= SATURATED_AFTER_SWEEPS ? SATURATED_SHARE : 1
  const totalWeight = shared.reduce((n, s) => n + weightOf(s), 0)
  for (const s of shared) {
    out.set(s.id, totalWeight > 0 ? Math.max(1, Math.floor((rest * weightOf(s)) / totalWeight)) : 0)
  }
  return out
}
