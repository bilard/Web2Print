import { describe, it, expect } from 'vitest'
import {
  buildMarker, eligibility, applyRevision, revertRevision, isEnriched,
  newPassCounts, countOutcome, countConsidered, type EnrichableField,
} from './revision'

const V1 = { kind: 'translate' as const, targetLang: 'fr', promptVersion: 'v1' }
const meta = (over: Partial<Parameters<typeof applyRevision>[2]> = {}) => ({
  kind: 'translate' as const, targetLang: 'fr', promptVersion: 'v1',
  passId: 'p1', at: 1_700_000_000_000, ...over,
})

describe('idempotence', () => {
  it('un champ déjà traité par la MÊME consigne est écarté', () => {
    // Un passage écrit directement : sans ce garde-fou, le suivant retraduirait sa
    // propre sortie, et un texte réécrit deux fois dérive.
    const field: EnrichableField = {
      value: 'Lame de tondeuse',
      enrich: { original: 'Grasmaaier mes', kind: 'translate', targetLang: 'fr', passId: 'p1', at: 1, marker: buildMarker('translate', 'fr', 'v1') },
    }
    expect(eligibility(field, { ...V1, minLength: 0, detectedLang: 'nl' })).toBe('already-done')
  })

  it('une consigne MODIFIÉE rend le champ à nouveau éligible', () => {
    // Sinon, améliorer sa consigne n'aurait jamais d'effet sur l'existant.
    const field: EnrichableField = {
      value: 'Lame de tondeuse',
      enrich: { original: 'Grasmaaier mes', kind: 'translate', targetLang: 'fr', passId: 'p1', at: 1, marker: buildMarker('translate', 'fr', 'v1') },
    }
    expect(eligibility(field, { ...V1, promptVersion: 'v2', minLength: 0, detectedLang: 'nl' })).toBeNull()
  })

  it('une autre langue cible est un autre travail', () => {
    const field: EnrichableField = {
      value: 'Lame de tondeuse',
      enrich: { original: 'Grasmaaier mes', kind: 'translate', targetLang: 'fr', passId: 'p1', at: 1, marker: buildMarker('translate', 'fr', 'v1') },
    }
    expect(eligibility(field, { ...V1, targetLang: 'es', minLength: 0, detectedLang: 'nl' })).toBeNull()
  })
})

describe('éligibilité', () => {
  it('la traduction ne dépend QUE de la langue, pas de la longueur', () => {
    // Un texte néerlandais parfaitement rédigé doit passer ; un texte français bancal
    // n'a rien à faire dans une passe de traduction.
    const nl: EnrichableField = { value: 'Grasmaaier mes 51 cm voor zitmaaier, uitstekende kwaliteit.' }
    expect(eligibility(nl, { ...V1, minLength: 500, detectedLang: 'nl' })).toBeNull()

    const fr: EnrichableField = { value: 'Lame' }
    expect(eligibility(fr, { ...V1, minLength: 500, detectedLang: 'fr' })).toBe('long-enough')
  })

  it('sans langue détectée, la traduction s’abstient', () => {
    // Traduire à l'aveugle ferait passer du français à la moulinette.
    expect(eligibility({ value: 'Lame' }, { ...V1, minLength: 0 })).toBe('long-enough')
  })

  it('l’enrichissement trie sur la longueur', () => {
    const opts = { kind: 'improve' as const, targetLang: 'fr', promptVersion: 'v1', minLength: 40 }
    expect(eligibility({ value: 'LAME 510' }, opts)).toBeNull()
    expect(eligibility({ value: 'Lame de tondeuse autoportée 510 mm pour STIGA, acier trempé.' }, opts)).toBe('long-enough')
  })

  it('un champ vide est écarté, sauf demande contraire', () => {
    // Un champ vide n'a rien à traduire, mais un gabarit peut le CONSTRUIRE à partir
    // d'autres colonnes.
    expect(eligibility({ value: '' }, { ...V1, minLength: 0 })).toBe('empty')
    expect(eligibility({ value: '   ' }, { ...V1, minLength: 0 })).toBe('empty')
    expect(eligibility({ value: '' }, { ...V1, minLength: 0, includeEmpty: true })).toBeNull()
  })
})

