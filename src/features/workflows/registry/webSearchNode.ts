// src/features/workflows/registry/webSearchNode.ts
// Node source « Recherche web » : interroge le web (Jina Search) sur une requête,
// lit réellement le contenu des premières pages de résultats, et produit :
//  - un `sheet` (tableau titre/url/description) exploitable en aval (transform, export…) ;
//  - un `text` (panorama + extraits des pages) à injecter dans un prompt ou afficher.
// Réutilise la récupération web générique (`@/features/scraping/webContext`), la même
// que le chat Telegram → une seule source de vérité pour l'accès web de l'app.
import { Search } from 'lucide-react'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import type { ExcelColumn, ExcelRow, ExcelSheet } from '@/features/excel/types'

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

function resultsToSheet(rows: Array<{ url: string; title?: string; description?: string }>): ExcelSheet {
  const columns: ExcelColumn[] = [
    { key: 'title', label: 'Titre', fieldType: 'text', detectedType: 'text', isPrimary: true, width: 280 },
    { key: 'url', label: 'URL', fieldType: 'url', detectedType: 'url', isPrimary: false, width: 320 },
    { key: 'description', label: 'Description', fieldType: 'text', detectedType: 'text', isPrimary: false, width: 360 },
  ]
  const excelRows: ExcelRow[] = rows.map((r, i) => ({
    _id: `web_${i}`,
    title: (r.title ?? '') as ExcelRow[string],
    url: r.url as ExcelRow[string],
    description: (r.description ?? '') as ExcelRow[string],
  }))
  return { name: 'Recherche web', columns, rows: excelRows, taxonomy: [] }
}

export const webSearchNode: NodeSpec<WebSearchConfig, WebSearchInputs, WebSearchOutputs> = {
  type: 'web-search',
  category: 'import',
  label: 'Recherche web',
  description:
    'Interroge le web (Jina) sur une requête et lit les premières pages de résultats. ' +
    'Produit un tableau (titre/url/description) et un texte de synthèse réutilisable en aval.',
  icon: Search,
  inputs: [{ name: 'query', type: 'any', required: false }],
  outputs: [
    { name: 'sheet', type: 'sheet' },
    { name: 'text', type: 'any' },
  ],
  configSchema: [
    { name: 'query', kind: 'text', label: 'Requête', required: true, help: 'Surchargée par une entrée « query » si branchée.' },
    { name: 'maxResults', kind: 'number', label: 'Nb de résultats', default: 5, help: '1 à 20.' },
    { name: 'readPages', kind: 'number', label: 'Pages lues en entier', default: 2, help: '0 à 5 — lit le contenu réel (données live).' },
  ],
  defaultConfig: { query: '', maxResults: 5, readPages: 2 },
  runtime: 'client',
  run: async (ctx, config, inputs) => {
    const upstream = typeof inputs.query === 'string' ? inputs.query.trim() : ''
    const query = upstream || (config.query ?? '').trim()
    if (!query) {
      throw new Error('Requête manquante — renseignez « Requête » ou branchez une entrée query.')
    }

    ctx.log('info', `🔎 Recherche web : « ${query} »…`)
    const { gatherWebContext } = await import('@/features/scraping/webContext')
    const ctxWeb = await gatherWebContext({
      searchQuery: query,
      maxResults: Number(config.maxResults) || 5,
      readPages: Number(config.readPages) || 0,
    })

    if (ctxWeb.results.length === 0) {
      ctx.log('warn', '⚠️ Aucun résultat (clé Jina absente, quota, ou recherche vide).')
    } else {
      ctx.log('info', `${ctxWeb.results.length} résultat(s), ${ctxWeb.sources.length} source(s) lue(s).`)
    }

    return { sheet: resultsToSheet(ctxWeb.results), text: ctxWeb.text }
  },
}

nodeRegistry.register(webSearchNode)
