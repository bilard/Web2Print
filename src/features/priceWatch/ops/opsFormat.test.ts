import { describe, it, expect } from 'vitest'
import { chantierUnitKeys, etaParts, plural, subPercentKey } from './opsFormat'
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
  const keys = { one: 'ops.card.fields.remaining.one', other: 'ops.card.fields.remaining.other' } as const

  it('met le singulier à un', () => {
    expect(fr[plural(keys, 1)]).toBe('{n} champ restant')
  })
  it('met le pluriel au-delà', () => {
    expect(fr[plural(keys, 12)]).toBe('{n} champs restants')
  })
  // Le seuil retenu partout ailleurs dans l'application : en français, zéro est singulier.
  it('met le singulier à zéro', () => {
    expect(fr[plural(keys, 0)]).toBe('{n} champ restant')
  })
})

// « 21 faits · 64 % · 1 restants » : 21 et 1 comptaient des SITES, 64 % l'avancement du
// balayage EN COURS. Rien de faux dans le calcul — tout de faux dans ce qu'on en disait.
// 504 champs traduits sur 207 802 : la carte affichait « 0 % » pendant des heures, entre
// deux compteurs qui, eux, bougeaient.
describe('subPercentKey — un travail commencé ne s’affiche pas « 0 % »', () => {
  it('bascule sur « < 1 % » quand l’arrondi écrase un travail réel', () => {
    const key = subPercentKey(0, 504)
    expect(key).not.toBeNull()
    expect(fr[key!]).toBe('< 1 %')
  })

  it('laisse le pourcentage tel quel dès qu’il vaut au moins un point', () => {
    expect(subPercentKey(1, 3_000)).toBeNull()
    expect(subPercentKey(62, 21)).toBeNull()
  })

  it('ne dit pas « < 1 % » d’un chantier qui n’a rien fait — zéro reste zéro', () => {
    expect(subPercentKey(0, 0)).toBeNull()
  })
})

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
      // ⚠⚠ « champs », pas un nombre nu : 207 298 unités sur un catalogue de 115 814
      // références se lisait comme une erreur de comptage. Une unité est un CHAMP.
      expect(fr[u.done.other]).toBe('{n} champs traités')
      expect(fr[u.remaining.other]).toBe('{n} champs restants')
    }
  })
})
