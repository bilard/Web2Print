import { describe, it, expect } from 'vitest'
import { skipReasons } from './useLiveRunCards'

// ⚠⚠ Mesuré en production : la cadence d'envoi suspend l'aval (« Déjà envoyé pour cette
// période »), donc le rapport n'est pas recomposé ni le mail envoyé. Trois cartes passaient
// en gris sans un mot, et l'utilisateur — relisant le mail de la veille — concluait que sa
// consigne était ignorée. La raison existait, dans le journal du run.
describe('skipReasons — une carte sautée dit pourquoi', () => {
  it('rattache au node sauté le dernier message de son journal', () => {
    expect(skipReasons({
      nodeStates: { cadence: 'skipped', moisson: 'success' },
      logs: [
        { ts: 1, level: 'info', node: 'moisson', msg: '+3 500 produits' },
        { ts: 2, level: 'info', node: 'cadence', msg: 'Fenêtre ouverte' },
        { ts: 3, level: 'info', node: 'cadence', msg: 'Envoi suspendu — Déjà envoyé pour cette période (2026-08-11).' },
      ],
    })).toEqual({ cadence: 'Envoi suspendu — Déjà envoyé pour cette période (2026-08-11).' })
  })

  it('ne dit rien des cartes qui ont travaillé — leur journal n’explique aucun saut', () => {
    expect(skipReasons({
      nodeStates: { moisson: 'success' },
      logs: [{ ts: 1, level: 'info', node: 'moisson', msg: '+3 500 produits' }],
    })).toEqual({})
  })

  it('ignore un message sans carte rattachée', () => {
    expect(skipReasons({
      nodeStates: { cadence: 'skipped' },
      logs: [{ ts: 1, level: 'warn', msg: 'message global' }],
    })).toEqual({})
  })

  it('aucun journal : aucune explication inventée', () => {
    expect(skipReasons({ nodeStates: { cadence: 'skipped' } })).toEqual({})
  })
})
