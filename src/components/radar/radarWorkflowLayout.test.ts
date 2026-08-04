import { describe, it, expect } from 'vitest'

/**
 * Le calcul de cadrage du graphe : c'est lui qui décide si le workflow tient
 * dans l'écran ou déborde. Une erreur ici ne lève rien — elle rogne simplement
 * des nodes hors du viewBox, invisible tant qu'on ne regarde pas un vrai graphe.
 */
import { graphLayout, NODE_W, NODE_H } from './radarWorkflowLayout'

const layout = (nodes: { id: string; position: { x: number; y: number } }[]) => graphLayout(nodes)!

describe('cadrage du graphe', () => {
  it('englobe le node le plus à droite ET le plus bas, marge comprise', () => {
    const l = layout([
      { id: 'a', position: { x: 0, y: 0 } },
      { id: 'b', position: { x: 600, y: 400 } },
    ])
    const b = l.pos.get('b')!
    expect(b.x + NODE_W).toBeLessThanOrEqual(l.width)
    expect(b.y + NODE_H).toBeLessThanOrEqual(l.height)
  })

  it('ramène des coordonnées NÉGATIVES dans le cadre', () => {
    // L'éditeur autorise les positions négatives : sans recentrage, ces nodes
    // sortiraient du viewBox et seraient invisibles dans la PWA.
    const l = layout([
      { id: 'a', position: { x: -300, y: -120 } },
      { id: 'b', position: { x: 0, y: 0 } },
    ])
    const a = l.pos.get('a')!
    expect(a.x).toBeGreaterThanOrEqual(0)
    expect(a.y).toBeGreaterThanOrEqual(0)
  })

  it('reste valide avec un seul node', () => {
    const l = layout([{ id: 'a', position: { x: 42, y: 7 } }])
    expect(l.width).toBe(NODE_W + 80)
    expect(l.height).toBe(NODE_H + 80)
  })

  it('rend null sur un graphe vide — pas un cadre de taille infinie', () => {
    // `Math.min()` sur un tableau vide donne Infinity : sans ce garde-fou, le
    // viewBox devenait « NaN NaN » et le SVG disparaissait en silence.
    expect(graphLayout([])).toBeNull()
  })
})
