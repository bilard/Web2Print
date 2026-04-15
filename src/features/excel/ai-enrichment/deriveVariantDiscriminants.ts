import type { EnrichedProduct, ProductVariant } from './types'

/**
 * Analyse les libellés de variantes et dérive les AXES DISCRIMINANTS
 * (attributs qui diffèrent entre variantes) comme colonnes `properties`.
 *
 * Générique — aucun parser par fournisseur. Détecte des motifs industriels
 * communs (profondeur, conditionnement, longueur, couleur, taille, classe).
 *
 * N'écrase JAMAIS une clé déjà présente dans `properties` (LLM prioritaire).
 * Ne garde QUE les clés qui varient entre au moins 2 variantes.
 */

type PatternDef = {
  key: string
  /** Regex avec au moins un groupe de capture (la valeur) */
  re: RegExp
  /** Transforme la valeur brute pour affichage (trim / case / format) */
  format?: (raw: string, fullMatch: string) => string
}

/** Patterns génériques industriels (FR). Ordre : plus spécifique en premier. */
const PATTERNS: PatternDef[] = [
  // Profondeur : "prof.0", "prof 1", "profondeur 2"
  {
    key: 'Profondeur',
    re: /\bprof(?:ondeur)?\s*\.?\s*(\d+(?:[,.]\d+)?)\b/i,
  },
  // Conditionnement : "Palette 40 m", "Carton 100 u", "Lot 50 pcs", "Sachet de 10"
  {
    key: 'Conditionnement',
    re: /\b(palette|carton|lot|sachet|pack|box|colis|caisse)\s+(?:de\s+)?(\d+(?:[,.]\d+)?)\s*(m|cm|mm|kg|g|l|ml|u|pcs?|pi[eè]ces?)?\b/i,
    format: (_raw, full) => {
      const t = full.trim().toLowerCase()
      return t.charAt(0).toUpperCase() + t.slice(1)
    },
  },
  // Diamètre : "Ø 100", "diam 50", "DN 80"
  {
    key: 'Diamètre',
    re: /\b(?:Ø|diam(?:[eè]tre)?\s*\.?|dn)\s*(\d+(?:[,.]\d+)?)\s*(mm|cm)?\b/i,
    format: (raw, full) => {
      const unit = full.match(/\b(mm|cm)\b/i)?.[1] ?? 'mm'
      return `${raw} ${unit}`
    },
  },
  // Longueur explicite : "L 1 m", "longueur 2.5 m"
  {
    key: 'Longueur',
    re: /\b(?:l|longueur)\s*\.?\s*(\d+(?:[,.]\d+)?)\s*(m|cm|mm)\b/i,
    format: (raw, full) => {
      const unit = full.match(/\b(m|cm|mm)\b/i)?.[1] ?? 'm'
      return `${raw} ${unit}`
    },
  },
  // Référence liée dans le libellé (format SKU type DR102CH, PR104CH)
  {
    key: 'Variante liée',
    re: /\b([A-Z]{2,4}\d{2,5}[A-Z]{0,3})\b/,
  },
  // Classe de charge (norme EN 124) : "c250", "d400", "b125"
  {
    key: 'Classe',
    re: /\b([abcdef])(15|125|250|400|600|900)\b/i,
    format: (_raw, full) => full.trim().toUpperCase(),
  },
  // Couleur : mots fréquents FR/EN
  {
    key: 'Couleur',
    re: /\b(noir|blanc|gris|bleu|rouge|vert|jaune|orange|rose|violet|marron|beige|argent|or|transparent|chrom[eé]|inox)\b/i,
    format: (raw) => raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase(),
  },
  // Taille textile : XS, S, M, L, XL, XXL
  {
    key: 'Taille',
    re: /\b(XS|S|M|L|XL|XXL|XXXL)\b/,
  },
]

function extractPatternsFromLabel(label: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const p of PATTERNS) {
    const m = label.match(p.re)
    if (!m) continue
    const raw = (m[1] ?? m[0]).trim()
    const val = p.format ? p.format(raw, m[0]) : raw
    if (val && !out.has(p.key)) out.set(p.key, val)
  }
  return out
}

/** Prend le produit enrichi et injecte les colonnes discriminantes dans chaque variante. */
export function deriveVariantDiscriminants(enriched: EnrichedProduct): EnrichedProduct {
  const variants = enriched.variants
  if (!variants || variants.length < 2) return enriched

  // 1. Extraire les patterns pour chaque variante (depuis le libellé)
  const extracted = variants.map((v) => extractPatternsFromLabel(v.label))

  // 2. Identifier les clés qui VARIENT entre variantes (≥ 2 valeurs distinctes)
  const allKeys = new Set<string>()
  for (const m of extracted) for (const k of m.keys()) allKeys.add(k)

  const varyingKeys = new Set<string>()
  for (const k of allKeys) {
    const values = new Set<string>()
    for (const m of extracted) {
      const v = m.get(k)
      if (v) values.add(v.toLowerCase())
    }
    if (values.size >= 2) varyingKeys.add(k)
  }

  if (varyingKeys.size === 0) return enriched

  // 3. Injecter les propriétés dérivées (sans écraser celles du LLM)
  const next: ProductVariant[] = variants.map((v, i) => {
    const props = { ...v.properties }
    for (const k of varyingKeys) {
      if (props[k]?.trim()) continue // déjà présente (LLM prioritaire)
      const derived = extracted[i].get(k)
      if (derived) props[k] = derived
    }
    return { ...v, properties: props }
  })

  console.log(
    '[variant-discriminants] derived keys:',
    [...varyingKeys],
    'for',
    variants.length,
    'variants',
  )

  return { ...enriched, variants: next }
}
