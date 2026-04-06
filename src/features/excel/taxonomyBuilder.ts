import type { ExcelSheet, ExcelColumn, TaxonomyCategory, TaxonomyTag, TaxonomyLevelMap } from './types'

const LEVEL_COLORS = [
  '#6366f1', '#3b82f6', '#06b6d4', '#22c55e', '#eab308',
  '#f97316', '#ef4444', '#a855f7', '#ec4899', '#64748b',
]

export function getLevelColor(level: number): string {
  return LEVEL_COLORS[(level - 1) % LEVEL_COLORS.length]
}

/** Build taxonomy categories/tags from column level assignments */
export function buildTaxonomyFromLevels(sheet: ExcelSheet, levels: TaxonomyLevelMap): TaxonomyCategory[] {
  const taxoCols = sheet.columns
    .filter((c) => (levels[c.key] ?? 0) > 0)
    .sort((a, b) => (levels[a.key] ?? 0) - (levels[b.key] ?? 0))

  if (taxoCols.length === 0) return []

  const categories: TaxonomyCategory[] = []
  const catMap = new Map<string, TaxonomyCategory>()

  for (const col of taxoCols) {
    const lvl = levels[col.key] ?? 0
    const color = getLevelColor(lvl)

    const uniqueValues = [...new Set(
      sheet.rows
        .map((r) => r[col.key])
        .filter((v) => v !== null && v !== '' && v !== undefined)
        .map(String)
    )]

    if (lvl === 1) {
      for (const val of uniqueValues) {
        if (!catMap.has(val)) {
          const cat: TaxonomyCategory = {
            id: `cat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name: val,
            color,
            tags: [],
          }
          catMap.set(val, cat)
          categories.push(cat)
        }
      }
    } else {
      // Sub-levels become tags, linked to parent by row association
      const parentCol = taxoCols.find((c) => (levels[c.key] ?? 0) === lvl - 1)
      const seenTags = new Set<string>()

      for (const val of uniqueValues) {
        if (seenTags.has(val)) continue
        seenTags.add(val)

        let parentCat: TaxonomyCategory | undefined
        if (parentCol) {
          const row = sheet.rows.find((r) => String(r[col.key]) === val && r[parentCol.key] !== null)
          if (row) parentCat = catMap.get(String(row[parentCol.key]))
        }
        if (!parentCat) parentCat = categories[0]
        if (!parentCat) continue

        const tag: TaxonomyTag = {
          id: `tag_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          label: val,
          color,
          parentId: parentCat.id,
        }
        parentCat.tags.push(tag)
      }
    }
  }

  return categories
}

/** Get sorted taxonomy columns from a sheet */
export function getTaxoColumns(sheet: ExcelSheet): { col: ExcelColumn; level: number; color: string }[] {
  const levels = sheet.taxonomyLevels ?? {}
  return sheet.columns
    .filter((c) => (levels[c.key] ?? 0) > 0)
    .map((c) => ({ col: c, level: levels[c.key], color: getLevelColor(levels[c.key]) }))
    .sort((a, b) => a.level - b.level)
}

/** Get max assigned level */
export function getMaxLevel(levels: TaxonomyLevelMap): number {
  return Math.max(0, ...Object.values(levels))
}
