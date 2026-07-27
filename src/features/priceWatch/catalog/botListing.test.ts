import { describe, it, expect } from 'vitest'
import { rowToListing, botOutputToHtml, parseLooseNumber, parseBotRows } from './botListing'
import { parseListingGeneric } from './genericListing'

const URL = 'https://www.exemple.fr/p/123'

describe('parseLooseNumber — libellés marchands', () => {
  it('lit les formats européens et anglo-saxons', () => {
    expect(parseLooseNumber('1 299,90 €')).toBe(1299.9)
    expect(parseLooseNumber('1.299,90')).toBe(1299.9)
    expect(parseLooseNumber('1,299.90')).toBe(1299.9)
    expect(parseLooseNumber('12.90 EUR')).toBe(12.9)
    expect(parseLooseNumber(24.5)).toBe(24.5)
  })
  it('rejette ce qui n’est pas un prix', () => {
    expect(parseLooseNumber('Prix sur demande')).toBeUndefined()
    expect(parseLooseNumber('0')).toBeUndefined()
    expect(parseLooseNumber(null)).toBeUndefined()
  })
})

describe('rowToListing — déduction par NOM de clé', () => {
  it('reconnaît les libellés français', () => {
    expect(rowToListing({ libelle: 'Lame 45 cm', prix: '24,90 €', reference: 'A97', lien: URL })).toMatchObject({
      name: 'Lame 45 cm', price: 24.9, ref: 'A97', url: URL,
    })
  })

  it('reconnaît les libellés anglais et le camelCase', () => {
    expect(rowToListing({ productName: 'Blade 45cm', unitPrice: 24.9, sku: 'A97', productUrl: URL })).toMatchObject({
      name: 'Blade 45cm', price: 24.9, ref: 'A97',
    })
  })

  it('lit le TTC / HT dans le NOM de la colonne', () => {
    expect(rowToListing({ name: 'X 20 cm', 'Prix TTC': '12,00', url: URL })?.taxIncluded).toBe(true)
    expect(rowToListing({ name: 'X 20 cm', 'Prix HT': '10,00', url: URL })?.taxIncluded).toBe(false)
  })

  it('ne retient un prix barré que s’il est SUPÉRIEUR au prix de vente', () => {
    expect(rowToListing({ name: 'Courroie A97', prix: 20, prixBarre: 30, url: URL })?.listPrice).toBe(30)
    expect(rowToListing({ name: 'Courroie A97', prix: 30, prixBarre: 20, url: URL })?.listPrice).toBeUndefined()
  })
})

describe('rowToListing — déduction par FORME de valeur (site inconnu)', () => {
  // Le cas qui compte : le bot est construit site par site, on ne connaît NI le site NI
  // ses libellés de colonnes. Aucun nom ci-dessous ne figure dans le dictionnaire.
  const exotic = {
    col_1: 'Filtre à air Briggs & Stratton Quantum 625',
    col_2: '8,40 €',
    col_3: 'https://www.exemple.fr/fr/filtre-air-quantum.html',
    col_4: 'https://cdn.exemple.fr/img/filtre-625.jpg',
    col_5: '3151234567890',
  }

  it('retrouve nom, prix, URL, image et EAN sans aucun nom de champ reconnu', () => {
    expect(rowToListing(exotic)).toMatchObject({
      name: 'Filtre à air Briggs & Stratton Quantum 625',
      price: 8.4,
      url: 'https://www.exemple.fr/fr/filtre-air-quantum.html',
      image: 'https://cdn.exemple.fr/img/filtre-625.jpg',
      gtin13: '3151234567890',
    })
  })

  it('ne confond pas l’image avec l’URL de la fiche', () => {
    const l = rowToListing(exotic)
    expect(l?.url).not.toMatch(/\.jpg$/)
    expect(l?.image).toMatch(/\.jpg$/)
  })

  it('retombe sur l’URL de la page quand le bot n’en rend aucune', () => {
    expect(rowToListing({ a: 'Bougie NGK BPMR7A', b: '4,20 €' }, URL)?.url).toBe(URL)
  })

  it('déduit la disponibilité en français comme en anglais', () => {
    expect(rowToListing({ name: 'Lame 45 cm', stock: 'Rupture de stock', url: URL })?.availability).toBe('out-of-stock')
    expect(rowToListing({ name: 'Lame 45 cm', availability: 'In stock', url: URL })?.availability).toBe('in-stock')
  })
})

describe('rowToListing — garde-fous', () => {
  it('FAIL-CLOSED : une ligne sans identité ne devient pas une fiche', () => {
    expect(rowToListing({ prix: '12,00 €' }, URL)).toBeNull()
    expect(rowToListing({}, URL)).toBeNull()
  })

  it('sans URL ni page d’origine, la fiche est rejetée (rien à rouvrir)', () => {
    expect(rowToListing({ name: 'Lame 45 cm', prix: 12 })).toBeNull()
  })

  it('une fiche sans prix reste valide (l’appariement compte aussi)', () => {
    const l = rowToListing({ name: 'Lame 45 cm', reference: 'A97' }, URL)
    expect(l).toMatchObject({ name: 'Lame 45 cm', ref: 'A97' })
    expect(l?.price).toBeUndefined()
  })
})

describe('botOutputToHtml — le bot devient une source comme une autre', () => {
  const output = JSON.stringify([
    { designation: 'Courroie A97', montant: '24,90 €', codeArticle: 'A97', page: 'https://x.fr/a97.html' },
    { designation: 'Lame 45 cm', montant: '18,00 €', codeArticle: 'L45', page: 'https://x.fr/l45.html' },
  ])

  it('le JSON-LD produit est relu par le parseur de liste existant', () => {
    const html = botOutputToHtml(output, URL)
    expect(html).toBeTruthy()
    const products = parseListingGeneric(html!, URL)
    expect(products).toHaveLength(2)
    expect(products[0]).toMatchObject({ name: 'Courroie A97', price: 24.9, ref: 'A97', url: 'https://x.fr/a97.html' })
  })

  it('accepte une enveloppe et du JSONL', () => {
    expect(parseBotRows('{"results":[{"a":1},{"a":2}]}')).toHaveLength(2)
    expect(parseBotRows('{"a":1}\n{"a":2}\nbruit')).toHaveLength(2)
  })

  it('rend null quand rien n’est exploitable — l’appelant voit une page vide', () => {
    expect(botOutputToHtml('Le produit coûte 9,90 €', URL)).toBeNull()
    expect(botOutputToHtml('', URL)).toBeNull()
    expect(botOutputToHtml(undefined, URL)).toBeNull()
  })

  it('une sortie contenant </script> ne casse pas le document porteur', () => {
    const html = botOutputToHtml(JSON.stringify([{ name: 'X </script> Y', prix: 10, url: 'https://x.fr/1' }]), URL)
    // Une seule balise fermante : celle du document. Celle du contenu est échappée.
    expect(html!.match(/<\/script>/g)).toHaveLength(1)
    expect(html).toContain('<\\/script>')
    expect(parseListingGeneric(html!, URL)).toHaveLength(1)
  })
})
