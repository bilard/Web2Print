import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TileEmpty, TileError } from './TileStates'

describe('états d’une tuile', () => {
  it('un résultat vide propose de retirer le filtre qui l’a vidé', () => {
    // ⚠ Un cadre vide sans explication se lit comme une panne.
    render(<TileEmpty hasFilters onClearFilters={() => {}} />)
    expect(screen.getByRole('button')).toBeTruthy()
  })

  it('SANS filtre, n’offre pas de les retirer — un bouton sans effet se lit comme une panne', () => {
    render(<TileEmpty hasFilters={false} onClearFilters={() => {}} />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('affiche la cause QUE LE HOOK CONNAÎT plutôt que « aucune donnée pour ces filtres »', () => {
    // ⚠⚠ L'utilisateur sans feuille ouverte lisait une explication FAUSSE : ses filtres
    // n'y étaient pour rien, il n'avait simplement aucune base chargée.
    render(<TileEmpty message="Aucune donnée chargée : ouvrez une base dans le module Données."
      hasFilters={false} onClearFilters={() => {}} />)
    expect(screen.getByText(/module Données/)).toBeTruthy()
    expect(screen.queryByText(/pour ces filtres/)).toBeNull()
  })

  it('une erreur donne sa cause ET un bouton réessayer, dans le cadre de la tuile', () => {
    render(<TileError message="Source inconnue : sql.libre" onRetry={() => {}} />)
    expect(screen.getByText(/sql.libre/)).toBeTruthy()
    expect(screen.getByRole('button')).toBeTruthy()
  })
})
