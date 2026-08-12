import { describe, it, expect } from 'vitest'
import { detectLanguage } from './detectLang'

const lang = (s: string | null) => detectLanguage(s).lang

describe('descriptions produit réelles', () => {
  it('reconnaît le français', () => {
    expect(lang('Lame de tondeuse pour autoportée, livrée avec les fixations.')).toBe('fr')
  })

  it('reconnaît le néerlandais', () => {
    expect(lang('Grasmaaier mes voor zitmaaier, geschikt voor alle modellen.')).toBe('nl')
  })

  it('reconnaît l’allemand, même sans mot grammatical, grâce aux tréma', () => {
    // « Messerhalterung für Rasenmäher » : un seul mot de la liste, mais deux signes.
    expect(lang('Messerhalterung für Rasenmäher mit Universalbefestigung')).toBe('de')
  })

  it('reconnaît l’anglais', () => {
    expect(lang('Lawn mower blade for ride-on, suitable for all the models.')).toBe('en')
  })

  it('reconnaît l’espagnol', () => {
    expect(lang('Cuchilla para cortacésped con todos los accesorios.')).toBe('es')
  })
})

describe('abstention — le comportement qui protège', () => {
  it('s’abstient sur un libellé produit court', () => {
    // ⚠ C'est le cas le plus fréquent du catalogue. Aucune méthode locale ne tranche
    // honnêtement « LAME 510MM STIGA » : ni mot grammatical, ni accord, ni ponctuation.
    // Conclure ferait soit retraduire du français, soit ignorer du néerlandais.
    expect(lang('LAME 510MM STIGA')).toBeNull()
    expect(lang('COURROIE A97')).toBeNull()
  })

  it('s’abstient sur un texte trop court pour rien dire', () => {
    expect(lang('Lame')).toBeNull()
    expect(lang('')).toBeNull()
    expect(lang(null)).toBeNull()
  })

  it('s’abstient sur un seul indice isolé', () => {
    // Un mot peut apparaître par accident dans une autre langue (marque, emprunt).
    // Exiger deux points concordants écarte ce hasard.
    expect(lang('Kit complet pour K700')).toBeNull()
  })

  it('s’abstient quand deux langues expliquent le texte aussi bien', () => {
    // Départager au hasard déclencherait une traduction sur un texte correct.
    const d = detectLanguage('Pour with les the des and')
    expect(d.lang).toBeNull()
  })
})

describe('pièges du domaine', () => {
  it('ne se laisse pas prendre par le vocabulaire technique commun', () => {
    // « Motor », « Rotor », « Kit » s'écrivent pareil dans plusieurs langues : seul le
    // tissu grammatical décide.
    expect(lang('Motor Rotor Kit Turbo 12V')).toBeNull()
  })

  it('une marque étrangère ne change pas la langue du texte', () => {
    expect(lang('Lame pour tondeuse Briggs and Stratton, avec les vis de fixation.')).toBe('fr')
  })

  it('conserve les accents pour décider', () => {
    // Les dépouiller ferait perdre exactement ce qui distingue le FR du EN.
    expect(lang('Réservoir à carburant avec bouchon et joint')).toBe('fr')
  })
})

// ⚠⚠ Relevé en production : des libellés FRANÇAIS classés espagnol à cause d'un « ¡ »
// isolé — un accident d'encodage courant sur les exports d'ERP, pas de l'espagnol. Le
// signe pesait à lui seul plus que le seuil de décision.
describe('ponctuation espagnole : ouvrante seule = encodage cassé', () => {
  for (const label of [
    'GOUPILLE ¡ RESSORT',
    'LEVIER DE FREIN, ¡ DROITE',
    'INTERRUPTEUR ¡ RESSORT',
    'RESSORT ¡ PRESSION .150 X .675',
  ]) {
    it(`« ${label} » n’est pas de l’espagnol`, () => {
      expect(detectLanguage(label).lang).not.toBe('es')
    })
  }

  it('une exclamation RÉELLEMENT espagnole compte toujours', () => {
    expect(detectLanguage('¡Oferta especial para todos los modelos!').lang).toBe('es')
  })

  it('le ñ reste un indice fort à lui seul', () => {
    expect(detectLanguage('Muelle de compresión para la caña').lang).toBe('es')
  })
})

describe('⚠⚠ libellés COURTS : trancher là où la syntaxe manque', () => {
  it('reconnaît la langue par le nom de la pièce', () => {
    // 82 % des textes du catalogue ne portent AUCUN mot grammatical et partaient en
    // abstention. Chaque libellé nomme pourtant la pièce : c'est là qu'est l'information.
    expect(detectLanguage('LAME 510MM COURROIE STIGA').lang).toBe('fr')
    expect(detectLanguage('BLADE 510MM BELT STIGA').lang).toBe('en')
    expect(detectLanguage('MESSER RIEMEN STIGA').lang).toBe('de')
    expect(detectLanguage('CUCHILLA CORREA STIGA').lang).toBe('es')
    expect(detectLanguage('LAMA CINGHIA STIGA').lang).toBe('it')
  })

  it('tranche sur un suffixe morphologique, sans un seul mot grammatical', () => {
    expect(detectLanguage('Messerhalterung Rasenmäher 46').lang).toBe('de')
    expect(detectLanguage('Cortacésped transmisión 46').lang).toBe('es')
  })

  it('⚠ s’abstient toujours quand le libellé ne dit rien', () => {
    // L'abstention reste le comportement par défaut : une traduction déclenchée à tort
    // abîme un texte correct.
    expect(detectLanguage('510MM 45X12 STIGA 2724').lang).toBeNull()
    expect(detectLanguage('REF 17-329').lang).toBeNull()
  })

  it('⚠ un seul nom de pièce ne suffit pas — deux indices, pas un', () => {
    expect(detectLanguage('LAME 510MM').lang).toBeNull()
  })

  it('les faux amis du domaine restent hors des listes', () => {
    // « moteur/motor », « filtre/filter », « kit », « lager » (nl ET de) : présents dans
    // deux langues, ils feraient basculer le score au hasard.
    expect(detectLanguage('MOTOR FILTER KIT').lang).toBeNull()
  })

  it('ne casse pas la détection des textes longs déjà reconnus', () => {
    expect(detectLanguage('Cette lame convient pour les tondeuses de la marque').lang).toBe('fr')
    expect(detectLanguage('Geschikt voor alle maaiers van het merk met deze riem').lang).toBe('nl')
  })
})
