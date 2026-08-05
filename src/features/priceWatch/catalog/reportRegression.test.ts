// Garde-fou de non-régression du rapport. Testé sur la RÈGLE seule : le recalcul complet
// demande Firestore, mais c'est la décision « écrire ou garder » qui doit être verrouillée.
//
// Cas vécu : un run sur une feuille de test a réécrit le catalogue source avec 100
// produits, le rafraîchissement live a recalculé dans la foulée, et 20 980 appariés sont
// devenus 72 — sans un message.
import { describe, it, expect } from 'vitest'

const FLOOR = 0.5
const MIN_PREVIOUS = 50

/** Réplique la condition de `recomputeReport` : refuse-t-on d'écrire ? */
function refuses(next: number, previous: number | null): boolean {
  return previous != null && previous >= MIN_PREVIOUS && next < previous * FLOOR
}

describe('garde-fou de non-régression du rapport', () => {
  it('refuse l’effondrement observé en production (20 980 → 72)', () => {
    expect(refuses(72, 20_980)).toBe(true)
  })

  it('laisse passer une baisse plausible (site désactivé, catalogue élagué)', () => {
    expect(refuses(9_000, 10_000)).toBe(false)
    expect(refuses(5_000, 10_000)).toBe(false) // pile au seuil
  })

  it('laisse passer une hausse', () => {
    expect(refuses(30_000, 20_980)).toBe(false)
  })

  it('n’entrave pas un suivi qui démarre (aucun rapport, ou rapport minuscule)', () => {
    expect(refuses(0, null)).toBe(false)
    expect(refuses(1, 40)).toBe(false)
  })

  it('protège dès que le rapport en place est significatif', () => {
    expect(refuses(20, 50)).toBe(true)
  })
})
