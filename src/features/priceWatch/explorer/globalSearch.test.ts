import { describe, it, expect } from 'vitest'
import { listingMatchesKey, scanSite } from './globalSearch'
import type { CompetitorListing } from '../catalog/prestashop'

const l = (o: Partial<CompetitorListing>): CompetitorListing =>
  ({ url: 'https://c.fr/p.html', name: 'Produit', ...o })

// Fiche RÉELLE d'emc-motoculture, celle que la recherche ne trouvait pas.
const ENJOLIVEUR = l({
  name: '122600092/0 - Protection de Roue Droite pour Tondeuse Castelgarden / GGP / Stiga',
  ref: '1226000920', price: 3.41,
  url: 'https://www.emc-motoculture.com/protection-de-roue/3559-1226000920-protection-de-roue-droite-pour-tondeuse-castelgarden-ggp-stiga-8008984359130.html',
})

describe('listingMatchesKey', () => {
  it('trouve par code-barres, même quand il n’est QUE dans l’adresse', () => {
    // emc ne publie pas de gtin13 : l'EAN n'existe que dans le slug de l'URL.
    expect(listingMatchesKey(ENJOLIVEUR, '8008984359130')).toBe(true)
    expect(listingMatchesKey(ENJOLIVEUR, '8 008984 359130')).toBe(true)
  })

  it('trouve par référence, séparateurs mis à part', () => {
    // La référence F1 porte un « / » que le marchand a retiré : sans normalisation des
    // DEUX côtés, la saisie du catalogue ne retrouve pas la fiche.
    expect(listingMatchesKey(ENJOLIVEUR, '122600092/0')).toBe(true)
    expect(listingMatchesKey(ENJOLIVEUR, '1226000920')).toBe(true)
  })

  it('trouve par mot du libellé', () => {
    expect(listingMatchesKey(ENJOLIVEUR, 'castelgarden')).toBe(true)
  })

  it('ne répond pas à une clé étrangère', () => {
    expect(listingMatchesKey(ENJOLIVEUR, '9999999999999')).toBe(false)
    expect(listingMatchesKey(ENJOLIVEUR, 'carburateur')).toBe(false)
    expect(listingMatchesKey(ENJOLIVEUR, '')).toBe(false)
  })
})

describe('scanSite', () => {
  const site = { siteId: 'emc', domain: 'emc-motoculture.com' }

  it('compte les fiches et garde la première en exemple', () => {
    const hit = scanSite(site, [l({ name: 'Courroie' }), ENJOLIVEUR, ENJOLIVEUR], '8008984359130')
    expect(hit?.count).toBe(2)
    expect(hit?.sample.price).toBe(3.41)
    expect(hit?.domain).toBe('emc-motoculture.com')
  })

  it('rend null quand le site ne vend pas l’article — le cas 123courroies', () => {
    expect(scanSite({ siteId: 'c123', domain: '123courroies.com' },
      [l({ name: 'Courroie trapézoïdale OPTIBELT', ref: 'A35' })], '8008984359130')).toBeNull()
  })
})
