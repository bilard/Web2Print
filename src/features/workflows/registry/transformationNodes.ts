// src/features/workflows/registry/transformationNodes.ts
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

export const setFieldsNode: NodeSpec<
  SetFieldsConfig,
  { sheet: SheetLike | null },
  { sheet: SheetLike }
> = {
  type: 'transform-set-fields',
  category: 'transformation',
  label: 'Définir / réécrire colonnes',
  description:
    "Ajoute ou modifie des colonnes en évaluant un template {{col}} sur chaque ligne. Une entrée par ligne au format `colonne = template`.",
  icon: Wand2,
  inputs: [{ name: 'sheet', type: 'sheet', required: true }],
  outputs: [{ name: 'sheet', type: 'sheet' }],
  configSchema: [
    {
      name: 'assignments',
      kind: 'textarea',
      label: 'Affectations (une par ligne)',
      help: "Ex :\nslug = {{name}}\nlabel = {{brand}} — {{model}}\nprice_eur = {{price}} €\nLes accolades {{...}} référencent les colonnes existantes de la ligne courante.",
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
      ctx.log('warn', 'Aucune affectation — sheet forwardée telle quelle.')
      return { sheet }
    }
    const pairs = lines
      .map((line) => {
        const eq = line.indexOf('=')
        if (eq < 0) return null
        const key = line.slice(0, eq).trim()
        const tpl = line.slice(eq + 1).trim()
        return key ? { key, tpl } : null
      })
      .filter((p): p is { key: string; tpl: string } => p !== null)

    ctx.log('info', `Définit ${pairs.length} colonne(s) sur ${rows.length} ligne(s).`)
    const next = rows.map((row) => {
      const out: Record<string, unknown> = { ...row }
      for (const { key, tpl } of pairs) {
        out[key] = interpolate(tpl, row as Record<string, unknown>)
      }
      return out
    })
    return { sheet: { ...sheet, rows: next } }
  },
}

/**
 * Filter — garde les lignes qui satisfont une expression JS sur `row`.
 */
interface FilterConfig {
  expression: string
}

export const filterNode: NodeSpec<
  FilterConfig,
  { sheet: SheetLike | null },
  { sheet: SheetLike }
> = {
  type: 'transform-filter',
  category: 'transformation',
  label: 'Filtrer lignes',
  description:
    "Garde les lignes pour lesquelles l'expression JS retourne true. La ligne courante est exposée via `row`.",
  icon: FilterIcon,
  inputs: [{ name: 'sheet', type: 'sheet', required: true }],
  outputs: [{ name: 'sheet', type: 'sheet' }],
  configSchema: [
    {
      name: 'expression',
      kind: 'expression',
      label: 'Condition (sur `row`)',
      help: "Ex : row.price > 0 — row.status === 'active' — !!row.url",
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
      throw new Error(
        `Filtre : expression invalide "${expr}" — ${err instanceof Error ? err.message : err}`,
        { cause: err },
      )
    }
    const kept = rows.filter((row) => {
      try {
        return predicate(row)
      } catch (err) {
        ctx.log('warn', `Erreur sur la ligne, écartée — ${err instanceof Error ? err.message : err}`)
        return false
      }
    })
    ctx.log('info', `Filtre : ${kept.length}/${rows.length} ligne(s) conservée(s).`)
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

export const sortNode: NodeSpec<
  SortConfig,
  { sheet: SheetLike | null },
  { sheet: SheetLike }
> = {
  type: 'transform-sort',
  category: 'transformation',
  label: 'Trier lignes',
  description: 'Trie les lignes selon la valeur d\'une colonne.',
  icon: ArrowDownUp,
  inputs: [{ name: 'sheet', type: 'sheet', required: true }],
  outputs: [{ name: 'sheet', type: 'sheet' }],
  configSchema: [
    { name: 'column', kind: 'columnRef', label: 'Colonne', required: true },
    {
      name: 'direction',
      kind: 'select',
      label: 'Sens',
      default: 'asc',
      options: [
        { value: 'asc', label: 'Croissant' },
        { value: 'desc', label: 'Décroissant' },
      ],
    },
    {
      name: 'type',
      kind: 'select',
      label: 'Comparaison',
      default: 'string',
      options: [
        { value: 'string', label: 'Texte (alphabétique)' },
        { value: 'number', label: 'Numérique' },
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
      ctx.log('warn', 'Aucune colonne — sheet forwardée telle quelle.')
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
    ctx.log('info', `Tri ${config.direction} sur "${col}" (${config.type}).`)
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

export const renameColumnsNode: NodeSpec<
  RenameConfig,
  { sheet: SheetLike | null },
  { sheet: SheetLike }
> = {
  type: 'transform-rename',
  category: 'transformation',
  label: 'Renommer colonnes',
  description: 'Renomme une ou plusieurs colonnes (mapping ancien = nouveau, une entrée par ligne).',
  icon: PenLine,
  inputs: [{ name: 'sheet', type: 'sheet', required: true }],
  outputs: [{ name: 'sheet', type: 'sheet' }],
  configSchema: [
    {
      name: 'mapping',
      kind: 'textarea',
      label: 'Mapping (une par ligne)',
      help: 'Ex :\nproduct_name = title\nproduit.prix = price',
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
      ctx.log('warn', 'Aucun renommage valide — sheet forwardée telle quelle.')
      return { sheet }
    }
    const next = rows.map((row) => {
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(row)) out[map.get(k) ?? k] = v
      return out
    })
    ctx.log('info', `Renommage de ${map.size} colonne(s).`)
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

export const textOpNode: NodeSpec<
  TextOpConfig,
  { sheet: SheetLike | null },
  { sheet: SheetLike }
> = {
  type: 'transform-text',
  category: 'transformation',
  label: 'Opération texte',
  description:
    'Applique une opération texte (minuscules, majuscules, trim, remplacement, extraction regex) sur une colonne.',
  icon: TypeIcon,
  inputs: [{ name: 'sheet', type: 'sheet', required: true }],
  outputs: [{ name: 'sheet', type: 'sheet' }],
  configSchema: [
    { name: 'source', kind: 'columnRef', label: 'Colonne source', required: true },
    {
      name: 'target',
      kind: 'text',
      label: 'Colonne cible (vide = même que source)',
    },
    {
      name: 'operation',
      kind: 'select',
      label: 'Opération',
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
      label: 'Motif (replace / regex)',
      help: "Pour 'Remplacer' : sous-chaîne littérale. Pour 'Extraire' : regex sans délimiteurs (ex : \\d+).",
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
      ctx.log('warn', 'Aucune colonne source — sheet forwardée telle quelle.')
      return { sheet }
    }
    const tgt = config.target?.trim() || src
    const op = config.operation
    let regex: RegExp | null = null
    if (op === 'regex-extract') {
      try {
        regex = new RegExp(config.pattern || '')
      } catch (err) {
        throw new Error(
          `Regex invalide "${config.pattern}" — ${err instanceof Error ? err.message : err}`,
          { cause: err },
        )
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
    ctx.log('info', `${op} sur "${src}" → "${tgt}" (${rows.length} ligne(s)).`)
    return { sheet: { ...sheet, rows: next } }
  },
}

nodeRegistry.register(setFieldsNode)
nodeRegistry.register(filterNode)
nodeRegistry.register(sortNode)
nodeRegistry.register(renameColumnsNode)
nodeRegistry.register(textOpNode)
