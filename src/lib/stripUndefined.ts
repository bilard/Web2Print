/** Récursivement retire les clés à valeur `undefined` — Firestore rejette tout
 *  `setDoc` qui en contient (ex. fieldMap « (non mappé) », styles remis par défaut).
 *  Préserve `null`, arrays, objets imbriqués ; ne traverse pas les Date. */
export function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => stripUndefined(v)) as unknown as T
  }
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue
      out[k] = stripUndefined(v)
    }
    return out as T
  }
  return value
}
