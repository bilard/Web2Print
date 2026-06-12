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
  /** 'product' = fiche produit unique ; 'listing' = page multi-produits
   *  (catégorie, recherche interne, guide…) — affichée mais non pré-cochée. */
  pageType: 'product' | 'listing'
  /** Prix de vente repéré dans le snippet (titre/description) — indicatif,
   *  le prix fiable vient du scrape « Produit complet ». */
  price?: string
}

/** Extrait un prix du snippet de résultat (titre + description). Formats
 *  gérés : « 1 234,56 € », « 299€ », « 299.99 EUR », « € 299 ». Pur — testable. */
export function parseSnippetPrice(...texts: Array<string | undefined>): string | undefined {
  const text = texts.filter(Boolean).join(' ')
  const num = '\\d{1,3}(?:[ \\u00a0\\u202f.]\\d{3})*(?:[.,]\\d{1,2})?'
  // Seuils non-prix : « livraison offerte dès 30€ », « frais de port dès 5€ »…
  const isThreshold = (idx: number) =>
    /livraison|frais de port|port offert|offerte?\s+d[eè]s/i.test(text.slice(Math.max(0, idx - 40), idx))
  for (const re of [new RegExp(`(${num})\\s?(?:€|EUR\\b)`, 'gi'), new RegExp(`€\\s?(${num})`, 'g')]) {
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      if (!isThreshold(m.index)) return `${m[1].replace(/[\u00a0\u202f]/g, ' ')} €`
    }
  }
  return undefined
}

/** Hôtes bruit : communauté, SAV, forum, blog… — jamais des fiches produit. */
const NOISY_HOST_RE = /(^|[.-])(communaute|community|forum|blog|sav|aide|support|avis|conseil|conseils|magazine|news)([.-]|$)/i

/** Classifie une URL de résultat : fiche produit unique ou page multi-produits.
 *  Heuristiques génériques (structure d'URL + titre), AUCUNE règle par enseigne. */
export function classifyResultPage(url: string, title?: string): 'product' | 'listing' {
  if (title && (/(\||-|–)\s*page\s+\d+/i.test(title) || /^(tous|toutes) les |^(les )?meilleur|^choisir |^comparatif|^guide |^que valent/i.test(title))) {
    return 'listing'
  }
  let u: URL
  try { u = new URL(url) } catch { return 'listing' }
  // Pagination / recherche interne / tri en query string → liste
  if (/[?&](p|page|q|query|search|tri|sort|filter)=/i.test(u.search)) return 'listing'
  const path = u.pathname
  // Signaux forts de fiche produit : slug terminé par une référence numérique,
  // segment dédié produit, ou identifiant hexadécimal long
  if (/-\d{4,}(\.html?)?\/?$/i.test(path)) return 'product'
  if (/\/(p|dp|product|produit|fiche|item|sku|art|ref)\//i.test(path)) return 'product'
  if (/[0-9a-f]{12,}/i.test(path)) return 'product'
  // Segments catégoriels explicites
  if (/\/(c|cat|category|categorie|categories|rayon|univers|marque|marques|brand|brands|vb|search|recherche|l|liste)\//i.test(path + '/')) return 'listing'
  const segments = path.split('/').filter(Boolean)
  // Arborescence profonde sans référence = navigation par catégories
  if (segments.length >= 4) return 'listing'
  // Slug final long et descriptif (≥ 4 tirets) = nom de produit probable
  if (((segments[segments.length - 1] ?? '').match(/-/g)?.length ?? 0) >= 4) return 'product'
  return 'listing'
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

const ImprovedPromptSchema = z.object({ improved: z.string() })

const IMPROVED_SCHEMA_FOR_LLM = {
  type: 'object',
  properties: {
    improved: {
      type: 'string',
      description:
        'La demande de recherche réécrite : sujet produit précis (type, marque, caractéristiques), ' +
        'enseignes/sites explicites, champs de données attendus listés clairement. En français.',
    },
  },
  required: ['improved'],
}

/** Réécrit le prompt de recherche de l'utilisateur en version optimale via le
 *  LLM actif (cascade). Conserve toutes les contraintes, n'invente rien. */
export async function improveSearchPrompt(prompt: string): Promise<string> {
  const raw = await generateJson<z.infer<typeof ImprovedPromptSchema>>({
    task: 'web.searchPlan',
    version: 'web.searchPlan.improve.v1',
    prompt:
      'Réécris la demande de recherche produit ci-dessous pour qu\'elle soit optimale pour un ' +
      'pipeline de scraping e-commerce :\n' +
      '- sujet produit précis et sans ambiguïté (type, marque, caractéristiques techniques)\n' +
      '- enseignes/sites marchands explicitement nommés s\'ils sont mentionnés ou clairement implicites\n' +
      '- champs de données attendus listés clairement (prix, promo, EAN, référence…)\n' +
      'CONSERVE toutes les contraintes de l\'utilisateur, n\'invente NI site NI champ non demandés. ' +
      'Reste concis (1 à 3 lignes), en français.\n\n' +
      `Demande : ${prompt}`,
    schema: ImprovedPromptSchema,
    schemaForLLM: IMPROVED_SCHEMA_FOR_LLM as unknown as Record<string, unknown>,
  })
  return raw.improved.trim() || prompt
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
  const lanes = perQuery.map(({ site, results }) => {
    const lane = results
      .filter((r) => !isJunkUrl(r.url))
      .filter((r) => {
        try {
          const host = new URL(r.url).hostname.toLowerCase().replace(/^www\./, '')
          if (NOISY_HOST_RE.test(host)) return false
          if (!site) return true
          return host === site || host.endsWith('.' + site)
        } catch { return false }
      })
      .map((r): PlannedSearchResult => ({
        ...r,
        onTarget: hasTargets && !!site,
        pageType: classifyResultPage(r.url, r.title),
        price: parseSnippetPrice(r.title, r.description),
      }))
    // Fiches produit d'abord — les pages liste passent en fin de lane (tri stable)
    return [...lane.filter((r) => r.pageType === 'product'), ...lane.filter((r) => r.pageType === 'listing')]
  })
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
