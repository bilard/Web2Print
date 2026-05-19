// src/features/workflows/runtime/interpolate.ts
// Templating { { path.x } } pour les configs de node dans un body de boucle.

const TOKEN_RE = /\{\{\s*([^{}]+?)\s*\}\}/g

function resolvePath(ctx: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.').map((p) => p.trim()).filter(Boolean)
  let cur: unknown = ctx
  for (const part of parts) {
    if (cur === null || cur === undefined) return undefined
    if (typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur
}

function interpolateString(input: string, ctx: Record<string, unknown>): string {
  return input.replace(TOKEN_RE, (match, path: string) => {
    const value = resolvePath(ctx, path.trim())
    // Token non résolu : on garde le {{...}} pour rendre l'erreur visible
    // (sinon le mail partirait silencieusement vide).
    if (value === undefined) return match
    if (value === null) return ''
    if (typeof value === 'string') return value
    if (typeof value === 'object') return JSON.stringify(value)
    return String(value)
  })
}

/**
 * Interpole récursivement les tokens { { path } } dans une valeur arbitraire.
 * Strings → remplacés ; objets/arrays → traversés ; autres types → laissés tels quels.
 */
export function interpolate<T>(value: T, ctx: Record<string, unknown>): T {
  if (typeof value === 'string') {
    return interpolateString(value, ctx) as unknown as T
  }
  if (Array.isArray(value)) {
    return value.map((v) => interpolate(v, ctx)) as unknown as T
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = interpolate(v, ctx)
    }
    return out as unknown as T
  }
  return value
}
