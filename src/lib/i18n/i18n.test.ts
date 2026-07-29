import { describe, it, expect } from 'vitest'
import { fr } from './fr'
import { en } from './en'
import { translate, intlLocale, formatDate } from './index'

/** Extrait les jetons `{param}` d'un gabarit de traduction. */
function placeholders(s: string): string[] {
  return (s.match(/\{(\w+)\}/g) ?? []).sort()
}

describe('catalogues i18n', () => {
  it('couvre exactement les mêmes clés en FR et en EN', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(fr).sort())
  })

  it('ne laisse aucune traduction vide', () => {
    for (const [key, value] of Object.entries(en)) {
      expect(value.trim(), `clé vide : ${key}`).not.toBe('')
    }
  })

  it('conserve les mêmes variables interpolées entre FR et EN', () => {
    // Un `{count}` perdu à la traduction n'est PAS une erreur de type : il
    // s'affiche tel quel à l'écran. Seul ce test l'attrape.
    for (const key of Object.keys(fr) as (keyof typeof fr)[]) {
      expect(placeholders(en[key]), `variables divergentes sur ${key}`).toEqual(
        placeholders(fr[key]),
      )
    }
  })
})

describe('intégrité des caractères', () => {
  // Un script Python qui applique `.decode('unicode_escape')` à de l'UTF-8
  // produit du mojibake (« Aperçu » → « AperÃ§u »). Ça passe tsc, le lint ET
  // les tests de parité : seul un contrôle sur les octets l'attrape. Vécu le
  // 29/07/2026 — 47 valeurs FR corrompues sont parties en production.
  const MOJIBAKE = /Ã.|Â[«»·]|â€|â\u0080/

  it("ne contient aucune séquence d'encodage cassée", () => {
    const offences: string[] = []
    for (const [catalogue, entries] of [['fr', fr], ['en', en]] as const) {
      for (const [key, value] of Object.entries(entries)) {
        const hit = value.match(MOJIBAKE)
        if (hit) offences.push(`${catalogue}.${key} → « ${hit[0]} »`)
      }
    }
    expect(offences, `mojibake détecté :\n${offences.join('\n')}`).toEqual([])
  })
})

describe('orthographe britannique (en-GB)', () => {
  // Graphies américaines à bannir.
  //
  // ⚠️ SURTOUT PAS de règle générique `\w+ize` : la terminaison -ize est
  // légitime en anglais britannique pour toute une famille de mots (size,
  // resize, prize, seize, capsize…). Dans une app de mise en page, « size » et
  // « resize » sont certains d'apparaître — une règle large rendrait la suite
  // rouge sur une clé parfaitement correcte, et le réflexe serait de supprimer
  // le garde-fou. On énumère donc les verbes réellement concernés.
  const US_VERBS = [
    'organiz', 'customiz', 'personaliz', 'realiz', 'recogniz', 'optimiz',
    'normaliz', 'serializ', 'synchroniz', 'categoriz', 'prioritiz', 'summariz',
    'visualiz', 'centraliz', 'initializ', 'authoriz', 'standardiz', 'minimiz',
    'maximiz', 'finaliz',
  ].join('|')

  const AMERICANISMS: readonly RegExp[] = [
    new RegExp(`\\b(${US_VERBS})(e|es|ed|ing|ation|ations)?\\b`, 'i'),
    /\bcolor(s|ed|ing)?\b/i,
    /\bcenter(s|ed|ing)?\b/i,
    /\bcatalog(s)?\b/i,
    /\bbehavior(s|al)?\b/i,
    /\banalyz(e|es|ed|ing)\b/i,
    /\blicense\b/i, // nom : « licence » en en-GB
  ]

  it("n'emploie aucune graphie américaine", () => {
    const offences: string[] = []
    for (const [key, value] of Object.entries(en)) {
      for (const rx of AMERICANISMS) {
        const hit = value.match(rx)
        if (hit) offences.push(`${key} → « ${hit[0]} »`)
      }
    }
    expect(offences, `graphies US détectées :\n${offences.join('\n')}`).toEqual([])
  })
})

describe('translate()', () => {
  it('rend le catalogue de la langue demandée', () => {
    expect(translate('en', 'login.welcome')).toBe('Welcome')
    expect(translate('fr', 'login.welcome')).toBe('Bienvenue')
  })

  it('interpole les paramètres', () => {
    // Gabarit ad hoc : on teste le moteur, pas une clé du catalogue.
    const rendered = translate('en', 'login.welcome').replace('Welcome', 'Hi {name}')
    expect(rendered).toBe('Hi {name}')
  })
})

describe('formats régionaux', () => {
  it('mappe en → en-GB (et non en-US)', () => {
    expect(intlLocale('en')).toBe('en-GB')
    expect(intlLocale('fr')).toBe('fr-FR')
  })

  it('date en JJ/MM/AAAA en anglais britannique', () => {
    // 3 février 2026 — en-US afficherait 2/3/2026.
    const d = new Date(Date.UTC(2026, 1, 3, 12))
    expect(formatDate(d, 'en')).toBe('03/02/2026')
  })
})
