const DATE_KEYS = /^(createdAt|updatedAt|startedAt|endedAt|lastSeenAt|lastSyncAt|expiresAt|receivedAt|at)$/

/** Valeur d'une cellule → texte court (dates lisibles, objets/arrays tronqués en JSON). */
export function formatCell(key: string, v: unknown): string {
  if (v == null) return '—'
  if (typeof v === 'object' && typeof (v as { toDate?: unknown }).toDate === 'function') {
    return (v as { toDate(): Date }).toDate().toLocaleString('fr-FR')
  }
  // Timestamp Firestore sérialisé { seconds, nanoseconds }.
  if (typeof v === 'object' && typeof (v as { seconds?: unknown }).seconds === 'number') {
    return new Date((v as { seconds: number }).seconds * 1000).toLocaleString('fr-FR')
  }
  if (typeof v === 'number' && DATE_KEYS.test(key) && v > 1e11) {
    return new Date(v).toLocaleString('fr-FR')
  }
  if (typeof v === 'object') {
    const json = JSON.stringify(v)
    return json.length > 60 ? `${json.slice(0, 57)}…` : json
  }
  return String(v)
}

/** Valeur complète mise en forme : objets/arrays → JSON indenté ; chaîne ressemblant
 *  à du JSON → reparsée & indentée ; sinon brute. */
export function prettyValue(v: unknown): string {
  if (v == null) return '—'
  if (typeof v === 'object') return JSON.stringify(v, null, 2)
  if (typeof v === 'string') {
    const t = v.trim()
    if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
      try { return JSON.stringify(JSON.parse(t), null, 2) } catch { /* pas du JSON → brut */ }
    }
    return v
  }
  return String(v)
}

/** Normalise une valeur en objet/array exploitable (parse les chaînes JSON). */
export function parseMaybeJson(v: unknown): unknown {
  if (typeof v === 'string') {
    const t = v.trim()
    if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
      try { return JSON.parse(t) } catch { return v }
    }
  }
  return v
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

export interface SheetLike { name?: string; columns: { key: string; label?: string }[]; rows: Record<string, unknown>[] }

/** Détecte un tableau de feuilles BDD `{columns, rows}` (ex. excel_data_payload.json). */
export function asSheets(v: unknown): SheetLike[] | null {
  if (!Array.isArray(v) || v.length === 0) return null
  const ok = v.every((s) => isPlainObject(s) && Array.isArray(s.columns) && Array.isArray(s.rows))
  return ok ? (v as unknown as SheetLike[]) : null
}

/** Détecte un tableau d'objets plats (→ rendu en table générique). */
export function asObjectRows(v: unknown): Record<string, unknown>[] | null {
  if (!Array.isArray(v) || v.length === 0) return null
  return v.every(isPlainObject) ? (v as Record<string, unknown>[]) : null
}
