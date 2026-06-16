import { describe, it, expect } from 'vitest'
import { detectColumnFormat, parseFormulaColumns, colLetter, resolveFormula, toCell, resolveChartIndices, buildChartRequest } from './google'

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

describe('graphe natif (resolveChartIndices)', () => {
  const keys = ['ean', 'produit', 'prix_source', 'prix_castorama']
  const cols = [
    { key: 'ean', label: 'EAN' },
    { key: 'produit', label: 'Produit' },
    { key: 'prix_source', label: 'Prix source' },
    { key: 'prix_castorama', label: 'Prix castorama' },
  ]
  it('mappe X + valeurs par libellé vers les bons index', () => {
    const r = resolveChartIndices(keys, cols, [], 'Produit', 'Prix source, Prix castorama')
    expect(r).toEqual({ xColIndex: 1, valueColIndices: [2, 3], totalCols: 4 })
  })
  it('mappe aussi par clé, et inclut les colonnes formule après les données', () => {
    const r = resolveChartIndices(keys, cols, [{ header: 'Marge' }], 'produit', 'prix_source, Marge')
    expect(r).toEqual({ xColIndex: 1, valueColIndices: [2, 4], totalCols: 5 })
  })
  it('ignore les noms de valeurs inconnus mais garde les valides', () => {
    const r = resolveChartIndices(keys, cols, [], 'Produit', 'Prix source, INCONNU')
    expect(r?.valueColIndices).toEqual([2])
  })
  it('null si axe X introuvable ou aucune valeur valide', () => {
    expect(resolveChartIndices(keys, cols, [], 'INEXISTANT', 'Prix source')).toBeNull()
    expect(resolveChartIndices(keys, cols, [], 'Produit', 'INCONNU')).toBeNull()
  })
})

describe('graphe natif (buildChartRequest)', () => {
  it('basicChart : COLUMN pour bar, plage en-tête incluse, série par axe gauche', () => {
    const req = buildChartRequest({ gid: 7, chartType: 'bar', xColIndex: 1, valueColIndices: [2, 3], rowCount: 10, anchorColIndex: 5, title: 'T' }) as any
    const bc = req.addChart.chart.spec.basicChart
    expect(bc.chartType).toBe('COLUMN')
    expect(bc.headerCount).toBe(1)
    expect(bc.domains[0].domain.sourceRange.sources[0]).toEqual({ sheetId: 7, startRowIndex: 0, endRowIndex: 11, startColumnIndex: 1, endColumnIndex: 2 })
    expect(bc.series).toHaveLength(2)
    expect(bc.series[1].targetAxis).toBe('LEFT_AXIS')
    expect(req.addChart.chart.position.overlayPosition.anchorCell).toEqual({ sheetId: 7, rowIndex: 1, columnIndex: 5 })
  })
  it('pieChart : pieHole 0.4 pour anneau, série unique', () => {
    const req = buildChartRequest({ gid: 0, chartType: 'doughnut', xColIndex: 0, valueColIndices: [1], rowCount: 3, anchorColIndex: 2, title: '' }) as any
    expect(req.addChart.chart.spec.pieChart.pieHole).toBe(0.4)
    expect(req.addChart.chart.spec.pieChart.series.sourceRange.sources[0].startColumnIndex).toBe(1)
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
