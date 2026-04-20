import { useEffect, useMemo, useState } from 'react'
import { useMergeStore } from '@/stores/merge.store'
import { listTemplates } from '@/features/scraping-templates/templatesStore'
import type { ScrapingTemplate } from '@/features/scraping-templates/types'

export type VendorMatchStatus = 'matched' | 'alias' | 'absent'

export interface VendorSummary {
  brand: string
  productCount: number
  status: VendorMatchStatus
  template: ScrapingTemplate | null
}

/** Candidats de noms de colonne pouvant contenir la marque. Classé par priorité. */
const BRAND_COLUMN_CANDIDATES = ['marque', 'marques', 'brand', 'brands', 'fabricant', 'marca']

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Détecte la colonne "marque" parmi les colonnes de la source. */
function findBrandColumnKey(columns: { key: string; label: string }[]): string | null {
  for (const candidate of BRAND_COLUMN_CANDIDATES) {
    const col = columns.find(
      (c) => normalize(c.key) === candidate || normalize(c.label) === candidate,
    )
    if (col) return col.key
  }
  return null
}

/** Match un nom de marque à un template : direct (vendorDomain) ou via alias. */
function matchTemplate(brand: string, templates: ScrapingTemplate[]): { template: ScrapingTemplate | null; status: VendorMatchStatus } {
  const needle = normalize(brand)
  if (needle.length < 3) return { template: null, status: 'absent' }

  // 1) Match direct via vendorDomain
  const byDomain = templates.find((t) => {
    const vendorKey = normalize(t.vendorDomain)
    return vendorKey.includes(needle) || needle.includes(vendorKey.split('.')[0] || vendorKey)
  })
  if (byDomain) return { template: byDomain, status: 'matched' }

  // 2) Match via alias explicite
  const byAlias = templates.find((t) =>
    (t.brandAliases ?? []).some((a) => normalize(a) === needle),
  )
  if (byAlias) return { template: byAlias, status: 'alias' }

  return { template: null, status: 'absent' }
}

/**
 * Extrait les marques uniques de la source Excel active, compte les produits
 * par marque et retourne le statut de matching avec les templates existants.
 *
 * - "matched"  : template trouvé automatiquement via vendorDomain
 * - "alias"    : template lié manuellement via brandAliases
 * - "absent"   : aucun template, bouton "Créer" dispo
 *
 * Auto-refresh quand les templates sont invalidés (création/édition alias).
 */
export function useSourceVendors(refreshKey = 0): {
  vendors: VendorSummary[]
  brandColumnKey: string | null
  loading: boolean
} {
  const rows = useMergeStore((s) => s.rows)
  const columns = useMergeStore((s) => s.columns)
  const [templates, setTemplates] = useState<ScrapingTemplate[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const list = await listTemplates()
        if (!cancelled) setTemplates(list)
      } catch (err) {
        console.error('[useSourceVendors] listTemplates error:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [refreshKey])

  const brandColumnKey = useMemo(() => findBrandColumnKey(columns), [columns])

  const vendors = useMemo<VendorSummary[]>(() => {
    if (!brandColumnKey) return []
    const counts = new Map<string, number>()
    for (const r of rows) {
      const v = r[brandColumnKey]
      const brand = typeof v === 'string' ? v.trim() : String(v ?? '').trim()
      if (!brand) continue
      counts.set(brand, (counts.get(brand) ?? 0) + 1)
    }
    const list: VendorSummary[] = []
    for (const [brand, productCount] of counts) {
      const { template, status } = matchTemplate(brand, templates)
      list.push({ brand, productCount, status, template })
    }
    // Tri : absents en premier (à traiter), puis alias, puis matchés. Secondaire : décroissant par count.
    const statusRank: Record<VendorMatchStatus, number> = { absent: 0, alias: 1, matched: 2 }
    list.sort((a, b) => {
      const r = statusRank[a.status] - statusRank[b.status]
      if (r !== 0) return r
      return b.productCount - a.productCount
    })
    return list
  }, [rows, brandColumnKey, templates])

  return { vendors, brandColumnKey, loading }
}
