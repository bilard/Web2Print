import { describe, it, expect } from 'vitest'
import { parsePricingFromMarkdown, parsePriceNumber } from '../parsers/parsePricing'

describe('parsePriceNumber', () => {
  it('parse les nombres avec espaces fines et virgule décimale (FR)', () => {
    expect(parsePriceNumber('1 199,00')).toBe(1199)
    expect(parsePriceNumber('999,99')).toBe(999.99)
    expect(parsePriceNumber('18 000')).toBe(18000)
  })

  it('parse les nombres anglo-saxons (point décimal, virgule milliers)', () => {
    expect(parsePriceNumber('1,199.00')).toBe(1199)
    expect(parsePriceNumber('999.99')).toBe(999.99)
  })

  it('parse les espaces insécables U+00A0', () => {
    expect(parsePriceNumber('1 199,00')).toBe(1199)
  })

  it('retourne null pour entrée invalide', () => {
    expect(parsePriceNumber('abc')).toBeNull()
    expect(parsePriceNumber('')).toBeNull()
  })
})

describe('parsePricingFromMarkdown', () => {
  it('extrait prix Dyson : actuel + barré + économie + éco-participation', () => {
    const md = `# Dyson Spot+Scrub

prix actuel :

999,00€

prix d'origine :

était 1 199,00€

Économisez 200,00€

Dont 3,40€ d'éco-participation
`
    const p = parsePricingFromMarkdown(md)
    expect(p?.ttc).toBe(999)
    expect(p?.original).toBe(1199)
    expect(p?.discount?.amount).toBe(200)
    expect(p?.ecoParticipation).toBe(3.40)
    expect(p?.currency).toBe('EUR')
  })

  it('extrait HT et TTC séparés (B2B style)', () => {
    const md = `# Produit

Prix : 1 449,00 € HT
Prix : 1 738,80 € TTC
`
    const p = parsePricingFromMarkdown(md)
    expect(p?.ht).toBe(1449)
    expect(p?.ttc).toBe(1738.80)
  })

  it('détecte le pourcentage de réduction', () => {
    const md = `Prix : 80,00 € — Avant : 100,00 € — -20%`
    const p = parsePricingFromMarkdown(md)
    expect(p?.discount?.percent).toBe(20)
  })

  it('priorité JSON-LD offers sur markdown', () => {
    const md = `Prix : 999,00€`
    const jsonLdPrice = { ttc: 1499, currency: 'EUR' }
    const p = parsePricingFromMarkdown(md, jsonLdPrice)
    expect(p?.ttc).toBe(1499)
  })

  it('retourne null si aucun prix trouvé', () => {
    const md = `Description seulement, pas de prix.`
    expect(parsePricingFromMarkdown(md)).toBeNull()
  })

  it('GBP : devise alternative', () => {
    const md = `Price: £49.99`
    const p = parsePricingFromMarkdown(md)
    expect(p?.ttc).toBe(49.99)
    expect(p?.currency).toBe('GBP')
  })

  it('USD : symbole $', () => {
    const md = `Price: $59.99`
    const p = parsePricingFromMarkdown(md)
    expect(p?.ttc).toBe(59.99)
    expect(p?.currency).toBe('USD')
  })

  it('JSON-LD avec validUntil → préserve la date', () => {
    const p = parsePricingFromMarkdown('', {
      ttc: 999,
      currency: 'EUR',
      validUntil: '2026-06-30',
    })
    expect(p?.validUntil).toBe('2026-06-30')
  })

  it('ignore les prix de livraison/expédition isolés', () => {
    const md = `Livraison : 5,90€\nExpédition : 8,00€`
    const p = parsePricingFromMarkdown(md)
    expect(p).toBeNull()
  })

  it('Jardiland-style : capture le 1er prix EUR brut, ignore les offres marketplace', () => {
    // Pattern réel Jardiland Ryobi : bannière site + prix principal + éco-part DEEE + offres marketplace
    const md = `Tondeuse RYOBI

**FRENCH DAYS : JUSQU'À -70% DE REMISE !**

23 avis

ALEXANDRA M.

5/5 5/5

Je suis contente de mon achat

Voir tous les avis

219,00 €

dont 2,50 € de participation DEEE

Quantité

Livraison à domicile

**En stock**

GRATUIT à partir du mercredi 06 mai

**Offres partenaires**

+ **6 offres** à partir de **185,99 €**

Paiement 100% sécurisé
`
    const p = parsePricingFromMarkdown(md)
    expect(p?.ttc).toBe(219)
    // Le 185,99 € est marketplace → DOIT être ignoré
    expect(p?.ttc).not.toBe(185.99)
    // L'éco-participation "de participation DEEE" doit être captée
    expect(p?.ecoParticipation).toBe(2.5)
    // La bannière "JUSQU'À -70%" est marketing globale → ne doit PAS créer un faux discount
    expect(p?.discount?.percent).toBeUndefined()
  })

  it('ignore les bannières marketing -XX% globales (jusqu\'à / à partir de)', () => {
    const md = `**FRENCH DAYS : JUSQU'À -70% DE REMISE !**

Prix : 100,00 €`
    const p = parsePricingFromMarkdown(md)
    expect(p?.ttc).toBe(100)
    expect(p?.discount?.percent).toBeUndefined()
  })

  it('garde un -XX% légitime hors bannière (ex: "-20%" en ligne avec prix)', () => {
    const md = `Prix : 80,00 € — Avant : 100,00 € — -20%`
    const p = parsePricingFromMarkdown(md)
    expect(p?.discount?.percent).toBe(20)
  })

  it('Jardiland Jina réel : prix adjacents collés `229,99 €367,49 €- 137,50 €`', () => {
    // Format réel Jina sur Jardiland en promo (pas de strikethrough préservé)
    const md = `Tondeuse Ryobi pack

229,99 €367,49 €- 137,50 €
dont 3,12 € de participation DEEE
`
    const p = parsePricingFromMarkdown(md)
    expect(p?.ttc).toBe(229.99)
    expect(p?.original).toBe(367.49)
    expect(p?.discount?.amount).toBe(137.5)
    expect(p?.ecoParticipation).toBe(3.12)
  })

  it('Jardiland-style promo : strikethrough barré + montant signé + éco-DEEE', () => {
    // Pattern réel Jardiland en promo : `~~XXX,XX €~~ -YYY,YY €` puis prix actuel
    const md = `Tondeuse XYZ Promo

**FRENCH DAYS : JUSQU'À -70% DE REMISE !**

~~367,49 €~~ -137,50 €

229,99 €

dont 3,12 € de participation DEEE
`
    const p = parsePricingFromMarkdown(md)
    expect(p?.original).toBe(367.49)
    expect(p?.discount?.amount).toBe(137.5)
    expect(p?.ttc).toBe(229.99)
    expect(p?.ecoParticipation).toBe(3.12)
    // La bannière "JUSQU'À -70%" reste exclue
    expect(p?.discount?.percent).toBeUndefined()
  })
})

