// ⚠⚠ L'âge n'était calculé qu'au RENDU : une tuile stable affichait « 0 s » indéfiniment.
// Un âge qui ne vieillit jamais certifie une fraîcheur qu'il n'a pas vérifiée.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { act } from 'react'
import { TileFrame } from './TileFrame'

const frame = (updatedAt: number | null, live = true) => (
  <TileFrame
    title="Nombre de produits" updatedAt={updatedAt} live={live} state="ready"
    skeleton="kpi" editing={false} onRetry={vi.fn()} onClearFilters={vi.fn()}
  >
    <span>42</span>
  </TileFrame>
)

afterEach(() => vi.useRealTimers())

describe('âge de la donnée', () => {
  it('vieillit tout seul, sans nouveau calcul de la tuile', () => {
    vi.useFakeTimers()
    const now = Date.now()
    render(frame(now))
    expect(screen.getByText('0 s')).toBeTruthy()

    // L'étiquette suit le battement du cadre (dix secondes), pas la seconde exacte.
    act(() => { vi.advanceTimersByTime(50_000) })
    expect(screen.getByText('50 s')).toBeTruthy()

    act(() => { vi.advanceTimersByTime(130_000) })
    expect(screen.getByText('3 min')).toBeTruthy()
  })

  it('sans donnée reçue, affiche un tiret et ne lance aucune minuterie', () => {
    vi.useFakeTimers()
    render(frame(null))
    expect(screen.getByText('—')).toBeTruthy()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('le point de direct ne s’affiche que pour une tuile réellement branchée', () => {
    const { container, rerender } = render(frame(Date.now(), false))
    expect(container.querySelector('.animate-pulse')).toBeNull()
    rerender(frame(Date.now(), true))
    expect(container.querySelector('.animate-pulse')).toBeTruthy()
  })
})
