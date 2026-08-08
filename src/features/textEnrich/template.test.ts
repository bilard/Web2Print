import { describe, it, expect } from 'vitest'
import { defaultNameTemplate, renderTemplate, needsAI, aiHints } from './template'
import { DEFAULT_MIN_LENGTH, isPlanOrdered, planFields, type FieldPlan } from './fieldPlan'

const COLS = { brand: 'marque', supplierRef: 'ref_fournisseur', ean: 'ean' }
const tpl = defaultNameTemplate(COLS)
const row = { marque: 'STIGA', ref_fournisseur: '1134-4319-01', ean: '3582321853475' }

describe('assemblage du gabarit', () => {
  it('assemble dans l’ordre demandé', () => {
    expect(renderTemplate(tpl, row, 'Lame de tondeuse 51 cm', ['droite']))
      .toBe('Lame de tondeuse 51 cm - STIGA - 1134-4319-01 - droite - 3582321853475')
  })

  it('⚠ retire les morceaux vides ET leurs séparateurs', () => {
    // Sans ça : « Lame - STIGA - 1134-4319-01 -  - » — des séparateurs orphelins qui
    // se retrouvent tels quels sur une étiquette ou dans un catalogue.
    const partial = { marque: 'STIGA', ref_fournisseur: '', ean: '' }
    expect(renderTemplate(tpl, partial, 'Lame de tondeuse', []))
      .toBe('Lame de tondeuse - STIGA')
  })

  it('⚠ n’écrit pas deux fois la marque déjà présente dans le libellé', () => {
    // Le cas le plus fréquent du catalogue : le libellé source porte déjà la marque.
    expect(renderTemplate(tpl, { marque: 'STIGA' }, 'Lame STIGA 51 cm', []))
      .toBe('Lame STIGA 51 cm')
  })

  it('reconnaît le doublon malgré la casse et la ponctuation', () => {
    expect(renderTemplate(tpl, { marque: 'AL-KO' }, 'Lame alko 46 cm', []))
      .toBe('Lame alko 46 cm')
  })

  it('renonce si un morceau INDISPENSABLE manque', () => {
    // Un nom sans nom n'a aucun sens : mieux vaut ne rien produire que « - STIGA - ».
    expect(renderTemplate(tpl, row, '', [])).toBe('')
  })

  it('tolère un morceau IA absent', () => {
    // Le discriminant n'existe pas pour un produit sans variante : ce n'est pas un échec.
    expect(renderTemplate(tpl, row, 'Lame 51 cm', []))
      .toBe('Lame 51 cm - STIGA - 1134-4319-01 - 3582321853475')
  })
})

describe('coût : ce qui demande vraiment un modèle', () => {
  it('un gabarit SANS morceau à produire n’appelle personne', () => {
    // C'est le cas rentable : marque, référence et code-barres sont en colonnes, on
    // assemble. Instantané, gratuit, et rien ne peut être inventé.
    const noAi = { separator: ' - ', parts: [{ source: { from: 'text' as const } }, { source: { from: 'column' as const, key: 'marque' } }] }
    expect(needsAI(noAi, row, 'Lame')).toBe(false)
  })

  it('seul le discriminant est demandé au modèle', () => {
    expect(aiHints(tpl)).toHaveLength(1)
    expect(aiHints(tpl)[0]).toContain('distingue')
  })
})

describe('plan par champ', () => {
  it('le seuil de la description est bien plus haut que celui du nom', () => {
    // Un nom devient explicite en une trentaine de caractères ; une description reste
    // indigente à cent. Un seuil unique ferait réécrire des noms corrects OU laisser
    // passer des descriptions vides de sens.
    expect(DEFAULT_MIN_LENGTH.name).toBeLessThan(DEFAULT_MIN_LENGTH.description)
    expect(DEFAULT_MIN_LENGTH.name).toBeGreaterThanOrEqual(25)
    expect(DEFAULT_MIN_LENGTH.name).toBeLessThanOrEqual(30)
  })

  it('refuse un plan qui enrichit AVANT de traduire', () => {
    // La traduction remplacerait le texte enrichi : l'enrichissement serait payé pour rien.
    const bad: FieldPlan[] = [
      { key: 'nom', kind: 'improve', minLength: 28, prompt: '', promptVersion: 'v1' },
      { key: 'nom', kind: 'translate', minLength: 0, prompt: '', promptVersion: 'v1' },
    ]
    expect(isPlanOrdered(bad)).toBe(false)
  })

  it('accepte traduire puis enrichir le même champ', () => {
    const good: FieldPlan[] = [
      { key: 'nom', kind: 'translate', minLength: 0, prompt: '', promptVersion: 'v1' },
      { key: 'nom', kind: 'improve', minLength: 28, prompt: '', promptVersion: 'v1' },
    ]
    expect(isPlanOrdered(good)).toBe(true)
  })

  it('énumère les champs touchés sans doublon', () => {
    const plans: FieldPlan[] = [
      { key: 'nom', kind: 'translate', minLength: 0, prompt: '', promptVersion: 'v1' },
      { key: 'nom', kind: 'improve', minLength: 28, prompt: '', promptVersion: 'v1' },
      { key: 'description', kind: 'improve', minLength: 100, prompt: '', promptVersion: 'v1' },
    ]
    expect(planFields(plans)).toEqual(['nom', 'description'])
  })
})
