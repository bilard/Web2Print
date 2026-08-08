import { describe, it, expect } from 'vitest'
import { sheetTargets, applySheetRevisions, sheetColumnsWithSources, sourceColumnOf } from './sheetMode'

describe('lignes de feuille en cibles', () => {
  it('expose les champs demandés avec leur valeur', () => {
    const [target] = sheetTargets([{ _id: 'row_0', nom: 'LAME 510', prix: 12 }], ['nom'])
    expect(target.id).toBe('row_0')
    expect(target.fields.nom.value).toBe('LAME 510')
  })

  it('⚠ expose le champ MÊME absent de la ligne, avec une valeur nulle', () => {
    // Sinon `planPass` le compterait « hors périmètre » et le passage annoncerait
    // « rien à traiter » — un succès parfaitement propre, et parfaitement vide.
    const [target] = sheetTargets([{ _id: 'row_0', nom: 'LAME' }], ['nom', 'description'])
    expect(target.fields.description).toEqual({ value: null, winningSourceId: '' })
  })

  it('garde la ligne entière accessible pour les gabarits', () => {
    const [target] = sheetTargets([{ _id: 'row_0', nom: 'LAME', marque: 'STIGA' }], ['nom'])
    expect(target.row?.marque).toBe('STIGA')
  })

  it('retombe sur la position quand la ligne n’a pas d’identifiant', () => {
    const targets = sheetTargets([{ nom: 'A' }, { nom: 'B' }], ['nom'])
    expect(targets.map((t) => t.id)).toEqual(['row_0', 'row_1'])
  })
})

describe('application à la feuille', () => {
  const rows = [
    { _id: 'row_0', nom: 'Grasmaaier mes 51 cm', prix: 12 },
    { _id: 'row_1', nom: 'Courroie A97', prix: 8 },
  ]

  it('remplace la colonne et garde l’ancien texte à côté', () => {
    const out = applySheetRevisions(rows, [
      { productId: 'row_0', field: 'nom', before: 'Grasmaaier mes 51 cm', after: 'Lame de tondeuse 51 cm' },
    ])
    expect(out[0].nom).toBe('Lame de tondeuse 51 cm')
    expect(out[0]['nom (source)']).toBe('Grasmaaier mes 51 cm')
  })

  it('laisse intactes les lignes sans révision', () => {
    const out = applySheetRevisions(rows, [
      { productId: 'row_0', field: 'nom', before: 'x', after: 'y' },
    ])
    expect(out[1]).toEqual(rows[1])
  })

  it('ne touche pas aux autres colonnes', () => {
    const out = applySheetRevisions(rows, [
      { productId: 'row_0', field: 'nom', before: 'x', after: 'y' },
    ])
    expect(out[0].prix).toBe(12)
  })

  it('⚠ ne modifie pas les lignes reçues', () => {
    // Elles appartiennent au node amont : les muter changerait ce que voient les AUTRES
    // branches du graphe, qui reçoivent la même feuille.
    applySheetRevisions(rows, [{ productId: 'row_0', field: 'nom', before: 'x', after: 'y' }])
    expect(rows[0].nom).toBe('Grasmaaier mes 51 cm')
  })

  it('applique plusieurs champs d’une même ligne', () => {
    const out = applySheetRevisions([{ _id: 'row_0', nom: 'A', description: 'B' }], [
      { productId: 'row_0', field: 'nom', before: 'A', after: 'A+' },
      { productId: 'row_0', field: 'description', before: 'B', after: 'B+' },
    ])
    expect(out[0]).toMatchObject({ nom: 'A+', 'nom (source)': 'A', description: 'B+', 'description (source)': 'B' })
  })
})

describe('colonnes de sortie', () => {
  it('place la jumelle juste après sa colonne', () => {
    // Reléguée en fin de feuille, elle obligerait à faire défiler quatorze colonnes pour
    // comparer deux textes qui ne tiennent déjà pas dans une cellule.
    expect(sheetColumnsWithSources(['ref', 'nom', 'prix'], ['nom']))
      .toEqual(['ref', 'nom', 'nom (source)', 'prix'])
  })

  it('n’en ajoute pas pour un champ non traité', () => {
    expect(sheetColumnsWithSources(['ref', 'nom'], [])).toEqual(['ref', 'nom'])
  })

  it('⚠ ne double pas la jumelle sur une feuille déjà passée par la carte', () => {
    // Deux cartes en série, ou un second run : « nom (source) (source) » n'aurait aucun
    // sens et écraserait la vraie mémoire de l'original.
    expect(sheetColumnsWithSources(['nom', 'nom (source)'], ['nom']))
      .toEqual(['nom', 'nom (source)'])
  })

  it('nomme la jumelle de façon lisible', () => {
    expect(sourceColumnOf('description')).toBe('description (source)')
  })
})
