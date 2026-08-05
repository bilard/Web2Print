import { describe, it, expect } from 'vitest'
import { normalizeVisual, isComparable, visualPrompt } from './visualMatch'

describe('normalizeVisual', () => {
  it('borne le score et retombe sur « non concluant » si le verdict est absent', () => {
    expect(normalizeVisual({ score: 250, verdict: 'same', note: 'x' }).score).toBe(100)
    expect(normalizeVisual({ score: -5, verdict: 'different', note: 'x' }).score).toBe(0)
    expect(normalizeVisual({ score: 'oui', verdict: 'bof', note: 1 })).toEqual({
      score: 0, verdict: 'unclear', note: '',
    })
  })

  it('refuse un verdict et un score qui se contredisent', () => {
    // « même pièce » à 10 % ou « pièce différente » à 95 % afficherait deux réponses
    // opposées dans le même badge. Le verdict prime, le score revient dans sa plage.
    expect(normalizeVisual({ score: 10, verdict: 'same', note: '' }).score).toBe(50)
    expect(normalizeVisual({ score: 95, verdict: 'different', note: '' }).score).toBe(50)
  })

  it('tronque une note bavarde', () => {
    const long = 'a'.repeat(500)
    expect(normalizeVisual({ score: 80, verdict: 'same', note: long }).note.length).toBe(200)
  })
})

describe('isComparable', () => {
  it('exige DEUX visuels', () => {
    // Sans les deux images, un score serait un chiffre inventé — et un faux « 12 % » à
    // côté d'un appariement correct ruinerait la confiance dans tout l'écran d'audit.
    expect(isComparable('a.jpg', 'b.jpg')).toBe(true)
    expect(isComparable('a.jpg', null)).toBe(false)
    expect(isComparable(null, 'b.jpg')).toBe(false)
    expect(isComparable('', '')).toBe(false)
  })
})

describe('visualPrompt', () => {
  it('porte les deux libellés et impose « unclear » sur un visuel générique', () => {
    const p = visualPrompt('SWITCH BOX BATTERY', 'Boîtier de commutation')
    expect(p).toContain('SWITCH BOX BATTERY')
    expect(p).toContain('Boîtier de commutation')
    // Les deux garde-fous qui empêchent le modèle d'inventer un verdict.
    expect(p).toContain('unclear')
    expect(p).toContain('logo')
    // Les libellés sont un appoint : ce sont les images qui décident (catalogues
    // rédigés dans deux langues, ou réduits à un code interne).
    expect(p).toContain('IMAGES qui décident')
  })
})
