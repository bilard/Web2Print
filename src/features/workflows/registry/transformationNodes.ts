import {
  Wand2,
  Filter as FilterIcon,
  ArrowDownUp,
  PenLine,
  Type as TypeIcon,
} from 'lucide-react'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import { interpolate } from '../runtime/interpolate'
// `run()` n'est pas un composant : helper `t()` de module (lit la locale courante).
import { t } from '@/lib/i18n'

interface SheetLike {
  rows?: Array<Record<string, unknown>>
  [key: string]: unknown
}

function asSheet(input: unknown): SheetLike {
  if (input && typeof input === 'object' && !Array.isArray(input)) return input as SheetLike
  return { rows: [] }
}

function asRows(sheet: SheetLike): Array<Record<string, unknown>> {
  return Array.isArray(sheet.rows) ? sheet.rows : []
}

/**
 * Set Fields — ajoute / réécrit des colonnes via templates {{col}} appliqués
 * row-par-row. Format : `colonne = template`, une entrée par ligne.
 *
 * Inspiré du module "Edit Fields" / "Set" de N8N et "Set Multiple Variables"
 * de MAKE.
 */
interface SetFieldsConfig {
  assignments: string
}

const setFieldsNode: NodeSpec<
  SetFieldsConfig,
  { sheet: SheetLike | null },
  { sheet: SheetLike }
> = {
  type: 'transform-set-fields',
  category: 'transformation',
  labelKey: 'node.transform-set-fields.label',
  descriptionKey: 'node.transform-set-fields.desc',
  icon: Wand2,
  inputs: [{ name: 'sheet', type: 'sheet', required: true }],
  outputs: [{ name: 'sheet', type: 'sheet' }],
  configSchema: [
    {
      name: 'assignments',
      kind: 'textarea',
      labelKey: 'node.transform-set-fields.f1',
      helpKey: 'node.transform-set-fields.f2',
    },
  ],
  defaultConfig: { assignments: '' },
  runtime: 'client',
  run: async (ctx, config, inputs) => {
    const sheet = asSheet(inputs.sheet)
    const rows = asRows(sheet)
    const lines = String(config.assignments || '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    if (lines.length === 0) {
      ctx.log('warn', t('run.pure.noAssign'))
      return { sheet }
    }
    // « := » (expression JS) prioritaire sur « = » (template texte).
    type Assign =
      | { key: string; mode: 'expr'; fn: (row: Record<string, unknown>) => unknown }
      | { key: string; mode: 'tpl'; tpl: string }
    const assigns: Assign[] = []
    for (const line of lines) {
      const ce = line.indexOf(':=')
      if (ce >= 0) {
        const key = line.slice(0, ce).trim()
        const expr = line.slice(ce + 2).trim()
        if (!key) continue
        try {
          const fn = new Function('row', `return (${expr})`) as (row: Record<string, unknown>) => unknown
          assigns.push({ key, mode: 'expr', fn })
        } catch (err) {
          throw new Error(t('run.pure.computedInvalid', { key, expr, message: err instanceof Error ? err.message : String(err) }), { cause: err })
        }
        continue
      }
      const eq = line.indexOf('=')
      if (eq < 0) continue
      const key = line.slice(0, eq).trim()
      const tpl = line.slice(eq + 1).trim()
      if (key) assigns.push({ key, mode: 'tpl', tpl })
    }
    if (assigns.length === 0) {
      ctx.log('warn', t('run.pure.noValidAssign'))
      return { sheet }
    }

    ctx.log('info', t('run.pure.setColumns', { columns: assigns.length, rows: rows.length }))
    const next = rows.map((row) => {
      const out: Record<string, unknown> = { ...row }
      for (const a of assigns) {
        if (a.mode === 'expr') {
          try {
            out[a.key] = a.fn(row)
          } catch (err) {
            ctx.log('warn', t('run.pure.rowError', { key: a.key, message: err instanceof Error ? err.message : String(err) }))
            out[a.key] = ''
          }
        } else {
          out[a.key] = interpolate(a.tpl, row)
        }
      }
      return out
    })

    // Déclare les nouvelles colonnes dans `columns` (sinon l'export les ignore).
    let columns = sheet.columns
    const existingCols = Array.isArray(sheet.columns) ? (sheet.columns as Array<{ key?: string }>) : null
    if (existingCols) {
      const known = new Set(existingCols.map((c) => c.key))
      const added = [...new Set(assigns.map((a) => a.key))].filter((k) => !known.has(k))
      if (added.length > 0) {
        columns = [
          ...existingCols,
          ...added.map((k) => ({ key: k, label: k, fieldType: 'text', detectedType: 'text', isPrimary: false, width: 140 })),
        ]
      }
    }
    return { sheet: { ...sheet, columns, rows: next } }
  },
}

/**
 * Filter — garde les lignes qui satisfont une expression JS sur `row`.
 */
