import { describe, it, expect } from 'vitest'
import {
  DEFAULT_TEXT_ENRICH_CONFIG, configToPlans, configProblem, protectedFieldsOf,
  type TextEnrichConfig, type PlanConfig,
} from './nodeConfig'

const cfg = (over: Partial<TextEnrichConfig> = {}): TextEnrichConfig => ({
  ...DEFAULT_TEXT_ENRICH_CONFIG,
  projectId: 'proj1',
  plans: DEFAULT_TEXT_ENRICH_CONFIG.plans.map((p) => ({ ...p, prompt: 'Sois factuel.' })),
  ...over,
})
const plan = (over: Partial<PlanConfig> = {}): PlanConfig => ({
  enabled: true, key: 'nom', kind: 'improve', minLength: 28,
  prompt: 'Sois factuel.', promptVersion: 'v1', ...over,
})

describe('config vers plans', () => {
  it('écarte les entrées désactivées et celles sans colonne', () => {
    const plans = configToPlans(cfg({
      plans: [plan(), plan({ enabled: false, key: 'description' }), plan({ key: '  ' })],
    }))
    expect(plans.map((p) => p.key)).toEqual(['nom'])
  })

  it('⚠ conserve l’ordre de la liste', () => {
    // C'est lui, et lui seul, qui garantit traduire-avant-enrichir : le moteur applique
    // les plans dans l'ordre reçu. Un tri par clé mélangerait les deux natures.
    const plans = configToPlans(cfg({
      plans: [plan({ kind: 'translate' }), plan({ kind: 'improve' })],
    }))
    expect(plans.map((p) => p.kind)).toEqual(['translate', 'improve'])
  })

  it('monte le gabarit avec les colonnes réglées dans la carte', () => {
    const plans = configToPlans(cfg({
      plans: [plan({ useTemplate: true })],
      brandField: 'Marque', refField: 'Ref fournisseur', eanField: 'Code EAN',
    }))
    expect(plans[0].template).toBeDefined()
    expect(JSON.stringify(plans[0].template)).toContain('Ref fournisseur')
  })

  it('sans gabarit demandé, le plan n’en porte pas', () => {
    expect(configToPlans(cfg({ plans: [plan()] }))[0].template).toBeUndefined()
  })
})

describe('ce qui empêche de partir', () => {
  it('accepte une config complète', () => {
    expect(configProblem(cfg())).toBeNull()
  })

  it('refuse sans projet', () => {
    expect(configProblem(cfg({ projectId: '  ' }))).toBe('no-project')
  })

  it('refuse quand tout est désactivé', () => {
    expect(configProblem(cfg({ plans: [plan({ enabled: false })] }))).toBe('no-plan')
  })

  it('⚠ refuse une consigne vide', () => {
    // Sans consigne, le modèle n'a que la ligne générique de la nature du travail : il
    // produirait du texte de catalogue passe-partout, et l'écrirait dans les fiches.
    expect(configProblem(cfg({ plans: [plan({ prompt: '   ' })] }))).toBe('no-prompt')
  })

  it('refuse d’enrichir avant de traduire sur un même champ', () => {
    // Enrichir puis traduire, c'est payer deux fois pour le second texte seulement.
    expect(configProblem(cfg({
      plans: [plan({ kind: 'improve' }), plan({ kind: 'translate' })],
    }))).toBe('unordered')
  })

  it('la config par défaut est incomplète, à dessein', () => {
    // Ni projet ni consigne : la carte ne doit pas pouvoir tourner à la pose, sinon un
    // clic distrait lance un passage payant sur un catalogue entier.
    expect(configProblem(DEFAULT_TEXT_ENRICH_CONFIG)).toBe('no-project')
  })
})

describe('éléments intouchables', () => {
  it('les lit sur les colonnes réglées', () => {
    const got = protectedFieldsOf(cfg(), { marque: 'STIGA', reference: '1134-4319-01', ean: '7391736312057' })
    expect(got).toEqual({ brands: ['STIGA'], refs: ['1134-4319-01'], eans: ['7391736312057'] })
  })

  it('ignore les cellules vides plutôt que de protéger une chaîne vide', () => {
    // Une chaîne vide « présente dans l'original » serait introuvable dans la proposition,
    // et ferait échouer la vérification sur toutes les fiches sans référence.
    expect(protectedFieldsOf(cfg(), { marque: '', reference: null })).toEqual({ brands: [], refs: [], eans: [] })
  })
})
