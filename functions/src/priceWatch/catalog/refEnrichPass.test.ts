import { describe, it, expect } from 'vitest'
import { refEnrichPass, type IndexedPage } from './refEnrichPass'

/** Fiche produit minimale portant sa référence en JSON-LD (cas progarden). */
const fiche = (sku: string) => `<html><script type="application/ld+json">
  {"@type":"Product","name":"Courroie","sku":"${sku}","offers":{"price":"12.00"}}
</script></html>`

const page = (id: string, products: { url: string; name: string; ref?: string; price?: number; image?: string; enriched?: boolean }[]): IndexedPage =>
  ({ id, url: `https://s.fr/c/${id}`, page: 1, products })

describe('refEnrichPass — visiter les fiches pour y trouver la clé', () => {
  it('complète les fiches SANS référence et réécrit la page', async () => {
    // Mesuré en production : progarden indexait 6 982 fiches dont ZÉRO ne portait de
    // référence — son thème n'en affiche aucune sur les pages de rayon. La clé existe
    // pourtant, une page plus loin.
    const saved: IndexedPage[] = []
    const r = await refEnrichPass({
      loadPages: async () => [page('p1', [
        { url: 'https://s.fr/a', name: 'A' },
        { url: 'https://s.fr/b', name: 'B' },
      ])],
      fetchHtml: async (u) => fiche(u.endsWith('/a') ? 'REF-A' : 'REF-B'),
      savePage: async (p) => { saved.push(p) },
    }, 10)

    expect(r.visited).toBe(2)
    expect(r.enriched).toBe(2)
    expect(saved[0].products.map((p) => p.ref)).toEqual(['REF-A', 'REF-B'])
  })

  it('⚠ sur un site CONNECTÉ, revisite une fiche identifiée pour ses prix professionnels', async () => {
    // La fiche porte le prix d'achat, le conseillé et la remise — tous absents des pages
    // de rayon. Une clé déjà connue ne dispense donc pas de la visite.
    const saved: IndexedPage[] = []
    await refEnrichPass({
      loadPages: async () => [page('p1', [{ url: 'https://s.fr/a', name: 'A', ref: 'DÉJÀ' }])],
      fetchHtml: async () => `<html><h1>Ressort de lanceur</h1>
        <p>Votre prix d'achat unitaire : 6,54 € HT</p>
        <p>Prix conseillé unit. : 16,36 € HT</p>
        <p>Remise sur prix de vente : -60%</p></html>`,
      savePage: async (p) => { saved.push(p) },
      wantB2BPrices: true,
    }, 10)
    expect(saved[0].products[0].netPrice).toBe(6.54)
    expect(saved[0].products[0].advisedPrice).toBe(16.36)
    expect(saved[0].products[0].discountPct).toBe(60)
    expect(saved[0].products[0].price).toBeUndefined()
  })

  it('n’ouvre PAS une fiche déjà identifiée — le budget va où la clé manque', async () => {
    let fetched = 0
    const r = await refEnrichPass({
      // Identifiée, chiffrée ET déjà ouverte : plus rien à y chercher.
      loadPages: async () => [page('p1', [
        { url: 'https://s.fr/a', name: 'A', ref: 'DÉJÀ', price: 9, image: 'i.jpg', enriched: true },
      ])],
      fetchHtml: async () => { fetched++; return fiche('X') },
      savePage: async () => {},
    }, 10)
    expect(fetched).toBe(0)
    expect(r.visited).toBe(0)
  })

  it('⚠ le prix de la page LISTE est conservé — c’est celui que la veille compare', async () => {
    // Une fiche produit peut afficher une autre grille (quantité, promotion) : on ne
    // retient que la clé manquante, jamais le prix.
    const saved: IndexedPage[] = []
    await refEnrichPass({
      loadPages: async () => [{
        id: 'p1', url: 'https://s.fr/c', page: 1,
        products: [{ url: 'https://s.fr/a', name: 'A', price: 9.9 }],
      }],
      fetchHtml: async () => fiche('REF-A'),
      savePage: async (p) => { saved.push(p) },
    }, 10)
    expect(saved[0].products[0].price).toBe(9.9)
    expect(saved[0].products[0].ref).toBe('REF-A')
  })

  it('⚠ remplace la vignette de liste par le grand visuel de la fiche', async () => {
    // La page de rayon sert une miniature ; la fiche, l'image de zoom. C'est celle-là
    // qu'on veut pour comparer deux produits côte à côte.
    const saved: IndexedPage[] = []
    await refEnrichPass({
      loadPages: async () => [{
        id: 'p1', url: 'https://s.fr/c', page: 1,
        products: [{ url: 'https://s.fr/a', name: 'A', image: 'https://s.fr/thumb/a-100.jpg' }],
      }],
      fetchHtml: async () => `<html><meta property="og:image" content="https://s.fr/large/a.jpg">
        <script type="application/ld+json">{"@type":"Product","name":"A","sku":"REF-A"}</script></html>`,
      savePage: async (p) => { saved.push(p) },
    }, 10)
    expect(saved[0].products[0].image).toBe('https://s.fr/large/a.jpg')
  })

  it('⚠ complète un prix ABSENT depuis la fiche, sans toucher à celui du rayon', async () => {
    // kramp n'expose son prix que sur la fiche (« Prix brut : 29,38 € ») : sans cette
    // complétion, la fiche entre à l'index sans prix et ne se compare à rien.
    const saved: IndexedPage[] = []
    await refEnrichPass({
      loadPages: async () => [{
        id: 'p1', url: 'https://s.fr/c', page: 1,
        products: [
          { url: 'https://s.fr/a', name: 'A', ref: 'R1' },
          { url: 'https://s.fr/b', name: 'B', ref: 'R2', price: 10 },
        ],
      }],
      fetchHtml: async () => `<html><h1>Filtre</h1><script type="application/ld+json">
        {"@type":"Product","name":"Filtre","sku":"R1","offers":{"price":"29.38"}}</script></html>`,
      savePage: async (p) => { saved.push(p) },
    }, 10)
    expect(saved[0].products[0].price).toBe(29.38)
    // Celle qui avait déjà un prix n'est même pas rouverte.
    expect(saved[0].products[1].price).toBe(10)
  })

  it('reprend APRÈS la dernière page menée à son terme', async () => {
    const r = await refEnrichPass({
      loadPages: async () => [
        page('p1', [{ url: 'https://s.fr/a', name: 'A' }]),
        page('p2', [{ url: 'https://s.fr/b', name: 'B' }]),
      ],
      fetchHtml: async () => fiche('R'),
      savePage: async () => {},
    }, 1)
    // Budget épuisé sur la première page : le curseur ne doit PAS avancer au-delà, sinon
    // le tick suivant sauterait des fiches jamais ouvertes.
    expect(r.visited).toBe(1)
    expect(r.cursor).toBe('p1')
  })

  it('reprend là où le curseur s’est arrêté', async () => {
    const seen: string[] = []
    await refEnrichPass({
      loadPages: async () => [
        page('p1', [{ url: 'https://s.fr/a', name: 'A' }]),
        page('p2', [{ url: 'https://s.fr/b', name: 'B' }]),
      ],
      fetchHtml: async (u) => { seen.push(u); return fiche('R') },
      savePage: async () => {},
    }, 10, 'p1')
    expect(seen).toEqual(['https://s.fr/b'])
  })

  it('rend la main à l’échéance, sans perdre sa position', async () => {
    let t = 1_000
    const r = await refEnrichPass({
      loadPages: async () => [page('p1', [{ url: 'https://s.fr/a', name: 'A' }])],
      fetchHtml: async () => fiche('R'),
      savePage: async () => {},
      deadlineAt: 900,
      now: () => t++,
    }, 10)
    expect(r.visited).toBe(0)
  })

  it('une fiche illisible ne casse pas la passe', async () => {
    const r = await refEnrichPass({
      loadPages: async () => [page('p1', [
        { url: 'https://s.fr/a', name: 'A' },
        { url: 'https://s.fr/b', name: 'B' },
      ])],
      fetchHtml: async (u) => (u.endsWith('/a') ? null : fiche('REF-B')),
      savePage: async () => {},
    }, 10)
    expect(r.visited).toBe(2)
    expect(r.enriched).toBe(1)
  })
})

describe('⚠⚠ une fiche déjà ouverte ne se rouvre pas', () => {
  it('marque la visite même bredouille — sinon la passe repasse sans fin', async () => {
    // Une fiche dont le site n'affiche aucun prix professionnel gardait « pas de prix
    // d'achat » comme motif de revisite : la condition restait vraie pour toujours, et la
    // passe repassait indéfiniment sur les mêmes pages au lieu d'avancer. Ce qui compte
    // n'est pas ce qu'on a trouvé, c'est qu'on soit allé voir.
    const saved: IndexedPage[] = []
    await refEnrichPass({
      loadPages: async () => [page('p1', [{ url: 'https://s.fr/a', name: 'A' }])],
      fetchHtml: async () => '<html><h1>Sans rien</h1></html>',
      savePage: async (p) => { saved.push(p) },
      wantB2BPrices: true,
    }, 10)
    expect(saved[0].products[0].enriched).toBe(true)
  })
})
