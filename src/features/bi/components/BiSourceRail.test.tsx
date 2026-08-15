// ⚠⚠ Ce que ces tests protègent : le choix qui décourageait. Trois sélecteurs — la source,
// le suivi, la base produits — dans trois coins du bandeau, sans lien apparent : « je ne
// comprends rien, comment faire un dashboard de la veille ou d'une donnée du PIM ? ». Ici,
// tout est sous les yeux, groupé, et une entrée porte la décision entière.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BiSourceRail } from './BiSourceRail'

vi.mock('../hooks/usePimDatabases', () => ({
  usePimDbList: () => ({
    items: [
      { docId: 'db1', name: 'Catalogue_GSB_2026', rows: 174 },
      { docId: 'db2', name: 'Makita', rows: 1 },
    ],
    loading: false,
  }),
  usePimDbLoader: () => {},
}))

const watches = [{ watchId: 'w1', label: 'F1 Veille Tarifaire', updatedAt: 1 }]

const rail = (onChoose = vi.fn(), sourceId: 'watch.summary' | 'pim.products' = 'watch.summary') => {
  render(<BiSourceRail watches={watches} sourceId={sourceId} watchId="w1" dbId={undefined}
    onChoose={onChoose} />)
  return onChoose
}

describe('volet « Jeu de données »', () => {
  it('montre les deux familles SANS rien déplier', () => {
    // Un menu déroulant cache ses entrées jusqu'au clic : on ne voyait ni qu'une veille et
    // une base s'excluent, ni combien il y en avait.
    rail()
    expect(screen.getByText('Veille tarifaire')).toBeTruthy()
    expect(screen.getByText('Données produits (PIM)')).toBeTruthy()
    expect(screen.getByText('Comparatif par concurrent')).toBeTruthy()
    expect(screen.getByText(/Catalogue_GSB_2026/)).toBeTruthy()
  })

  it('un clic sur une base porte la décision ENTIÈRE : la source ET la base', () => {
    // C'est ce qu'il fallait deviner en combinant deux sélecteurs distincts.
    const onChoose = rail()
    fireEvent.click(screen.getByText(/Catalogue_GSB_2026/))
    expect(onChoose).toHaveBeenCalledWith({
      source: 'pim.products', dbId: 'db1', dbName: 'Catalogue_GSB_2026',
    })
  })

  it('un clic sur un angle de veille porte la source ET le suivi', () => {
    const onChoose = rail()
    fireEvent.click(screen.getByText('Notre catalogue suivi'))
    expect(onChoose).toHaveBeenCalledWith({ source: 'watch.catalog', watchId: 'w1' })
  })

  it('offre toujours de rendre la main à la feuille ouverte', () => {
    const onChoose = rail()
    fireEvent.click(screen.getByText(/Suivre la feuille ouverte/))
    expect(onChoose).toHaveBeenCalledWith({ source: 'pim.products', dbId: null })
  })

  it('SURLIGNE le choix courant : un tableau dont on ignore la source ne se vérifie pas', () => {
    rail(vi.fn(), 'watch.summary')
    expect(screen.getByText('Comparatif par concurrent').className).toContain('indigo')
    expect(screen.getByText('Notre catalogue suivi').className).not.toContain('indigo')
  })
})
