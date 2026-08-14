// Parité des TARIFS client ↔ serveur.
//
// ⚠⚠ Ce que ce test protège : un même appel doit coûter le même prix qu'il parte du
// navigateur ou de la tâche planifiée. Les deux catalogues sont dupliqués par contrainte de
// build (`functions/` a `rootDir: "src"` et ne peut rien importer hors de lui) ; sans ce
// test, un tarif corrigé d'un seul côté ferait diverger deux compteurs qui s'additionnent
// pourtant dans le MÊME document Firestore.
//
// Import direct du catalogue serveur, comme `runMessages.test.ts` : `modelPricing.ts` est
// un module pur (aucun import, donc pas d'Admin SDK dans le graphe vitest). L'inverse reste
// interdit.
import { describe, it, expect } from 'vitest'
import { AI_MODELS, type AiProvider } from './aiModels'
import { SERVER_MODEL_PRICING } from '../../functions/src/workflow/modelPricing'

/** Les providers que le CRON sait appeler (cf. `PROVIDERS` dans `functions/src/workflow/llm.ts`). */
const SERVER_PROVIDERS: AiProvider[] = ['deepseek', 'gemini', 'openai', 'claude']

describe('tarifs des modèles — parité client ↔ serveur', () => {
  it('tout modèle connu des deux côtés porte le MÊME tarif', () => {
    const divergences: string[] = []
    for (const provider of SERVER_PROVIDERS) {
      for (const m of AI_MODELS[provider]) {
        const server = SERVER_MODEL_PRICING[m.id]
        if (!server) continue
        if (server.input !== m.pricing.input || server.output !== m.pricing.output) {
          divergences.push(
            `${m.id} : client ${m.pricing.input}/${m.pricing.output} ≠ serveur ${server.input}/${server.output}`,
          )
        }
      }
    }
    expect(divergences).toEqual([])
  })

  it('le serveur n’invente aucun modèle que le client ignore', () => {
    // Un identifiant qui n'existe que côté serveur signale une faute de frappe : il ne
    // serait jamais appelé, et son tarif ne servirait donc jamais.
    const known = new Set(SERVER_PROVIDERS.flatMap((p) => AI_MODELS[p].map((m) => m.id)))
    expect(Object.keys(SERVER_MODEL_PRICING).filter((id) => !known.has(id))).toEqual([])
  })

  it('les modèles par DÉFAUT du cron sont tarifés', () => {
    // Ceux que `llm.ts` appelle quand l'utilisateur n'a rien choisi : s'ils manquaient au
    // catalogue serveur, la consommation par défaut du cron serait comptée zéro.
    for (const id of ['deepseek-chat', 'gemini-3.1-pro-preview', 'gpt-5.1', 'claude-opus-4-7']) {
      expect(SERVER_MODEL_PRICING[id], `${id} absent du catalogue serveur`).toBeDefined()
    }
  })
})
