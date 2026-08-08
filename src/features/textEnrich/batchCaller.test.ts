import { describe, it, expect, vi } from 'vitest'
import { makeCallBatch } from './batchCaller'
import { unitKey, type EnrichUnit } from './pass'
import { defaultNameTemplate } from './template'
import type { FieldPlan } from './fieldPlan'

const plan = (over: Partial<FieldPlan> = {}): FieldPlan => ({
  key: 'nom', kind: 'improve', minLength: 28, prompt: 'Sois factuel.', promptVersion: 'v1', ...over,
})
const unit = (id: string, text: string, over: Partial<EnrichUnit> = {}): EnrichUnit => ({
  productId: id, field: 'nom', plan: plan(), text, row: {}, ...over,
})

describe('appel de lot', () => {
  it('rend le texte final indexé par unité', async () => {
    const u = unit('p1', 'LAME 510')
    const call = makeCallBatch({
      generate: async () => ({ results: [{ id: unitKey(u), text: 'Lame de tondeuse 510 mm' }] }),
    })
    expect(await call([u])).toEqual({ [unitKey(u)]: 'Lame de tondeuse 510 mm' })
  })

  it('n’appelle pas le modèle pour un lot vide', async () => {
    const generate = vi.fn()
    expect(await makeCallBatch({ generate })([])).toEqual({})
    expect(generate).not.toHaveBeenCalled()
  })

  it('⚠ revalide la réponse même si le schéma a été annoncé', async () => {
    // Un modèle rend parfois un objet conforme en apparence dont un `text` manque.
    // Écrire « undefined » dans une fiche produit est pire que ne rien écrire.
    const u = unit('p1', 'LAME 510')
    const call = makeCallBatch({ generate: async () => ({ results: [{ id: unitKey(u) }] }) })
    await expect(call([u])).rejects.toThrow()
  })

  it('assemble le gabarit : le modèle ne fournit que le morceau manquant', async () => {
    const tpl = defaultNameTemplate({ brand: 'marque', supplierRef: 'ref', ean: '' })
    const u = unit('p1', 'Lame 51 cm', { plan: plan({ template: tpl }), row: { marque: 'STIGA', ref: '1134-4319-01' } })
    const call = makeCallBatch({ generate: async () => ({ results: [{ id: unitKey(u), text: 'droite' }] }) })
    expect((await call([u]))[unitKey(u)]).toBe('Lame 51 cm - STIGA - 1134-4319-01 - droite')
  })

  it('n’écrit rien quand le gabarit ne peut pas s’appliquer', async () => {
    // Morceau indispensable absent : un nom amputé serait pire qu'un nom inchangé.
    const tpl = defaultNameTemplate({ brand: 'marque' })
    const u = unit('p1', '', { plan: plan({ template: tpl }), row: { marque: 'STIGA' } })
    const call = makeCallBatch({ generate: async () => ({ results: [{ id: unitKey(u), text: 'droite' }] }) })
    expect(await call([u])).toEqual({})
  })
})

describe('justifications', () => {
  it('les remonte quand elles sont demandées', async () => {
    const u = unit('p1', 'LAME 510')
    const seen: Record<string, string>[] = []
    const call = makeCallBatch({
      withNote: true,
      onNotes: (n) => seen.push(n),
      generate: async ({ schema }) => {
        // Le schéma envoyé doit exiger la justification, sinon le modèle l'omettra.
        const s = schema as { properties: { results: { items: { required: string[] } } } }
        expect(s.properties.results.items.required).toContain('note')
        return { results: [{ id: unitKey(u), text: 'Lame de tondeuse 510 mm', note: 'Abréviation développée.' }] }
      },
    })
    await call([u])
    expect(seen[0][unitKey(u)]).toBe('Abréviation développée.')
  })

  it('ne les réclame pas quand elles sont coupées', async () => {
    const u = unit('p1', 'LAME 510')
    const onNotes = vi.fn()
    await makeCallBatch({
      onNotes,
      generate: async ({ schema }) => {
        const s = schema as { properties: { results: { items: { required: string[] } } } }
        expect(s.properties.results.items.required).not.toContain('note')
        return { results: [{ id: unitKey(u), text: 'Lame de tondeuse 510 mm' }] }
      },
    })([u])
    expect(onNotes).not.toHaveBeenCalled()
  })
})

describe('consigne transmise', () => {
  it('le prompt envoyé commence par la consigne de l’utilisateur', async () => {
    const u = unit('p1', 'LAME 510', { plan: plan({ prompt: 'Mets la dimension en premier.' }) })
    let sent = ''
    await makeCallBatch({
      generate: async ({ prompt }) => {
        sent = prompt
        return { results: [{ id: unitKey(u), text: '510 mm — lame de tondeuse' }] }
      },
    })([u])
    expect(sent.startsWith('Mets la dimension en premier.')).toBe(true)
  })
})
