/** Gabarit d'un node dans le repère du workflow (proportions de l'éditeur). */
export const NODE_W = 170
export const NODE_H = 90
const PAD = 40

export interface GraphLayout {
  width: number
  height: number
  pos: Map<string, { x: number; y: number }>
}

/**
 * Cadre le graphe pour qu'il tienne ENTIER dans un `viewBox`.
 *
 * ⚠️ L'éditeur autorise des coordonnées NÉGATIVES : sans recentrage sur le
 * minimum, les nodes concernés sortiraient du cadre et seraient invisibles dans
 * la PWA — sans erreur, sans trou apparent, juste des étapes manquantes.
 */
export function graphLayout(nodes: { id: string; position: { x: number; y: number } }[]): GraphLayout | null {
  if (nodes.length === 0) return null
  const xs = nodes.map((n) => n.position.x)
  const ys = nodes.map((n) => n.position.y)
  const minX = Math.min(...xs) - PAD
  const minY = Math.min(...ys) - PAD
  return {
    width: Math.max(...xs) + NODE_W + PAD - minX,
    height: Math.max(...ys) + NODE_H + PAD - minY,
    pos: new Map(nodes.map((n) => [n.id, { x: n.position.x - minX, y: n.position.y - minY }])),
  }
}
