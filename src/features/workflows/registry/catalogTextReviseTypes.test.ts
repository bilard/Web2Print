import { describe, it, expect } from 'vitest'
import { plansToFieldTasks, DEFAULT_REVISE_PLANS } from './catalogTextReviseTypes'

describe('plans → tâches par champ', () => {
  it('⚠ DEUX lignes sur le même champ : traduire ET améliorer, chacune avec sa consigne', () => {
    const out = plansToFieldTasks([
      { enabled: true, field: 'description', kind: 'translate', prompt: 'Garde les réfs.' },
      { enabled: true, field: 'description', kind: 'improve', prompt: 'Liste les adaptables.' },
    ])
    expect(out.description).toEqual({
      translate: true, improve: true,
      translatePrompt: 'Garde les réfs.', improvePrompt: 'Liste les adaptables.',
    })
    // Le champ non visé reste intact : rien ne déborde d'un champ sur l'autre.
    expect(out.name.translate).toBe(false)
  })

  it('une ligne décochée ne compte pas', () => {
    const out = plansToFieldTasks([{ enabled: false, field: 'name', kind: 'translate', prompt: 'x' }])
    expect(out.name.translate).toBe(false)
    expect(out.name.translatePrompt).toBe('')
  })

  it('les plans par défaut traduisent les deux textes, sans rien réécrire', () => {
    const out = plansToFieldTasks(DEFAULT_REVISE_PLANS)
    expect(out.name.translate && out.description.translate).toBe(true)
    expect(out.name.improve || out.description.improve).toBe(false)
  })
})
