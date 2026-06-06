import { describe, it, expect } from 'vitest'
import { parseEcTag, decodeEcName } from './ecIdmlImport'

describe('decodeEcName', () => {
  it('décode les espaces URL-encodés', () => {
    expect(decodeEcName('Astérisque%20Exclusion')).toBe('Astérisque Exclusion')
    expect(decodeEcName('Prix%20Malin')).toBe('Prix Malin')
  })
  it('laisse un nom simple intact', () => {
    expect(decodeEcName('Name')).toBe('Name')
  })
  it('retombe sur la valeur brute (trim) si le décodage échoue', () => {
    expect(decodeEcName('%E0%')).toBe('%E0%')
  })
})

describe('parseEcTag', () => {
  it('reconnaît un marqueur d’ouverture $ID/4', () => {
    expect(parseEcTag('$ID/4 Description')).toEqual({ kind: 'open', field: 'Description' })
  })
  it('reconnaît un marqueur de fermeture $ID/5', () => {
    expect(parseEcTag('$ID/5 Prix%20Malin')).toEqual({ kind: 'close', field: 'Prix Malin' })
  })
  it('décode les noms de champ avec espaces', () => {
    expect(parseEcTag('$ID/4 Astérisque%20Exclusion')).toEqual({ kind: 'open', field: 'Astérisque Exclusion' })
  })
  it('ignore la forme qualifiée $ID/2 / $ID/3 (chemin data source ambigu)', () => {
    expect(parseEcTag('$ID/2 $ID/Trafic%20596756%20Unité%20de%20vente')).toEqual({ kind: 'none' })
    expect(parseEcTag('$ID/3 quoi que ce soit')).toEqual({ kind: 'none' })
  })
  it('renvoie none pour null, vide ou attribut non-EC', () => {
    expect(parseEcTag(null)).toEqual({ kind: 'none' })
    expect(parseEcTag('')).toEqual({ kind: 'none' })
    expect(parseEcTag('AllCaps')).toEqual({ kind: 'none' })
  })
})
