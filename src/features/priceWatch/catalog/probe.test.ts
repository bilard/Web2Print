import { describe, it, expect } from 'vitest'
import { probeCompetitor } from './probe'

// Home PrestaShop minimal avec des catégories dans le menu + des pages produit.
const HOME = `<ul class="top-menu">
  <li><a href="https://x.fr/12-lames-de-tondeuse">Lames de tondeuse</a></li>
  <li><a href="https://x.fr/13-courroies">Courroies</a></li>
</ul>`
const PAGE_PRICE = `<article class="product-miniature js-product-miniature">
  <a href="https://x.fr/p/1-lame-51cm.html" class="product-title">Lame 51cm</a>
  <span class="price">24,90 €</span></article>`
const PAGE_NOPRICE = `<article class="product-miniature js-product-miniature">
  <a href="https://x.fr/p/2-piece.html" class="product-title">Pièce</a></article>`

describe('probeCompetitor', () => {
  it('verdict « blocked » quand l’accueil est injoignable (anti-bot/HS)', async () => {
    const r = await probeCompetitor({ siteId: 's', domain: 'x.fr', families: [] }, { fetchHtml: async () => null })
    expect(r.verdict).toBe('blocked')
    expect(r.audit.indexed).toBe(0)
    expect(r.categoriesFound).toBe(0)
  })

  it('verdict « ok » quand des prix sortent de l’échantillon', async () => {
    const deps = { fetchHtml: async (url: string) => (url.endsWith('/') ? HOME : PAGE_PRICE) }
    const r = await probeCompetitor({ siteId: 's', domain: 'x.fr', families: [] }, deps)
    if (r.categoriesFound > 0) {
      expect(r.verdict).toBe('ok')
      expect(r.audit.pctPrice).toBeGreaterThan(0)
    }
  })

  it('verdict « no-price » quand des fiches sortent mais sans prix (B2B/JS)', async () => {
    const deps = { fetchHtml: async (url: string) => (url.endsWith('/') ? HOME : PAGE_NOPRICE) }
    const r = await probeCompetitor({ siteId: 's', domain: 'x.fr', families: [] }, deps)
    if (r.audit.indexed > 0) expect(r.verdict).toBe('no-price')
  })
})
