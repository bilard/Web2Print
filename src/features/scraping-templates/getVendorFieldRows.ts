import type { EnrichedProduct } from '@/features/excel/ai-enrichment/types'
import type { ScrapingTemplate } from './types'

/**
 * Helper partagé entre VendorFieldOrderModal (enrichment panel) et
 * ProductSheet (colonne source gauche). Calcule la liste ordonnée des
 * champs à afficher et/ou à trier pour un fournisseur donné.
 *
 * La liste combine :
 *   1. Union des `fields` déclarés dans les templates du vendor
 *   2. Sections "synthétiques" toujours rendues par EnrichmentPanel même
 *      quand elles ne sont pas déclarées comme fields (images, spécifications,
 *      variants, documents, advantages, description)
 *   3. Clés de `customFields` qui existent dans l'enrichissement mais pas
 *      dans les templates (champs ajoutés dynamiquement par l'IA)
 *
 * L'ordre initial respecte `vendorFieldOrder` s'il existe, puis append les
 * items nouveaux. L'aperçu de la valeur (`preview`) est calculé depuis
 * l'EnrichedProduct courant si disponible.
 */

export interface FieldRow {
  /** Clé stable = identifiant pour sortable + entrée dans vendorFieldOrder. */
  key: string
  /** Libellé humain pour l'affichage. */
  label: string
  /** Aperçu court de la valeur scrapée — "—" si vide ou indispo. */
  preview: string
  /** Nombre de templates du vendor qui utilisent ce champ. */
  used: number
  /** Nombre total de templates du vendor. */
  total: number
  /** `true` si présent dans tous les templates du vendor. */
  shared: boolean
  /** Nombre d'items dans la data scrapée (liste → longueur, string → null). */
  count: number | null
}

/** Sections toujours rendues par EnrichmentPanel, même sans template field. */
const SYNTHETIC_KEYS = ['images', 'description', 'advantages', 'specifications', 'variants', 'documents'] as const

const LABELS: Record<string, string> = {
  images: 'Images',
  description: 'Description',
  advantages: 'Points forts',
  specifications: 'Spécifications',
  variants: 'Variantes',
  documents: 'Documents',
  title: 'Titre',
  brand: 'Marque',
  reference: 'Référence',
  price: 'Prix',
  ean: 'EAN',
}

function truncate(s: string, n: number): string {
  const clean = (s ?? '').replace(/\s+/g, ' ').trim()
  if (!clean) return '—'
  return clean.length > n ? clean.slice(0, n - 1) + '…' : clean
}

function countFor(key: string, p: EnrichedProduct | null | undefined): number | null {
  if (!p) return null
  switch (key) {
    case 'images': return p.images.length
    case 'advantages': return p.advantages.length
    case 'specifications': return p.specifications.length
    case 'variants': return p.variants.length
    case 'documents': return p.documents.length
    case 'description': return null
    default: {
      const v = p.customFields?.[key]
      if (Array.isArray(v)) return v.length
      return null
    }
  }
}

function previewFor(key: string, p: EnrichedProduct | null | undefined): string {
  if (!p) return '—'
  switch (key) {
    case 'images':
      return p.images.length > 0 ? `${p.images.length} image${p.images.length > 1 ? 's' : ''}` : '—'
    case 'description':
      return truncate(p.description, 90)
    case 'advantages': {
      if (p.advantages.length === 0) return '—'
      const first = p.advantages[0]?.text ?? ''
      return `${p.advantages.length} item${p.advantages.length > 1 ? 's' : ''} · ${truncate(first, 50)}`
    }
    case 'specifications':
      return p.specifications.length > 0 ? `${p.specifications.length} ligne${p.specifications.length > 1 ? 's' : ''}` : '—'
    case 'variants':
      if (p.variants.length === 0) return '—'
      return `${p.variants.length} · ${truncate(p.variants[0]?.reference ?? p.variants[0]?.label ?? '', 40)}`
    case 'documents':
      return p.documents.length > 0 ? `${p.documents.length} document${p.documents.length > 1 ? 's' : ''}` : '—'
    default: {
      const v = p.customFields?.[key]
      if (Array.isArray(v)) {
        if (v.length === 0) return '—'
        return `${v.length} · ${truncate(v[0] ?? '', 50)}`
      }
      if (typeof v === 'string') return truncate(v, 90)
      return '—'
    }
  }
}

export function getVendorFieldRows(
  vendorTemplates: ScrapingTemplate[],
  enriched: EnrichedProduct | null | undefined,
  savedOrder: string[] = [],
): FieldRow[] {
  const total = vendorTemplates.length

  // 1. Usage par clé (nombre de templates la déclarant)
  const usage = new Map<string, number>()
  for (const t of vendorTemplates) {
    const seen = new Set<string>()
    for (const f of t.fields) {
      if (seen.has(f.field)) continue
      seen.add(f.field)
      usage.set(f.field, (usage.get(f.field) ?? 0) + 1)
    }
  }

  // 2. Sections synthétiques présentes dans l'enrichissement : on ajoute UNIQUEMENT
  //    celles qui ont du contenu (images > 0, description non vide, etc.). Cela
  //    permet à la liste de fonctionner SANS template — la liste est dérivée de
  //    la data scrapée réelle.
  if (enriched) {
    const has = (k: string): boolean => {
      switch (k) {
        case 'images': return enriched.images.length > 0
        case 'description': return (enriched.description ?? '').trim().length > 0
        case 'advantages': return enriched.advantages.length > 0
        case 'specifications': return enriched.specifications.length > 0
        case 'variants': return enriched.variants.length > 0
        case 'documents': return enriched.documents.length > 0
        default: return false
      }
    }
    for (const k of SYNTHETIC_KEYS) {
      if (has(k) && !usage.has(k)) usage.set(k, 0)
    }
    // customFields dynamiques présents dans l'enrichissement mais absents des templates
    for (const k of Object.keys(enriched.customFields ?? {})) {
      if (!usage.has(k)) usage.set(k, 0)
    }
  }

  // 3. Si on a des templates mais pas encore d'enrichissement : inclure toutes
  //    les sections synthétiques comme placeholders.
  if (total > 0 && !enriched) {
    for (const k of SYNTHETIC_KEYS) {
      if (!usage.has(k)) usage.set(k, total)
    }
  }

  // 4. Ordre : savedOrder d'abord, puis synthetic manquants, puis le reste.
  const ordered: string[] = []
  const seenKey = new Set<string>()
  for (const k of savedOrder) {
    if (usage.has(k) && !seenKey.has(k)) { ordered.push(k); seenKey.add(k) }
  }
  for (const k of SYNTHETIC_KEYS) {
    if (usage.has(k) && !seenKey.has(k)) { ordered.push(k); seenKey.add(k) }
  }
  for (const k of usage.keys()) {
    if (!seenKey.has(k)) { ordered.push(k); seenKey.add(k) }
  }

  // 5. Rows avec previews
  return ordered.map((key) => {
    const used = usage.get(key) ?? 0
    return {
      key,
      label: LABELS[key] ?? key,
      preview: previewFor(key, enriched),
      used,
      total,
      shared: total > 0 && used >= total,
      count: countFor(key, enriched),
    }
  })
}
