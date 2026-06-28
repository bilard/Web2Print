import { describe, it, expect } from 'vitest'
import './index' // effet de bord : enregistre tous les jumeaux serveur
import { SERVER_UNSUPPORTED } from './index'
import { getServerNode } from '../registry'

// Garde anti-régression : ces nodes étaient client-only et faisaient échouer le cron
// (« Type inconnu » / « non exécutable côté serveur »). Ils DOIVENT rester enregistrés
// côté serveur ET absents de SERVER_UNSUPPORTED. Cf. execute.ts:197+ (la liste court-
// circuite getServerNode).
describe('jumeaux serveur cron', () => {
  for (const type of ['cost-report', 'gdrive-export', 'analytics-report']) {
    it(`${type} est enregistré et exécutable côté serveur`, () => {
      expect(getServerNode(type)).toBeDefined()
      expect(SERVER_UNSUPPORTED.has(type)).toBe(false)
    })
  }
})
