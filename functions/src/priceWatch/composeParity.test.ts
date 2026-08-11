// functions/src/priceWatch/composeParity.test.ts
// `reportCompose.ts` est DUPLIQUÉ depuis src/features/priceWatch/ : le navigateur et le
// cron composent le MÊME mail à partir de la MÊME consigne, seul l'appel au modèle diffère
// (generateJson ⇄ callLlm). Une dérive de la copie donnerait deux rédactions du même
// rapport selon l'heure d'envoi. Ce test exerce les fonctions clés côté serveur.
import { describe, it, expect } from 'vitest'
import { buildComposePrompt, normalizeComposedHtml } from './reportCompose'
import { eventsOfLastRun } from './priceEvents'
import type { PriceEvent } from './priceEvents'
import type { StoredReport } from './reportStore'

const REPORT = {
  runAt: new Date('2026-08-07T06:00:00Z').getTime(),
  kpis: { products: 21_810, comparisons: 48_002, productsUndercut: 9_120, priceIndex: 103.4, cheaperThanMe: 14_500, ruptures: 812 },
  byCompetitor: [
    { siteId: 'a', domain: 'www.exemple-a.fr', matched: 4_200, cheaper: 2_100, medGapPct: -12.5, audit: { indexed: 18_000 } },
    { siteId: 'b', domain: 'exemple-b.fr', matched: 0, cheaper: 0, medGapPct: null },
  ],
  byFamily: [
    { famille: 'Tonte', products: 900, undercut: 540 },
    { famille: 'Rare', products: 2, undercut: 2 },
  ],
  products: [
    { id: 'p1', name: 'Lame 51 cm', reference: 'LAM51', myPriceHt: 24.9, bestGapPct: -31 },
    { id: 'p2', name: 'Bougie', reference: 'BG1', myPriceHt: 5.1, bestGapPct: null },
  ],
} as unknown as StoredReport

describe('buildComposePrompt (parité serveur)', () => {
  it("place la consigne EN TÊTE, verbatim — c'est elle qui commande", () => {
    // L'invariant le plus facile à casser en refactorant, et celui qui compte le plus :
    // un brief maison placé avant reprendrait la main sur la demande de l'utilisateur.
    const consigne = 'Un point court pour un acheteur pressé, rien d\'autre.'
    expect(buildComposePrompt(REPORT, `  ${consigne}  `).startsWith(consigne)).toBe(true)
  })

  it('transmet les agrégats du catalogue complet, pas les lignes brutes', () => {
    const p = buildComposePrompt(REPORT, 'x')
    expect(p).toContain('"produits_apparies": 21810')
    expect(p).toContain('"indice_tarif_base_100": 103.4')
    expect(p).toContain('exemple-a.fr')
  })

  it('écarte les concurrents sans appariement et les familles trop maigres', () => {
    const p = buildComposePrompt(REPORT, 'x')
    expect(p).not.toContain('exemple-b.fr')
    expect(p).toContain('"famille": "Tonte"')
    expect(p).not.toContain('"famille": "Rare"')
  })

  it('annonce les exemples comme tels, et n\'y met que ce qui a un écart', () => {
    const p = buildComposePrompt(REPORT, 'x')
    expect(p).toContain('exemples_de_produits_sous_cotes')
    expect(p).toContain('LAM51')
    expect(p).not.toContain('BG1') // bestGapPct null → pas un exemple d'écart
  })
})

describe('normalizeComposedHtml (parité serveur)', () => {
  const body = `<table style="width:100%">${'<tr><td>ligne</td></tr>'.repeat(20)}</table>`
  // `normalizeComposedHtml` préfixe désormais le mail par une déclaration de thème sombre
  // (`makeResponsive`) : sans elle, iOS Mail recolorait le texte pour son propre mode sombre
  // sur un fond déjà sombre — gris foncé sur noir, constaté en production le 2026-08-10.
  // Le corps n'est donc plus rendu « intact », il est rendu intact PLUS ce préfixe.
  const scheme = '<style>:root{color-scheme:dark;supported-color-schemes:dark;}</style>'

  it('accepte un corps de mail et lui ajoute la déclaration de thème sombre', () => {
    expect(normalizeComposedHtml(body)).toBe(scheme + body)
  })

  it('retire le bloc de code dont le modèle enrobe sa réponse', () => {
    expect(normalizeComposedHtml('```html\n' + body + '\n```')).toBe(scheme + body)
  })

  it('retire les scripts — rien d\'exécutable dans un mail ni dans une archive', () => {
    const out = normalizeComposedHtml(`<script>alert(1)</script>${body}`)
    expect(out).toBe(scheme + body)
  })

  it('refuse le vide, la prose et les réponses trop courtes', () => {
    expect(normalizeComposedHtml('')).toBeNull()
    expect(normalizeComposedHtml(null)).toBeNull()
    expect(normalizeComposedHtml('<p>ok</p>')).toBeNull()
    expect(normalizeComposedHtml(`Je ne peux pas produire ce rapport. ${'Désolé. '.repeat(40)}`)).toBeNull()
  })
})

const RUN_2 = new Date('2026-08-07T06:00:00Z').getTime()
const RUN_1 = new Date('2026-08-06T06:00:00Z').getTime()
const move = (at: number, pct: number, name: string): PriceEvent => ({
  at, pid: name, name, ref: 'R1', sid: 's', dom: 'www.exemple-a.fr',
  from: 100, to: 100 + pct, pctChange: pct, mine: 95, gapAfter: pct, u: 'https://exemple-a.fr/p',
})

describe('mouvements de prix (parité serveur)', () => {
  it('ne retient que le DERNIER relevé, pas une fenêtre de jours', () => {
    // Entre deux runs il peut s'écouler une heure comme une semaine : « depuis le dernier
    // relevé » doit dire exactement ça, sinon le mail annonce des baisses déjà envoyées.
    const journal = [move(RUN_1, -5, 'Vieux'), move(RUN_2, -12, 'Récent'), move(RUN_2, 3, 'Hausse')]
    const last = eventsOfLastRun(journal)
    expect(last.map((m) => m.name)).toEqual(['Récent', 'Hausse'])
    expect(eventsOfLastRun([])).toEqual([])
  })

  it('transmet les baisses au modèle, la plus forte en tête', () => {
    const p = buildComposePrompt(REPORT, 'x', [move(RUN_2, -12, 'Lame'), move(RUN_2, -30, 'Courroie'), move(RUN_2, 4, 'Bougie')])
    expect(p).toContain('Ce qui a CHANGÉ depuis le relevé précédent')
    expect(p).toContain('"baisses_concurrentes": 2')
    expect(p).toContain('"hausses_concurrentes": 1')
    // Ordre : la plus forte baisse d'abord — c'est elle qui met le plus sous pression.
    // (Sur la section des mouvements seule : le rapport cite « Lame » plus haut, dans ses
    // exemples de produits sous-cotés.)
    const section = p.slice(p.indexOf('Ce qui a CHANGÉ'))
    expect(section.indexOf('Courroie')).toBeLessThan(section.indexOf('Lame'))
    // L'URL de la fiche voyage : le mail doit pouvoir renvoyer vers la preuve.
    expect(p).toContain('https://exemple-a.fr/p')
  })

  it("n'ajoute RIEN quand rien n'a bougé — pas de section vide dans le mail", () => {
    expect(buildComposePrompt(REPORT, 'x')).not.toContain('Ce qui a CHANGÉ')
  })
})
