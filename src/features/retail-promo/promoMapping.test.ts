import { describe, it, test, expect } from 'vitest'
import { defaultPromoFieldMap, defaultCustomFields, buildDetailLines, buildSpecTable, extractPromoFields, computeRemiseLabel, displayedRemisePct } from './promoMapping'
import type { MergeColumn, MergeRow } from '@/stores/merge.store'
import type { PromoFields } from './promoTypes'

/** PromoFields neutre + surcharges, pour tester l'affichage de la remise. */
const F = (over: Partial<PromoFields>): PromoFields => ({
  name: '', image: null, brand: '', ref: '', ean: '', oldPrice: null, newPrice: null,
  currency: 'EUR', unit: '', description: '', category: '', unitPrice: '', promoLabel: '',
  mechanism: 'simple', remisePct: null, remiseMontant: null, lotQty: null, lotOffert: null,
  lotPrice: null, validFrom: null, validTo: null, mentions: '', enseigne: '', badges: [], ...over,
})

const cols: MergeColumn[] = [
  { key: 'ai_name', label: 'Nom', fieldType: 'text' },
  { key: 'ai_images', label: 'Images', fieldType: 'image', aliases: ['Image', 'Photo'] },
  { key: 'prix_barre', label: 'Prix barré', fieldType: 'currency' },
  { key: 'prix', label: 'Prix', fieldType: 'currency' },
  { key: 'ean', label: 'EAN', fieldType: 'barcode' },
]

describe('defaultPromoFieldMap', () => {
  it('devine name/image/oldPrice/newPrice/ean depuis labels & aliases', () => {
    const m = defaultPromoFieldMap(cols)
    expect(m.name).toBe('ai_name')
    expect(m.image).toBe('ai_images')
    expect(m.oldPrice).toBe('prix_barre')
    expect(m.newPrice).toBe('prix')
    expect(m.ean).toBe('ean')
  })

  it('paire retail « Prix_barré » + « Prix_normal » : normal = prix de VENTE, barré = prix barré', () => {
    const m = defaultPromoFieldMap([
      { key: 'pb', label: 'Prix_barré', fieldType: 'currency' },
      { key: 'pn', label: 'Prix_normal', fieldType: 'currency' },
    ])
    expect(m.oldPrice).toBe('pb')
    expect(m.newPrice).toBe('pn')
  })

  it('garde anti-collision : une seule colonne prix → newPrice mappé, oldPrice abandonné', () => {
    const m = defaultPromoFieldMap([{ key: 'pb', label: 'Prix barré', fieldType: 'currency' }])
    expect(m.newPrice).toBe('pb') // repli partiel « prix »
    expect(m.oldPrice).toBeUndefined() // jamais la même colonne que newPrice
  })

  it('cartouche promo : la colonne TEXTE (Mechanic) prime sur la colonne ratio (Promotion)', () => {
    const m = defaultPromoFieldMap([
      { key: 'promo', label: 'Promotion', fieldType: 'number' },
      { key: 'mech', label: 'Mechanic', fieldType: 'text' },
    ])
    expect(m.promoLabel).toBe('mech')
  })
})

describe('extractPromoFields', () => {
  it('extrait + calcule la remise, conserve la CHAÎNE d’images (repli à la résolution)', () => {
    const row: MergeRow = { _id: '1', ai_name: 'Perceuse', ai_images: 'http://a/1.jpg | http://a/2.jpg', prix_barre: '100 €', prix: '75 €', ean: '123' }
    const f = extractPromoFields(row, cols, defaultPromoFieldMap(cols))
    expect(f.name).toBe('Perceuse')
    expect(f.image).toBe('http://a/1.jpg | http://a/2.jpg')
    expect(f.oldPrice).toBe(100)
    expect(f.newPrice).toBe(75)
    expect(f.remisePct).toBe(25)
    expect(f.mechanism).toBe('remise')
  })
  it('champs absents → valeurs neutres, mechanism simple', () => {
    const f = extractPromoFields({ _id: '2', ai_name: 'X', prix: '5 €' }, cols, defaultPromoFieldMap(cols))
    expect(f.oldPrice).toBeNull()
    expect(f.image).toBeNull()
    expect(f.mechanism).toBe('simple')
    expect(f.currency).toBe('EUR')
  })
})

