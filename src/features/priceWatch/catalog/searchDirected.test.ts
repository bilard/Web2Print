import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseListingPage } from './prestashop'
import { searchProductOnSite, searchUrl } from './searchDirected'

const fixture = (name: string) =>
  readFileSync(join(__dirname, '__fixtures__', `listing-${name}.html`), 'utf-8')

describe('searchDirected — recherche dirigée par clé', () => {
  it('construit l’URL du moteur de recherche PrestaShop', () => {
    expect(searchUrl('jardimax.com', 'A97')).toBe(
      'https://jardimax.com/recherche?controller=search&s=A97',
    )
    expect(searchUrl('https://www.jardimax.com/', 'courroie A97')).toBe(
      'https://www.jardimax.com/recherche?controller=search&s=courroie%20A97',
    )
  })

  it('les cartes de LISTE jardimax n’exposent pas de réf → la moisson par liste les rate', () => {
    // Cœur du problème : sur une page catégorie, jardimax n’affiche pas la référence.
    // L’appariement par réf est donc impossible depuis la moisson — mais la page de
    // RECHERCHE, elle, l’affiche (« RÉFÉRENCE: A97 » vérifié en live). D’où la recherche dirigée.
    const withRef = parseListingPage(fixture('jardimax')).find((l) => (l.ref?.length ?? 0) >= 4)
    expect(withRef).toBeUndefined()
  })

  it('apparie un produit à un résultat de recherche par sa réf (HTML réel avec réf)', async () => {
    const html = fixture('pro-motoculture') // fixture où la réf EST affichée
    const withRef = parseListingPage(html).find((l) => (l.ref?.length ?? 0) >= 5)
    expect(withRef?.ref).toBeTruthy()

    const hit = await searchProductOnSite({ ref: withRef!.ref }, 'pro-motoculture.com', {
      fetchHtml: async () => html,
    })

    expect(hit).not.toBeNull()
    expect(hit!.listing.ref).toBe(withRef!.ref)
    // Preuve par égalité exacte — jamais le nom seul.
    expect(['sku', 'ref-in-name', 'mpn', 'gtin13', 'ean-in-url']).toContain(hit!.evidence)
  })

  it('renvoie null quand la réf source n’est chez aucun résultat', async () => {
    const hit = await searchProductOnSite({ ref: 'ZZZINEXISTANT999' }, 'jardimax.com', {
      fetchHtml: async () => fixture('jardimax'),
    })
    expect(hit).toBeNull()
  })
})