describe('application et retour arrière', () => {
  it('conserve l’original et pose le marqueur', () => {
    const out = applyRevision({ value: 'Grasmaaier mes' }, 'Lame de tondeuse', meta({ sourceLang: 'nl' }))
    expect(out.value).toBe('Lame de tondeuse')
    expect(out.enrich?.original).toBe('Grasmaaier mes')
    expect(out.enrich?.sourceLang).toBe('nl')
    expect(out.enrich?.marker).toBe('translate:fr:v1')
  })

  it('⚠ l’original N’EST PAS écrasé par une seconde révision', () => {
    // C'est la donnée fournisseur : un « original » qui serait la sortie du passage
    // précédent ne permettrait plus de revenir à la source.
    const first = applyRevision({ value: 'Grasmaaier mes' }, 'Lame de tondeuse', meta())
    const second = applyRevision(first, 'Lame de tondeuse autoportée 51 cm', meta({ kind: 'improve', promptVersion: 'v2' }))
    expect(second.enrich?.original).toBe('Grasmaaier mes')
    expect(second.value).toBe('Lame de tondeuse autoportée 51 cm')
  })

  it('le retour arrière restaure la source ET libère le champ', () => {
    // Rejeter une mauvaise traduction doit permettre d'en obtenir une bonne : garder le
    // marqueur interdirait tout nouvel essai.
    const revised = applyRevision({ value: 'Grasmaaier mes' }, 'Tondeuse à gazon lame', meta())
    const back = revertRevision(revised)
    expect(back.value).toBe('Grasmaaier mes')
    expect(isEnriched(back)).toBe(false)
    expect(eligibility(back, { ...V1, minLength: 0, detectedLang: 'nl' })).toBeNull()
  })

  it('un retour arrière sur un champ jamais révisé ne casse rien', () => {
    const plain: EnrichableField = { value: 'Lame' }
    expect(revertRevision(plain)).toEqual(plain)
  })

  it('remonte deux révisions successives jusqu’à la source', () => {
    const a = applyRevision({ value: 'Grasmaaier mes' }, 'Lame de tondeuse', meta())
    const b = applyRevision(a, 'Lame de tondeuse 51 cm', meta({ kind: 'improve', promptVersion: 'v2' }))
    expect(revertRevision(b).value).toBe('Grasmaaier mes')
  })
})

describe('compteurs d’un passage', () => {
  it('part de zéro sur TOUTES les raisons de refus', () => {
    // Une raison omise se lit comme un oubli de comptage, pas comme un zéro.
    const c = newPassCounts()
    expect(c).toEqual({
      considered: 0, revised: 0, rejected: 0,
      skipped: { 'already-done': 0, empty: 0, 'long-enough': 0, 'not-applicable': 0 },
    })
  })

  it('enregistre chaque sort sans toucher au dénominateur', () => {
    // ⚠ `countOutcome` ne compte QUE le sort. Le dénominateur est tenu à part par
    // `countConsidered` : les deux moitiés du passage ne voient pas les mêmes champs, et
    // une fonction unique comptait les retenus deux fois.
    let c = newPassCounts()
    c = countOutcome(c, { revised: true })
    c = countOutcome(c, { revised: false, rejected: true })
    c = countOutcome(c, { revised: false, skipped: 'already-done' })
    c = countOutcome(c, { revised: false, skipped: 'already-done' })
    expect(c.considered).toBe(0)
    expect(c.revised).toBe(1)
    expect(c.rejected).toBe(1)
    expect(c.skipped['already-done']).toBe(2)
  })

  it('le dénominateur se tient à part', () => {
    // « 412 révisés » ne dit rien sans lui : sur 500 ou sur 231 000 ?
    let c = newPassCounts()
    c = countConsidered(c)
    c = countConsidered(c, 9)
    expect(c.considered).toBe(10)
  })

  it('un champ écarté n’est jamais compté comme refusé', () => {
    // Écarté (on ne l'a pas traité) et refusé (la révision a cassé une référence) sont
    // deux choses différentes, et les confondre masquerait la seconde.
    const c = countOutcome(newPassCounts(), { revised: false, skipped: 'empty' })
    expect(c.rejected).toBe(0)
    expect(c.skipped.empty).toBe(1)
  })

  it('ne mute pas les compteurs reçus', () => {
    const before = newPassCounts()
    countOutcome(before, { revised: true })
    expect(before.considered).toBe(0)
  })
})

// ⚠⚠ 81 117 fiches sur 115 814 — 70 % du catalogue — n'entraient dans AUCUNE file : le
// détecteur s'abstient sur les textes courts, très techniques ou à l'encodage abîmé, et
// son silence était traité comme « déjà en français ». C'est le gisement principal.
describe('traduction : langue non tranchée', () => {
  const opts = { kind: 'translate' as const, targetLang: 'fr', promptVersion: 'v1', minLength: 0 }
  const field = { value: 'Kit joint carburateur 4T' }

  it('écartée par défaut : on ne paie pas pour deviner', () => {
    expect(eligibility(field, opts)).toBe('long-enough')
  })

  it('acceptée quand la carte le demande', () => {
    expect(eligibility(field, { ...opts, includeUndetected: true })).toBeNull()
  })

  it('le FRANÇAIS reconnu reste écarté, même avec l’option', () => {
    expect(eligibility(field, { ...opts, detectedLang: 'fr', includeUndetected: true })).toBe('long-enough')
  })

  it('une langue étrangère reconnue passe, option ou non', () => {
    expect(eligibility(field, { ...opts, detectedLang: 'de' })).toBeNull()
    expect(eligibility(field, { ...opts, detectedLang: 'de', includeUndetected: true })).toBeNull()
  })
})
