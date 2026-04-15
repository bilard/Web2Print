import type { EnrichedProduct, ProductVariant } from './types'
import { parseVariantsFromMarkdown } from './markdownParsers'

/**
 * Post-processeur : enrichit les variantes du LLM avec les propriétés extraites
 * depuis le markdown scrapé.
 *
 * Deux sources de propriétés par variante dans le markdown :
 *  1. Tables standard (réf en colonne)     → via parseVariantsFromMarkdown
 *  2. Tables transposées (réf en en-tête)  → via parseTransposedVariantTable
 *  3. Blocs "Caractéristiques" par variante → géré dans parseVariantsFromMarkdown (phase 3)
 *
 * Règle : le LLM reste prioritaire. Le markdown ne fait que combler les trous.
 */
export function enrichVariantsFromMarkdown(
  enriched: EnrichedProduct,
  markdown: string | null,
): EnrichedProduct {
  console.log('[enrich-variants-md] ENTRY — markdown len:', markdown?.length ?? 0, '| variants:', enriched.variants?.length ?? 0)
  if (!markdown || !enriched.variants || enriched.variants.length === 0) {
    console.log('[enrich-variants-md] EARLY EXIT — no markdown or no variants')
    return enriched
  }

  // Diagnostic : chercher chaque réf dans le markdown et compter les occurrences
  const refs = enriched.variants.map(v => v.reference.toUpperCase().trim())
  const mdUpper = markdown.toUpperCase()
  const occurrences = refs.map(r => ({ ref: r, count: (mdUpper.match(new RegExp(`\\b${r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g')) || []).length }))
  console.log('[enrich-variants-md] SKU occurrences in markdown:', occurrences)

  const byRef = new Map<string, ProductVariant>()
  for (const v of enriched.variants) {
    byRef.set(v.reference.toUpperCase().trim(), v)
  }

  let mergedCount = 0
  const merge = (ref: string, props: Record<string, string>): void => {
    const key = ref.toUpperCase().trim()
    const target = byRef.get(key)
    if (!target) return
    for (const [k, v] of Object.entries(props)) {
      if (!v?.trim()) continue
      if (!target.properties[k]?.trim()) {
        target.properties[k] = v
        mergedCount++
      }
    }
  }

  // 1 + 3) Parsing standard (tables + blobs caractéristiques)
  const parsed = parseVariantsFromMarkdown(markdown)
  for (const p of parsed) {
    merge(p.reference, p.properties)
  }

  // 2) Tables transposées (attribut en 1re colonne, réfs en en-tête)
  const transposed = parseTransposedVariantTables(markdown)
  for (const [ref, props] of transposed) {
    merge(ref, props)
  }

  // 4) Scanner inline : "Key : Value" après la mention d'une réf LLM
  //    Utile quand Puppeteer+turndown produit des listes à puces structurées
  //    au lieu des anciens blobs "Voir moins".
  const inline = parseInlineVariantSpecs(markdown, [...byRef.keys()])
  for (const [ref, props] of inline) {
    merge(ref, props)
  }

  console.log('[enrich-variants-md] DONE — merged', mergedCount, 'values from markdown (parsed:', parsed.length, '| transposed:', transposed.size, '| inline:', inline.size, ')')
  if (mergedCount === 0 && refs.some(r => occurrences.find(o => o.ref === r)?.count ?? 0 > 1)) {
    // Diagnostic : extraire un échantillon autour de la 1re réf pour comprendre le format
    const firstRef = refs[0]
    const idx = mdUpper.indexOf(firstRef)
    if (idx >= 0) {
      const sample = markdown.slice(Math.max(0, idx - 100), Math.min(markdown.length, idx + 500))
      console.log('[enrich-variants-md] DIAGNOSTIC — sample around first ref:', JSON.stringify(sample))
    }
  }

  return { ...enriched, variants: [...byRef.values()] }
}

/**
 * Détecte les tables markdown où les VARIANTES sont en en-tête (colonnes)
 * et les ATTRIBUTS en 1re colonne (lignes).
 *
 * Exemple :
 *   | Caractéristique     | DR100CH | DR101CH | DR102CH |
 *   | ------------------- | ------- | ------- | ------- |
 *   | Hauteur intérieure  | 174 mm  | 184 mm  | 194 mm  |
 *   | Hauteur extérieure  | 210 mm  | 220 mm  | 230 mm  |
 *
 * → { DR100CH: {Hauteur intérieure: "174 mm", ...}, DR101CH: {...}, ... }
 */
function parseTransposedVariantTables(md: string): Map<string, Record<string, string>> {
  const out = new Map<string, Record<string, string>>()
  const lines = md.split('\n')
  const SKU_RE = /^[A-Z]{1,4}\d{2,6}[A-Z0-9]{0,6}$/i

  let inTable = false
  let headerCells: string[] = []
  let skuColumns: Array<{ idx: number; ref: string }> = []

  const reset = () => { inTable = false; headerCells = []; skuColumns = [] }

  for (let li = 0; li < lines.length; li++) {
    const trimmed = lines[li].trim()
    const isTableRow = trimmed.startsWith('|') && trimmed.endsWith('|')

    if (!inTable && isTableRow) {
      const cells = trimmed.split('|').slice(1, -1).map(c => c.trim())
      if (cells.length < 3) continue
      // Détecter ≥ 2 cellules header qui ressemblent à des SKU
      const skuCells: Array<{ idx: number; ref: string }> = []
      for (let i = 1; i < cells.length; i++) {
        const raw = cells[i].replace(/[*_`]/g, '').trim()
        if (SKU_RE.test(raw)) skuCells.push({ idx: i, ref: raw })
      }
      if (skuCells.length >= 2) {
        inTable = true
        headerCells = cells
        skuColumns = skuCells
        continue
      }
    }

    if (inTable && /^\|[\s\-:|]+\|$/.test(trimmed)) continue

    if (inTable && isTableRow) {
      const cells = trimmed.split('|').slice(1, -1).map(c => c.trim().replace(/^\*+|\*+$/g, ''))
      const attrName = cells[0]?.replace(/^\*+|\*+$/g, '').trim()
      if (!attrName || attrName.length > 60 || /^[-:\s]+$/.test(attrName)) continue
      for (const { idx, ref } of skuColumns) {
        const val = cells[idx]?.trim()
        if (!val || val === '—' || val === '-' || /^[-–—]+$/.test(val)) continue
        const bucket = out.get(ref.toUpperCase()) ?? {}
        if (!bucket[attrName]) bucket[attrName] = val
        out.set(ref.toUpperCase(), bucket)
      }
      continue
    }

    if (inTable && !isTableRow) reset()
  }

  if (out.size > 0) {
    console.log('[transposed-variant-table] parsed', out.size, 'variant columns with attributes')
  }
  return out
}

/**
 * Scanner inline : suit les mentions des SKU connus dans le markdown et collecte
 * les paires "Clé : Valeur" (bullets, lignes structurées) qui suivent jusqu'au
 * prochain SKU ou au prochain heading d'une autre section.
 *
 * Fonctionne pour les pages où chaque variante a sa propre section (header,
 * accordéon déplié, ou liste détaillée). Générique — aucun parser par fournisseur.
 */
function parseInlineVariantSpecs(
  md: string,
  knownRefs: string[],
): Map<string, Record<string, string>> {
  const out = new Map<string, Record<string, string>>()
  if (knownRefs.length === 0) return out

  const refSet = new Set(knownRefs.map(r => r.toUpperCase().trim()))
  const SKU_IN_LINE = /\b([A-Z]{1,6}\d{2,8}[A-Z]{0,4})\b/g
  const KV_LINE = /^[*\-•>]?\s*\**\s*([^:*\n][^:*\n]{1,58})\**\s*:\s*(.{1,200})$/

  const lines = md.split('\n')
  let currentRef: string | null = null

  for (const raw of lines) {
    const trimmed = raw.trim()
    if (!trimmed) continue

    // Changement de variante : toute ligne contenant une réf connue devient la nouvelle cible.
    // On reset uniquement si la ligne n'est PAS elle-même une paire K:V (ex: "Type de sortie : DR100CH"
    // ne doit pas changer la variante courante).
    SKU_IN_LINE.lastIndex = 0
    const matches = [...trimmed.matchAll(SKU_IN_LINE)]
    const isKvLine = KV_LINE.test(trimmed)
    if (!isKvLine && matches.length > 0) {
      for (const m of matches) {
        const ref = m[1].toUpperCase()
        if (refSet.has(ref)) { currentRef = ref; break }
      }
      continue
    }

    // Nouveau heading majeur (#, ##, ###) — sortie de contexte variante
    if (/^#{1,4}\s+/.test(trimmed) && !matches.length) {
      currentRef = null
      continue
    }

    if (!currentRef) continue

    // Paires Key : Value
    const kv = trimmed.match(KV_LINE)
    if (!kv) continue
    const key = kv[1].replace(/\*\*/g, '').trim()
    const value = kv[2].replace(/\*\*/g, '').trim()
    if (!key || !value) continue
    if (key.length < 2 || key.length > 60) continue
    if (/^(tarif|prix|price|stock|disponibilit)/i.test(key)) continue
    // Ignorer valeurs qui ressemblent à des URLs ou du markdown de lien
    if (/^\[.*\]\(.*\)$/.test(value)) continue
    if (/^https?:\/\//.test(value)) continue

    const bucket = out.get(currentRef) ?? {}
    if (!bucket[key]) bucket[key] = value
    out.set(currentRef, bucket)
  }

  if (out.size > 0) {
    let total = 0
    for (const props of out.values()) total += Object.keys(props).length
    console.log('[inline-variant-specs] parsed', total, 'K:V pairs across', out.size, 'variants')
  }
  return out
}
