// src/features/workflows/registry/scrapeNodes.ts
import { Globe } from 'lucide-react'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import { enrichRow } from '@/features/excel/ai-enrichment/enrichRow'
import { FIELD_TEMPLATES } from '@/features/scraping/useJina'
import type { ExcelColumn, ExcelRow, ExcelSheet } from '@/features/excel/types'

interface ScrapeUrlConfig {
  /** URL à scraper, ou plusieurs URLs séparées par retours à la ligne / virgules. */
  urls: string
  /** Template de champs (clé de FIELD_TEMPLATES) ou `custom`. */
  template: string
  /** Liste de champs custom (séparés par virgule), utilisée si template = `custom`. */
  customFields: string
  /** Modèle LLM. */
  model: string
}

interface ScrapeUrlAsset {
  url: string
  type: 'image' | 'pdf' | 'video' | 'other'
}

interface ScrapeUrlOutputs {
  sheet: ExcelSheet
  assets: ScrapeUrlAsset[]
}

const TEMPLATE_OPTIONS: Array<{ value: string; label: string }> = [
  ...Object.entries(FIELD_TEMPLATES).map(([key, t]) => ({ value: key, label: t.label })),
  { value: 'custom', label: 'Personnalisé' },
]

function parseUrls(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function resolveTargetFields(config: ScrapeUrlConfig): { keys: string[]; labels: Record<string, string> } {
  if (config.template === 'custom') {
    const keys = config.customFields
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    return { keys, labels: Object.fromEntries(keys.map((k) => [k, k])) }
  }
  const tpl = FIELD_TEMPLATES[config.template]
  if (!tpl) {
    return { keys: [], labels: {} }
  }
  return {
    keys: tpl.fields.map((f) => f.key),
    labels: Object.fromEntries(tpl.fields.map((f) => [f.key, f.label])),
  }
}

function rowsToSheet(
  name: string,
  fieldKeys: string[],
  fieldLabels: Record<string, string>,
  rows: Array<Record<string, unknown>>,
): ExcelSheet {
  const columns: ExcelColumn[] = [
    { key: '_url', label: 'URL', fieldType: 'url', detectedType: 'url', isPrimary: false, width: 240 },
    ...fieldKeys.map((k, i) => {
      const isImage = /image|photo|picture/i.test(k)
      return {
        key: k,
        label: fieldLabels[k] ?? k,
        fieldType: isImage ? ('image' as const) : ('text' as const),
        detectedType: isImage ? ('image' as const) : ('text' as const),
        isPrimary: i === 0,
        width: isImage ? 120 : 200,
      }
    }),
  ]

  const excelRows: ExcelRow[] = rows.map((r, i) => {
    const row: ExcelRow = { _id: `scrape_${i}` }
    for (const [k, v] of Object.entries(r)) {
      row[k] = (v == null ? null : String(v)) as ExcelRow[string]
    }
    return row
  })

  return { name, columns, rows: excelRows, taxonomy: [] }
}

export const scrapeUrlNode: NodeSpec<ScrapeUrlConfig, Record<string, never>, ScrapeUrlOutputs> = {
  type: 'scrape-url',
  category: 'import',
  label: 'Scrape URL',
  description: "Scrape une ou plusieurs URLs via Jina + LLM (cascade scrape produit complet).",
  icon: Globe,
  inputs: [],
  outputs: [
    { name: 'sheet', type: 'sheet' },
    { name: 'assets', type: 'asset[]' },
  ],
  configSchema: [
    {
      name: 'urls',
      kind: 'textarea',
      label: 'URLs (une par ligne ou séparées par virgule)',
      required: true,
    },
    {
      name: 'template',
      kind: 'select',
      label: 'Template de champs',
      default: 'product_full',
      options: TEMPLATE_OPTIONS,
    },
    {
      name: 'customFields',
      kind: 'text',
      label: 'Champs personnalisés (si Personnalisé, séparés par virgule)',
      default: '',
      help: 'Ignoré si un template est sélectionné',
    },
    {
      name: 'model',
      kind: 'select',
      label: 'Modèle LLM',
      default: 'claude-opus-4-7',
      options: [
        { value: 'claude-opus-4-7', label: 'Claude Opus 4.7' },
        { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro' },
      ],
    },
  ],
  defaultConfig: {
    urls: '',
    template: 'product_full',
    customFields: '',
    model: 'claude-opus-4-7',
  },
  runtime: 'client',
  run: async (ctx, config) => {
    const urls = parseUrls(config.urls)
    if (urls.length === 0) {
      throw new Error('Aucune URL fournie — renseignez au moins une URL dans la config.')
    }

    const { keys, labels } = resolveTargetFields(config)
    if (keys.length === 0) {
      throw new Error('Aucun champ à extraire — choisissez un template ou listez des champs personnalisés.')
    }

    const allRows: Array<Record<string, unknown>> = []
    const allAssets: ScrapeUrlAsset[] = []
    let anyBlocked = false

    for (let i = 0; i < urls.length; i++) {
      if (ctx.signal.aborted) break
      const url = urls[i]
      ctx.log('info', `(${i + 1}/${urls.length}) Scraping ${url}`)
      ctx.setProgress?.(Math.round((i / urls.length) * 100))
      try {
        const result = await enrichRow({
          url,
          targetFields: keys,
          model: config.model,
          signal: ctx.signal,
          log: (msg) => ctx.log('info', msg),
        })
        allRows.push({ _url: url, ...result.fields })
        allAssets.push(...result.assets)
        if (result.blockedByAntiBot) anyBlocked = true
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        ctx.log('error', `Échec ${url} : ${msg}`)
        allRows.push({ _url: url, ...Object.fromEntries(keys.map((k) => [k, null])) })
      }
    }

    ctx.setProgress?.(100)
    const sheet = rowsToSheet('Scrape', keys, labels, allRows)
    // Compte les cellules réellement remplies (hors _url) → permet de signaler un scrape vide.
    const filled = allRows.reduce(
      (n, row) =>
        n + Object.entries(row).filter(([k, v]) => k !== '_url' && v != null && v !== '').length,
      0,
    )
    if (filled === 0 && allAssets.length === 0) {
      ctx.log(
        'warn',
        `⚠️ Aucune donnée extraite (${allRows.length} URL(s)) — site anti-bot non débloqué (cookies de session ?) ou page sans contenu structuré.`,
      )
    } else if (anyBlocked) {
      ctx.log(
        'warn',
        `⚠️ Données PARTIELLES — ${filled} champ(s), ${allAssets.length} asset(s) : anti-bot non résolu sur au moins une URL (mêmes données que le bandeau d'alerte du PIM).`,
      )
    } else {
      ctx.log('info', `Terminé — ${allRows.length} ligne(s), ${filled} champ(s) rempli(s), ${allAssets.length} asset(s)`)
    }
    return { sheet, assets: allAssets }
  },
}

nodeRegistry.register(scrapeUrlNode)
