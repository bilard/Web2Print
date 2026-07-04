import { beforeEach, describe, expect, it } from 'vitest'
import { useCatalogStore } from './catalog.store'
import type { CatalogPlan } from '@/features/catalog/catalogTypes'
import type { MergeColumn } from './merge.store'

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

describe('catalog.store — setFieldMapOverride', () => {
  beforeEach(() => {
    useCatalogStore.getState().reset()
  })

  it('le choix manuel prime et survit au re-devinage', () => {
    const columns: MergeColumn[] = [
      { key: 'p_barre', label: 'Prix barré' } as MergeColumn,
      { key: 'p_promo', label: 'Prix promo' } as MergeColumn,
      { key: 'p_autre', label: 'PVC' } as MergeColumn,
    ]
    useCatalogStore.setState({ rawColumns: columns, fieldMapOverrides: {}, fieldMap: {} })
    // L'utilisateur force le prix barré sur « PVC »
    useCatalogStore.getState().setFieldMapOverride('oldPrice', 'p_autre')
    expect(useCatalogStore.getState().fieldMap.oldPrice).toBe('p_autre')
    // Re-dérivation (comme au boot) : l'override tient
    const s = useCatalogStore.getState()
    const eff = { ...s.fieldMap, oldPrice: undefined, ...s.fieldMapOverrides }
    expect(eff.oldPrice).toBe('p_autre')
    // Retour à « Auto »
    useCatalogStore.getState().setFieldMapOverride('oldPrice', null)
    expect(useCatalogStore.getState().fieldMapOverrides.oldPrice).toBeUndefined()
  })
})
