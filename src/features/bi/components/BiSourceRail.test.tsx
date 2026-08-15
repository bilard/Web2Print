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

const rail = (
  onChoose = vi.fn(),
  sourceId: 'watch.summary' | 'pim.products' = 'watch.summary',
  demanded: ('watch.summary' | 'pim.products')[] = ['watch.summary'],
  readOnly = false,
) => {
  render(<BiSourceRail watches={watches} sourceId={sourceId} watchId="w1" dbId={undefined}
    demanded={demanded} readOnly={readOnly} onChoose={onChoose} />)
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

  it('⚠⚠ distingue ce qui ALIMENTE le tableau de ce qui est simplement CHOISI', () => {
    // Choisir une base produits sur un tableau de veille est légitime — on va y poser une
    // tuile. Mais surligner cette base sans autre signe laissait croire que le tableau avait
    // changé de jeu de données : on cherchait alors pourquoi un filtre concurrent subsistait.
    rail(vi.fn(), 'pim.products', ['watch.summary'])
    const chosen = screen.getByText(/Suivre la feuille ouverte/)
    const fed = screen.getByText('Comparatif par concurrent')
    expect(chosen.className).toContain('indigo')       // choisi pour la prochaine tuile
    expect(chosen.title).not.toMatch(/alimente/)
    expect(fed.className).not.toContain('indigo')      // pas le choix courant…
    expect(fed.title).toMatch(/alimente ce tableau/)   // …mais c'est lui qu'on lit
  })
})

// ⚠⚠ Ce que ces tests protègent : un clic en LECTURE qui modifierait le tableau de toute la
// société. Regarder le même tableau sur une autre base est une exploration ; en rebâtir les
// tuiles est une modification. Le volet doit laisser passer la première et retenir la seconde.
describe('volet en consultation', () => {
  it('laisse changer de base quand les tuiles lisent DÉJÀ le PIM', () => {
    const onChoose = rail(vi.fn(), 'pim.products', ['pim.products'], true)
    fireEvent.click(screen.getByText(/Catalogue_GSB_2026/))
    expect(onChoose).toHaveBeenCalledWith({
      source: 'pim.products', dbId: 'db1', dbName: 'Catalogue_GSB_2026',
    })
  })

  it('⚠ RETIENT un changement de nature, et dit pourquoi', () => {
    // Les tuiles lisent la veille : passer au PIM demanderait de les rebâtir.
    const onChoose = rail(vi.fn(), 'watch.summary', ['watch.summary'], true)
    const entry = screen.getByText(/Catalogue_GSB_2026/) as HTMLButtonElement
    expect(entry.disabled).toBe(true)
    expect(entry.title).toMatch(/Passez en Édition/)
    fireEvent.click(entry)
    expect(onChoose).not.toHaveBeenCalled()
  })

  it('laisse changer d’angle de veille en ÉDITION', () => {
    const onChoose = rail(vi.fn(), 'watch.summary', ['watch.summary'], false)
    fireEvent.click(screen.getByText('Notre catalogue suivi'))
    expect(onChoose).toHaveBeenCalledWith({ source: 'watch.catalog', watchId: 'w1' })
  })
})
