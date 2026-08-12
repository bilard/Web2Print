import { describe, it, expect } from 'vitest'
import { refEnrichPass, type IndexedPage } from './refEnrichPass'

/** Fiche produit minimale portant sa référence en JSON-LD (cas progarden). */
const fiche = (sku: string) => `<html><script type="application/ld+json">
  {"@type":"Product","name":"Courroie","sku":"${sku}","offers":{"price":"12.00"}}
</script></html>`

const page = (id: string, products: { url: string; name: string; ref?: string }[]): IndexedPage =>
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

  it('n’ouvre PAS une fiche déjà identifiée — le budget va où la clé manque', async () => {
    let fetched = 0
    const r = await refEnrichPass({
      loadPages: async () => [page('p1', [{ url: 'https://s.fr/a', name: 'A', ref: 'DÉJÀ' }])],
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
