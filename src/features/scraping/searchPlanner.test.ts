import { describe, it, expect } from 'vitest'
import { buildQueries, mergePlannedResults, classifyResultPage, parseSnippetPrice } from './searchPlanner'

describe('parseSnippetPrice', () => {
  it('formats courants', () => {
    expect(parseSnippetPrice('Tondeuse Honda à 549,99 € livrée')).toBe('549,99 €')
    expect(parseSnippetPrice('Promo 299€ au lieu de 349€')).toBe('299 €')
    expect(parseSnippetPrice('Price: 1 234,56 EUR')).toBe('1 234,56 €')
    expect(parseSnippetPrice('soldé € 89')).toBe('89 €')
  })
  it('titre puis description, undefined sans prix', () => {
    expect(parseSnippetPrice('Tondeuse HRG 416', 'Dès 449 € chez nous')).toBe('449 €')
    expect(parseSnippetPrice('Tondeuse thermique tractée 167CC', 'Livraison offerte dès 30 produits')).toBeUndefined()
  })
  it('ignore les seuils de livraison (« offerte dès 30€ »)', () => {
    expect(parseSnippetPrice('Tondeuse 167CC', 'Retrait 2h | Livraison magasin offerte dès 30€ | Paiement 4x')).toBeUndefined()
    expect(parseSnippetPrice('Tondeuse à 549€', 'Livraison offerte dès 30€')).toBe('549 €')
  })
})

describe('classifyResultPage', () => {
  it('fiche produit : slug terminé par une référence numérique', () => {
    expect(classifyResultPage('https://www.leroymerlin.fr/produits/boulon-lame-tondeuse-electrique-honda-et-ggp-82876154.html')).toBe('product')
  })
  it('fiche produit : segment /p/ + identifiant hexadécimal', () => {
    expect(classifyResultPage('https://www.jardiland.com/p/tondeuse-thermique-tractee-167cc-692ee2f2f86f2123bb201efc')).toBe('product')
  })
  it('page liste : arborescence catégorielle profonde sans référence', () => {
    expect(classifyResultPage('https://www.leroymerlin.fr/produits/terrasse-jardin/outils-motorises-jardin/tondeuse-a-gazon/tondeuse-thermique/')).toBe('listing')
  })
  it('page liste : segment catégoriel court (/vb/)', () => {
    expect(classifyResultPage('https://www.castorama.fr/vb/tondeuse-honda')).toBe('listing')
  })
  it('page liste : pagination en query ou titre « Page N »', () => {
    expect(classifyResultPage('https://example.fr/category/TONDEUSE/2810?p=18')).toBe('listing')
    expect(classifyResultPage('https://example.fr/tondeuse-honda-electrique-batterie-2024', 'Tous les produits Tondeuse – SAV - Page 3')).toBe('listing')
  })
})

describe('buildQueries', () => {
  it('génère une requête site: par enseigne demandée', () => {
    const qs = buildQueries('tondeuse Honda électrique', ['leroymerlin.fr', 'castorama.fr', 'jardiland.com'])
    expect(qs).toEqual([
      { query: 'site:leroymerlin.fr tondeuse Honda électrique', site: 'leroymerlin.fr' },
      { query: 'site:castorama.fr tondeuse Honda électrique', site: 'castorama.fr' },
      { query: 'site:jardiland.com tondeuse Honda électrique', site: 'jardiland.com' },
    ])
  })

  it('retombe sur une requête générique sans site demandé', () => {
    expect(buildQueries('perceuse Makita 18V', [])).toEqual([{ query: 'perceuse Makita 18V' }])
  })

  it('normalise les domaines (www., casse, espaces)', () => {
    const qs = buildQueries('x', [' WWW.LeroyMerlin.fr '])
    expect(qs).toEqual([{ query: 'site:leroymerlin.fr x', site: 'leroymerlin.fr' }])
  })
})

describe('mergePlannedResults', () => {
  const r = (url: string, title = `Fiche ${url}`) => ({ url, title })

  it('équilibre les résultats entre sites (round-robin) et marque onTarget', () => {
    const merged = mergePlannedResults([
      { site: 'a.fr', results: [r('https://a.fr/p1'), r('https://a.fr/p2')] },
      { site: 'b.fr', results: [r('https://b.fr/p1'), r('https://b.fr/p2')] },
    ], 3)
    expect(merged.map((m) => m.url)).toEqual(['https://a.fr/p1', 'https://b.fr/p1', 'https://a.fr/p2'])
    expect(merged.every((m) => m.onTarget)).toBe(true)
  })

  it('rejette les résultats hors du site demandé (site: non respecté par le moteur)', () => {
    const merged = mergePlannedResults([
      { site: 'leroymerlin.fr', results: [r('https://www.leroymerlin.fr/p1'), r('https://facebook.com/x'), r('https://autre.fr/p')] },
    ], 10)
    expect(merged.map((m) => m.url)).toEqual(['https://www.leroymerlin.fr/p1'])
  })

  it('filtre les domaines junk sur une requête générique et déduplique', () => {
    const merged = mergePlannedResults([
      { results: [r('https://youtube.com/watch?v=1'), r('https://reddit.com/r/x'), r('https://shop.fr/p1'), r('https://shop.fr/p1')] },
    ], 10)
    expect(merged.map((m) => m.url)).toEqual(['https://shop.fr/p1'])
    expect(merged[0].onTarget).toBe(false)
  })

  it('écarte les hôtes communauté/SAV/forum et trie les fiches produit en premier', () => {
    const merged = mergePlannedResults([
      { site: 'castorama.fr', results: [
        r('https://communaute-sav.castorama.fr/category/TONDEUSE/2810'),
        r('https://www.castorama.fr/vb/tondeuse-honda'),
        r('https://www.castorama.fr/tondeuse-thermique-tractee-167cc-moteur-honda-3454976543210.html'),
      ] },
    ], 10)
    expect(merged.map((m) => m.url)).toEqual([
      'https://www.castorama.fr/tondeuse-thermique-tractee-167cc-moteur-honda-3454976543210.html',
      'https://www.castorama.fr/vb/tondeuse-honda',
    ])
    expect(merged.map((m) => m.pageType)).toEqual(['product', 'listing'])
  })

  it('supprime les résultats vides (sans titre utile ni description)', () => {
    const merged = mergePlannedResults([
      { site: 'leroymerlin.fr', results: [
        { url: 'https://www.leroymerlin.fr/produits/tondeuse-honda-izy-46-89725431.html' }, // ni titre ni description
        { url: 'https://www.leroymerlin.fr/produits/tondeuse-electrique-honda-82876154.html', title: 'leroymerlin.fr' }, // titre = domaine
        { url: 'https://www.leroymerlin.fr/produits/tondeuse-batterie-honda-90011223.html', title: 'Tondeuse à batterie Honda HRG 466' },
      ] },
    ], 10)
    expect(merged.map((m) => m.url)).toEqual(['https://www.leroymerlin.fr/produits/tondeuse-batterie-honda-90011223.html'])
  })

  it('tronque au limit demandé', () => {
    const merged = mergePlannedResults([
      { results: [r('https://a.fr/1'), r('https://a.fr/2'), r('https://a.fr/3')] },
    ], 2)
    expect(merged).toHaveLength(2)
  })
})
