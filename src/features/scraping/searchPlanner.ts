import { z } from 'zod'
import { generateJson } from '@/features/ai/llmRouter'
import { jinaSearch, isJunkUrl, type SearchResult } from '@/features/excel/ai-enrichment/useProductEnrichment'

/**
 * Planificateur de recherche de l'onglet « Recherche » du scraping.
 *
 * Au lieu d'envoyer le prompt brut au moteur de recherche (qui remonte alors
 * Facebook/Reddit/YouTube), un LLM interprète l'intention :
 *  - le sujet produit (« tondeuse Honda électrique »)
 *  - les enseignes/sites explicitement demandés (« chez LeroyMerlin, Castorama… »)
 *  - les champs attendus (prix, EAN, référence…)
 * puis génère une requête `site:domaine` PAR enseigne. Chaque requête est
 * exécutée séparément, les résultats sont fusionnés, dédupliqués et filtrés.
 */

export interface SearchPlanQuery {
  /** Requête envoyée au moteur (ex: `site:leroymerlin.fr tondeuse Honda électrique`). */
  query: string
  /** Domaine ciblé par la requête (ex: `leroymerlin.fr`) — vide pour une requête générique. */
  site?: string
}

export interface SearchPlan {
  /** Sujet produit condensé extrait du prompt. */
  subject: string
  /** Requêtes à exécuter (1 par site demandé + éventuelle générique). */
  queries: SearchPlanQuery[]
  /** Champs de données demandés par l'utilisateur (prix, EAN…) — affichage UI. */
  wantedFields: string[]
}

export interface PlannedSearchResult extends SearchResult {
  /** True si le résultat provient d'un des sites explicitement demandés. */
  onTarget: boolean
}

const PlanSchema = z.object({
  subject: z.string(),
  sites: z.array(z.string()),
  wantedFields: z.array(z.string()),
})

const PLAN_SCHEMA_FOR_LLM = {
  type: 'object',
  properties: {
    subject: {
      type: 'string',
      description:
        'Le sujet de la recherche condensé en mots-clés efficaces pour un moteur de recherche ' +
        '(produit, marque, caractéristiques). Ex: "tondeuse Honda électrique batterie". ' +
        "Exclure les enseignes et les champs de données demandés (prix, EAN…) — ils n'aident pas à trouver la page.",
    },
    sites: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Domaines des sites/enseignes EXPLICITEMENT demandés par l\'utilisateur, en domaine réel ' +
        '(ex: "LeroyMerlin"→"leroymerlin.fr", "Castorama"→"castorama.fr", "jardiland"→"jardiland.com"). ' +
        'Tableau vide si aucun site précis n\'est demandé.',
    },
    wantedFields: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Champs de données que l\'utilisateur veut récupérer (ex: "prix de vente", "promo", "EAN", ' +
        '"référence"). Tableau vide si non précisé.',
    },
  },
  required: ['subject', 'sites', 'wantedFields'],
}

/** Construit les requêtes finales à partir du plan brut du LLM. Pur — testable. */
export function buildQueries(subject: string, sites: string[]): SearchPlanQuery[] {
  const cleanSubject = subject.trim()
  const cleanSites = sites.map((s) => s.trim().toLowerCase().replace(/^www\./, '')).filter(Boolean)
  if (cleanSites.length === 0) return [{ query: cleanSubject }]
  return cleanSites.map((site) => ({ query: `site:${site} ${cleanSubject}`, site }))
}

/** Interprète le prompt utilisateur en plan de recherche. Fallback : requête brute. */
async function planSearch(prompt: string): Promise<SearchPlan> {
  try {
    const raw = await generateJson<z.infer<typeof PlanSchema>>({
      task: 'web.searchPlan',
      version: 'web.searchPlan.v1',
      prompt:
        'Tu prépares une recherche web pour trouver des FICHES PRODUIT e-commerce à scraper.\n' +
        "Analyse la demande de l'utilisateur ci-dessous et extrais :\n" +
        '- subject : les mots-clés produit pour le moteur de recherche\n' +
        '- sites : les domaines réels des enseignes explicitement citées (déduis le vrai domaine ' +
        'du site marchand français de chaque enseigne ; tableau vide si aucune)\n' +
        '- wantedFields : les données que l\'utilisateur veut extraire des pages\n\n' +
        `Demande : ${prompt}`,
      schema: PlanSchema,
      schemaForLLM: PLAN_SCHEMA_FOR_LLM as unknown as Record<string, unknown>,
    })
    const queries = buildQueries(raw.subject || prompt, raw.sites)
    return { subject: raw.subject || prompt, queries, wantedFields: raw.wantedFields }
  } catch (err) {
    console.warn('[search-planner] LLM indisponible — requête brute', err)
    return { subject: prompt, queries: [{ query: prompt }], wantedFields: [] }
  }
}

/** Fusionne les résultats par requête : dédup URL, filtre junk, marque les cibles,
 *  équilibre site par site (round-robin) puis tronque à `limit`. Pur — testable. */
export function mergePlannedResults(
  perQuery: Array<{ site?: string; results: SearchResult[] }>,
  limit: number,
): PlannedSearchResult[] {
  const hasTargets = perQuery.some((q) => q.site)
  const seen = new Set<string>()
  const lanes = perQuery.map(({ site, results }) =>
    results
      .filter((r) => !isJunkUrl(r.url))
      .filter((r) => {
        if (!site) return true
        try {
          const host = new URL(r.url).hostname.toLowerCase().replace(/^www\./, '')
          return host === site || host.endsWith('.' + site)
        } catch { return false }
      })
      .map((r): PlannedSearchResult => ({ ...r, onTarget: hasTargets && !!site })),
  )
  const merged: PlannedSearchResult[] = []
  for (let i = 0; merged.length < limit; i++) {
    let added = false
    for (const lane of lanes) {
      const r = lane[i]
      if (!r || seen.has(r.url)) { if (r) added = true; continue }
      seen.add(r.url)
      merged.push(r)
      added = true
      if (merged.length >= limit) break
    }
    if (!added) break
  }
  return merged
}

/** Plan + exécution : 1 recherche Jina par requête, fusion équilibrée. */
export async function runPlannedSearch(
  prompt: string,
  limit: number,
): Promise<{ plan: SearchPlan; results: PlannedSearchResult[] }> {
  const plan = await planSearch(prompt)
  // Marge par requête : le filtrage junk/hors-site va en éliminer une partie.
  const perQueryLimit = Math.max(4, Math.ceil((limit * 1.5) / plan.queries.length))
  const perQuery = await Promise.all(
    plan.queries.map(async (q) => {
      try {
        return { site: q.site, results: await jinaSearch(q.query, perQueryLimit) }
      } catch (err) {
        console.warn('[search-planner] recherche échouée pour', q.query, err)
        return { site: q.site, results: [] }
      }
    }),
  )
  return { plan, results: mergePlannedResults(perQuery, limit) }
}
