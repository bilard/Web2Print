import { Sparkles } from 'lucide-react'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
// `run()` n'est pas un composant : helper `t()` de module (lit la locale courante).
import { t } from '@/lib/i18n'
// enrichRow tire le moteur PIM (useProductEnrichment ~156 Ko + Jina + LLM) : chargé
// dynamiquement dans run pour ne pas cascader à l'ouverture de la page Workflows.

interface EnrichConfig {
  urlColumn: string
  fields: string  // comma-separated list of columns to enrich
}

interface EnrichInputs {
  sheet: { rows?: Array<Record<string, unknown>>; [key: string]: unknown } | null
}

const enrichmentNode: NodeSpec<
  EnrichConfig,
  EnrichInputs,
  { sheet: unknown; assets: unknown[] }
> = {
  type: 'enrichment',
  category: 'enrichment',
  labelKey: 'node.enrichment.label',
  descriptionKey: 'node.enrichment.desc',
  icon: Sparkles,
  inputs: [{ name: 'sheet', type: 'sheet', required: true }],
  outputs: [
    { name: 'sheet', type: 'sheet' },
    { name: 'assets', type: 'asset[]' },
  ],
  configSchema: [
    { name: 'urlColumn', kind: 'text', label: 'Colonne URL', default: 'url', required: true },
    { name: 'fields', kind: 'text', label: 'Colonnes à enrichir (séparées par virgule)', default: 'title,description,price', required: true },
  ],
  defaultConfig: { urlColumn: 'url', fields: 'title,description,price' },
  runtime: 'client',
  run: async (ctx, config, inputs) => {
    const sheet = inputs.sheet
    const rows = (sheet?.rows ?? []) as Array<Record<string, unknown>>
    const fields = config.fields.split(',').map((s) => s.trim()).filter(Boolean)
    const collectedAssets: unknown[] = []
    const enrichedRows: Record<string, unknown>[] = []
    const { enrichRow } = await import('@/features/excel/ai-enrichment/enrichRow')
    for (const row of rows) {
      if (ctx.signal.aborted) break
      const url = row[config.urlColumn]
      if (typeof url !== 'string' || !url) {
        enrichedRows.push(row)
        continue
      }
      ctx.log('info', t('run.net.enriching', { url }))
      try {
        const result = await enrichRow({
          url,
          targetFields: fields,
          signal: ctx.signal,
          log: (msg) => ctx.log('info', msg),
        })
        enrichedRows.push({ ...row, ...result.fields })
        collectedAssets.push(...(result.assets ?? []))
      } catch (err) {
        ctx.log('error', t('run.net.scrapeFailed', { url, message: err instanceof Error ? err.message : String(err) }))
        enrichedRows.push(row)
      }
    }
    return { sheet: { ...sheet, rows: enrichedRows }, assets: collectedAssets }
  },
}

nodeRegistry.register(enrichmentNode)
