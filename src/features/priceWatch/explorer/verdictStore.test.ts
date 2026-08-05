import { describe, it, expect } from 'vitest'
import { urlKey } from './verdictStore'

describe('urlKey', () => {
  it('est stable et distingue des URL voisines', () => {
    expect(urlKey('https://m.fr/p/12.html')).toBe(urlKey('https://m.fr/p/12.html'))
    expect(urlKey('https://m.fr/p/12.html')).not.toBe(urlKey('https://m.fr/p/13.html'))
  })

  it('reste court quelle que soit la longueur de l’URL', () => {
    // Une URL produit fait couramment 100 caractères. Stockées telles quelles comme clés,
    // quelques milliers de verdicts feraient sauter la limite de 1 Mo du document.
    const long = 'https://m.fr/categorie/sous-categorie/' + 'x'.repeat(300) + '.html'
    expect(urlKey(long).length).toBeLessThanOrEqual(14)
  })

  it('ne collisionne pas sur un lot réaliste', () => {
    // Un haché 32 bits collisionnerait sur ~5 % des paires à ce volume — soit un verdict
    // recopié en silence sur le mauvais produit.
    const keys = new Set(Array.from({ length: 20_000 }, (_, i) => urlKey(`https://m.fr/produit/${i}-piece-detachee.html`)))
    expect(keys.size).toBe(20_000)
  })
})
