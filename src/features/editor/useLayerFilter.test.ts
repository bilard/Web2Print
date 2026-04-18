import { describe, it, expect } from 'vitest'
import { filterLayers, normalizeForSearch } from './useLayerFilter'
import type { CanvasObjectProps } from '@/stores/editor.store'

function make(id: string, name: string, type: CanvasObjectProps['type'] = 'rect', children?: CanvasObjectProps[]): CanvasObjectProps {
  return {
    id, type, name, visible: true, locked: false,
    x: 0, y: 0, width: 10, height: 10,
    fill: '#000', stroke: '', strokeWidth: 0, opacity: 1, angle: 0,
    flipX: false, flipY: false,
    ...(children ? { children } : {}),
  }
}

describe('normalizeForSearch', () => {
  it('met en minuscules et retire les accents', () => {
    expect(normalizeForSearch('Étoile')).toBe('etoile')
    expect(normalizeForSearch('Trâcé')).toBe('trace')
  })
})

describe('filterLayers', () => {
  const tree = [
    make('a', 'Titre'),
    make('b', '', 'group', [make('c', 'Enfant étoile'), make('d', 'Autre')]),
    make('e', 'Bannière'),
  ]

  it('retourne l\'arbre complet si query vide', () => {
    const { filtered, forceExpandedIds } = filterLayers(tree, '', [])
    expect(filtered).toEqual(tree)
    expect(forceExpandedIds.size).toBe(0)
  })

  it('filtre par nom, insensible à la casse', () => {
    const { filtered } = filterLayers(tree, 'TITRE', [])
    expect(filtered).toHaveLength(1)
    expect(filtered[0].id).toBe('a')
  })

  it('filtre insensible aux accents', () => {
    const { filtered } = filterLayers(tree, 'banniere', [])
    expect(filtered).toHaveLength(1)
    expect(filtered[0].id).toBe('e')
  })

  it('conserve les ancêtres d\'un enfant matché et force expand', () => {
    const { filtered, forceExpandedIds } = filterLayers(tree, 'étoile', [])
    expect(filtered).toHaveLength(1)
    expect(filtered[0].id).toBe('b')
    expect(filtered[0].children?.map((c) => c.id)).toEqual(['c'])
    expect(forceExpandedIds.has('b')).toBe(true)
  })

  it('utilise le label de colonne merge si le nom est une clé', () => {
    const obj = make('x', 'productTitle')
    const { filtered } = filterLayers([obj], 'titre du produit', [{ key: 'productTitle', label: 'Titre du produit' }])
    expect(filtered).toHaveLength(1)
  })

  it('utilise l\'auto-nom pour matcher un objet sans nom', () => {
    const obj = make('y', '', 'ellipse')
    const { filtered } = filterLayers([obj], 'ellipse', [])
    expect(filtered).toHaveLength(1)
  })
})
