// ⚠⚠ Ce que ces tests protègent : une case à cocher qui ne commande RIEN. `stacked` et
// `showTotals` vivaient au contrat sans qu'aucune interface ne les pose — atteignables
// seulement par un document écrit à la main. Et une bascule proposée sur un visuel qu'elle
// ne concerne pas (empiler un camembert) se lit comme une panne.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BiFormatSection } from './BiFormatSection'
import type { Tile, TileKind } from '../types'

const tile = (kind: TileKind, options?: Tile['options']): Tile => ({
  id: 't1', kind, title: 'T', options,
  query: { source: 'pim.products', measures: [{ id: 'count' }], dimensions: [], filters: [] },
})

const mount = (t: Tile | null, onApply = vi.fn()) => {
  const view = render(<BiFormatSection tile={t} canEdit onApply={onApply} />)
  return { view, onApply }
}

describe('la section de mise en forme', () => {
  it('propose l’orientation sur les barres', () => {
    mount(tile('bar'))
    expect(screen.getByText('Barres couchées')).toBeTruthy()
  })

  it('ne propose RIEN sur un visuel qu’aucune bascule ne concerne', () => {
    const { view } = mount(tile('pie'))
    expect(view.container.textContent).toBe('')
  })

  it('n’empile pas un camembert, mais propose la ligne de totaux au croisé', () => {
    mount(tile('pivot'))
    expect(screen.queryByText('Empiler les séries')).toBeNull()
    expect(screen.getByText('Ligne de totaux')).toBeTruthy()
  })

  it('pose l’option sur la tuile', () => {
    const { onApply } = mount(tile('bar'))
    fireEvent.click(screen.getByText('Barres couchées'))
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.objectContaining({ horizontal: true }),
    }))
  })

  // ⚠ La clé est RETIRÉE quand elle retombe à faux : le document ne garde que ce qui s'écarte
  // du défaut, et Firestore refuse `undefined`.
  it('retire l’option au lieu de l’écrire à faux', () => {
    const { onApply } = mount(tile('bar', { horizontal: true }))
    fireEvent.click(screen.getByText('Barres couchées'))
    const next = onApply.mock.calls[0][0] as Tile
    expect('horizontal' in (next.options ?? {})).toBe(false)
  })

  it('se tait sans tuile sélectionnée', () => {
    const { view } = mount(null)
    expect(view.container.textContent).toBe('')
  })
})
