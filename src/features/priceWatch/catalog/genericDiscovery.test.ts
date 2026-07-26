import { describe, it, expect } from 'vitest'
import { discoverViaSitemap, extractGenericCategoryLinks, orderByLeafFirst } from './genericDiscovery'

const idx = `<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://www.shop.fr/homeandcategories_sitemap.xml</loc></sitemap>
  <sitemap><loc>https://www.shop.fr/product_sitemap.xml</loc></sitemap>
</sitemapindex>`
// CDATA + chemins imbriqués sans mot-clé « category » (cas PrestaShop 1.6).
const catsSm = `<urlset><url><loc><![CDATA[https://www.shop.fr/fr/]]></loc></url>
  <url><loc><![CDATA[https://www.shop.fr/fr/moteur/courroies/]]></loc></url>
  <url><loc><![CDATA[https://www.shop.fr/fr/moteur/filtration/]]></loc></url>
  <url><loc><![CDATA[https://www.shop.fr/fr/module/quote/form]]></loc></url></urlset>`
const prodSm = `<urlset><url><loc>https://www.shop.fr/fr/12-courroie-a97.html</loc></url></urlset>`

function mockFetch(map: Record<string, string | null>) {
  return async (url: string) => {
    for (const [k, v] of Object.entries(map)) if (url.endsWith(k)) return v
    return null
  }
}

describe('discoverViaSitemap', () => {
  it('fait confiance au sous-sitemap « catégories » (CDATA + chemins imbriqués), exclut home/module', async () => {
    const fetch = mockFetch({
      '/robots.txt': 'Sitemap: https://www.shop.fr/index_sitemap.xml',
      '/index_sitemap.xml': idx,
      '/homeandcategories_sitemap.xml': catsSm,
      '/product_sitemap.xml': prodSm,
    })
    const cats = await discoverViaSitemap('shop.fr', fetch)
    expect(cats).toContain('https://www.shop.fr/fr/moteur/courroies/')
    expect(cats).toContain('https://www.shop.fr/fr/moteur/filtration/')
    expect(cats).not.toContain('https://www.shop.fr/fr/')            // home exclue
    expect(cats.some((u) => u.includes('/module/'))).toBe(false)     // module exclu
  })

  it('filtre par mots-clés de familles', async () => {
    const fetch = mockFetch({
      '/robots.txt': 'Sitemap: https://www.shop.fr/index_sitemap.xml',
      '/index_sitemap.xml': idx, '/homeandcategories_sitemap.xml': catsSm, '/product_sitemap.xml': prodSm,
    })
    const cats = await discoverViaSitemap('shop.fr', fetch, { keywords: ['courroie'] })
    expect(cats).toEqual(['https://www.shop.fr/fr/moteur/courroies/'])
  })

  it('repli fiches produit si aucune catégorie', async () => {
    const fetch = mockFetch({
      '/robots.txt': 'Sitemap: https://www.shop.fr/index_sitemap.xml',
      '/index_sitemap.xml': idx, '/homeandcategories_sitemap.xml': '<urlset></urlset>', '/product_sitemap.xml': prodSm,
    })
    const cats = await discoverViaSitemap('shop.fr', fetch)
    expect(cats).toContain('https://www.shop.fr/fr/12-courroie-a97.html')
  })

  it('renvoie [] sans sitemap', async () => {
    expect(await discoverViaSitemap('shop.fr', async () => null)).toEqual([])
  })
})

describe('extractGenericCategoryLinks', () => {
  it('garde les liens catégorie-ish, exclut la nav', () => {
    const home = `<a href="/collections/courroies">C</a><a href="/panier">Panier</a><a href="https://ext.com/shop/x">ext</a>`
    const links = extractGenericCategoryLinks(home, 'shop.fr')
    expect(links).toContain('https://www.shop.fr/collections/courroies')
    expect(links.some((u) => u.includes('/panier'))).toBe(false)
    expect(links.some((u) => u.includes('ext.com'))).toBe(false)
  })
})

describe('orderByLeafFirst', () => {
  const urls = [
    'https://x.fr/produits/',
    'https://x.fr/produits/salle-de-bains/',
    'https://x.fr/produits/salle-de-bains/meuble/plan-de-travail/bois-massif/',
    'https://x.fr/produits/salle-de-bains/meuble/',
    'https://x.fr/produits/jardin/',
    'https://x.fr/produits/jardin/tondeuse/autoportee/',
  ]

  it('sert les feuilles avant les rayons (les rayons n’ont pas de grille produit)', () => {
    const out = orderByLeafFirst(urls)
    expect(out[0]).toMatch(/bois-massif|autoportee/)
    // La page de rayon la plus générale passe APRÈS les feuilles de chaque univers.
    const racine = out.indexOf('https://x.fr/produits/')
    expect(racine).toBeGreaterThan(out.findIndex((u) => u.includes('bois-massif')))
    expect(racine).toBeGreaterThan(out.findIndex((u) => u.includes('autoportee')))
  })

  it('alterne les univers : 250 URLs ne viennent pas toutes du même rayon', () => {
    const out = orderByLeafFirst(urls)
    const univers = out.slice(0, 2).map((u) => u.split('/')[4])
    expect(new Set(univers).size).toBe(2)
  })

  it('ne perd aucune URL', () => {
    expect(orderByLeafFirst(urls).sort()).toEqual([...urls].sort())
  })
})
