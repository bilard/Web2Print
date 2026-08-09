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

describe('consignes PAR CHAMP et PAR OPÉRATION', () => {
  const P = [{ id: '1', name: 'BOBINEAU', description: 'Bobineau adaptable FLYMO' }]
  const task = (over: Partial<FieldTask> = {}): FieldTask =>
    ({ translate: false, improve: false, translatePrompt: '', improvePrompt: '', ...over })
  const build = (name: FieldTask, description: FieldTask) =>
    buildScreenPrompt(P, '', { translate: true, improve: false }, { name, description })

  it('⚠ traduit PUIS améliore le même champ, en UN appel, avec les deux consignes', () => {
    const out = build(
      task({ translate: true, improve: true, translatePrompt: 'Garde les réfs.', improvePrompt: 'Structure : Nom - Modèle - REF.' }),
      task({ translate: true }),
    )
    expect(out).toContain('- nom : traduis en français ce qui ne l’est pas, PUIS réécris-le')
    expect(out).toContain('· pour la traduction du nom : Garde les réfs.')
    expect(out).toContain('· pour la réécriture du nom : Structure : Nom - Modèle - REF.')
  })

  it('une consigne ne fuit pas vers l’opération qu’elle ne vise pas', () => {
    const out = build(task({ translate: true, improvePrompt: 'NE DOIT PAS APPARAÎTRE' }), task({ improve: true }))
    expect(out).not.toContain('NE DOIT PAS APPARAÎTRE')
  })

  it('chaque champ garde SA demande', () => {
    const out = build(task({ translate: true }), task({ improve: true, improvePrompt: 'Liste les adaptables.' }))
    expect(out).toContain('- nom : traduis-le en français, sans rien réécrire d’autre.')
    expect(out).toContain('- description : réécris-le pour qu’il se lise et qu’il vende, en français.')
    expect(out).toContain('· pour la réécriture du description : Liste les adaptables.')
  })

  it('⚠ un champ sans opération est NOMMÉ, pas tu : sinon le modèle le réécrit quand même', () => {
    const out = build(task(), task({ translate: true }))
    expect(out).toContain('- nom : recopie-le EXACTEMENT, sans y toucher.')
  })

  it('sans consignes par champ, les modes globaux gouvernent — le chemin de l’écran', () => {
    const out = buildScreenPrompt(P, '', { translate: true, improve: false })
    expect(out).toContain('Traduis en français le nom et le texte de vente')
    expect(out).not.toContain('champ par champ')
  })
})
