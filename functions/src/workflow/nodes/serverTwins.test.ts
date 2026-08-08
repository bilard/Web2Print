import { describe, it, expect } from 'vitest'
import './index' // effet de bord : enregistre tous les jumeaux serveur
import { SERVER_UNSUPPORTED, SERVER_SKIP_VISUAL } from './index'
import { getServerNode } from '../registry'

// Garde anti-régression : ces nodes étaient client-only et faisaient échouer le cron
// (« Type inconnu » / « non exécutable côté serveur »). Ils DOIVENT rester enregistrés
// côté serveur ET absents de SERVER_UNSUPPORTED. Cf. execute.ts:197+ (la liste court-
// circuite getServerNode).
describe('jumeaux serveur cron', () => {
  for (const type of ['cost-report', 'gdrive-export', 'analytics-report', 'harvest-competitor', 'compare-catalog', 'source-sites', 'directed-search', 'pairing-rules']) {
    it(`${type} est enregistré et exécutable côté serveur`, () => {
      expect(getServerNode(type)).toBeDefined()
      expect(SERVER_UNSUPPORTED.has(type)).toBe(false)
    })
  }
})

describe('enrichissement de textes — non exécutable, et pas silencieux', () => {
  it('est déclaré non exécutable côté serveur', () => {
    // Son moteur n'est pas encore porté. Tant qu'il ne l'est pas, le cron doit le dire.
    expect(SERVER_UNSUPPORTED.has('text-enrich')).toBe(true)
  })

  it('⚠ n’est PAS traité comme un node visuel', () => {
    // `SERVER_SKIP_VISUAL` le rendrait no-op gracieux : le run planifié réussirait sans
    // avoir rien enrichi, et l'aval exporterait des textes bruts en les croyant traités.
    // C'est précisément la panne silencieuse à éviter — il doit marquer le run en erreur.
    expect(SERVER_SKIP_VISUAL.has('text-enrich')).toBe(false)
  })
})
