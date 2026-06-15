// functions/src/workflow/nodes/comparePrices.test.ts
import { describe, it, expect } from 'vitest'
import './comparePrices'
import { getServerNode } from '../registry'
import type { ServerRunCtx } from '../types'

const ctx: ServerRunCtx = { uid: 'u', log: () => {}, signal: new AbortController().signal }
const run = (config: any, inputs: any) => getServerNode('compare-prices')!.run(ctx, config, inputs)
const CFG = { nameColumn: 'name', priceColumn: 'price', eanColumn: 'ean', referenceColumn: '', siteColumn: 'site', onlyMatched: false }

describe('compare-prices (serveur)', () => {
  const source = {
    rows: [
      { site: 'jardiland.com', name: 'Tondeuse RLM15E36H 1500W', ean: '', price: '169,00 €' },
      { site: 'jardiland.com', name: 'Exclusif', ean: '', price: '99' },
    ],
  }
  const concurrents = {
    rows: [{ site: 'castorama.fr', name: 'Tondeuse RYOBI RLM15E36H 1500W', ean: '', price: '149,99' }],
  }

  it('ancre sur la source (tous conservés) et apparie par code modèle', async () => {
    const out = (await run(CFG, { source, concurrents })).sheet as any
    expect(out.rows).toHaveLength(2)
    const rlm15 = out.rows.find((r: any) => r.reference === 'RLM15E36H')
    expect(rlm15).toMatchObject({ prix_source: '169', prix_castorama_fr: '149.99', ecart_eur: '19.01', position: 'plus cher' })
    const exclusif = out.rows.find((r: any) => r.produit === 'Exclusif')
    expect(exclusif.position).toBe('non trouvé')
    expect(out.columns.map((c: any) => c.key)).toContain('prix_castorama_fr')
  })

  it('source vide → sortie vide', async () => {
    const out = (await run(CFG, { source: { rows: [] }, concurrents })).sheet as any
    expect(out.rows).toEqual([])
  })
})
