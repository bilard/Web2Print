import { describe, it, expect } from 'vitest'
import { candidateListingUrls, probeListingUrls, shapeMates, childListings } from './probeListings'

/** Home d'enseigne : quelques catégories (forme répétée), des fiches (autre forme
 *  répétée), des pages maison uniques, des assets. Motifs calqués sur castorama.fr. */
const HOME = `
<html><body>
  <link href="/_static/app/entry.client-abc.js">
  <img src="/_assets/r/logo.svg">
  <a href="/outillage/soudure/cat_id_1893.cat">Soudure</a>
  <a href="/jardin-et-terrasse/piscine/cat_id_0001746.cat">Piscine</a>
  <a href="/bonde/cat_id_007.cat">Bonde</a>
  <a href="/chauffage/radiateur/cat_id_0042.cat">Radiateur</a>
  <a href="/diable-transformable-cosco/0044681123030_CAFR.prd">Diable</a>
  <a href="/abri-metal-yardmaster/5013546063014_CAFR.prd">Abri</a>
  <a href="/perceuse-visseuse/3222871201653_CAFR.prd">Perceuse</a>
  <a href="/casto-pro">Casto Pro</a>
  <a href="/nos-engagements-prix">Nos engagements</a>
  <a href="/mon-compte/connexion">Connexion</a>
  <a href="/panier">Panier</a>
  <a href="/blog/conseils-jardin">Conseils</a>
  <a href="https://www.facebook.com/castorama">Facebook</a>
  <a href="mailto:contact@x.fr">Mail</a>
</body></html>`

describe('candidateListingUrls', () => {
  const urls = candidateListingUrls(HOME, 'castorama.fr')

  it('écarte assets, tunnel d’achat, éditorial et liens externes', () => {
    expect(urls.some((u) => u.includes('_static') || u.includes('_assets'))).toBe(false)
    expect(urls.some((u) => /panier|connexion|blog/.test(u))).toBe(false)
    expect(urls.every((u) => u.startsWith('https://www.castorama.fr/'))).toBe(true)
  })

  it('met les FORMES d’URL répétées en tête (gabarits de catalogue)', () => {
    // Catégories et fiches partagent un gabarit répété ; les pages maison sont uniques.
    // On ne cherche PAS à départager catégorie/fiche ici : c'est la sonde qui tranche
    // (une fiche rend 1 produit, sous le seuil) — deviner coûterait un faux négatif.
    const firstHouse = urls.findIndex((u) => /casto-pro|engagements/.test(u))
    const firstTemplated = urls.findIndex((u) => /\.cat$|\.prd$/.test(u))
    expect(firstTemplated).toBeLessThan(firstHouse)
    expect(urls.slice(0, 2).every((u) => /\.cat$|\.prd$/.test(u))).toBe(true)
  })

  it('ne sonde pas deux fois la même page et respecte le plafond', () => {
    expect(new Set(urls).size).toBe(urls.length)
    expect(candidateListingUrls(HOME, 'castorama.fr', { max: 3 })).toHaveLength(3)
  })

  it('fait remonter les URLs qui parlent des familles suivies', () => {
    const withKw = candidateListingUrls(HOME, 'castorama.fr', { keywords: ['radiateur'] })
    expect(withKw[0]).toContain('radiateur')
  })
})

describe('probeListingUrls', () => {
  const pages: Record<string, number> = {
    'https://x.fr/a.cat': 51, // page liste
    'https://x.fr/b.prd': 1, // fiche produit
    'https://x.fr/c.cat': 12, // page liste
    'https://x.fr/d': 0, // page maison
  }
  const fetchHtml = async (u: string) => (u in pages ? u : null)
  const count = (html: string) => pages[html] ?? 0

  it('retient les pages qui contiennent VRAIMENT des produits', async () => {
    const found = await probeListingUrls(Object.keys(pages), fetchHtml, count)
    expect(found).toEqual(['https://x.fr/a.cat', 'https://x.fr/c.cat'])
  })

  it('s’arrête dès qu’il en a assez (chaque sonde est un fetch facturé)', async () => {
    let calls = 0
    const counted = async (u: string) => { calls++; return fetchHtml(u) }
    const found = await probeListingUrls(Object.keys(pages), counted, count, { enough: 1 })
    expect(found).toHaveLength(1)
    expect(calls).toBe(1)
  })

  it('borne le nombre de pages ouvertes', async () => {
    let calls = 0
    const counted = async (u: string) => { calls++; return fetchHtml(u) }
    await probeListingUrls(Object.keys(pages), counted, () => 0, { maxProbes: 2 })
    expect(calls).toBe(2)
  })

  it('rend [] quand rien ne contient de liste (jamais d’URL au hasard)', async () => {
    const found = await probeListingUrls(['https://x.fr/d'], fetchHtml, count)
    expect(found).toEqual([])
  })
})

