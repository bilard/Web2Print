// functions/src/workflow/nodes/comparePrices.test.ts
import { describe, it, expect } from 'vitest'
import './comparePrices'
import { getServerNode } from '../registry'
import type { ServerRunCtx } from '../types'

const ctx: ServerRunCtx = { uid: 'u', log: () => {}, signal: new AbortController().signal }
const run = (config: any, inputs: any) => getServerNode('compare-prices')!.run(ctx, config, inputs)
const CFG = {
  nameColumn: 'name', priceColumn: 'price', eanColumn: 'ean',
  referenceColumn: '', urlColumn: 'url', siteColumn: 'site', onlyMatched: false,
}

describe('compare-prices (serveur)', () => {
  const source = {
    rows: [
      {
        site: 'jardiland.com', name: 'Tondeuse électrique – RYOBI', ean: '',
        url: 'https://www.jardiland.com/p/tondeuse-1800-w-40-cm-rlm18e40h-ryobi-1404817', price: '219,00 €',
      },
      { site: 'jardiland.com', name: 'Exclusif', ean: '', url: '', price: '99' },
    ],
  }
  const concurrents = {
    rows: [{ site: 'castorama.fr', name: 'Tondeuse RYOBI RLM18E40H 1800W', ean: '', url: '', price: '208,99' }],
  }

  it('ancre source (tous conservés) et apparie via code modèle de l’URL', async () => {
    const out = (await run(CFG, { source, concurrents })).sheet as any
    expect(out.rows).toHaveLength(2)
    const rlm18 = out.rows.find((r: any) => r.reference === 'RLM18E40H')
    expect(rlm18).toMatchObject({ prix_source: '219', prix_castorama_fr: '208.99', ecart_eur: '10.01', position: 'plus cher' })
    expect(out.rows.find((r: any) => r.produit === 'Exclusif').position).toBe('non trouvé')
    expect(out.columns.map((c: any) => c.key)).toContain('prix_castorama_fr')
  })

  it('expose le lien source ET le lien du concurrent apparié (contrôle)', async () => {
    const src = { rows: [{ site: 'jardiland.com', name: 'Tondeuse RYOBI RLM18E40H', ean: '', url: 'https://jardiland.com/p/rlm18e40h', price: '219' }] }
    const comp = { rows: [{ site: 'castorama.fr', name: 'RYOBI RLM18E40H 1800W', ean: '', url: 'https://castorama.fr/x/rlm18e40h.prd', price: '208,99' }] }
    const out = (await run(CFG, { source: src, concurrents: comp })).sheet as any
    expect(out.rows[0]).toMatchObject({
      lien_source: 'https://jardiland.com/p/rlm18e40h',
      lien_concurrent: 'https://castorama.fr/x/rlm18e40h.prd',
    })
    const keys = out.columns.map((c: any) => c.key)
    expect(keys).toContain('lien_source')
    expect(keys).toContain('lien_concurrent')
  })

  it('source vide → sortie vide', async () => {
    const out = (await run(CFG, { source: { rows: [] }, concurrents })).sheet as any
    expect(out.rows).toEqual([])
  })

  it('apparie une réf tronquée via préfixe (RBC36X2 ↔ RBC36X26B), EAN différents', async () => {
    const src = { rows: [{ site: 'jardiland.com', name: 'RYOBI Débroussailleuse 36V RBC36X2', ean: '6744473726508', url: '', price: '199,00' }] }
    const comp = { rows: [{ site: 'castorama.fr', name: 'Pack RYOBI débroussailleuse RBC36X26B RAC114', ean: '3700812025181', url: '', price: '284,41' }] }
    const out = (await run(CFG, { source: src, concurrents: comp })).sheet as any
    expect(out.rows[0]).toMatchObject({ prix_castorama_fr: '284.41', meilleur_concurrent: 'castorama.fr' })
  })

  it('mode pairs (noSource) : regroupe N enseignes, 1 ligne/produit + meilleur prix', async () => {
    const concurrents = { rows: [
      { site: 'castorama.fr', name: 'Barbecue RYOBI RBQ123X', ean: '', url: '', price: '200', originalPrice: '250' },
      { site: 'leroymerlin.fr', name: 'RBQ123X Barbecue', ean: '', url: '', price: '180' },
      { site: 'jardiland.com', name: 'Barbecue exclusif RBQ999Z', ean: '', url: '', price: '90' },
    ] }
    const out = (await run({ ...CFG, noSource: true }, { source: { rows: [] }, concurrents })).sheet as any
    const grouped = out.rows.find((r: any) => r.reference === 'RBQ123X')
    expect(grouped).toMatchObject({ prix_castorama_fr: '200', prix_leroymerlin_fr: '180', meilleur_prix: '180', enseigne_moins_chere: 'leroymerlin.fr' })
    expect(out.columns.map((c: any) => c.key)).toContain('meilleur_prix')
  })

  it('ne crée PAS de faux appariement entre variantes distinctes', async () => {
    const src = { rows: [{ site: 's', name: 'RYOBI RY36LMXSP53A', ean: '', url: '', price: '982' }] }
    const comp = { rows: [{ site: 'c', name: 'RYOBI RY36LMXP46A', ean: '', url: '', price: '599' }] }
    const out = (await run(CFG, { source: src, concurrents: comp })).sheet as any
    expect(out.rows[0].position).toBe('non trouvé')
  })
})
