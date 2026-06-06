import { describe, it, expect } from 'vitest'
import { isHelpSectionVisible } from './helpAccess'

const ctx = (isOwner: boolean, keys: string[] = []) => ({ isOwner, permissions: new Set(keys) })

describe('isHelpSectionVisible', () => {
  it('owner voit toutes les sections', () => {
    expect(isHelpSectionVisible('access', ctx(true))).toBe(true)
    expect(isHelpSectionVisible('pim', ctx(true))).toBe(true)
  })

  it('sections transverses toujours visibles (absentes de la map)', () => {
    expect(isHelpSectionVisible('getting-started', ctx(false))).toBe(true)
    expect(isHelpSectionVisible('editor', ctx(false))).toBe(true)
    expect(isHelpSectionVisible('export', ctx(false))).toBe(true)
  })

  it('section de module masquée sans la permission', () => {
    expect(isHelpSectionVisible('pim', ctx(false))).toBe(false)
    expect(isHelpSectionVisible('dam', ctx(false, ['pim.view']))).toBe(false)
  })

  it('section de module visible avec la permission', () => {
    expect(isHelpSectionVisible('pim', ctx(false, ['pim.view']))).toBe(true)
    expect(isHelpSectionVisible('settings', ctx(false, ['settings.view']))).toBe(true)
  })

  it('toutes les sous-sections Import gatées par import.view', () => {
    const has = ctx(false, ['import.view'])
    for (const id of ['import-idml', 'import-pptx', 'import-excel', 'import-image', 'import-svg', 'import-image-to-svg', 'import-pdf-to-svg', 'easycatalog']) {
      expect(isHelpSectionVisible(id, has)).toBe(true)
      expect(isHelpSectionVisible(id, ctx(false))).toBe(false)
    }
  })

  it('multi-clés : visible si AU MOINS une est détenue', () => {
    expect(isHelpSectionVisible('scraping', ctx(false, ['scrapingTemplates.view']))).toBe(true)
    expect(isHelpSectionVisible('scraping', ctx(false, ['scrapingHub.view']))).toBe(true)
    expect(isHelpSectionVisible('scraping', ctx(false))).toBe(false)
    expect(isHelpSectionVisible('briefs', ctx(false, ['taxonomies.view']))).toBe(true)
  })

  it('access réservé à la permission admin', () => {
    expect(isHelpSectionVisible('access', ctx(false))).toBe(false)
    expect(isHelpSectionVisible('access', ctx(false, ['admin']))).toBe(true)
  })
})
