import { describe, it, expect } from 'vitest'
import { parseLlmJson, recoverJsonObjects, buildProviderOrder } from './llm'

describe('buildProviderOrder — préférés en tête, cascade en repli', () => {
  it('place les préférés avant la cascade et déduplique', () => {
    expect(buildProviderOrder(['gemini', 'openai', 'claude'], ['deepseek', 'gemini', 'openai']))
      .toEqual(['gemini', 'openai', 'claude', 'deepseek'])
  })
  it('sans préférés → cascade inchangée (non-régression)', () => {
    expect(buildProviderOrder([], ['deepseek', 'gemini'])).toEqual(['deepseek', 'gemini'])
  })
  it('deepseek conservé en dernier recours (repli), jamais perdu', () => {
    expect(buildProviderOrder(['gemini'], ['deepseek'])).toEqual(['gemini', 'deepseek'])
  })
})

describe('parseLlmJson', () => {
  it('parse un objet JSON propre', () => {
    expect(parseLlmJson('{"products":[{"name":"A"}]}')).toEqual({ products: [{ name: 'A' }] })
  })

  it('tolère une ```json fence', () => {
    const t = 'Voici le résultat :\n```json\n{"products":[{"name":"A"}]}\n```'
    expect(parseLlmJson(t)).toEqual({ products: [{ name: 'A' }] })
  })

  it('tolère de la prose APRÈS le JSON (cause racine du bug list-products)', () => {
    const t = '{"products":[{"name":"Tondeuse Ryobi","url":"https://x.fr/p/1"}]}\n\nVoici les 27 tondeuses Ryobi trouvées.'
    expect(parseLlmJson<{ products: unknown[] }>(t)?.products).toHaveLength(1)
  })

  it('tolère de la prose AVANT le JSON', () => {
    const t = 'Bien sûr ! Voici les produits :\n[{"name":"A"},{"name":"B"}]'
    expect(parseLlmJson(t)).toEqual([{ name: 'A' }, { name: 'B' }])
  })

  it('ne se laisse pas piéger par une } dans une string', () => {
    expect(parseLlmJson('{"name":"a } b","ok":true} et du texte')).toEqual({ name: 'a } b', ok: true })
  })

  it('renvoie null sur un JSON tronqué (pas de fermeture)', () => {
    expect(parseLlmJson('{"products":[{"name":"A"},{"name":"B"')).toBeNull()
  })
})

describe('recoverJsonObjects', () => {
  it('récupère les objets complets d’un tableau tronqué (réponse coupée)', () => {
    const truncated = '{"products":[{"name":"A","price":10},{"name":"B","price":20},{"name":"C","pri'
    const got = recoverJsonObjects(truncated)
    expect(got).toEqual([{ name: 'A', price: 10 }, { name: 'B', price: 20 }])
  })

  it('récupère malgré la prose autour', () => {
    const t = 'Voici :\n```json\n{"products":[{"name":"A"},{"name":"B"}]}\n```\nVoilà.'
    expect(recoverJsonObjects(t)).toEqual([{ name: 'A' }, { name: 'B' }])
  })

  it('gère les objets imbriqués sans les éclater', () => {
    const t = '[{"name":"A","meta":{"x":1}},{"name":"B"}]'
    expect(recoverJsonObjects(t)).toEqual([{ name: 'A', meta: { x: 1 } }, { name: 'B' }])
  })

  it('renvoie [] quand il n’y a aucun objet', () => {
    expect(recoverJsonObjects('désolé, aucun produit trouvé.')).toEqual([])
  })
})
