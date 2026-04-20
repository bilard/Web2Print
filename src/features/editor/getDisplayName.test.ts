import { describe, it, expect } from 'vitest'
import { getDisplayName } from './getDisplayName'
import type { CanvasObjectProps } from '@/stores/editor.store'

function make(partial: Partial<CanvasObjectProps> = {}): CanvasObjectProps {
  return {
    id: 'x', type: 'rect', name: '', visible: true, locked: false,
    x: 0, y: 0, width: 10, height: 10,
    fill: '#000', stroke: '', strokeWidth: 0, opacity: 1, angle: 0,
    flipX: false, flipY: false,
    ...partial,
  }
}

describe('getDisplayName', () => {
  it('utilise le label de colonne merge si le nom matche une clé', () => {
    const obj = make({ type: 'text', name: 'productTitle' })
    const columns = [{ key: 'productTitle', label: 'Titre du produit' }]
    expect(getDisplayName(obj, columns)).toBe('Titre du produit')
  })

  it('retourne le nom tel quel si non vide et non clé merge', () => {
    const obj = make({ type: 'rect', name: 'Mon rect' })
    expect(getDisplayName(obj, [])).toBe('Mon rect')
  })

  it('retourne l\'auto-nom si le nom est vide', () => {
    const obj = make({ type: 'ellipse', name: '' })
    expect(getDisplayName(obj, [])).toBe('<Ellipse>')
  })

  it('retourne l\'auto-nom pour un groupe sans nom', () => {
    const obj = make({ type: 'group', name: '' })
    expect(getDisplayName(obj, [])).toBe('<Groupe>')
  })

  it('retourne le contenu du texte pour un text sans nom', () => {
    const obj = make({ type: 'text', name: '', text: 'Nathalie' })
    expect(getDisplayName(obj, [])).toBe('Nathalie')
  })

  it('tronque un texte long et garde seulement la première ligne', () => {
    const long = 'Ligne un\nLigne deux'
    const obj = make({ type: 'text', name: '', text: long })
    expect(getDisplayName(obj, [])).toBe('Ligne un')
  })

  it('tronque à 40 caractères avec ellipse', () => {
    const long = 'a'.repeat(60)
    const obj = make({ type: 'text', name: '', text: long })
    expect(getDisplayName(obj, [])).toBe('a'.repeat(40) + '…')
  })

  it('retombe sur <Texte> si le texte est vide', () => {
    const obj = make({ type: 'text', name: '', text: '   ' })
    expect(getDisplayName(obj, [])).toBe('<Texte>')
  })
})
