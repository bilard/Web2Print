import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TileEmpty, TileError } from './TileStates'

describe('états d’une tuile', () => {
  it('un résultat vide propose de retirer le filtre qui l’a vidé', () => {
    // ⚠ Un cadre vide sans explication se lit comme une panne.
    render(<TileEmpty onClearFilters={() => {}} />)
    expect(screen.getByRole('button')).toBeTruthy()
  })

  it('une erreur donne sa cause ET un bouton réessayer, dans le cadre de la tuile', () => {
    render(<TileError message="Source inconnue : sql.libre" onRetry={() => {}} />)
    expect(screen.getByText(/sql.libre/)).toBeTruthy()
    expect(screen.getByRole('button')).toBeTruthy()
  })
})
