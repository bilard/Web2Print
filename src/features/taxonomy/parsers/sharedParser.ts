// src/features/taxonomy/parsers/sharedParser.ts
import type { TaxonomyNode } from '../types'

// Match label columns: level_1, Nom_Niveau1, Niveau_1, Nom_Level1.
// Exclude ID columns (ID_Niveau1, ID_Level1) — those carry codes, not labels.
const LEVEL_KEY_RE = /^(?:nom[_\s]?)?(?:level|niveau)[_\s]?\d+$/i

/**
 * Convertit des lignes avec colonnes level_1, level_2, …level_N
 * (ou Nom_NiveauN / Niveau_N, casse libre) en TaxonomyNodes.
 * Les valeurs identiques à même niveau sont dédupliquées.
 */
export function nodesFromRows(rows: Record<string, string>[]): TaxonomyNode[] {
  if (rows.length === 0) return []

  const sampleRow = rows[0]
  const levelKeys = Object.keys(sampleRow)
    .filter((k) => LEVEL_KEY_RE.test(k))
    .sort((a, b) => {
      const na = parseInt(a.replace(/\D/g, ''), 10)
      const nb = parseInt(b.replace(/\D/g, ''), 10)
      return na - nb
    })

  if (levelKeys.length === 0) return []

  const nodes: TaxonomyNode[] = []
  const pathToId = new Map<string, string>()

  for (const row of rows) {
    let parentId: string | null = null

    for (let i = 0; i < levelKeys.length; i++) {
      const key = levelKeys[i]
      const label = String(row[key] ?? '').trim()
      if (!label) break

      const pathKey = levelKeys
        .slice(0, i + 1)
        .map((k) => String(row[k] ?? '').trim())
        .join('|||')

      if (!pathToId.has(pathKey)) {
        const id = crypto.randomUUID()
        pathToId.set(pathKey, id)

        const siblings = nodes.filter(
          (n) => n.parentId === parentId && n.level === i
        )

        nodes.push({
          id,
          label,
          parentId,
          order: siblings.length,
          level: i,
          linkedProjectIds: [],
        })
      }

      parentId = pathToId.get(pathKey)!
    }
  }

  return nodes
}
