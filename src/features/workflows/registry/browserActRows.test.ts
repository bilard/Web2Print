import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseParamLines, rowsToSheet } from './browserActRows'
import { parseBrowserActRows } from '@/features/scraping/core/browserAct'

describe('parseParamLines', () => {
  it('lit les paires « nom = valeur », ignore vides et commentaires', () => {
    expect(parseParamLines('url = https://amazon.fr/dp/B08\n# note\n\nmax=25')).toEqual({
      url: 'https://amazon.fr/dp/B08',
      max: '25',
    })
  })

  it('conserve les « = » de la valeur (URL à paramètres)', () => {
    expect(parseParamLines('url=https://x.fr/s?k=perceuse&ref=nb')).toEqual({
      url: 'https://x.fr/s?k=perceuse&ref=nb',
    })
  })

  it('ignore une ligne sans nom', () => {
    expect(parseParamLines('= orphelin\nok = 1')).toEqual({ ok: '1' })
  })
})

describe('parseBrowserActRows', () => {
  it('accepte un tableau JSON', () => {
    expect(parseBrowserActRows('[{"name":"A","price":"9,90"},{"name":"B"}]')).toHaveLength(2)
  })

  it('déballe une enveloppe usuelle du bot', () => {
    expect(parseBrowserActRows('{"results":[{"name":"A"},{"name":"B"}]}')).toEqual([
      { name: 'A' }, { name: 'B' },
    ])
  })

  it('accepte du JSONL', () => {
    expect(parseBrowserActRows('{"name":"A"}\n{"name":"B"}\nbruit')).toHaveLength(2)
  })

  it('fail-closed : sortie non tabulaire → aucune ligne (jamais un demi-enregistrement)', () => {
    expect(parseBrowserActRows('Le produit coûte 9,90 €')).toEqual([])
    expect(parseBrowserActRows('')).toEqual([])
    expect(parseBrowserActRows(undefined)).toEqual([])
  })
})

describe('rowsToSheet', () => {
  it('prend l’UNION des clés : une ligne incomplète ne supprime pas la colonne', () => {
    const sheet = rowsToSheet([{ name: 'A', price: 9.9 }, { name: 'B', ean: '123' }], 'BrowserAct')
    expect(sheet.columns.map((c) => c.key)).toEqual(['name', 'price', 'ean'])
    expect(sheet.rows[1]).toMatchObject({ name: 'B', price: '', ean: '123' })
  })

  it('sérialise les valeurs imbriquées plutôt que de rendre « [object Object] »', () => {
    const sheet = rowsToSheet([{ specs: { poids: '2 kg' } }, { specs: null }], 'BrowserAct')
    expect(sheet.rows[0].specs).toBe('{"poids":"2 kg"}')
    expect(sheet.rows[1].specs).toBe('')
  })

  it('sans ligne : feuille vide exploitable (pas de colonne fantôme)', () => {
    expect(rowsToSheet([], 'BrowserAct')).toMatchObject({ columns: [], rows: [], taxonomy: [] })
  })
})

describe('enregistrement du node', () => {
  // Les nodes s'enregistrent par EFFET DE BORD à l'import : un oubli dans `builtin.ts`
  // ne casse aucun type, le node disparaît simplement de la palette.
  it('« BrowserAct (bot) » est dans la palette, étape Import', async () => {
    await import('./browserActNode')
    const { nodeRegistry } = await import('./index')
    const spec = nodeRegistry.get('browseract')
    expect(spec).toBeDefined()
    expect(spec?.category).toBe('import')
    expect(spec?.hidden).toBeFalsy()
  })

  it('est importé par builtin.ts (sinon absent à l’exécution)', () => {
    const builtin = readFileSync(join(__dirname, 'builtin.ts'), 'utf-8')
    expect(builtin).toContain("import './browserActNode'")
  })
})
