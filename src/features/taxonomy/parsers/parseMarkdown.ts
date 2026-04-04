// src/features/taxonomy/parsers/parseMarkdown.ts
import type { TaxonomyNode } from '../types'

/**
 * Parse un fichier Markdown de nomenclature :
 * - `## N. Titre` → niveau 0 (racine)
 * - `- **Gras**`  → niveau 1
 * - `  - Texte`   → niveau 2+ (indenté)
 * - `- Texte`     → niveau 1 (bullet simple, parent = H2 courant)
 */
export function parseMarkdown(content: string): TaxonomyNode[] {
  const nodes: TaxonomyNode[] = []
  const lines = content.split('\n')

  let currentLevel0: TaxonomyNode | null = null
  let currentLevel1: TaxonomyNode | null = null
  let order0 = 0
  let order1 = 0
  let order2 = 0

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    if (!line.trim()) continue

    // H2 → niveau 0
    const h2 = line.match(/^##\s+(?:\d+\.\s+)?(.+)$/)
    if (h2) {
      const node: TaxonomyNode = {
        id: crypto.randomUUID(),
        label: h2[1].trim(),
        parentId: null,
        order: order0++,
        level: 0,
        linkedProjectIds: [],
      }
      nodes.push(node)
      currentLevel0 = node
      currentLevel1 = null
      order1 = 0
      continue
    }

    // Bold bullet → niveau 1
    const bold = line.match(/^-\s+\*\*(.+?)\*\*\s*$/)
    if (bold && currentLevel0) {
      const node: TaxonomyNode = {
        id: crypto.randomUUID(),
        label: bold[1].trim(),
        parentId: currentLevel0.id,
        order: order1++,
        level: 1,
        linkedProjectIds: [],
      }
      nodes.push(node)
      currentLevel1 = node
      order2 = 0
      continue
    }

    // Indented bullet → niveau 2 (sous level1 si présent, sinon level0)
    const indented = line.match(/^\s+-\s+(.+)$/)
    if (indented) {
      const parent = currentLevel1 ?? currentLevel0
      if (!parent) continue
      nodes.push({
        id: crypto.randomUUID(),
        label: indented[1].trim(),
        parentId: parent.id,
        order: order2++,
        level: parent.level + 1,
        linkedProjectIds: [],
      })
      continue
    }

    // Plain bullet → niveau 1 (sous level0 courant)
    const plain = line.match(/^-\s+(.+)$/)
    if (plain && currentLevel0) {
      const node: TaxonomyNode = {
        id: crypto.randomUUID(),
        label: plain[1].trim(),
        parentId: currentLevel0.id,
        order: order1++,
        level: 1,
        linkedProjectIds: [],
      }
      nodes.push(node)
      currentLevel1 = node
      order2 = 0
      continue
    }
  }

  return nodes
}
