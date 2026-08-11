import { describe, it, expect } from 'vitest'
import type { Node } from '@xyflow/react'
import { fromRfNode } from './WorkflowEditor'
import type { WorkflowNode } from '../types'

// ⚠⚠ Le ByPass de trois cartes s'effaçait au premier DÉPLACEMENT de l'une d'elles, sans un
// mot : ReactFlow ne transporte que `type` et `config`, et la conversion inverse
// RECONSTRUISAIT le node — donc perdait tout le reste. Le flux repartait ensuite en
// exécutant les étapes désactivées.
describe('fromRfNode — un déplacement ne perd AUCUN champ du node', () => {
  const stored: WorkflowNode = {
    id: 'n1', type: 'text-enrich', position: { x: 0, y: 0 },
    config: { maxUnits: 500 }, bypass: true,
  }
  const dragged = { id: 'n1', type: 'base', position: { x: 120, y: 340 }, data: { type: 'text-enrich', config: { maxUnits: 500 } } } as Node

  it('garde le ByPass et met à jour la position', () => {
    expect(fromRfNode(dragged, stored)).toEqual({
      id: 'n1', type: 'text-enrich', position: { x: 120, y: 340 },
      config: { maxUnits: 500 }, bypass: true,
    })
  })

  it('gardera aussi les champs AJOUTÉS plus tard — rien n’est reconstruit', () => {
    const future = { ...stored, note: 'à revoir', color: '#f00' } as WorkflowNode & Record<string, unknown>
    const out = fromRfNode(dragged, future) as WorkflowNode & Record<string, unknown>
    expect(out.note).toBe('à revoir')
    expect(out.color).toBe('#f00')
  })

  it('sait encore construire un node inconnu du store (création par glisser-déposer)', () => {
    expect(fromRfNode(dragged)).toEqual({
      id: 'n1', type: 'text-enrich', position: { x: 120, y: 340 }, config: { maxUnits: 500 },
    })
  })
})