describe('computeRemiseLabel', () => {
  it('colonne « Promotion » prioritaire (entier, ratio, brut)', () => {
    expect(computeRemiseLabel(F({ promoLabel: '28' }))).toBe('-28%')
    expect(computeRemiseLabel(F({ promoLabel: '0.28' }))).toBe('-28%')
    expect(computeRemiseLabel(F({ promoLabel: '3 achetés = 1 offert' }))).toBe('3 achetés = 1 offert')
  })
  it('repli sur la remise calculée si pas de « Promotion »', () => {
    expect(computeRemiseLabel(F({ remisePct: 25 }))).toBe('-25%')
    expect(computeRemiseLabel(F({}))).toBeUndefined()
  })
})

describe('displayedRemisePct (colonne synthétique « Remise (%) »)', () => {
  it('reflète la remise AFFICHÉE, quelle que soit son origine', () => {
    expect(displayedRemisePct(F({ promoLabel: '28' }))).toBe(28)      // entier → -28% → 28
    expect(displayedRemisePct(F({ promoLabel: '0.28' }))).toBe(28)    // ratio → -28% → 28
    expect(displayedRemisePct(F({ promoLabel: '28%' }))).toBe(28)     // texte « 28% » brut → 28
    expect(displayedRemisePct(F({ remisePct: 25 }))).toBe(25)         // calcul pur prix → 25
  })
  it('null si le badge n’exprime pas un pourcentage', () => {
    expect(displayedRemisePct(F({ promoLabel: 'Lot 3+1' }))).toBeNull()
    expect(displayedRemisePct(F({}))).toBeNull()
  })
})

describe('defaultCustomFields (devinage des champs libres « Détails »)', () => {
  it('devine les colonnes détails usuelles du retail, dans l’ordre du dictionnaire', () => {
    const columns: MergeColumn[] = [
      { key: 'c_tva', label: 'TVA (%)', fieldType: 'number' },
      { key: 'c_av', label: 'Avantages', fieldType: 'text' },
      { key: 'c_app', label: 'Applications', fieldType: 'text' },
      { key: 'c_inst', label: 'Installation', fieldType: 'text' },
      { key: 'c_ent', label: 'Entretien', fieldType: 'text' },
      { key: 'c_seo', label: 'SEO', fieldType: 'text' },
    ]
    const cfs = defaultCustomFields(columns, {})
    expect(cfs.map((c) => c.column)).toEqual(['c_av', 'c_app', 'c_inst', 'c_ent', 'c_tva'])
    expect(cfs.map((c) => c.label)).toEqual(['Avantages', 'Applications', 'Installation', 'Entretien', 'TVA (%)'])
  })

  it('exclut les colonnes déjà mappées sur un champ de fiche', () => {
    const columns: MergeColumn[] = [
      { key: 'c_av', label: 'Avantages', fieldType: 'text' },
      { key: 'c_gar', label: 'Garantie', fieldType: 'text' },
    ]
    const cfs = defaultCustomFields(columns, { description: 'c_av' })
    expect(cfs.map((c) => c.column)).toEqual(['c_gar'])
  })

  it('jamais deux champs sur la même colonne, ids uniques', () => {
    const columns: MergeColumn[] = [
      { key: 'c1', label: 'Matière', fieldType: 'text', aliases: ['material'] },
    ]
    const cfs = defaultCustomFields(columns, {})
    expect(cfs).toHaveLength(1)
    const ids = defaultCustomFields(
      [{ key: 'a', label: 'Garantie', fieldType: 'text' }, { key: 'b', label: 'Garantie constructeur', fieldType: 'text' }], {})
    expect(new Set(ids.map((c) => c.id)).size).toBe(ids.length)
  })

  it('aucune colonne reconnue → liste vide', () => {
    expect(defaultCustomFields([{ key: 'x', label: 'SEO', fieldType: 'text' }], {})).toEqual([])
  })
})

