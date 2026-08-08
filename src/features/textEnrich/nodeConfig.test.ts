import { describe, it, expect } from 'vitest'
import {
  DEFAULT_TEXT_ENRICH_CONFIG, configToPlans, configProblem, missingProtectedColumns, protectedFieldsOf,
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

  it('⚠ refuse DEUX plans sur la même colonne', () => {
    // C'est une collision, pas un enchaînement : les unités sont identifiées par
    // `produit::champ`, sans le plan. Le prompt porterait deux fois le même identifiant,
    // la réponse en écraserait une, et les deux écritures viseraient la même cellule dans
    // le même lot. On paierait deux fois pour un seul résultat — tiré du texte d'origine
    // dans les deux cas, puisque les unités sont toutes calculées avant le premier appel.
    expect(configProblem(cfg({
      plans: [plan({ kind: 'translate' }), plan({ kind: 'improve' })],
    }))).toBe('duplicate-key')
  })

  it('accepte les mêmes natures sur des colonnes différentes', () => {
    expect(configProblem(cfg({
      plans: [plan({ key: 'nom' }), plan({ key: 'description' })],
    }))).toBeNull()
  })

  it('un plan désactivé ne compte pas comme un doublon', () => {
    // C'est ce qui rend le réglage par défaut valide : il porte les quatre entrées, mais
    // n'en active que deux.
    expect(configProblem(cfg({
      plans: [plan({ kind: 'translate' }), plan({ kind: 'improve', enabled: false })],
    }))).toBeNull()
  })

  it('la config par défaut est incomplète, à dessein', () => {
    // Ni projet ni consigne : la carte ne doit pas pouvoir tourner à la pose, sinon un
    // clic distrait lance un passage payant sur un catalogue entier.
    expect(configProblem(DEFAULT_TEXT_ENRICH_CONFIG)).toBe('no-project')
  })

  it('⚠ le réglage par défaut n’active jamais deux plans sur la même colonne', () => {
    // Il en porte quatre, dont deux sur `nom` et deux sur `description`. Si les quatre
    // étaient actifs, la carte livrée collisionnerait dès la pose — et le symptôme
    // (facture double, texte écrasé) est invisible dans la console du run.
    const filled = {
      ...DEFAULT_TEXT_ENRICH_CONFIG,
      projectId: 'p',
      plans: DEFAULT_TEXT_ENRICH_CONFIG.plans.map((p) => ({ ...p, prompt: 'x' })),
    }
    expect(configProblem(filled)).toBeNull()
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

describe('colonnes protégées absentes', () => {
  it('les nomme quand aucune fiche ne les porte', () => {
    // Le symptôme, sinon, est nul : le passage se déroule normalement et n'écrit plus
    // rien de vérifié. C'est le pire des deux mondes — une facture et aucune garantie.
    const got = missingProtectedColumns(cfg(), [{ nom: 'Lame', 'Référence': 'X' }])
    expect(got).toEqual(['marque', 'reference', 'ean'])
  })

  it('ne signale rien quand une seule fiche sur mille les porte', () => {
    // Une colonne vide sur la plupart des fiches reste une colonne configurée juste :
    // c'est son ABSENCE totale du projet qui trahit une erreur de nom.
    expect(missingProtectedColumns(cfg(), [{ nom: 'Lame' }, { marque: 'STIGA', reference: 'X', ean: '1' }]))
      .toEqual([])
  })

  it('ignore une colonne laissée vide dans le réglage', () => {
    expect(missingProtectedColumns(cfg({ eanField: '' }), [{ marque: 'S', reference: 'X' }])).toEqual([])
  })
})
