// Node source « Recherche web » : interroge le web (Jina Search) sur une requête,
// lit réellement le contenu des premières pages de résultats, et produit :
//  - un `sheet` (tableau titre/url/description) exploitable en aval (transform, export…) ;
//  - un `text` (panorama + extraits des pages) à injecter dans un prompt ou afficher.
// Réutilise la récupération web générique (`@/features/scraping/webContext`), la même
// que le chat Telegram → une seule source de vérité pour l'accès web de l'app.
import { Search } from 'lucide-react'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import type { ExcelSheet } from '@/features/excel/types'
import { webResultsToSheet } from './webResultsSheet'
// `run()` n'est pas un composant : helper `t()` de module (lit la locale courante).
import { t } from '@/lib/i18n'

interface WebSearchConfig {
  /** Requête de recherche. Peut être surchargée par une entrée `query` en amont. */
  query: string
  /** Nb max de résultats (1-20). */
  maxResults: number
  /** Nb de pages de résultats dont on lit le contenu complet (0-5). */
  readPages: number
}

interface WebSearchInputs {
  /** Texte amont (ex. node Saisie texte) utilisé comme requête s'il est fourni. */
  query?: unknown
}

interface WebSearchOutputs {
  sheet: ExcelSheet
  text: string
}

export const webSearchNode: NodeSpec<WebSearchConfig, WebSearchInputs, WebSearchOutputs> = {
  type: 'web-search',
  hidden: true,
  category: 'import',
  labelKey: 'node.web-search.label',
  descriptionKey: 'node.web-search.desc',
  icon: Search,
  inputs: [{ name: 'query', type: 'any', required: false }],
  outputs: [
    { name: 'sheet', type: 'sheet' },
    { name: 'text', type: 'any' },
  ],
  configSchema: [
    { name: 'query', kind: 'text', labelKey: 'node.web-search.query.label', required: true, helpKey: 'node.web-search.query.help' },
    { name: 'maxResults', kind: 'number', labelKey: 'node.web.maxResults.label', default: 5, helpKey: 'node.web.maxResults.help' },
    { name: 'readPages', kind: 'number', labelKey: 'node.web.readPages.label', default: 2, helpKey: 'node.web.readPages.help' },
  ],
  defaultConfig: { query: '', maxResults: 5, readPages: 2 },
  runtime: 'client',
  run: async (ctx, config, inputs) => {
    const upstream = typeof inputs.query === 'string' ? inputs.query.trim() : ''
    const query = upstream || (config.query ?? '').trim()
    if (!query) {
      throw new Error(t('run.net.queryMissing'))
    }

    ctx.log('info', t('run.net.searchingIcon', { query }))
    const { gatherWebContext } = await import('@/features/scraping/webContext')
    const ctxWeb = await gatherWebContext({
      searchQuery: query,
      maxResults: Number(config.maxResults) || 5,
      readPages: Number(config.readPages) || 0,
    })

    if (ctxWeb.results.length === 0) {
      ctx.log('warn', t('run.net.noResult'))
    } else {
      ctx.log('info', t('run.net.resultsSources', { count: ctxWeb.results.length, sources: ctxWeb.sources.length }))
    }

    return { sheet: webResultsToSheet(ctxWeb.results), text: ctxWeb.text }
  },
}

nodeRegistry.register(webSearchNode)
