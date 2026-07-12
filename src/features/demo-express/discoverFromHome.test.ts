import { describe, it, expect } from 'vitest'
import { isObviousNonProductUrl } from './discoverFromHome'

describe('isObviousNonProductUrl — pages parasites écartées AVANT enrichissement', () => {
  it('cas réels Milwaukee : cookies, catalogues, news, concours, store locator', () => {
    for (const u of [
      'https://fr.milwaukeetool.eu/fr-fr/politique-de-cookies/',
      'https://fr.milwaukeetool.eu/fr-fr/nos-catalogues/',
      'https://fr.milwaukeetool.eu/fr-fr/heavy-duty-news/',
      'https://fr.milwaukeetool.eu/fr-fr/jeu-concours-supercross/',
      'https://fr.milwaukeetool.eu/fr-fr/store-locator/',
      'https://site.fr/mentions-legales',
      'https://site.fr/fr/contact',
    ]) expect(isObviousNonProductUrl(u), u).toBe(true)
  })

  it('URLs produit/rayon jamais écartées', () => {
    for (const u of [
      'https://fr.milwaukeetool.eu/fr-fr/m18-fuel-perforateur-sds-16mm%E2%80%8B/m18-fhac16/',
      'https://fr.milwaukeetool.eu/fr-fr/outils-electroportatifs/percage-et-burinage/',
      'https://www.castorama.fr/abri-de-jardin-milo/5411352805932_CAFR.prd',
      // « catalogue » au SINGULIER dans un slug produit légitime
      'https://site.fr/produits/porte-catalogue-mural-a4',
    ]) expect(isObviousNonProductUrl(u), u).toBe(false)
  })
})
