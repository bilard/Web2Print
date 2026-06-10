// functions/src/workflow/nodes/pure.ts
import { registerServerNode } from '../registry'
import { interpolate } from '../interpolate'

interface SheetLike { rows?: Array<Record<string, unknown>>; [key: string]: unknown }
const asSheet = (input: unknown): SheetLike =>
  input && typeof input === 'object' && !Array.isArray(input) ? (input as SheetLike) : { rows: [] }
const asRows = (sheet: SheetLike): Array<Record<string, unknown>> => (Array.isArray(sheet.rows) ? sheet.rows : [])

// --- text-input ---
registerServerNode({
  type: 'text-input',
  run: async (ctx, config) => {
    const text = (config.text as string) ?? ''
    if (!String(text).trim()) ctx.log('warn', 'Le texte saisi est vide.')
    return { text }
  },
})

// --- if-else ---
registerServerNode({
  type: 'if-else',
  run: async (ctx, config, inputs) => {
    const expr = String(config.expression ?? 'true').trim() || 'true'
    let result: boolean
    try {
      result = Boolean(new Function('value', `return (${expr})`)(inputs.value))
    } catch (err) {
      throw new Error(`Erreur d'évaluation "${expr}" : ${err instanceof Error ? err.message : err}`)
    }
    ctx.log('info', `Condition "${expr}" = ${result}`)
    return result ? { then: inputs.value } : { else: inputs.value }
  },
})

// --- pipe ---
registerServerNode({
  type: 'pipe',
  run: async (ctx, config, inputs) => {
    const lines = String(config.expressions ?? '').split('\n').map((s) => s.trim()).filter(Boolean)
    if (lines.length === 0) return { result: inputs.value }
    let value = inputs.value
    for (let i = 0; i < lines.length; i++) {
      try {
        value = new Function('value', `return (${lines[i]})`)(value)
      } catch (err) {
        throw new Error(`Étape ${i + 1} "${lines[i]}" : ${err instanceof Error ? err.message : err}`)
      }
    }
    return { result: value }
  },
})

// --- loop-each / loop-collect (fallback uniquement ; l'orchestrator gère les paires) ---
registerServerNode({
  type: 'loop-each',
  run: async (ctx, _config, inputs) => {
    const items = inputs.items
    if (!Array.isArray(items)) throw new Error("Loop each : l'entrée 'items' doit être un tableau.")
    ctx.log('warn', 'Loop each isolé — forwarde le premier élément.')
    return { item: items[0] }
  },
})
registerServerNode({
  type: 'loop-collect',
  run: async (_ctx, _config, inputs) => ({ results: inputs.item === undefined ? [] : [inputs.item] }),
})

// --- transform-set-fields ---
registerServerNode({
  type: 'transform-set-fields',
  run: async (ctx, config, inputs) => {
    const sheet = asSheet(inputs.sheet)
    const rows = asRows(sheet)
    const lines = String(config.assignments ?? '').split('\n').map((s) => s.trim()).filter(Boolean)
    if (lines.length === 0) return { sheet }
    const pairs = lines.map((line) => {
      const eq = line.indexOf('=')
      if (eq < 0) return null
      const key = line.slice(0, eq).trim()
      const tpl = line.slice(eq + 1).trim()
      return key ? { key, tpl } : null
    }).filter((p): p is { key: string; tpl: string } => p !== null)
    ctx.log('info', `Définit ${pairs.length} colonne(s) sur ${rows.length} ligne(s).`)
    const next = rows.map((row) => {
      const out: Record<string, unknown> = { ...row }
      for (const { key, tpl } of pairs) out[key] = interpolate(tpl, row)
      return out
    })
    return { sheet: { ...sheet, rows: next } }
  },
})

