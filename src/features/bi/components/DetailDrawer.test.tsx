// ⚠⚠ Ce que ces tests protègent : un extrait lu comme s'il était le tout. Un détail qui
// tait sa troncature ou ses filtres fait voyager un chiffre partiel sous l'habit d'un total.
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DetailDrawer } from './DetailDrawer'
import type { UnderlyingRows } from '../engine/underlyingRows'

const detail = (over: Partial<UnderlyingRows> = {}): UnderlyingRows => ({
  columns: [{ key: 'domain', labelKey: 'bi.dim.competitor' }],
  rows: [{ domain: 'alpha.fr' }, { domain: null }],
  total: 2, truncated: false, ...over,
})

const drawer = (d: UnderlyingRows, filters: string[] = []) => (
  <DetailDrawer title="Appariés" detail={d} filters={filters} onClose={vi.fn()} onExport={vi.fn()} />
)

describe('tiroir de détail', () => {
  it('annonce le décompte RÉEL quand l’échantillon est plafonné', () => {
    render(drawer(detail({ total: 63495, truncated: true })))
    expect(screen.getByText(/63\s?495/)).toBeTruthy()
  })

  it('affiche les filtres actifs, et le dit quand il n’y en a aucun', () => {
    const { unmount } = render(drawer(detail(), ['Concurrent : alpha.fr']))
    expect(screen.getByText('Concurrent : alpha.fr')).toBeTruthy()
    unmount()
    render(drawer(detail()))
    expect(screen.getByText('Aucun filtre')).toBeTruthy()
  })

  it('rend une valeur absente en TIRET, jamais en zéro ni en case vide', () => {
    render(drawer(detail()))
    expect(screen.getByText('—')).toBeTruthy()
  })

  it('dit qu’aucune ligne ne compose le chiffre plutôt que de montrer un tableau vide', () => {
    render(drawer(detail({ rows: [], total: 0 })))
    expect(screen.getByText(/Aucune ligne/)).toBeTruthy()
  })
})
