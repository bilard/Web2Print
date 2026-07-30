import { describe, it, expect } from 'vitest'
import { fr } from './fr'
import { findKeysByText, normalizeLabel } from './reverseIndex'

/** Chaque appel change de `version` : sinon l'index resterait en cache entre deux
 *  jeux de surcharges et le test mesurerait le cache, pas la résolution. */
let version = 0
function lookup(text: string, overrides: Record<string, string> = {}) {
  return findKeysByText(text, 'fr', overrides, ++version)
}

describe('normalizeLabel', () => {
  it('écrase les blancs introduits par le DOM', () => {
    // Le JSX indente ; le catalogue non. Sans normalisation, aucun libellé
    // multiligne ne serait jamais retrouvé.
    expect(normalizeLabel('\n  Bienvenue\n  ')).toBe('Bienvenue')
    expect(normalizeLabel('Deux   mots')).toBe('Deux mots')
  })

  it("réduit l'espace insécable comme un blanc ordinaire", () => {
    // Le français en sème avant « : » ; le DOM le rend tel quel, alors que le
    // catalogue écrit une espace ordinaire. Sans cette réduction, le libellé
    // affiché ne correspondrait jamais à celui du catalogue.
    expect(normalizeLabel('Langue\u00a0: FR')).toBe('Langue : FR')
  })
})

describe('findKeysByText', () => {
  it('retrouve la clé derrière un texte affiché', () => {
    expect(lookup('Bienvenue')).toContain('login.welcome')
  })

  it('retrouve la clé malgré indentation et retours à la ligne', () => {
    expect(lookup('\n      Bienvenue\n    ')).toContain('login.welcome')
  })

  it('rend TOUTES les clés candidates quand le mot est partagé', () => {
    // « Fermer » sert dans plusieurs écrans : renommer à l'aveugle changerait le
    // mot dans des modules que l'utilisateur n'a pas sous les yeux. L'index doit
    // donc les remonter toutes pour qu'il tranche.
    const keys = lookup('Fermer')
    expect(keys.length).toBeGreaterThan(1)
    expect(keys).toContain('wfc.close')
  })

  it('rend un tableau vide pour un texte absent du catalogue', () => {
    // Une donnée importée, scrapée ou générée par IA n'a pas de clé : elle n'est
    // pas surchargeable, et le popover ne doit pas s'ouvrir dessus.
    expect(lookup('Perceuse Makita DDA351RTJ')).toEqual([])
    expect(lookup('')).toEqual([])
  })

  it("ignore un gabarit qui n'est QU'une variable", () => {
    // `ac.quota.scopeSuffix` vaut « {scope} » : sa regex reconnaîtrait tout
    // texte de l'écran. C'est ce cas précis qui rendait n'importe quelle donnée
    // scrapée « surchargeable » — cf. MIN_LITERAL_CHARS.
    expect(fr['ac.quota.scopeSuffix'].trim()).toBe('{scope}')
    expect(lookup('Perceuse Makita DDA351RTJ')).not.toContain('ac.quota.scopeSuffix')
  })

  it('résout un gabarit interpolé depuis sa valeur rendue', () => {
    // Le DOM affiche « ✓ Rotation animation persisted… », le catalogue stocke
    // « ✓ {name} animation… » : sans le passage par gabarit, tout libellé
    // portant une variable serait inaccessible à l'édition.
    const rendered = fr['anim.persisted'].replace('{name}', 'Rotation')
    expect(lookup(rendered)).toContain('anim.persisted')
  })

  it('indexe le texte SURCHARGÉ, pas celui du catalogue', () => {
    // Un libellé déjà renommé une fois doit rester cliquable pour être corrigé.
    const keys = lookup('Contenance', { 'login.welcome': 'Contenance' })
    expect(keys).toContain('login.welcome')
  })

  it('ne retrouve plus le texte d’origine une fois surchargé', () => {
    // Corollaire du précédent : c'est ce qui est À L'ÉCRAN qui est cliquable.
    expect(lookup('Bienvenue', { 'login.welcome': 'Contenance' })).not.toContain('login.welcome')
  })
})