describe('parsePricingFromMarkdown — HT/TTC turndown artefacts', () => {
  it('matche `414,20 €^HT^` (turndown-rendered <sup>HT</sup>)', () => {
    const md = 'Prix : 414,20 €^HT^ / unité'
    const p = parsePricingFromMarkdown(md)
    expect(p?.ht).toBe(414.2)
  })

  it('matche `497,04 € *TTC*` (italique markdown autour de TTC)', () => {
    const md = 'Total 497,04 € *TTC*'
    const p = parsePricingFromMarkdown(md)
    expect(p?.ttc).toBe(497.04)
  })

  it('matche les deux prix HT et TTC dans un même bloc style Rubix', () => {
    const md = `
414,20 €^HT^
/ unité
497,04 €^TTC^
En stock
`
    const p = parsePricingFromMarkdown(md)
    expect(p?.ht).toBe(414.2)
    expect(p?.ttc).toBe(497.04)
  })

  it('matche `414,20 € (HT)` (parens)', () => {
    const md = '414,20 € (HT)'
    const p = parsePricingFromMarkdown(md)
    expect(p?.ht).toBe(414.2)
  })

  it('matche avec saut de ligne entre € et HT/TTC', () => {
    const md = '414,20 €\nHT\n'
    const p = parsePricingFromMarkdown(md)
    expect(p?.ht).toBe(414.2)
  })
})

