import { describe, it, expect, beforeEach } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fr } from './fr'
import { en } from './en'
import { translate, intlLocale, formatDate, COMPILED_LOCALES } from './index'
import { useI18nOverridesStore } from '@/stores/i18nOverrides.store'

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

describe('jumeaux de catalogue', () => {
  // Vécu : un script d'ajout a recréé `ac.deleteWarn.1` avec le texte EXACT de
  // `ac.deleteWarn`, déjà présent 300 lignes plus haut. Rien ne l'a signalé —
  // ni tsc, ni la parité, ni knip (qui ne voit pas les clés d'un objet). La clé
  // en trop est restée morte jusqu'à une relecture à l'œil. Un catalogue qui
  // accrète des jumeaux à chaque lot finit par diverger : deux clés au même
  // texte se traduisent un jour différemment, et l'écran devient incohérent.
  /**
   * Jumeaux ASSUMÉS : même phrase, contextes distincts qui doivent pouvoir
   * diverger (un champ homonyme sur quatre nodes, deux modules qui affichent le
   * même vide). Les fusionner créerait un couplage entre modules sans rapport.
   * Ajouter une ligne ici est une DÉCISION, pas une formalité — c'est tout
   * l'intérêt de la liste : elle force à trancher au moment où le doublon naît.
   */
  const TWINS_ASSUMED: readonly (readonly string[])[] = [
    ['palette.noResults', 'pim.noResult'],
    ['connectors.removebg.desc', 'live.removebg.desc'],
    ['dam.gen.downloadPng', 'ch.downloadPng'],
    ['wf.deleteFailed', 'pw.watch.deleteFailed'],
    ['node.harvest-competitor.watchId.label', 'ss.watchId.label',
      'node.compare-catalog.watchId.label', 'node.directed-search.watchId.label'],
    ['ss.pages.title', 'rd.pagesPerRun.title'],
    ['node.compare-catalog.f2', 'node.compare-catalog.f3', 'node.directed-search.f2',
      'node.directed-search.f3', 'node.harvest-competitor.f2', 'node.harvest-competitor.f6'],
    ['run.wh.rowFailed', 'run.tg.rowFailed'],
    ['cat.style.resetPositions', 'rp.render.resetPositions'],
    ['xl.enr.antibot', 'sc.antibot'],
    ['xl.scraped.itemCount', 'st.itemCount'],
    ['sc.compareManufacturer', 'sc.compareManufacturerFull'],
    ['rd.install.hint', 'pu.installHint'],
  ]

  it('ne contient pas deux clés au texte français identique', () => {
    const allowed = new Set(TWINS_ASSUMED.map((g) => [...g].sort().join(' = ')))
    const byValue = new Map<string, string[]>()
    for (const [key, value] of Object.entries(fr)) {
      // Les fragments courts (unités, ponctuation, « OK ») se répètent
      // légitimement — on ne vise que la PROSE, où la collision est fortuite.
      if (value.length < 25) continue
      byValue.set(value, [...(byValue.get(value) ?? []), key])
    }
    const twins = [...byValue.entries()]
      .filter(([, keys]) => keys.length > 1)
      .map(([value, keys]) => ({ id: [...keys].sort().join(' = '), value }))
      .filter(({ id }) => !allowed.has(id))
      .map(({ id, value }) => `${id} → « ${value.slice(0, 60)}… »`)
    expect(twins, `clés jumelles non déclarées :\n${twins.join('\n')}`).toEqual([])
  })
})

