import { describe, it, expect } from 'vitest'
import { t, DEFAULT_LOCALE } from './i18n'

describe('i18n serveur', () => {
  it('rend le français par défaut et l’anglais sur demande', () => {
    expect(t('fr', 'run.noCompetitor')).toBe('Aucun site concurrent configuré.')
    expect(t('en', 'run.noCompetitor')).toBe('No competitor site configured.')
    expect(DEFAULT_LOCALE).toBe('fr')
  })

  it('interpole les paramètres dans les deux langues', () => {
    expect(t('fr', 'run.dashboardSaved', { watchId: 'w1' })).toContain('« w1 »')
    expect(t('en', 'run.dashboardSaved', { watchId: 'w1' })).toContain('"w1"')
  })

  it('laisse le jeton tel quel si le paramètre manque', () => {
    expect(t('en', 'run.dashboardSaved')).toContain('{watchId}')
  })
})
