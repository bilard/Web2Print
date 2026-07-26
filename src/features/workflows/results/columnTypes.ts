// Détection de types de colonnes pour la visualisation. CLÉ : exclure les IDENTIFIANTS
// (EAN/GTIN/SKU/réf/code, ou nombres ≥12 chiffres) des séries numériques — sinon un EAN
// à 13 chiffres (~5e12) écrase l'échelle du graphe et pollue les KPI.
interface ColumnLike { key: string; label?: string }

const NUM_RE = /^-?\d+(?:[.,]\d+)?$/
const ID_RE = /\b(ean|gtin|upc|isbn|sku|ref|reference|référence|code|mpn)\b/i

export function isIdentifierColumn(key: string, label?: string): boolean {
  return ID_RE.test(`${key} ${label ?? ''}`)
}

export function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v ?? '').trim().replace(/\s/g, '')
  if (!NUM_RE.test(s)) return null
  const n = Number(s.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export function formatNumber(n: number): string {
  return n.toLocaleString('fr-FR', { maximumFractionDigits: 2 })
}

/** Colonnes réellement numériques (≥60 % de valeurs numériques), hors identifiants. */
export function numericColumnKeys(columns: ColumnLike[], rows: Record<string, unknown>[]): string[] {
  const out: string[] = []
  for (const c of columns) {
    if (isIdentifierColumn(c.key, c.label)) continue
    const vals = rows.map((r) => String(r[c.key] ?? '').trim()).filter(Boolean)
    if (vals.length === 0) continue
    const cleaned = vals.map((v) => v.replace(/\s/g, ''))
    if (cleaned.every((v) => /^\d{12,}$/.test(v))) continue // identifiant numérique long
    const nums = cleaned.filter((v) => NUM_RE.test(v))
    if (nums.length / cleaned.length >= 0.6) out.push(c.key)
  }
  return out
}

/** Colonne d'axe X : 1re colonne ni numérique ni identifiant (ex. nom produit). */
export function categoricalKey(columns: ColumnLike[], numericKeys: string[]): string {
  const numset = new Set(numericKeys)
  const notNum = columns.filter((c) => !numset.has(c.key))
  const cat = notNum.find((c) => !isIdentifierColumn(c.key, c.label)) ?? notNum[0]
  return cat?.key ?? columns[0]?.key ?? ''
}
