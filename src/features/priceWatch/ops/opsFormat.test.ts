import { describe, it, expect } from 'vitest'
import { chantierUnitKeys, etaParts, plural } from './opsFormat'
import { fr } from '@/lib/i18n/fr'

describe('etaParts — une estimation se lit, elle ne se déchiffre pas', () => {
  it('rend heures et minutes au-delà d’une heure', () => {
    expect(etaParts(3 * 3_600_000 + 25 * 60_000)).toEqual({ h: 3, m: 25 })
  })

  it('rend les seules minutes en dessous', () => {
    expect(etaParts(42 * 60_000)).toEqual({ h: 0, m: 42 })
  })

  it('arrondit à la minute supérieure — « 0 min » sur un travail en cours est un mensonge', () => {
    expect(etaParts(20_000)).toEqual({ h: 0, m: 1 })
  })
})

// L'écran affichait « 1 restants ».
describe("plural — le libellé s'accorde avec son nombre", () => {
  const keys = { one: 'ops.card.remaining.one', other: 'ops.card.remaining.other' } as const

  it('met le singulier à un', () => {
    expect(fr[plural(keys, 1)]).toBe('{n} restant')
  })
  it('met le pluriel au-delà', () => {
    expect(fr[plural(keys, 12)]).toBe('{n} restants')
  })
  // Le seuil retenu partout ailleurs dans l'application : en français, zéro est singulier.
  it('met le singulier à zéro', () => {
    expect(fr[plural(keys, 0)]).toBe('{n} restant')
  })
})

// « 21 faits · 64 % · 1 restants » : 21 et 1 comptaient des SITES, 64 % l'avancement du
// balayage EN COURS. Rien de faux dans le calcul — tout de faux dans ce qu'on en disait.
describe('chantierUnitKeys — chaque chiffre dit ce qu’il compte', () => {
  it('nomme les SITES pour la moisson, et étiquette son pourcentage', () => {
    const u = chantierUnitKeys('harvest')
    expect(fr[u.done.other]).toBe('{n} sites bouclés')
    expect(fr[u.remaining.one]).toBe('{n} en cours')
    expect(u.pctLabelKey).not.toBeNull()
    expect(fr[u.pctLabelKey!]).toBe('balayage en cours')
  })

  it("n'étiquette RIEN sur les chantiers de textes — leurs trois chiffres comptent des champs", () => {
    for (const id of ['translate', 'improve', 'structure'] as const) {
      const u = chantierUnitKeys(id)
      expect(u.pctLabelKey).toBeNull()
      expect(fr[u.done.other]).toBe('{n} faits')
    }
  })
})
