import { describe, it, expect } from 'vitest'
import { buildEnrichmentPrompt, UNIVERSAL_RULES } from './buildEnrichmentPrompt'
import type { ScrapingTemplate } from './types'

const baseTemplate: ScrapingTemplate = {
  id: 't1',
  name: 'Milwaukee fiche produit',
  vendorDomain: 'fr.milwaukeetool.eu',
  urlPattern: '.*',
  preActions: [],
  fields: [],
  specGroups: [],
  createdAt: 0,
  updatedAt: 0,
  version: 1,
  stats: { appliedCount: 0, successCount: 0 },
}

describe('buildEnrichmentPrompt', () => {
  it('prepends UNIVERSAL_RULES even without template', () => {
    const out = buildEnrichmentPrompt('Tâche : enrichir le produit X.', null)
    expect(out.startsWith(UNIVERSAL_RULES)).toBe(true)
    expect(out).toContain('Tâche : enrichir le produit X.')
  })

  it('always includes the 5 universal rules markers', () => {
    const out = buildEnrichmentPrompt('base', null)
    expect(out).toContain('RÈGLES UNIVERSELLES')
    expect(out).toContain('SPÉCIFICATIONS = paires KEY/VALUE')
    expect(out).toContain('EXHAUSTIVITÉ')
    expect(out).toContain('DOCUMENTS / PDF')
    expect(out).toContain('AUCUNE INVENTION')
  })

  it('respects ordering: rules → vendor → global → base', () => {
    const tpl: ScrapingTemplate = {
      ...baseTemplate,
      vendorPrompt: 'Le site Milwaukee utilise des accordéons fermés par défaut.',
      globalPrompt: 'Pour cette URL, prioriser la section "Caractéristiques techniques".',
    }
    const out = buildEnrichmentPrompt('Extraire les specs.', tpl)
    const iRules = out.indexOf('RÈGLES UNIVERSELLES')
    const iVendor = out.indexOf('CONTEXTE FOURNISSEUR')
    const iGlobal = out.indexOf('INSTRUCTIONS TEMPLATE')
    const iBase = out.indexOf('Extraire les specs.')
    expect(iRules).toBeGreaterThanOrEqual(0)
    expect(iVendor).toBeGreaterThan(iRules)
    expect(iGlobal).toBeGreaterThan(iVendor)
    expect(iBase).toBeGreaterThan(iGlobal)
  })

  it('skips empty vendorPrompt / globalPrompt sections', () => {
    const tpl: ScrapingTemplate = { ...baseTemplate, vendorPrompt: '   ', globalPrompt: undefined }
    const out = buildEnrichmentPrompt('base', tpl)
    expect(out).not.toContain('CONTEXTE FOURNISSEUR')
    expect(out).not.toContain('INSTRUCTIONS TEMPLATE')
  })

  it('separates sections with "---" markers for LLM clarity', () => {
    const out = buildEnrichmentPrompt('base', { ...baseTemplate, vendorPrompt: 'V', globalPrompt: 'G' })
    expect(out).toMatch(/\n---\n/)
    // Au moins 3 séparateurs (rules → vendor → global → base)
    const matches = out.match(/\n---\n/g)
    expect(matches?.length).toBeGreaterThanOrEqual(3)
  })
})