interface FilterConfig {
  expression: string
}

const filterNode: NodeSpec<
  FilterConfig,
  { sheet: SheetLike | null },
  { sheet: SheetLike }
> = {
  type: 'transform-filter',
  category: 'transformation',
  labelKey: 'node.transform-filter.label',
  descriptionKey: 'node.transform-filter.desc',
  icon: FilterIcon,
  inputs: [{ name: 'sheet', type: 'sheet', required: true }],
  outputs: [{ name: 'sheet', type: 'sheet' }],
  configSchema: [
    {
      name: 'expression',
      kind: 'expression',
      labelKey: 'node.transform-filter.f1',
      helpKey: 'node.transform-filter.f2',
    },
  ],
  defaultConfig: { expression: 'true' },
  runtime: 'client',
  run: async (ctx, config, inputs) => {
    const sheet = asSheet(inputs.sheet)
    const rows = asRows(sheet)
    const expr = config.expression?.trim() || 'true'
    let predicate: (row: Record<string, unknown>) => boolean
    try {
      const fn = new Function('row', `return (${expr})`) as (
        row: Record<string, unknown>,
      ) => unknown
      predicate = (row) => Boolean(fn(row))
    } catch (err) {
      throw new Error(t('run.pure.filterInvalid', { expr, message: err instanceof Error ? err.message : String(err) }), { cause: err })
    }
    const kept = rows.filter((row) => {
      try {
        return predicate(row)
      } catch (err) {
        ctx.log('warn', t('run.pure.rowDropped', { message: err instanceof Error ? err.message : String(err) }))
        return false
      }
    })
    ctx.log('info', t('run.pure.filterKeptRows', { kept: kept.length, total: rows.length }))
    return { sheet: { ...sheet, rows: kept } }
  },
}

/**
 * Sort — trie les lignes par une colonne (asc/desc, comparaison string ou number).
 */
interface SortConfig {
  column: string
  direction: 'asc' | 'desc'
  type: 'string' | 'number'
}

const sortNode: NodeSpec<
  SortConfig,
  { sheet: SheetLike | null },
  { sheet: SheetLike }
> = {
  type: 'transform-sort',
  category: 'transformation',
  labelKey: 'node.transform-sort.label',
  descriptionKey: 'node.transform-sort.desc',
  icon: ArrowDownUp,
  inputs: [{ name: 'sheet', type: 'sheet', required: true }],
  outputs: [{ name: 'sheet', type: 'sheet' }],
  configSchema: [
    { name: 'column', kind: 'columnRef', label: 'Colonne', required: true },
    {
      name: 'direction',
      kind: 'select',
      labelKey: 'node.transform-sort.f1',
      default: 'asc',
      options: [
        { value: 'asc', label: 'Croissant' },
        { value: 'desc', labelKey: 'opt.sort.desc' },
      ],
    },
    {
      name: 'type',
      kind: 'select',
      labelKey: 'node.transform-sort.f2',
      default: 'string',
      options: [
        { value: 'string', labelKey: 'opt.sortType.string' },
        { value: 'number', labelKey: 'opt.sortType.number' },
      ],
    },
  ],
  defaultConfig: { column: '', direction: 'asc', type: 'string' },
  runtime: 'client',
  run: async (ctx, config, inputs) => {
    const sheet = asSheet(inputs.sheet)
    const rows = asRows(sheet)
    const col = config.column?.trim()
    if (!col) {
      ctx.log('warn', t('run.pure.noColumn'))
      return { sheet }
    }
    const sign = config.direction === 'desc' ? -1 : 1
    const sorted = [...rows].sort((a, b) => {
      const va = a[col]
      const vb = b[col]
      if (config.type === 'number') {
        const na = typeof va === 'number' ? va : Number(va)
        const nb = typeof vb === 'number' ? vb : Number(vb)
        const safeA = Number.isFinite(na) ? na : 0
        const safeB = Number.isFinite(nb) ? nb : 0
        return (safeA - safeB) * sign
      }
      const sa = va == null ? '' : String(va)
      const sb = vb == null ? '' : String(vb)
      return sa.localeCompare(sb) * sign
    })
    ctx.log('info', t('run.pure.sortedTyped', { direction: config.direction, column: col, type: config.type }))
    return { sheet: { ...sheet, rows: sorted } }
  },
}

/**
 * Rename Columns — renomme des colonnes via mapping `ancien = nouveau` (une
 * entrée par ligne). Préserve l'ordre d'insertion des autres colonnes.
 */
interface RenameConfig {
  mapping: string
}

const renameColumnsNode: NodeSpec<
  RenameConfig,
  { sheet: SheetLike | null },
  { sheet: SheetLike }
