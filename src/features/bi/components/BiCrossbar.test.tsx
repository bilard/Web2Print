// ⚠⚠ Rien ne disait sur quel jeu de données un tableau de bord était calculé. Les tuiles
// interrogent la feuille ACTIVE et les identifiants de dimension sont les intitulés de
// colonnes : deux feuilles aux mêmes en-têtes (un catalogue et celui d'un concurrent) sont
// interchangeables en silence.
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BiCrossbar } from './BiCrossbar'

describe('BiCrossbar', () => {
  it('nomme la feuille qui alimente réellement les tuiles', () => {
    render(<BiCrossbar activeSheetName="Catalogue 2026" />)
    expect(screen.getByText(/Catalogue 2026/)).toBeTruthy()
  })

  it('sans feuille active, le dit plutôt que de laisser un blanc', () => {
    render(<BiCrossbar />)
    expect(screen.getByText(/Aucune feuille active/)).toBeTruthy()
  })

  it('AVERTIT, sans survol, quand la feuille active n’est plus celle de construction', () => {
    render(<BiCrossbar activeSheetName="Concurrent A" builtOnSheetName="Catalogue 2026" />)
    // Le texte est dans le document, pas dans un `title=` : il se lit sans rien survoler.
    const warning = screen.getByText(/construit sur/)
    expect(warning).toBeTruthy()
    expect(warning.textContent).toContain('Catalogue 2026')
  })

  it('même feuille : aucun avertissement', () => {
    render(<BiCrossbar activeSheetName="Catalogue 2026" builtOnSheetName="Catalogue 2026" />)
    expect(screen.queryByText(/construit sur/)).toBeNull()
  })

  // ⚠⚠ Le moteur a TROIS chemins (cf. `useTileData`) : sans feuille exploitable il se replie
  // sur le catalogue master du PIM. Annoncer « aucune feuille active » pendant que les tuiles
  // affichent de vrais chiffres serait exactement le mensonge que ce défaut corrige.
  it('nomme le catalogue master quand c’est LUI que le moteur lit', () => {
    render(<BiCrossbar usesMasterCatalogue />)
    expect(screen.getByText(/catalogue master/)).toBeTruthy()
    expect(screen.queryByText(/Aucune feuille active/)).toBeNull()
  })

  it('le repli sur le catalogue master compte AUSSI comme un écart', () => {
    render(<BiCrossbar usesMasterCatalogue builtOnSheetName="Catalogue 2026" />)
    expect(screen.getByText(/construit sur/)).toBeTruthy()
  })

  it('un tableau ANTÉRIEUR (sans feuille mémorisée) n’avertit pas à tort', () => {
    // ⚠ Le champ est optionnel et rétro-compatible : les tableaux déjà enregistrés ne le
    // portent pas, ils ne doivent pas se mettre à crier pour autant.
    render(<BiCrossbar activeSheetName="Concurrent A" />)
    expect(screen.queryByText(/construit sur/)).toBeNull()
  })
})
