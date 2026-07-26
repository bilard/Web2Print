import { describe, it, expect } from 'vitest'
import { splitMegaSpecValue } from './liftIdentity'

describe('splitMegaSpecValue', () => {
  // Méga-valeur RÉELLE produite par le LLM sur une fiche Castorama (2026-07-12) :
  // toute la table de specs concaténée dans UNE paire, terminée par le copyright
  // et la sentinelle interne JINA_EXTRACTED_IMAGES_START.
  it('re-découpe une valeur « Clé: Valeur Clé: Valeur … » en paires propres', () => {
    const mega =
      "Type d'article: Traitement anti-dépôts verts Gamme: SIKASTOP Usage: Toits, murs et sols extérieurs. " +
      "Lieu: Extérieur Couleur: Orange Contenance: 20L Référence produit: 7612895465791 © Castorama 2026: JINA_EXTRACTED_IMAGES_START"
    const pairs = splitMegaSpecValue(mega)
    const byName = Object.fromEntries(pairs.map((p) => [p.name, p.value]))
    expect(byName["Type d'article"]).toBe('Traitement anti-dépôts verts')
    expect(byName['Gamme']).toBe('SIKASTOP')
    expect(byName['Couleur']).toBe('Orange')
    expect(byName['Contenance']).toBe('20L')
    expect(byName['Référence produit']).toBe('7612895465791')
    const all = JSON.stringify(pairs)
    expect(all).not.toContain('JINA_EXTRACTED')
    expect(all).not.toContain('©')
  })

  it("renvoie [] pour une valeur normale (pas une table inline)", () => {
    expect(splitMegaSpecValue('Orange')).toEqual([])
    expect(splitMegaSpecValue('Application au pinceau, au rouleau ou par pulvérisation')).toEqual([])
  })
})