describe('buildDetailLines — valeurs multi-sujets en PUCES (étiquette en tête)', () => {
  const cfs = [{ id: 'av', label: 'Avantages', column: 'c_av' }]
  const F = (v: string) => ({ extra: { av: v } }) as unknown as Parameters<typeof buildDetailLines>[1]

  it('« - A - B - C » (export IA/scraping) → une puce par sujet', () => {
    expect(buildDetailLines(cfs, F('- Double expansion - Charge 35kg - Anti-corrosion')))
      .toEqual(['Avantages :', '• Double expansion', '• Charge 35kg', '• Anti-corrosion'])
  })

  it('les tirets INTERNES des mots composés sont préservés (Anti-corrosion)', () => {
    expect(buildDetailLines(cfs, F('- Anti-corrosion - Semi-rigide'))).toEqual(['Avantages :', '• Anti-corrosion', '• Semi-rigide'])
  })

  it('une phrase par ligne (sortie IA) → une puce par phrase', () => {
    expect(buildDetailLines(cfs, F('En sapin blanc du Nord.\nToiture en plaques ESB.\nDouble porte verrouillable.')))
      .toEqual(['Avantages :', '• En sapin blanc du Nord.', '• Toiture en plaques ESB.', '• Double porte verrouillable.'])
  })

  it('liste à puces multi-lignes → puces propres (marqueurs d’origine retirés)', () => {
    expect(buildDetailLines(cfs, F('• Léger\n• Pliable'))).toEqual(['Avantages :', '• Léger', '• Pliable'])
  })

  it('valeur mono-sujet → ligne « Étiquette : valeur » classique', () => {
    expect(buildDetailLines(cfs, F('Acier zingué'))).toEqual(['Avantages : Acier zingué'])
  })
})

test('extractPromoFields peuple extra depuis customFields (vides omises)', () => {
  const columns: MergeColumn[] = [
    { key: 'c_norm', label: 'Normes' } as MergeColumn,
    { key: 'c_colis', label: 'Colis' } as MergeColumn,
    { key: 'c_vide', label: 'SEO' } as MergeColumn,
  ]
  const row: MergeRow = { _id: 'r1', c_norm: 'EN 388', c_colis: '6', c_vide: '' } as unknown as MergeRow
  const f = extractPromoFields(row, columns, {}, [
    { id: 'normes', label: 'Normes', column: 'c_norm' },
    { id: 'colis', label: 'Colis', column: 'c_colis' },
    { id: 'seo', label: 'SEO', column: 'c_vide' },
  ])
  expect(f.extra).toEqual({ normes: 'EN 388', colis: '6' })
})

test('extractPromoFields sans customFields → extra vide (rétro-compat)', () => {
  const columns: MergeColumn[] = [{ key: 'c', label: 'Nom' } as MergeColumn]
  const row: MergeRow = { _id: 'r1', c: 'X' } as unknown as MergeRow
  expect(extractPromoFields(row, columns, { name: 'c' }).extra).toEqual({})
})

