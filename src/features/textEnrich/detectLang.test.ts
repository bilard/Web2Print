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
