import { describe, it, expect } from 'vitest'
import { sectionFromHighlightId } from './MenuLink'

describe('sectionFromHighlightId', () => {
  it('dérive la section d\'un onglet sidebar', () => {
    expect(sectionFromHighlightId('dashboard.sidebar.import')).toBe('import')
    expect(sectionFromHighlightId('dashboard.sidebar.data')).toBe('data')
    expect(sectionFromHighlightId('dashboard.sidebar.workflows')).toBe('workflows')
    expect(sectionFromHighlightId('dashboard.sidebar.scraping-templates')).toBe('scraping-templates')
  })

  it('renvoie null pour un highlightId qui ne cible pas une section', () => {
    expect(sectionFromHighlightId('dashboard.new-project')).toBeNull()
    expect(sectionFromHighlightId('editor-header.export')).toBeNull()
    expect(sectionFromHighlightId('toolbar.text')).toBeNull()
    expect(sectionFromHighlightId(undefined)).toBeNull()
  })
})
