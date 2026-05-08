/**
 * Tests pour `liftIdentityFromSpecs` — promotion des chips identité (RUBIX,
 * FABRICANT, EAN, marque connue) depuis les specs vers les champs identité
 * d'EnrichedProduct.
 *
 * Garde-fou critique : NE PAS lifter les specs techniques avec name en CAPS
 * (TENSION, POIDS, PUISSANCE…) — risque historique d'avoir nuke des specs
 * réelles (cf. revue advisor 2026-05-08).
 */
import { describe, it, expect } from 'vitest'
import { liftIdentityFromSpecs } from './useProductEnrichment'

describe('liftIdentityFromSpecs — chips Rubix-style', () => {
  it('lifte les 4 chips identité (BOSCH/RUBIX/FABRICANT/EAN) en retirant des specs', () => {
    const specs = [
      { name: 'BOSCH', value: 'GBH 5-40 DCE' },
      { name: 'RUBIX', value: '0136-5035407' },
      { name: 'FABRICANT', value: '0611264000' },
      { name: 'EAN', value: '3165140461214' },
      { name: 'Tension', value: '230 V', group: 'Puissance' },
      { name: 'Poids', value: '6.8 kg', group: 'Poids' },
    ]
    const { identity, remaining } = liftIdentityFromSpecs(specs)

    expect(identity).toEqual({
      brand: 'Bosch',
      model: 'GBH 5-40 DCE',
      distributorRef: '0136-5035407',
      manufacturerRef: '0611264000',
      ean: '3165140461214',
    })
    // Les 4 specs identité doivent être retirées ; les specs techniques restent.
    expect(remaining).toEqual([
      { name: 'Tension', value: '230 V', group: 'Puissance' },
      { name: 'Poids', value: '6.8 kg', group: 'Poids' },
    ])
  })

  it('NE LIFT PAS une spec technique en CAPS (TENSION, POIDS) — pas dans le dico marque', () => {
    const specs = [
      { name: 'TENSION', value: '230 V' },
      { name: 'POIDS', value: '6.8 kg' },
      { name: 'PUISSANCE', value: '1500 W' },
      { name: 'DIAMETRE', value: '40 mm' },
    ]
    const { identity, remaining } = liftIdentityFromSpecs(specs)

    expect(identity).toEqual({})
    expect(remaining).toHaveLength(4)
  })

  it('rejette le pattern "BRAND: mesure" si la value ressemble à une mesure (garde-fou)', () => {
    // Hypothétique : un site rendrait "BOSCH" comme label avec une valeur
    // numérique seule. On préfère ne RIEN lifter qu'extraire un faux modèle.
    const specs = [
      { name: 'BOSCH', value: '230 V' },
    ]
    const { identity, remaining } = liftIdentityFromSpecs(specs)

    expect(identity.brand).toBeUndefined()
    expect(identity.model).toBeUndefined()
    expect(remaining).toHaveLength(1)
  })

  it('lifte le label générique "Marque" / "Modèle" / "EAN" / "Code commande"', () => {
    const specs = [
      { name: 'Marque', value: 'Bosch' },
      { name: 'Modèle', value: 'GBH 5-40 DCE' },
      { name: 'EAN', value: '3165140461214' },
      { name: 'Code commande', value: 'AB-12345' },
      { name: 'Référence fabricant', value: '0611264000' },
    ]
    const { identity, remaining } = liftIdentityFromSpecs(specs)

    expect(identity).toEqual({
      brand: 'Bosch',
      model: 'GBH 5-40 DCE',
      ean: '3165140461214',
      distributorRef: 'AB-12345',
      manufacturerRef: '0611264000',
    })
    expect(remaining).toEqual([])
  })

  it('rejette un EAN mal formé (pas 8-14 chiffres)', () => {
    const specs = [
      { name: 'EAN', value: 'ABC123' },
      { name: 'EAN', value: '123' },
    ]
    const { identity, remaining } = liftIdentityFromSpecs(specs)

    expect(identity.ean).toBeUndefined()
    expect(remaining).toHaveLength(2)
  })

  it('garde la première occurrence quand un champ identité apparaît deux fois', () => {
    const specs = [
      { name: 'EAN', value: '3165140461214' },
      { name: 'EAN', value: '9999999999999' },
    ]
    const { identity, remaining } = liftIdentityFromSpecs(specs)

    expect(identity.ean).toBe('3165140461214')
    // La 2e occurrence revient dans les specs (pas perdue).
    expect(remaining).toHaveLength(1)
    expect(remaining[0].value).toBe('9999999999999')
  })

  it('ne lifte pas si specs vide', () => {
    const { identity, remaining } = liftIdentityFromSpecs([])
    expect(identity).toEqual({})
    expect(remaining).toEqual([])
  })
})
