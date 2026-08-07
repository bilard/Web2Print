// Une colonne de `sheet.columns` = une colonne du tableur, toujours.
//
// L'export construisait chaque ligne en `{ [libellé]: valeur }` : deux colonnes de même
// libellé n'en faisaient qu'une. La veille tarifaire donne « Prix TTC », « Prix HT »… à
// CHACUN de ses quatorze concurrents — treize blocs disparaissaient du fichier, sans
// message. Ce test tient l'invariant, parce que rien à l'écran ne le signalait.
import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { exportSheetToXlsxBlob } from './gdriveCore'
import type { ExcelSheet } from '@/features/excel/types'

/** Deux concurrents, mêmes libellés de champs — la forme exacte de la matrice de veille. */
function sheetWithTwoCompetitors(): ExcelSheet {
  return {
    name: 'Veille tarifaire',
    taxonomy: [],
    columns: [
      { key: 'produit', label: 'Produit', fieldType: 'text', detectedType: 'text', isPrimary: false, width: 120 },
      { key: 'bloc_a', label: 'alpha.fr', fieldType: 'text', detectedType: 'text', isPrimary: false, width: 120 },
      { key: 'prix_ttc_a', label: 'Prix TTC', fieldType: 'number', detectedType: 'number', isPrimary: false, width: 120 },
      { key: 'url_a', label: 'Lien', fieldType: 'text', detectedType: 'text', isPrimary: false, width: 120 },
      { key: 'bloc_b', label: 'beta.fr', fieldType: 'text', detectedType: 'text', isPrimary: false, width: 120 },
      { key: 'prix_ttc_b', label: 'Prix TTC', fieldType: 'number', detectedType: 'number', isPrimary: false, width: 120 },
      { key: 'url_b', label: 'Lien', fieldType: 'text', detectedType: 'text', isPrimary: false, width: 120 },
    ],
    rows: [{
      _id: 'r1', produit: 'LAME 520MM', bloc_a: '', prix_ttc_a: 20.28, url_a: 'https://alpha.fr/p',
      bloc_b: '', prix_ttc_b: 17.68, url_b: 'https://beta.fr/p',
    }] as ExcelSheet['rows'],
  }
}

async function grid(sheet: ExcelSheet): Promise<string[][]> {
  const blob = await exportSheetToXlsxBlob(sheet, 'Test')
  const wb = XLSX.read(new Uint8Array(await blob.arrayBuffer()), { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: '' })
}

describe('export XLSX — libellés répétés', () => {
  it('écrit UNE colonne par colonne déclarée, même à libellé identique', async () => {
    const sheet = sheetWithTwoCompetitors()
    const [head, first] = await grid(sheet)
    expect(head).toHaveLength(sheet.columns.length)
    expect(head).toEqual(['Produit', 'alpha.fr', 'Prix TTC', 'Lien', 'beta.fr', 'Prix TTC', 'Lien'])
    // Et chaque concurrent garde SA valeur : la collision écrasait la première par la
    // seconde, si bien que les deux blocs affichaient le prix du dernier.
    // Valeurs rendues avec le format monétaire posé par l'export — ce qui compte ici,
    // c'est qu'elles soient DEUX, chacune dans sa colonne.
    expect(first[2]).toContain('20.28')
    expect(first[5]).toContain('17.68')
    expect(first[3]).toBe('https://alpha.fr/p')
    expect(first[6]).toBe('https://beta.fr/p')
  })

  it('garde l’ordre des colonnes, seul repère de l’index de groupe', async () => {
    // Les groupes pliables sont posés par INDEX de colonne : une colonne manquante
    // décalerait tous les blocs suivants et les crochets tomberaient à côté.
    const sheet = sheetWithTwoCompetitors()
    const [head] = await grid(sheet)
    expect(head.indexOf('alpha.fr')).toBe(1)
    expect(head.indexOf('beta.fr')).toBe(4)
  })
})
