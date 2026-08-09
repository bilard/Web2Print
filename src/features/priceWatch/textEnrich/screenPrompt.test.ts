import { describe, it, expect } from 'vitest'
import { buildScreenPrompt, ScreenBatchSchema, screenSchemaForLLM, type FieldTask } from './screenPrompt'

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

describe('consignes PAR CHAMP', () => {
  const P = [{ id: '1', name: 'BOBINEAU', description: 'Bobineau adaptable FLYMO' }]
  const tasks = (over: Partial<Record<'name' | 'description', Partial<FieldTask>>> = {}) => ({
    name: { enabled: true, mode: 'translate' as const, prompt: '', ...over.name },
    description: { enabled: true, mode: 'improve' as const, prompt: '', ...over.description },
  })

  it('donne à chaque champ SA consigne, jamais celle de l’autre', () => {
    const out = buildScreenPrompt(P, '', { translate: true, improve: false }, tasks({
      name: { prompt: 'Structure : Nom - Modèle - REF.' },
      description: { prompt: 'Liste les adaptables et les origines.' },
    }))
    expect(out).toContain('- nom : traduis-le en français, sans rien réécrire d’autre. Structure : Nom - Modèle - REF.')
    expect(out).toContain('- description : réécris-le pour qu’il se lise et qu’il vende, en français. Liste les adaptables et les origines.')
  })

  it('⚠ un champ désactivé est NOMMÉ, pas tu : le modèle doit savoir qu’il le recopie', () => {
    // Passé sous silence, il comble le vide en le réécrivant quand même.
    const out = buildScreenPrompt(P, '', { translate: true, improve: false }, tasks({ name: { enabled: false } }))
    expect(out).toContain('- nom : recopie-le EXACTEMENT, sans y toucher.')
  })

  it('sans consignes par champ, les modes globaux gouvernent — le chemin de l’écran', () => {
    const out = buildScreenPrompt(P, '', { translate: true, improve: false })
    expect(out).toContain('Traduis en français le nom et le texte de vente')
    expect(out).not.toContain('champ par champ')
  })
})