describe('spécifications techniques sur les fiches (devinage + rendu plafonné)', () => {
  const SPECS = '[Général]Type d\'article: Dispo | [Général]Gamme: Milo | [Dimensions]Profondeur externe (cm): 243cm | [Dimensions]Largeur externe (cm): 243cm | [Dimensions]Hauteur (cm): 232cm | [Toit]Pente: 15.7° | [Toit]Couverture: feutre bitumeux | [Portes]Largeur: 1.2M'

  it('defaultCustomFields devine la colonne specifications (alias ai_specifications)', () => {
    const columns: MergeColumn[] = [
      { key: 'ai_name', label: 'Nom', fieldType: 'text' },
      { key: 'ai_specifications', label: 'Spécifications', fieldType: 'text', aliases: ['Spécifications', 'specs', 'Caractéristiques', 'specifications'] },
    ]
    const cfs = defaultCustomFields(columns, { name: 'ai_name' })
    expect(cfs.some((cf) => cf.column === 'ai_specifications')).toBe(true)
  })

  it('buildSpecTable éclate les specs aplaties en paires nom/valeur plafonnées à 6, groupe retiré', () => {
    const cfs = [{ id: 'specs', label: 'Spécifications', column: 'ai_specifications' }]
    const t = buildSpecTable(cfs, { extra: { specs: SPECS } } as unknown as Parameters<typeof buildSpecTable>[1])
    expect(t?.label).toBe('Spécifications')
    expect(t?.rows).toHaveLength(6)
    expect(t?.rows[0]).toEqual({ name: 'Type d\'article', value: 'Dispo' })
    expect(t?.rows[2]).toEqual({ name: 'Profondeur externe (cm)', value: '243cm' })
    expect(t?.rows.every((r) => !r.name.includes('['))).toBe(true)
  })

  it('specs « une paire nom: valeur PAR LIGNE » (dataset démo express) → même tableau', () => {
    const cfs = [{ id: 'specs', label: 'Caractéristiques', column: 'specifications' }]
    const t = buildSpecTable(cfs, {
      extra: { specs: 'Type d\'article: Dispo\nGamme: Milo\nMatière: Bois' },
    } as unknown as Parameters<typeof buildSpecTable>[1])
    expect(t).toEqual({ label: 'Caractéristiques', rows: [
      { name: 'Type d\'article', value: 'Dispo' },
      { name: 'Gamme', value: 'Milo' },
      { name: 'Matière', value: 'Bois' },
    ] })
  })

  it('buildDetailLines EXCLUT le champ specs éclatable (rendu en tableau, pas en lignes)', () => {
    const cfs = [
      { id: 'av', label: 'Avantages', column: 'c_av' },
      { id: 'specs', label: 'Spécifications', column: 'ai_specifications' },
    ]
    const lines = buildDetailLines(cfs, { extra: { av: 'Acier zingué', specs: SPECS } } as unknown as Parameters<typeof buildDetailLines>[1])
    expect(lines).toEqual(['Avantages : Acier zingué'])
  })

  it('une valeur specs SANS format éclatable reste une ligne « Étiquette : valeur » (et pas de tableau)', () => {
    const cfs = [{ id: 'specs', label: 'Spécifications', column: 'ai_specifications' }]
    const F = { extra: { specs: 'Acier zingué' } } as unknown as Parameters<typeof buildDetailLines>[1]
    expect(buildDetailLines(cfs, F)).toEqual(['Spécifications : Acier zingué'])
    expect(buildSpecTable(cfs, F)).toBeNull()
  })

  it('extractPromoFields aplatit une cellule specs STRUCTURÉE (source PIM verbatim)', () => {
    const columns: MergeColumn[] = [{ key: 'ai_specifications', label: 'Spécifications' } as MergeColumn]
    const row = {
      _id: 'r1',
      ai_specifications: [
        { group: 'Général', name: 'Gamme', value: 'Milo' },
        { group: 'Dimensions', name: 'Hauteur (cm)', value: '232cm' },
      ],
    } as unknown as MergeRow
    const f = extractPromoFields(row, columns, {}, [{ id: 'specs', label: 'Spécifications', column: 'ai_specifications' }])
    expect(f.extra?.specs).toBe('[Général]Gamme: Milo | [Dimensions]Hauteur (cm): 232cm')
  })
})

describe('plafond de specs réglable (cardStyle.maxSpecLines)', () => {
  const cfs = [{ id: 'specs', label: 'Spécifications', column: 'ai_specifications' }]
  const SPECS = '[G]A: 1 | [G]B: 2 | [G]C: 3 | [G]D: 4'
  const F = { extra: { specs: SPECS } } as unknown as Parameters<typeof buildSpecTable>[1]

  it('maxSpecLines=2 → 2 paires', () => {
    expect(buildSpecTable(cfs, F, undefined, 2)?.rows).toEqual([
      { name: 'A', value: '1' }, { name: 'B', value: '2' },
    ])
  })
  it('maxSpecLines=0 → pas de tableau', () => {
    expect(buildSpecTable(cfs, F, undefined, 0)).toBeNull()
  })
  it('absent → défaut MAX_SPEC_LINES (6) : les 4 paires', () => {
    expect(buildSpecTable(cfs, F)?.rows).toHaveLength(4)
  })
})

