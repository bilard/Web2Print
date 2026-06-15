// functions/src/workflow/nodes/comparePrices.test.ts
import { describe, it, expect } from 'vitest'
import './comparePrices'
import { getServerNode } from '../registry'
import type { ServerRunCtx } from '../types'

const ctx: ServerRunCtx = { uid: 'u', log: () => {}, signal: new AbortController().signal }
const run = (config: any, inputs: any) => getServerNode('compare-prices')!.run(ctx, config, inputs)

const CFG = {
  keyColumn: 'ean', fallbackKeyColumn: 'name', siteColumn: 'site',
  priceColumn: 'price', labelColumn: 'name', onlyCommon: true,
}

describe('compare-prices (serveur)', () => {
  it('apparie par EAN, pivote prix par site et calcule l’écart', async () => {
    const inputs = {
      sheet: {
        rows: [
          { site: 'jardiland.com', name: 'Tondeuse RLM15E36H', ean: '4892210822567', price: '169,00 €' },
          { site: 'castorama.fr', name: 'Tondeuse RLM15E36H 1500W', ean: '4892210822567', price: '149,99' },
          { site: 'jardiland.com', name: 'Solo', ean: '0000000000001', price: '50' },
        ],
      },
    }
    const out = (await run(CFG, inputs)).sheet as any
    expect(out.rows).toHaveLength(1) // onlyCommon → exclut le mono-site
    expect(out.rows[0]).toMatchObject({
      ean: '4892210822567',
      prix_jardiland_com: '169',
      prix_castorama_fr: '149.99',
      ecart_eur: '19.01',
      moins_cher: 'castorama.fr',
    })
    // colonnes dynamiques pour gsheets-export (key + label)
    expect(out.columns.map((c: any) => c.key)).toContain('prix_castorama_fr')
  })

  it('feuille vide → sortie vide', async () => {
    const out = (await run(CFG, { sheet: { rows: [] } })).sheet as any
    expect(out.rows).toEqual([])
  })
})