describe('parsePricingFromMarkdown — inférence HT depuis 2 prix sans label', () => {
  it('infère HT quand TTC matché et un prix plus petit (TVA ~20%) à proximité', () => {
    // Cas : turndown perd les <sup>HT</sup>/<sup>TTC</sup>, il reste juste 2 prix
    const md = `Prix unitaire
414,20 €
/ unité
497,04 € TTC
En stock`
    const p = parsePricingFromMarkdown(md)
    expect(p?.ttc).toBe(497.04)
    expect(p?.ht).toBe(414.2)
  })

  it("n'infère PAS HT si l'autre prix est trop éloigné en valeur (>25% de différence)", () => {
    const md = `100,00 €
TVA non applicable
500,00 € TTC`
    const p = parsePricingFromMarkdown(md)
    expect(p?.ttc).toBe(500)
    // 500/100 = 5x → trop loin du facteur TVA, pas d'inférence
    expect(p?.ht).toBeUndefined()
  })

  it("n'infère PAS HT si l'autre prix est plus grand (cas prix barré)", () => {
    const md = `Prix promo : 100,00 €
Avant : 150,00 €`
    const p = parsePricingFromMarkdown(md)
    // 150 > 100 donc pas HT — c'est probablement un prix barré
    expect(p?.ht).toBeUndefined()
  })

  it('matche `**414,20** €^HT^` (bold autour du prix + sup tag)', () => {
    const md = '**414,20** €^HT^ / unité'
    const p = parsePricingFromMarkdown(md)
    expect(p?.ht).toBe(414.2)
  })

  it('matche `__414,20__ € __HT__` (italic markers)', () => {
    const md = '__414,20__ € __HT__'
    const p = parsePricingFromMarkdown(md)
    expect(p?.ht).toBe(414.2)
  })

  it('matche `<strong>414,20</strong> €<sup>HT</sup>` (HTML strong/sup résiduel)', () => {
    const md = '<strong>414,20</strong> €<sup>HT</sup>'
    const p = parsePricingFromMarkdown(md)
    expect(p?.ht).toBe(414.2)
  })

  it('cas Rubix complet : HT bold prominent + TTC plus petit', () => {
    // Reproduction de la sortie turndown probable du bloc prix Rubix
    const md = `Prix unitaire

**414,20** € ^HT^

/ unité

497,04 € ^TTC^

En stock`
    const p = parsePricingFromMarkdown(md)
    expect(p?.ht).toBe(414.2)
    expect(p?.ttc).toBe(497.04)
  })

  it('infère HT via fallback global quand HT est éloigné du TTC dans le doc', () => {
    // Cas Rubix : HT au top de la page, TTC en bas, séparés par 2000 chars de
    // description, specs, etc. La fenêtre locale 250 chars ne les voit pas.
    const md = `## Produit perforateur

414,20 €

${'X '.repeat(500)}

Description très longue du produit...

${'Y '.repeat(500)}

Prix total : 497,04 € TTC
`
    const p = parsePricingFromMarkdown(md)
    expect(p?.ttc).toBe(497.04)
    expect(p?.ht).toBe(414.2)
  })
})

