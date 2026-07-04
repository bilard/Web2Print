import { beforeEach, describe, expect, it } from 'vitest'
import { useCatalogStore } from './catalog.store'
import type { CatalogPlan } from '@/features/catalog/catalogTypes'

const basePlan = (): CatalogPlan => ({
  theme: { accent: '#e97817', pageBg: '#fff', ink: '#111', headerBg: '#1c3d2e', headerInk: '#fff', fontHeading: 'Archivo', fontBody: 'Inter' },
  sections: [{ nodeId: 'a', productsPerPage: 6, randomDensity: false, featuredIds: ['x'] }],
  cover: { title: 'T', subtitle: '', baseline: '', imagePrompt: '' },
  backCover: { title: '', text: '' },
  tocTitle: 'Sommaire',
})

describe('catalog.store — setAllSectionsDensity', () => {
  beforeEach(() => {
    useCatalogStore.getState().reset()
    useCatalogStore.getState().setPlan(basePlan())
  })

  it('crée les sections MANQUANTES des nœuds fournis puis applique la densité partout (plan partiel → plus de « mixte » fantôme)', () => {
    useCatalogStore.getState().setAllSectionsDensity(8, ['a', 'b', 'b/x'])
    const sections = useCatalogStore.getState().plan!.sections
    expect(sections.map((s) => s.nodeId).sort()).toEqual(['a', 'b', 'b/x'])
    expect(sections.every((s) => s.productsPerPage === 8 && !s.randomDensity)).toBe(true)
    // La section existante garde ses vedettes.
    expect(sections.find((s) => s.nodeId === 'a')?.featuredIds).toEqual(['x'])
  })

  it("'random' active la densité aléatoire sur toutes les sections, upserts inclus", () => {
    useCatalogStore.getState().setAllSectionsDensity('random', ['a', 'b'])
    const sections = useCatalogStore.getState().plan!.sections
    expect(sections).toHaveLength(2)
    expect(sections.every((s) => s.randomDensity === true)).toBe(true)
  })
})