describe('intégrité des caractères', () => {
  // Un script Python qui applique `.decode('unicode_escape')` à de l'UTF-8
  // produit du mojibake (« Aperçu » → « AperÃ§u »). Ça passe tsc, le lint ET
  // les tests de parité : seul un contrôle sur les octets l'attrape. Vécu le
  // 29/07/2026 — 47 valeurs FR corrompues sont parties en production.
  // `Ã` SUIVI d'un octet de continuation (\u0080-\u00bf) : c'est la signature
  // de l'UTF-8 relu en latin-1 (é→Ã©, ç→Ã§, à→Ã ). On n'attrape PAS « Ã » suivi
  // d'une lettre ASCII : `OBSERVA[ÇC][ÃA]O` dans les regex multilingues du
  // scraping est légitime, et un garde-fou qui crie au loup finit désactivé.
  const MOJIBAKE = /Ã[\u0080-\u00bf]|Â[«»·°]|â€[\u0080-\u00bf]/

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

  // Le contrôle ci-dessus ne voit QUE les catalogues. Or la corruption vient de
  // scripts d'édition qui touchent aussi les composants : un `title=` ou une
  // chaîne restée en dur peut être atteinte sans qu'aucune clé ne bouge.
  it('ne laisse aucun mojibake dans les sources', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const full = join(dir, e.name)
        if (e.isDirectory()) return e.name === 'node_modules' || e.name === 'lib' ? [] : walk(full)
        return /\.tsx?$/.test(e.name) ? [full] : []
      })
    const offences: string[] = []
    // `functions/src` est inclus : les messages de run du cron y sont écrits en
    // français accentué, et le catalogue serveur n'était couvert par AUCUN
    // contrôle d'encodage — alors que le mojibake est déjà parti en prod une fois.
    for (const file of [...walk('src'), ...walk('functions/src')]) {
      if (file.endsWith('i18n.test.ts')) continue // contient le motif lui-même
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        const hit = line.match(MOJIBAKE)
        if (hit) offences.push(`${file}:${i + 1} → « ${hit[0]} »`)
      })
    }
    expect(offences, `mojibake détecté dans les sources :\n${offences.join('\n')}`).toEqual([])
  })
})

describe('pluriel', () => {
  // Vécu à l'écran : `PreflightBanner` écrivait `${t('wfc.inconsistency')}s` et
  // affichait « 2 inconsistencys ». Recoller un « s » au mot TRADUIT suppose la
  // règle de pluriel du français ; elle ne survit pas à la traduction.
  it('ne recolle jamais un « s » à une traduction', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const full = join(dir, e.name)
        if (e.isDirectory()) return walk(full)
        return /\.tsx?$/.test(e.name) ? [full] : []
      })
    // `${t(…)}s` ou `${tr(…)}s` collé — le motif exact du défaut.
    const NAIVE_PLURAL = /\$\{\s*t r?\(|\$\{\s*tr?\([^}]*\)\s*\}s\b/
    const offences: string[] = []
    for (const file of walk('src')) {
      if (file.endsWith('i18n.test.ts')) continue // contient le motif lui-même
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        // Saute les COMMENTAIRES : ceux qui documentent ce défaut citent forcément
        // le motif fautif, et un garde-fou qui crie sur sa propre explication finit
        // désactivé.
        const code = line.trim()
        if (code.startsWith('//') || code.startsWith('*') || code.startsWith('/*')) return
        if (/\$\{\s*tr?\([^}]*\)\s*\}s\b/.test(line)) offences.push(`${file}:${i + 1}`)
      })
    }
    expect(offences, `pluriel naïf sur une traduction :\n${offences.join('\n')}`).toEqual([])
    // Éprouvé : le motif DOIT matcher la forme fautive.
    expect(NAIVE_PLURAL.test("`${n} ${t('wfc.inconsistency')}s`")).toBe(true)
  })

  it('emploie des clés dédiées pour chaque forme', () => {
    for (const base of ['wfc.inconsistencies', 'wfc.warnings', 'wfc.pointsToCheck']) {
      for (const form of ['one', 'many'] as const) {
        expect(fr, `${base}.${form} manquante`).toHaveProperty(`${base}.${form}`)
      }
    }
    // La forme anglaise irrégulière est celle que le « +s » cassait.
    expect(en['wfc.inconsistencies.many']).toBe('{count} inconsistencies')
  })
})

