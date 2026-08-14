import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AddTileMenu } from './AddTileMenu'
import { deriveMeasures } from '../registry/deriveMeasures'
import type { DataSource } from '../registry/types'

/** Une feuille de deux colonnes : « Marque » (texte) et « Prix » (monnaie). */
const source: DataSource = {
  id: 'pim.products', labelKey: 'bi.source.pim', engine: 'client',
  dimensions: [
    { id: 'brand', labelKey: 'bi.dim.column', label: 'Marque', kind: 'text', get: (r) => r.brand },
    { id: 'price', labelKey: 'bi.dim.column', label: 'Prix', kind: 'number', get: (r) => r.price },
  ],
  measures: [
    { id: 'count', labelKey: 'bi.measure.count', format: 'int', aggregable: true, compute: (r) => r.length },
    ...deriveMeasures([
      { key: 'brand', label: 'Marque', kind: 'text' },
      { key: 'price', label: 'Prix', kind: 'number', format: 'eur' },
    ]),
  ],
}

const openMeasures = () => fireEvent.click(screen.getByText('Mesure').parentElement!.querySelector('button')!)

describe('AddTileMenu — la mesure se choisit parmi les colonnes', () => {
  it('n’utilise AUCUN menu natif (spec, D5)', () => {
    const { container } = render(<AddTileMenu source={source} onAdd={vi.fn()} />)
    expect(container.querySelector('select')).toBeNull()
  })

  it('liste les mesures DÉRIVÉES en plus des déclarées, groupées par colonne', () => {
    render(<AddTileMenu source={source} onAdd={vi.fn()} />)
    openMeasures()
    // La mesure déclarée reste proposée (le bouton la porte aussi : elle est sélectionnée)…
    expect(screen.getAllByText('Nombre de produits').length).toBeGreaterThan(1)
    // …et chaque colonne apporte les siennes, nommées « agrégation · colonne ».
    expect(screen.getByText('Somme · Prix')).toBeTruthy()
    expect(screen.getByText('Médiane · Prix')).toBeTruthy()
    expect(screen.getByText('Valeurs distinctes · Marque')).toBeTruthy()
    // ⚠ Pas de somme sur une colonne de texte : son type ne l'autorise pas.
    expect(screen.queryByText('Somme · Marque')).toBeNull()
  })

  it('ouvre une recherche quand la liste dépasse une dizaine d’entrées', () => {
    render(<AddTileMenu source={source} onAdd={vi.fn()} />)
    openMeasures()
    const search = screen.getByPlaceholderText('Rechercher…')
    fireEvent.change(search, { target: { value: 'médiane' } })
    expect(screen.getByText('Médiane · Prix')).toBeTruthy()
    expect(screen.queryByText('Somme · Prix')).toBeNull()
  })

  it('remonte la COLONNE et son agrégation, jamais un identifiant de mesure déclarée', () => {
    const onAdd = vi.fn()
    render(<AddTileMenu source={source} onAdd={onAdd} />)
    openMeasures()
    fireEvent.click(screen.getByText('Somme · Prix'))
    fireEvent.click(screen.getByText('Ajouter'))
    expect(onAdd).toHaveBeenCalledWith('bar', { field: 'price', agg: 'sum' }, 'brand', undefined)
  })

  it('avertit qu’une mesure non agrégeable ne se totalise pas entre groupes', () => {
    render(<AddTileMenu source={source} onAdd={vi.fn()} />)
    openMeasures()
    fireEvent.click(screen.getByText('Médiane · Prix'))
    expect(screen.getByText(/ne s’additionne pas/)).toBeTruthy()
  })
})
