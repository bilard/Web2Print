import { describe, it, expect } from 'vitest'
import { buildScreenPrompt, ScreenBatchSchema, screenSchemaForLLM } from './screenPrompt'

describe('buildScreenPrompt', () => {
  it('la consigne de l’utilisateur ouvre le prompt, verbatim', () => {
    const out = buildScreenPrompt([{ id: '1', name: 'A' }], 'Ton commercial, deux phrases max.')
    expect(out.startsWith('Ton commercial, deux phrases max.')).toBe(true)
  })

  it('annonce la description MÊME vide — sinon le modèle comble le silence', () => {
    const out = buildScreenPrompt([{ id: '1', name: 'A' }], '')
    expect(out).toContain('description: ')
  })

  it('joint la description quand elle existe', () => {
    const out = buildScreenPrompt([{ id: '1', name: 'A', description: 'Courroie trapézoïdale' }], '')
    expect(out).toContain('description: Courroie trapézoïdale')
  })

  it('joint la langue détectée quand on la connaît', () => {
    expect(buildScreenPrompt([{ id: '1', name: 'A', lang: 'nl' }], '')).toContain('langue détectée : nl')
    expect(buildScreenPrompt([{ id: '1', name: 'A', lang: null }], '')).not.toContain('langue détectée')
  })
})

describe('schéma de réponse', () => {
  it('nom et description sont DEUX champs — plus de « nom | description »', () => {
    const parsed = ScreenBatchSchema.parse({
      results: [{ id: '1', name: 'Kit d’installation S', description: 'Pour toutes les séries.' }],
    })
    expect(parsed.results[0].description).toBe('Pour toutes les séries.')
  })

  it('la description est exigée du modèle, pas laissée à son gré', () => {
    const items = (screenSchemaForLLM.properties as Record<string, { items: { required: string[] } }>).results.items
    expect(items.required).toContain('description')
  })

  it('une réponse sans description reste lisible (produit qui n’en a pas)', () => {
    expect(ScreenBatchSchema.parse({ results: [{ id: '1', name: 'A' }] }).results[0].description).toBeUndefined()
  })
})