describe('plafond des puces (champ verbeux ne doit pas évincer les specs)', () => {
  const cfs = [{ id: 'av', label: 'Avantages', column: 'c_av' }]
  const F = (v: string) => ({ extra: { av: v } }) as unknown as Parameters<typeof buildDetailLines>[1]

  it('max 5 puces par champ (défaut)', () => {
    const lines = buildDetailLines(cfs, F('A\nB\nC\nD\nE\nF\nG\nH'))
    expect(lines).toEqual(['Avantages :', '• A', '• B', '• C', '• D', '• E'])
  })

  it('une puce trop longue est abrégée au mot (« … »)', () => {
    const long = `Le coffre est-il difficile à monter ? Non, le montage est simplifié grâce à une notice illustrée et des éléments pré-percés, rendant l'assemblage accessible à tous les bricoleurs.`
    const lines = buildDetailLines(cfs, F(`${long}\nSecond point court.`))
    expect(lines[1]!.length).toBeLessThanOrEqual(2 + 161)
    expect(lines[1]!.endsWith('…')).toBe(true)
  })
})

test('buildSpecTable écarte les paires PROSE (valeur > 60 c) — elles creusaient des vides en chips', () => {
  const cfs = [{ id: 'specs', label: 'Caractéristiques', column: 'specifications' }]
  const t = buildSpecTable(cfs, {
    extra: { specs: 'Matière: Aluminium\nUsage: Idéal pour les usages quotidiens exigeants dans de nombreuses situations domestiques différentes. 3 positions, conversion facile sans outil.\nType d\'article: Diable' },
  } as unknown as Parameters<typeof buildSpecTable>[1])
  expect(t?.rows).toEqual([
    { name: 'Matière', value: 'Aluminium' },
    { name: 'Type d\'article', value: 'Diable' },
  ])
})

describe('lien vers la fiche produit SOURCE (colonne url)', () => {
  const columns: MergeColumn[] = [
    { key: 'ai_name', label: 'Nom', fieldType: 'text' },
    { key: 'url', label: 'URL source', fieldType: 'url' },
  ] as MergeColumn[]

  it('devine la colonne url et valide http(s)', () => {
    const m = defaultPromoFieldMap(columns)
    expect(m.url).toBe('url')
    const f = extractPromoFields({ _id: '1', ai_name: 'X', url: 'https://site.fr/p/123' } as unknown as MergeRow, columns, m)
    expect(f.url).toBe('https://site.fr/p/123')
  })

  it('valeur non-URL → pas de lien', () => {
    const m = defaultPromoFieldMap(columns)
    const f = extractPromoFields({ _id: '1', ai_name: 'X', url: 'voir site' } as unknown as MergeRow, columns, m)
    expect(f.url).toBeUndefined()
  })
})

describe('puces : plafond réglable + titres de sous-section écartés', () => {
  const cfs = [{ id: 'av', label: 'Avantages', column: 'c_av' }]
  const F = (v: string) => ({ extra: { av: v } }) as unknown as Parameters<typeof buildDetailLines>[1]

  it('une « puce » finissant par « : » est un titre aspiré → écartée (Equipement standard :)', () => {
    expect(buildDetailLines(cfs, F('Equipement standard :\nPoignée latérale\nPerforateur SDS-Max puissant\nMoteur 1470 W')))
      .toEqual(['Avantages :', '• Poignée latérale', '• Perforateur SDS-Max puissant', '• Moteur 1470 W'])
  })

  it('défaut : 5 puces max', () => {
    const lines = buildDetailLines(cfs, F('A1\nB2\nC3\nD4\nE5\nF6\nG7'))
    expect(lines).toHaveLength(6) // étiquette + 5
  })

  it('maxBulletItems=8 → 7 puces affichées', () => {
    const lines = buildDetailLines(cfs, F('A1\nB2\nC3\nD4\nE5\nF6\nG7'), undefined, 8)
    expect(lines).toHaveLength(8) // étiquette + 7
  })
})
