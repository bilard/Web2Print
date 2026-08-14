// ⚠⚠ Ce que ces tests protègent : le listing de Gemini est PAGINÉ, et son défaut est bas
// (50 modèles). Les modèles les plus récents sortent en fin de catalogue — donc hors de la
// première page. Le symptôme n'est PAS une erreur : le bouton « rafraîchir » répond
// « aucun nouveau modèle » et l'utilisateur en conclut que Google n'a rien publié.
import { describe, it, expect } from 'vitest'
import { buildModelsRequest, nextModelsPageToken, mergeModelsPages } from './modelsListing'

describe('listing des modèles — pagination Gemini', () => {
  it('demande le maximum documenté par page', () => {
    const { url } = buildModelsRequest('gemini', 'CLE')
    expect(url).toContain('pageSize=1000')
    expect(url).not.toContain('pageToken')
  })

  it('reprend au jeton fourni, en l’échappant', () => {
    const { url } = buildModelsRequest('gemini', 'CLE', 'a b/c')
    expect(url).toContain('pageToken=a%20b%2Fc')
  })

  it('lit le jeton de page suivante, et s’arrête quand il manque', () => {
    expect(nextModelsPageToken('gemini', JSON.stringify({ models: [], nextPageToken: 'T2' }))).toBe('T2')
    expect(nextModelsPageToken('gemini', JSON.stringify({ models: [] }))).toBeNull()
    // Jeton vide = fin de liste, pas une page « » à redemander en boucle.
    expect(nextModelsPageToken('gemini', JSON.stringify({ nextPageToken: '' }))).toBeNull()
  })

  it('ne pagine que Gemini : les autres providers rendent tout d’un coup', () => {
    expect(nextModelsPageToken('openai', JSON.stringify({ nextPageToken: 'T2' }))).toBeNull()
    expect(buildModelsRequest('openai', 'CLE').url).not.toContain('pageSize')
  })

  it('un corps illisible ne fait pas échouer le rafraîchissement', () => {
    expect(nextModelsPageToken('gemini', 'pas du json')).toBeNull()
    expect(JSON.parse(mergeModelsPages(['{ cassé', JSON.stringify({ models: [{ name: 'models/a' }] })])))
      .toEqual({ models: [{ name: 'models/a' }] })
  })

  it('recolle les pages dans la forme que le client sait parser', () => {
    const p1 = JSON.stringify({ models: [{ name: 'models/gemini-3.5-flash' }], nextPageToken: 'T2' })
    const p2 = JSON.stringify({ models: [{ name: 'models/gemini-3.7-flash' }] })
    expect(JSON.parse(mergeModelsPages([p1, p2]))).toEqual({
      models: [{ name: 'models/gemini-3.5-flash' }, { name: 'models/gemini-3.7-flash' }],
    })
  })
})