describe('shapeMates — une forme jugée liste vaut pour tous ses membres', () => {
  // Cas RÉEL swap-europe : la sonde confirme `/fr/pieces/tondeuse` (32 produits) et le
  // plan n'en retenait que celle-là, alors que ses sœurs de MÊME forme (`3:w`) sont
  // autant de rayons du même gabarit.
  const home = `
    <a href="https://swap-europe.com/fr/pieces/tondeuse">Tondeuse</a>
    <a href="https://swap-europe.com/fr/jardinage/tondeuse">Tondeuse jardin</a>
    <a href="https://swap-europe.com/fr/pieces/souffleur">Souffleur</a>
    <a href="https://swap-europe.com/fr/pieces-ryobi">Ryobi</a>
    <a href="https://swap-europe.com/fr/mentions-legales">Mentions</a>`

  it('rend les sœurs de forme, sans la page confirmée elle-même', () => {
    const mates = shapeMates(home, 'swap-europe.com', ['https://swap-europe.com/fr/pieces/tondeuse'])
    expect(mates).toEqual([
      'https://swap-europe.com/fr/jardinage/tondeuse',
      'https://swap-europe.com/fr/pieces/souffleur',
    ])
  })

  it('n’attrape pas les formes NON confirmées', () => {
    const mates = shapeMates(home, 'swap-europe.com', ['https://swap-europe.com/fr/pieces/tondeuse'])
    expect(mates).not.toContain('https://swap-europe.com/fr/pieces-ryobi') // forme 2:w-w
  })

  it('rend [] sans page confirmée (jamais un plan inventé)', () => {
    expect(shapeMates(home, 'swap-europe.com', [])).toEqual([])
  })

  it('exclut le légal/éditorial comme le reste du module', () => {
    const mates = shapeMates(home, 'swap-europe.com', ['https://swap-europe.com/fr/pieces-ryobi'])
    expect(mates.join()).not.toContain('mentions-legales')
  })
})

describe('childListings — descente hiérarchique', () => {
  // Markup RÉEL (condensé) de https://swap-europe.com/fr/debroussailleuse-et-coupe-bordure :
  // sous-rayons, pagination en SEGMENT, variantes de tri en QUERY, et fiches produit.
  const parent = 'https://swap-europe.com/fr/debroussailleuse-et-coupe-bordure'
  const html = `
    <a href="${parent}/moteur">Moteur</a>
    <a href="${parent}/transmission">Transmission</a>
    <a href="${parent}/2">2</a>
    <a href="${parent}/18">18</a>
    <a href="${parent}?sort=price_asc">Prix croissant</a>
    <a href="${parent}?display=grid">Grille</a>
    <a href="${parent}/moteur/bougie-nkg-bpmr7a/20282735">Bougie</a>
    <a href="https://swap-europe.com/fr/pieces/tondeuse">Autre rayon</a>`

  it('retient les sous-rayons, écarte la pagination par segment', () => {
    expect(childListings(html, parent)).toEqual([`${parent}/moteur`, `${parent}/transmission`])
  })

  it('ne duplique pas le parent via ses variantes de tri (query ignorée)', () => {
    expect(childListings(html, parent).some((u) => u.includes('sort=') || u.includes('display='))).toBe(false)
  })

  it('ne descend que d’UN niveau (une fiche produit n’est pas un rayon)', () => {
    expect(childListings(html, parent).join()).not.toContain('20282735')
  })

  it('ignore un rayon frère qui n’est pas sous le parent', () => {
    expect(childListings(html, parent).join()).not.toContain('/pieces/tondeuse')
  })

  it('rend [] sur une page sans hiérarchie', () => {
    expect(childListings('<a href="/fr/autre">x</a>', parent)).toEqual([])
  })
})
