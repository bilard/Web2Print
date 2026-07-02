import { describe, expect, it } from 'vitest'
import type { MergeColumn, MergeRow } from '@/stores/merge.store'
import { EMPTY_TREE_EDITS, buildCatalogTree, flattenTree, guessLevelKeys } from './catalogTree'

const columns: MergeColumn[] = [
  { key: 'univers', label: 'Univers', fieldType: 'text' },
  { key: 'fam', label: 'Famille', fieldType: 'text' },
  { key: 'sfam', label: 'Sous-famille', fieldType: 'text' },
  { key: 'name', label: 'Nom', fieldType: 'text' },
]
const row = (id: string, u: string, f = '', sf = ''): MergeRow => ({ _id: id, univers: u, fam: f, sfam: sf })

describe('guessLevelKeys', () => {
  it('devine les 3 niveaux sur les libellés FR', () => {
    expect(guessLevelKeys(columns)).toEqual({ univers: 'univers', famille: 'fam', sousFamille: 'sfam' })
  })
  it('rend un objet vide si rien ne matche', () => {
    expect(guessLevelKeys([{ key: 'x', label: 'Nom', fieldType: 'text' }])).toEqual({})
  })
})

describe('buildCatalogTree', () => {
  const keys = { univers: 'univers', famille: 'fam', sousFamille: 'sfam' }

  it('regroupe par chemin, ordre de première apparition', () => {
    const rows = [row('1', 'Outillage', 'Perceuses'), row('2', 'Jardin'), row('3', 'Outillage', 'Perceuses'), row('4', 'Outillage', 'Scies')]
    const tree = buildCatalogTree(rows, columns, keys, EMPTY_TREE_EDITS)
    expect(tree.map((n) => n.label)).toEqual(['Outillage', 'Jardin'])
    expect(tree[0].children.map((n) => n.label)).toEqual(['Perceuses', 'Scies'])
    expect(tree[0].children[0].productIds).toEqual(['1', '3'])
    expect(tree[1].productIds).toEqual(['2']) // pas de famille → rattaché à l'univers
  })

  it('produit sans aucune valeur taxo → nœud « Autres »', () => {
    const tree = buildCatalogTree([row('1', '')], columns, keys, EMPTY_TREE_EDITS)
    expect(tree).toHaveLength(1)
    expect(tree[0].label).toBe('Autres')
    expect(tree[0].productIds).toEqual(['1'])
  })

  it('aucune colonne mappée → nœud unique « Produits »', () => {
    const tree = buildCatalogTree([row('1', 'X')], columns, {}, EMPTY_TREE_EDITS)
    expect(tree).toHaveLength(1)
    expect(tree[0].label).toBe('Produits')
    expect(tree[0].productIds).toEqual(['1'])
  })

  it('renommage fusionne deux nœuds frères', () => {
    const rows = [row('1', 'Outillage'), row('2', 'Outils')]
    const tree = buildCatalogTree(rows, columns, keys, { ...EMPTY_TREE_EDITS, renames: { '1:Outils': 'Outillage' } })
    expect(tree).toHaveLength(1)
    expect(tree[0].productIds).toEqual(['1', '2'])
  })

  it('moves déplace un produit vers un autre chemin', () => {
    const rows = [row('1', 'Outillage', 'Perceuses'), row('2', 'Jardin')]
    const tree = buildCatalogTree(rows, columns, keys, { ...EMPTY_TREE_EDITS, moves: { '2': ['Outillage', 'Perceuses'] } })
    expect(tree).toHaveLength(1)
    expect(tree[0].children[0].productIds).toEqual(['1', '2'])
  })

  it('order réordonne les enfants, inconnus après', () => {
    const rows = [row('1', 'A'), row('2', 'B'), row('3', 'C')]
    const idB = buildCatalogTree([row('2', 'B')], columns, keys, EMPTY_TREE_EDITS)[0].id
    const tree = buildCatalogTree(rows, columns, keys, { ...EMPTY_TREE_EDITS, order: { '': [idB] } })
    expect(tree.map((n) => n.label)).toEqual(['B', 'A', 'C'])
  })

  it('flattenTree parcourt en profondeur', () => {
    const rows = [row('1', 'Outillage', 'Perceuses', 'Visseuses'), row('2', 'Jardin')]
    const flat = flattenTree(buildCatalogTree(rows, columns, keys, EMPTY_TREE_EDITS))
    expect(flat.map((n) => `${n.level}:${n.label}`)).toEqual(['1:Outillage', '2:Perceuses', '3:Visseuses', '1:Jardin'])
  })
})
