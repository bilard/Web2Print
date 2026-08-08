import { describe, it, expect } from 'vitest'
import { COMPOSE_FIELDS } from './composeFields'
import { reportFacts, movesFacts, buildComposePrompt } from './reportCompose'
import type { StoredReport } from './reportStore'
import type { PriceEvent } from './priceEvents'

const report: StoredReport = {
  runAt: Date.now(),
  kpis: {
    products: 10, matchedExact: 8, matchedOriginOnly: 2, sites: 2, comparisons: 20,
    cheaperThanMe: 5, aligned: 3, dearerThanMe: 12, ruptures: 1, productsUndercut: 4,
  },
  byCompetitor: [{
    siteId: 's1', domain: 'www.exemple.fr', matched: 10, cheaper: 5, ruptures: 1,
    avgGapPct: -8, medGapPct: -6,
    audit: { indexed: 100, pctPrice: 90, pctListPrice: 10, pctStock: 50, pctName: 100, pctImage: 80, pctRef: 70 },
  }],
  byFamily: [{ famille: 'LAMES', products: 9, undercut: 5 }],
  sites: [{ siteId: 's1', domain: 'www.exemple.fr' }],
  products: [{
    id: 'p1', name: 'LAME 520MM', reference: 'X1', ean: null, famille: 'LAMES',
    myPriceHt: 10, sourceUrl: null, competitors: [], bestGapPct: -12, undercut: true,
  }],
  totalMatched: 1,
  truncated: false,
}

const moves: PriceEvent[] = [{
  at: Date.now(), name: 'LAME 520MM', ref: 'X1', dom: 'www.exemple.fr',
  from: 12, to: 9, pctChange: -25, mine: 10, gapAfter: -10, u: 'https://exemple.fr/p',
} as PriceEvent]

describe('les champs annoncés existent vraiment', () => {
  // ⚠ Le cœur de ce fichier. La liste montrée dans l'interface est du texte ; ce test
  // l'oblige à correspondre aux clés RÉELLEMENT transmises au modèle. Sans lui, on
  // annoncerait des données absentes (l'utilisateur les demanderait en vain, et le modèle
  // se tairait sans rien dire) ou on cacherait des données présentes.
  it('le bloc « relevé » annonce exactement ce que le prompt transmet', () => {
    const announced = COMPOSE_FIELDS.find((g) => g.id === 'report')!.fields.map((f) => f.key)
    expect(announced.sort()).toEqual(Object.keys(reportFacts(report)).sort())
  })

  it('le bloc « mouvements » annonce exactement ce que le prompt transmet', () => {
    const announced = COMPOSE_FIELDS.find((g) => g.id === 'moves')!.fields.map((f) => f.key)
    expect(announced.sort()).toEqual(Object.keys(movesFacts(moves)!).sort())
  })

  it('chaque champ annoncé se retrouve dans le prompt final', () => {
    const prompt = buildComposePrompt(report, 'Ma consigne.', moves)
    for (const group of COMPOSE_FIELDS) {
      for (const f of group.fields) expect(prompt).toContain(f.key)
    }
  })

  it('la consigne reste EN TÊTE, avant les faits', () => {
    // Un brief maison placé avant reprendrait la main sur la demande de l'utilisateur.
    const prompt = buildComposePrompt(report, 'MA CONSIGNE À MOI.', moves)
    expect(prompt.startsWith('MA CONSIGNE À MOI.')).toBe(true)
    expect(prompt.indexOf('MA CONSIGNE À MOI.')).toBeLessThan(prompt.indexOf('Contraintes techniques'))
  })

  it('sans mouvement, le second bloc n’est pas annoncé au modèle', () => {
    // Promettre « ce qui a changé » quand rien n'a changé ferait inventer une section vide.
    expect(buildComposePrompt(report, 'x', [])).not.toContain('Ce qui a CHANGÉ')
  })
})
