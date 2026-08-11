import { describe, it, expect } from 'vitest'
import './index' // effet de bord : enregistre tous les jumeaux serveur
import { SERVER_UNSUPPORTED, SERVER_SKIP_VISUAL, SERVER_PASS_THROUGH } from './index'
import { getServerNode } from '../registry'

// Garde anti-régression : ces nodes étaient client-only et faisaient échouer le cron
// (« Type inconnu » / « non exécutable côté serveur »). Ils DOIVENT rester enregistrés
// côté serveur ET absents de SERVER_UNSUPPORTED. Cf. execute.ts:197+ (la liste court-
// circuite getServerNode).
describe('jumeaux serveur cron', () => {
  for (const type of ['cost-report', 'gdrive-export', 'analytics-report', 'harvest-competitor', 'compare-catalog', 'source-sites', 'directed-search', 'pairing-rules', 'text-enrich']) {
    it(`${type} est enregistré et exécutable côté serveur`, () => {
      expect(getServerNode(type)).toBeDefined()
      expect(SERVER_UNSUPPORTED.has(type)).toBe(false)
    })
  }
})

describe('enrichissement de textes — moteur serveur depuis le 9 août (429ad1b1)', () => {
  it('n’est plus une simple passe-through : il porte désormais son propre moteur', () => {
    // Avant le 9 août, la carte n'avait pas de jumeau serveur et devait LAISSER PASSER
    // sa donnée pour ne pas casser l'aval d'un run planifié. Elle est maintenant
    // enregistrée (cf. describe ci-dessus) : la faire figurer ICI EN PLUS mentirait sur
    // ce qui l'exécute réellement — un run planifié n'a plus besoin d'un contournement.
    expect(SERVER_PASS_THROUGH.has('text-enrich')).toBe(false)
  })

  it('n’est pas un node VISUEL : sa sortie porte la donnée reçue, pas du vide', () => {
    expect(SERVER_SKIP_VISUAL.has('text-enrich')).toBe(false)
  })
})
