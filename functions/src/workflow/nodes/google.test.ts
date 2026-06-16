import { describe, it, expect } from 'vitest'
import { detectColumnFormat, parseFormulaColumns, colLetter, resolveFormula, toCell } from './google'

describe('detectColumnFormat', () => {
  it('EAN → TEXTE (évite la notation scientifique)', () => {
    expect(detectColumnFormat('ean', 'EAN', ['4892210822604', '3700123456789'])).toEqual({ type: 'TEXT', pattern: '@' })
  })

  it('référence → TEXTE', () => {
    expect(detectColumnFormat('reference', 'Réf.', ['RY18LM37A'])?.type).toBe('TEXT')
  })

  it('prix → devise €', () => {
    const f = detectColumnFormat('prix_source', 'Prix source', ['149.99', '299'])
    expect(f?.type).toBe('NUMBER')
    expect(f?.pattern).toContain('€')
  })

  it('écart % → pourcentage sans ×100 (valeurs déjà en %)', () => {
    expect(detectColumnFormat('ecart_pct', 'Écart %', ['12.7', '-5'])).toEqual({ type: 'NUMBER', pattern: '0.00"%"' })
  })

  it('entier long sans hint → TEXTE (identifiant, pas un nombre)', () => {
    expect(detectColumnFormat('gtin', 'Code', ['12345678901234'])?.type).toBe('TEXT')
  })

  it('valeurs numériques quelconques → nombre', () => {
    expect(detectColumnFormat('qte', 'Quantité', ['1', '42', '3.5'])).toEqual({ type: 'NUMBER', pattern: '#,##0.##' })
  })

  it('dates → format date', () => {
    expect(detectColumnFormat('maj', 'Mise à jour', ['2026-06-16', '2026-01-02'])?.type).toBe('DATE')
  })

  it('texte libre → null (laisser tel quel)', () => {
    expect(detectColumnFormat('produit', 'Produit', ['Tondeuse Ryobi', 'Taille-haie'])).toBeNull()
  })

  it('colonne vide → null', () => {
    expect(detectColumnFormat('x', 'X', ['', null, undefined])).toBeNull()
  })
})

// Non-régression : le node « Comparer les prix » sort des prix EN CHAÎNES (« 409 »,
// « 177.49 », « 982.2 ») et des cases vides. Le chemin serveur doit les écrire en VRAIS
// nombres (sinon formules =E2/2 en #VALUE! sous locale FR + aucun format €). Cf. fix client.
describe('forme réelle du node compare (chemin cron/serveur)', () => {
  const prixSrc = ['409', '177.49', '982.2', '6999', '', '30.99']
  it('colonne prix → NUMBER €', () => {
    const f = detectColumnFormat('prix_source', 'Prix source', prixSrc)
    expect(f?.type).toBe('NUMBER')
  })
  it('toCell coerce les décimaux en nombre (pas de #VALUE! aval)', () => {
    const f = detectColumnFormat('prix_source', 'Prix source', prixSrc)
    expect(toCell('409', f)).toBe(409)
    expect(toCell('177.49', f)).toBe(177.49)
    expect(toCell('982.2', f)).toBe(982.2)
    expect(toCell('', f)).toBe('') // case vide → reste vide
  })
  it('toCell garde le texte des colonnes non-numériques', () => {
    expect(toCell('castorama.fr', null)).toBe('castorama.fr')
    expect(toCell('plus cher', null)).toBe('plus cher')
  })
})

describe('colonnes formule', () => {
  it('parse « En-tête = template »', () => {
    expect(parseFormulaColumns('TEST = {prix_source}/2')).toEqual([{ header: 'TEST', template: '{prix_source}/2' }])
  })
  it('ignore les lignes sans =', () => {
    expect(parseFormulaColumns('TEST = {a}\nbidon\nX={b}')).toHaveLength(2)
  })
  it('colLetter 0→A, 6→G, 26→AA', () => {
    expect([colLetter(0), colLetter(6), colLetter(26)]).toEqual(['A', 'G', 'AA'])
  })
  it('resolveFormula remplace {col} par lettre+ligne et retire le = initial', () => {
    const byName = (n: string) => ({ prix_source: 'E' }[n] ?? null)
    expect(resolveFormula('={prix_source}/2', byName, 3)).toBe('E3/2')
  })
  it('resolveFormula garde le nom si colonne inconnue', () => {
    expect(resolveFormula('{inconnue}+1', () => null, 2)).toBe('inconnue+1')
  })
})
