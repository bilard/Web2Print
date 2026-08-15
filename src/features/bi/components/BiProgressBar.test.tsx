// ⚠⚠ Ce que ces tests protègent : un écran qu'on croit figé. Une lecture de soixante-deux
// tranches disait son avancement dans une phrase grise sous le bandeau — personne ne la
// voyait, on rechargeait la page en croyant à une panne.
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BiProgressBar } from './BiProgressBar'

describe('barre de chargement', () => {
  it('remplit la barre à la proportion RÉELLE, et l’annonce', () => {
    render(<BiProgressBar label="Catalogue" done={56} total={62} />)
    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('aria-valuenow')).toBe('90')
    expect(screen.getByText('90 %')).toBeTruthy()
  })

  it('ne dépasse jamais 100 %, même si le compte déborde', () => {
    // Une barre à 130 % se lit comme un défaut d'affichage, et fait douter du reste.
    render(<BiProgressBar label="Catalogue" done={70} total={62} />)
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100')
  })

  it('⚠⚠ SANS fraction connue, n’invente aucun pourcentage', () => {
    // Afficher « 0 % » ferait attendre une progression qui ne viendra pas : les fiches d'un
    // concurrent se lisent d'un bloc.
    render(<BiProgressBar label="Fiches" done={0} total={0} />)
    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('aria-valuenow')).toBeNull()
    expect(screen.queryByText(/%/)).toBeNull()
    // …mais la barre BOUGE : muet ne veut pas dire immobile.
    expect(bar.querySelector('.progress-indeterminate')).toBeTruthy()
  })

  it('nomme ce qui est en train de se lire', () => {
    render(<BiProgressBar label="Lecture du catalogue source" done={1} total={62} />)
    expect(screen.getByText('Lecture du catalogue source')).toBeTruthy()
  })
})