// Fixture réelle trafic.com : la page « tout dépliée » contient un montant
// « 50,00 € HT » de bruit (franco de port / offre d'assurance) alors que le
// produit vaut 19,99 € TTC. Un HT ≥ TTC est arithmétiquement impossible
// (TVA ≥ 0) → le HT doit être rejeté.
describe('parsePricingFromMarkdown — garde HT ≥ TTC (bruit de page)', () => {
  it('rejette un HT capturé supérieur au TTC', () => {
    const md = `# Ventilateur Sans Hélice Noir

19,99 €

Franco de port à partir de 50,00 € HT`
    const p = parsePricingFromMarkdown(md, { ttc: 19.99 })
    expect(p?.ttc).toBe(19.99)
    expect(p?.ht).toBeUndefined()
  })

  it('garde-fou : un vrai couple HT/TTC reste intact', () => {
    const md = `414,20 € HT

497,04 € TTC`
    const p = parsePricingFromMarkdown(md)
    expect(p?.ht).toBe(414.2)
    expect(p?.ttc).toBe(497.04)
  })

  it('rejette un prix barré ≤ TTC (bruit)', () => {
    const md = `Prix actuel : 19,99 €

était 19,99 €`
    const p = parsePricingFromMarkdown(md)
    expect(p?.ttc).toBe(19.99)
    expect(p?.original).toBeUndefined()
  })
})

// Fixture réelle Rubix (fr.rubix.com/…/p-G3515004580) : promo B2B où le prix
// barré est exprimé en HT ("Au lieu de 135,03 €" au-dessus du "131,00 € HT")
// alors que le TTC (157,20 €) coexiste. Le JSON-LD ne porte que le TTC.
describe('parsePricingFromMarkdown — Rubix promo B2B (barré HT + DEEE + unité)', () => {
  const rubixMd = `PROMOTION
Au lieu de 135,03 €
131,00 € HT
/ unité
157,20 € TTC
Dont DEEE : 0,42 € TTC
En stock, expédié sous 24/48h`

  it('capte barré HT, DEEE (label avant montant) et unité de vente', () => {
    const p = parsePricingFromMarkdown(rubixMd, { ttc: 157.2, currency: 'EUR' })
    expect(p?.ttc).toBe(157.2)
    expect(p?.ht).toBe(131)
    // "Au lieu de 135,03 €" : barré HT (135,03) — NE doit PAS être rejeté même
    // s'il est ≤ TTC (157,20), car il dépasse le prix de vente le plus bas (131).
    expect(p?.original).toBe(135.03)
    // "Dont DEEE : 0,42 €" : libellé DEEE avant le montant.
    expect(p?.ecoParticipation).toBe(0.42)
    // "/ unité" : unité de vente verbatim.
    expect(p?.unit).toBe('unité')
  })

  it('rejette toujours un barré réellement ≤ au prix le plus bas', () => {
    // Barré 120 alors que HT=131 et TTC=157,20 → 120 < 131 : incohérent, rejeté.
    const md = `Au lieu de 120,00 €\n131,00 € HT\n157,20 € TTC`
    const p = parsePricingFromMarkdown(md, { ttc: 157.2 })
    expect(p?.original).toBeUndefined()
  })

  it('markdown turndown RÉEL : **strong** barré, ^sup^ HT/TTC, blocs séparés', () => {
    // Reproduction fidèle de la sortie turndown du HTML Rubix effectivement scrapé
    // (<strong class="line-through"> → **…**, <sup> → ^…^, blocs en lignes vides,
    //  commentaire HTML "/<!-- --> unité" nettoyé). Vérifie que les nouveaux
    // signaux tiennent sur du markdown "sale", pas seulement du texte propre.
    const md = `PROMOTION

Au lieu de **135,03 €**

**131,00** € ^HT^

/ unité

157,20 € ^TTC^

Dont DEEE : 0,42 € ^TTC^

En stock, expédié sous 24/48h`
    const p = parsePricingFromMarkdown(md, { ttc: 157.2, currency: 'EUR' })
    expect(p?.ttc).toBe(157.2)
    expect(p?.ht).toBe(131)
    expect(p?.original).toBe(135.03)
    expect(p?.ecoParticipation).toBe(0.42)
    expect(p?.unit).toBe('unité')
  })
})