> = {
  type: 'transform-rename',
  category: 'transformation',
  labelKey: 'node.transform-rename.label',
  descriptionKey: 'node.transform-rename.desc',
  icon: PenLine,
  inputs: [{ name: 'sheet', type: 'sheet', required: true }],
  outputs: [{ name: 'sheet', type: 'sheet' }],
  configSchema: [
    {
      name: 'mapping',
      kind: 'textarea',
      labelKey: 'node.transform-rename.f1',
      helpKey: 'node.transform-rename.f2',
    },
  ],
  defaultConfig: { mapping: '' },
  runtime: 'client',
  run: async (ctx, config, inputs) => {
    const sheet = asSheet(inputs.sheet)
    const rows = asRows(sheet)
    const map = new Map<string, string>()
    for (const line of String(config.mapping || '').split('\n')) {
      const eq = line.indexOf('=')
      if (eq < 0) continue
      const from = line.slice(0, eq).trim()
      const to = line.slice(eq + 1).trim()
      if (from && to && from !== to) map.set(from, to)
    }
    if (map.size === 0) {
      ctx.log('warn', t('run.pure.noValidRename'))
      return { sheet }
    }
    const next = rows.map((row) => {
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(row)) out[map.get(k) ?? k] = v
      return out
    })
    ctx.log('info', t('run.pure.renamed', { count: map.size }))
    return { sheet: { ...sheet, rows: next } }
  },
}

/**
 * Text Operation — applique une opération texte (lower/upper/trim/replace/regex)
 * à une colonne, sortie vers la même colonne ou une nouvelle.
 */
interface TextOpConfig {
  source: string
  target: string
  operation: 'lowercase' | 'uppercase' | 'trim' | 'replace' | 'regex-extract'
  pattern: string
  replacement: string
}

const textOpNode: NodeSpec<
  TextOpConfig,
  { sheet: SheetLike | null },
  { sheet: SheetLike }
> = {
  type: 'transform-text',
  category: 'transformation',
  labelKey: 'node.transform-text.label',
  descriptionKey: 'node.transform-text.desc',
  icon: TypeIcon,
  inputs: [{ name: 'sheet', type: 'sheet', required: true }],
  outputs: [{ name: 'sheet', type: 'sheet' }],
  configSchema: [
    { name: 'source', kind: 'columnRef', label: 'Colonne source', required: true },
    {
      name: 'target',
      kind: 'text',
      labelKey: 'node.transform-text.f1',
    },
    {
      name: 'operation',
      kind: 'select',
      labelKey: 'node.transform-text.f2',
      default: 'lowercase',
      options: [
        { value: 'lowercase', label: 'Minuscules' },
        { value: 'uppercase', label: 'Majuscules' },
        { value: 'trim', label: 'Trim (espaces)' },
        { value: 'replace', label: 'Remplacer' },
        { value: 'regex-extract', label: 'Extraire (regex)' },
      ],
    },
    {
      name: 'pattern',
      kind: 'text',
      labelKey: 'node.transform-text.f3',
      helpKey: 'node.transform-text.f4',
    },
    { name: 'replacement', kind: 'text', label: 'Remplacement (replace uniquement)' },
  ],
  defaultConfig: {
    source: '',
    target: '',
    operation: 'lowercase',
    pattern: '',
    replacement: '',
  },
  runtime: 'client',
  run: async (ctx, config, inputs) => {
    const sheet = asSheet(inputs.sheet)
    const rows = asRows(sheet)
    const src = config.source?.trim()
    if (!src) {
      ctx.log('warn', t('run.pure.noSourceColumn'))
      return { sheet }
    }
    const tgt = config.target?.trim() || src
    const op = config.operation
    let regex: RegExp | null = null
    if (op === 'regex-extract') {
      try {
        regex = new RegExp(config.pattern || '')
      } catch (err) {
        throw new Error(t('run.pure.badRegexPattern', { pattern: config.pattern, message: err instanceof Error ? err.message : String(err) }), { cause: err })
      }
    }
    const apply = (raw: unknown): string => {
      const s = raw == null ? '' : String(raw)
      switch (op) {
        case 'lowercase':
          return s.toLowerCase()
        case 'uppercase':
          return s.toUpperCase()
        case 'trim':
          return s.trim()
        case 'replace':
          return config.pattern ? s.split(config.pattern).join(config.replacement || '') : s
        case 'regex-extract': {
          if (!regex) return s
          const m = s.match(regex)
          if (!m) return ''
          return m[1] ?? m[0]
        }
        default:
          return s
      }
    }
    const next = rows.map((row) => ({ ...row, [tgt]: apply(row[src]) }))
    ctx.log('info', t('run.pure.textOpRows', { op, source: src, target: tgt, rows: rows.length }))
    return { sheet: { ...sheet, rows: next } }
  },
}

nodeRegistry.register(setFieldsNode)
nodeRegistry.register(filterNode)
nodeRegistry.register(sortNode)
nodeRegistry.register(renameColumnsNode)
nodeRegistry.register(textOpNode)