// --- transform-filter ---
registerServerNode({
  type: 'transform-filter',
  run: async (ctx, config, inputs) => {
    const sheet = asSheet(inputs.sheet)
    const rows = asRows(sheet)
    const expr = String(config.expression ?? 'true').trim() || 'true'
    let fn: (row: Record<string, unknown>) => unknown
    try {
      fn = new Function('row', `return (${expr})`) as (row: Record<string, unknown>) => unknown
    } catch (err) {
      throw new Error(`Filtre : expression invalide "${expr}" — ${err instanceof Error ? err.message : err}`)
    }
    const kept = rows.filter((row) => {
      try { return Boolean(fn(row)) } catch { return false }
    })
    ctx.log('info', `Filtre : ${kept.length}/${rows.length} ligne(s).`)
    return { sheet: { ...sheet, rows: kept } }
  },
})

// --- transform-sort ---
registerServerNode({
  type: 'transform-sort',
  run: async (ctx, config, inputs) => {
    const sheet = asSheet(inputs.sheet)
    const rows = asRows(sheet)
    const col = String(config.column ?? '').trim()
    if (!col) return { sheet }
    const sign = config.direction === 'desc' ? -1 : 1
    const numeric = config.type === 'number'
    const sorted = [...rows].sort((a, b) => {
      if (numeric) {
        const na = typeof a[col] === 'number' ? (a[col] as number) : Number(a[col])
        const nb = typeof b[col] === 'number' ? (b[col] as number) : Number(b[col])
        return ((Number.isFinite(na) ? na : 0) - (Number.isFinite(nb) ? nb : 0)) * sign
      }
      const sa = a[col] == null ? '' : String(a[col])
      const sb = b[col] == null ? '' : String(b[col])
      return sa.localeCompare(sb) * sign
    })
    ctx.log('info', `Tri ${config.direction} sur "${col}".`)
    return { sheet: { ...sheet, rows: sorted } }
  },
})

// --- transform-rename ---
registerServerNode({
  type: 'transform-rename',
  run: async (ctx, config, inputs) => {
    const sheet = asSheet(inputs.sheet)
    const rows = asRows(sheet)
    const map = new Map<string, string>()
    for (const line of String(config.mapping ?? '').split('\n')) {
      const eq = line.indexOf('=')
      if (eq < 0) continue
      const from = line.slice(0, eq).trim()
      const to = line.slice(eq + 1).trim()
      if (from && to && from !== to) map.set(from, to)
    }
    if (map.size === 0) return { sheet }
    const next = rows.map((row) => {
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(row)) out[map.get(k) ?? k] = v
      return out
    })
    ctx.log('info', `Renommage de ${map.size} colonne(s).`)
    return { sheet: { ...sheet, rows: next } }
  },
})

// --- transform-text ---
registerServerNode({
  type: 'transform-text',
  run: async (ctx, config, inputs) => {
    const sheet = asSheet(inputs.sheet)
    const rows = asRows(sheet)
    const src = String(config.source ?? '').trim()
    if (!src) return { sheet }
    const tgt = String(config.target ?? '').trim() || src
    const op = config.operation as string
    let regex: RegExp | null = null
    if (op === 'regex-extract') {
      try { regex = new RegExp(String(config.pattern ?? '')) }
      catch (err) { throw new Error(`Regex invalide — ${err instanceof Error ? err.message : err}`) }
    }
    const apply = (raw: unknown): string => {
      const s = raw == null ? '' : String(raw)
      switch (op) {
        case 'lowercase': return s.toLowerCase()
        case 'uppercase': return s.toUpperCase()
        case 'trim': return s.trim()
        case 'replace': return config.pattern ? s.split(String(config.pattern)).join(String(config.replacement ?? '')) : s
        case 'regex-extract': { if (!regex) return s; const m = s.match(regex); return m ? (m[1] ?? m[0]) : '' }
        default: return s
      }
    }
    const next = rows.map((row) => ({ ...row, [tgt]: apply(row[src]) }))
    ctx.log('info', `${op} sur "${src}" → "${tgt}".`)
    return { sheet: { ...sheet, rows: next } }
  },
})
