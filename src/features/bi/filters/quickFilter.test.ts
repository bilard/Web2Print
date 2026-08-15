// ⚠ Ce que ce test protège : un filtre rapide posé sur une source que l'écran ne lit pas —
// il ne changerait rien, et se lirait comme un réglage sans effet.
import { describe, it, expect } from 'vitest'
import { quickFilterTarget } from './quickFilter'

describe('cible du filtre rapide', () => {
  it('choisit la première source AFFICHÉE qui porte le concurrent', () => {
    expect(quickFilterTarget(['watch.catalog', 'watch.summary']))
      .toEqual({ sourceId: 'watch.summary', field: 'domain' })
  })

  it('ne propose RIEN quand aucune source affichée ne porte la dimension', () => {
    expect(quickFilterTarget(['watch.catalog'])).toBeNull()
    expect(quickFilterTarget([])).toBeNull()
  })
})
