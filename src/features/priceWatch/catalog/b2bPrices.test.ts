import { describe, it, expect } from 'vitest'
import { extractB2BPrices } from './b2bPrices'

/** Fiche telle qu'un espace professionnel la sert, une fois connecté. */
const FICHE = `<html><body>
  <div class="price-box">
    <span>Votre prix d'achat unitaire :</span>
    <strong class="net">6,54 €</strong> <span class="tax">HT</span>
  </div>
  <p>Prix conseillé unit. : <b>16,36 € HT</b></p>
  <p>Remise sur prix de vente : <b>-60%</b></p>
</body></html>`

describe('prix d’un espace professionnel', () => {
  it('lit les trois prix séparément, sans les confondre', () => {
    // Les confondre fausse tout : comparer un prix d'ACHAT à un prix de VENTE annonce des
    // écarts de 150 % qui n'existent pas.
    const p = extractB2BPrices(FICHE)
    expect(p.netPrice).toBe(6.54)
    expect(p.advisedPrice).toBe(16.36)
    expect(p.discountPct).toBe(60)
  })

  it('rend la remise TOUJOURS positive', () => {
    // « -60 % » et « 60 % » décrivent la même remise ; un signe conservé tel quel ferait
    // basculer les calculs d'un site à l'autre.
    expect(extractB2BPrices('<p>Remise : 45%</p>').discountPct).toBe(45)
    expect(extractB2BPrices('<p>Discount: -45 %</p>').discountPct).toBe(45)
  })

  it('déduit la remise des deux montants quand elle n’est pas écrite', () => {
    const p = extractB2BPrices(`<p>Votre prix : 50 €</p><p>Prix conseillé : 100 €</p>`)
    expect(p.discountPct).toBe(50)
  })

  it('⚠ n’attribue pas à un libellé le montant du SUIVANT', () => {
    // Sur une fiche, « prix conseillé » et « votre prix » se suivent à quelques balises
    // près : une fenêtre de lecture trop large mélangerait les deux.
    const p = extractB2BPrices(`<p>Votre prix d'achat : 6,54 €</p><p>Prix conseillé : 16,36 €</p>`)
    expect(p.netPrice).toBe(6.54)
    expect(p.advisedPrice).toBe(16.36)
  })

  it('comprend les formats de nombre européens et anglo-saxons', () => {
    expect(extractB2BPrices('<p>Votre prix : 1 234,56 €</p>').netPrice).toBe(1234.56)
    expect(extractB2BPrices('<p>Your price: 1,234.56 EUR</p>').netPrice).toBe(1234.56)
  })

  it('reste MUET sur une fiche grand public — rien à inventer', () => {
    const p = extractB2BPrices('<html><p>Prix : 19,90 €</p><p>Ajouter au panier</p></html>')
    expect(p.netPrice).toBeUndefined()
    expect(p.advisedPrice).toBeUndefined()
    expect(p.discountPct).toBeUndefined()
  })

  it('ignore les prix cachés dans le JavaScript de la page', () => {
    const p = extractB2BPrices('<script>var votrePrix = "999 €";</script><p>Votre prix : 12 €</p>')
    expect(p.netPrice).toBe(12)
  })

  it('écarte une remise hors bornes', () => {
    expect(extractB2BPrices('<p>Remise : 250%</p>').discountPct).toBeUndefined()
    expect(extractB2BPrices('<p>Remise : 0%</p>').discountPct).toBeUndefined()
  })
})
