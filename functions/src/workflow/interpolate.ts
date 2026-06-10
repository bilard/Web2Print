// functions/src/workflow/interpolate.ts
const TOKEN_RE = /\{\{\s*([^{}]+?)\s*\}\}/g

function resolvePath(ctx: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.').map((p) => p.trim()).filter(Boolean)
  let cur: unknown = ctx
  for (const part of parts) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur
}

function interpolateString(input: string, ctx: Record<string, unknown>): string {
  return input.replace(TOKEN_RE, (match, path: string) => {
    const value = resolvePath(ctx, path.trim())
    if (value === undefined) return match
    if (value === null) return ''
    if (typeof value === 'string') return value
    if (typeof value === 'object') return JSON.stringify(value)
    return String(value)
  })
}

export function interpolate<T>(value: T, ctx: Record<string, unknown>): T {
  if (typeof value === 'string') return interpolateString(value, ctx) as unknown as T
  if (Array.isArray(value)) return value.map((v) => interpolate(v, ctx)) as unknown as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = interpolate(v, ctx)
    return out as unknown as T
  }
  return value
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

export function extractRows(input: unknown): Record<string, unknown>[] | null {
  if (Array.isArray(input)) {
    const objs = input.filter((v) => v && typeof v === 'object' && !Array.isArray(v)) as Record<string, unknown>[]
    return objs.length > 0 ? objs : null
  }
  if (input && typeof input === 'object') {
    const maybeRows = (input as Record<string, unknown>).rows
    if (Array.isArray(maybeRows)) {
      const objs = maybeRows.filter((v) => v && typeof v === 'object' && !Array.isArray(v)) as Record<string, unknown>[]
      return objs.length > 0 ? objs : null
    }
  }
  return null
}

export function buildInterpolationContext(
  inputs: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const ctx: Record<string, unknown> = {}
  for (const value of Object.values(inputs)) {
    const rows = extractRows(value)
    if (rows) {
      const cols = new Set<string>()
      for (const obj of rows) for (const k of Object.keys(obj)) cols.add(k)
      for (const col of cols) {
        if (col in ctx) continue
        ctx[col] = rows.map((obj) => formatValue(obj[col])).filter(Boolean).join(', ')
      }
      if (!Array.isArray(value) && value && typeof value === 'object') {
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
          if (k === 'rows') continue
          if (!(k in ctx)) ctx[k] = v
        }
      }
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(ctx, value as Record<string, unknown>)
    }
  }
  for (const [key, value] of Object.entries(inputs)) if (!(key in ctx)) ctx[key] = value
  Object.assign(ctx, extra)
  return ctx
}