describe('appels rendus dans une chaîne', () => {
  // Vécu : `title="{t('pw.opp.unitGap')} entre votre prix et…"`. Une valeur
  // d'attribut ENTRE GUILLEMETS est une chaîne littérale en JSX — les accolades
  // ne sont PAS évaluées : l'utilisateur lisait « {t('pw.opp.unitGap')} … » au
  // survol. tsc et le lint acceptent ; seul ce contrôle l'attrape. La forme
  // correcte est `title={t('…')}` (accolades AUTOUR de l'attribut).
  it("n'enferme jamais un t() dans une valeur d'attribut littérale", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const full = join(dir, e.name)
        if (e.isDirectory()) return walk(full)
        return /\.tsx$/.test(e.name) ? [full] : []
      })
    const IN_ATTRIBUTE = /\w+="[^"]*\{\s*tr?\(/
    const offences: string[] = []
    for (const file of walk('src')) {
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (IN_ATTRIBUTE.test(line)) offences.push(`${file}:${i + 1}`)
      })
    }
    expect(offences, `t() inerte dans un attribut :\n${offences.join('\n')}`).toEqual([])
    // Éprouvé : le motif DOIT matcher la forme fautive et ÉPARGNER la bonne.
    expect(IN_ATTRIBUTE.test(`title="{t('a.b')} suite"`)).toBe(true)
    expect(IN_ATTRIBUTE.test(`title={t('a.b')}`)).toBe(false)
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
    // ⚠️ `catalog` PRÉCÉDÉ D'UN SLASH est un chemin (`/media/catalog/`, convention
    // Magento) : c'est de la DONNÉE dans un exemple, pas de la prose à angliciser.
    // Le remplacer par « catalogue » produirait un chemin FAUX. Même précaution que
    // pour `EasyCatalog` et l'identifiant de module `catalog` côté /docs/.
    /(?<!\/)\bcatalog(s)?\b/i,
    /\bbehavior(s|al)?\b/i,
    /\banalyz(e|es|ed|ing)\b/i,
    /\blicense\b/i, // nom : « licence » en en-GB
    // ⚠️ Typographie : les GUILLEMETS FRANÇAIS dans une phrase anglaise. Trouvés
    // par la passe visuelle (`« Compare catalogue »` au milieu d'un paragraphe
    // en-GB) — aucune règle sur les accents ne peut les voir. L'anglais prend
    // des guillemets courbes ; le helper `quote()` s'en charge quand le texte
    // encadré est dynamique.
    /[«»]/,
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

describe('langues activables sans catalogue (es, de, it)', () => {
  // Ces langues n'ont PAS de catalogue compilé : c'est le compte qui les
  // remplit depuis l'écran « Langues & vocabulaire ». Le garde-fou de
  // complétude (`tsc -b` + parité des clés) ne vaut donc que pour fr/en — ces
  // tests-ci sont ce qui le remplace pour les autres.
  beforeEach(() => useI18nOverridesStore.getState().reset())

  it('ne garantit la couverture totale que pour fr et en', () => {
    expect([...COMPILED_LOCALES]).toEqual(['fr', 'en'])
    for (const locale of COMPILED_LOCALES) {
      const catalogue = locale === 'fr' ? fr : en
      expect(Object.keys(catalogue).length, `catalogue ${locale} incomplet`).toBe(
        Object.keys(fr).length,
      )
    }
  })

  it('retombe sur le FRANÇAIS pour une langue sans catalogue', () => {
    expect(translate('es', 'login.welcome')).toBe(fr['login.welcome'])
    expect(translate('de', 'login.welcome')).toBe(fr['login.welcome'])
  })
})

describe('surcharges de vocabulaire par compte', () => {
  beforeEach(() => useI18nOverridesStore.getState().reset())

  it('passe DEVANT le catalogue compilé', () => {
    useI18nOverridesStore.getState().setOverride('en', 'login.welcome', 'Howdy')
    expect(translate('en', 'login.welcome')).toBe('Howdy')
    // …sans contaminer les autres langues.
    expect(translate('fr', 'login.welcome')).toBe(fr['login.welcome'])
  })

  it('remplit une langue qui n’a pas de catalogue', () => {
    useI18nOverridesStore.getState().setOverride('es', 'login.welcome', 'Bienvenido')
    expect(translate('es', 'login.welcome')).toBe('Bienvenido')
    // Une clé non surchargée reste en français, elle ne disparaît pas.
    expect(translate('es', 'login.workspace')).toBe(fr['login.workspace'])
  })

  it('interpole les paramètres DANS la surcharge', () => {
    // Piège : une surcharge saisie à la main peut oublier le `{name}` du
    // gabarit d'origine — mais si elle le garde, il doit être interpolé comme
    // dans le catalogue, sinon le client voit « {name} » à l'écran.
    useI18nOverridesStore.getState().setOverride('fr', 'login.welcome', 'Salut {name}')
    expect(translate('fr', 'login.welcome', { name: 'Léa' })).toBe('Salut Léa')
  })

  it('rend la clé au catalogue quand la surcharge est retirée', () => {
    const store = useI18nOverridesStore.getState()
    store.setOverride('fr', 'login.welcome', 'Coucou')
    store.setOverride('fr', 'login.welcome', null)
    expect(translate('fr', 'login.welcome')).toBe(fr['login.welcome'])
  })

  it('incrémente `version` à chaque mutation — c’est ce qui re-rend l’écran', () => {
    const before = useI18nOverridesStore.getState().version
    useI18nOverridesStore.getState().setOverride('fr', 'login.welcome', 'Coucou')
    expect(useI18nOverridesStore.getState().version).toBeGreaterThan(before)
  })
})
