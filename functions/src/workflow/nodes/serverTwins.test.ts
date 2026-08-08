import { describe, it, expect } from 'vitest'
import './index' // effet de bord : enregistre tous les jumeaux serveur
import { SERVER_UNSUPPORTED, SERVER_SKIP_VISUAL, SERVER_PASS_THROUGH } from './index'
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

describe('enrichissement de textes — non exécutable, mais transparent', () => {
  it('est déclaré non exécutable côté serveur', () => {
    // Son moteur n'est pas encore porté. Tant qu'il ne l'est pas, le cron doit le dire.
    expect(SERVER_UNSUPPORTED.has('text-enrich')).toBe(true)
  })

  it('⚠ LAISSE PASSER la donnée au lieu de casser l’aval', () => {
    // Il était marqué en erreur pour qu'un run planifié ne réussisse pas sans avoir
    // enrichi. Le remède était pire : posée au milieu d'une chaîne de veille, la carte
    // faisait sauter tout l'aval (« Recherche dirigée : aucune donnée produit en entrée »)
    // et la veille entière restait muette, pour une réécriture de textes qui se fait
    // désormais dans l'écran « Traduire (IA) », hors workflow.
    expect(SERVER_PASS_THROUGH.has('text-enrich')).toBe(true)
  })

  it('n’est pas un node VISUEL : sa sortie porte la donnée reçue, pas du vide', () => {
    expect(SERVER_SKIP_VISUAL.has('text-enrich')).toBe(false)
  })
})
