/**
 * Prompt Optimization Function
 * Transforms a rough design brief into a structured instruction for AI-generated designs.
 * Uses Claude Opus 4.7 via direct Anthropic API.
 */

import { getApiKey } from '@/lib/apiKeys'
import { useUIStore } from '@/stores/ui.store'

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'

const OPTIMIZATION_SYSTEM_PROMPT = `Tu es un expert en création d'affiches et de designs marketing.
L'utilisateur te fournit un brief brut (description du produit/promotion à afficher).

Transforme ce brief en une instruction détaillée et structurée pour un designer IA, incluant:
- Description précise du produit/service
- Ambiance et style visuel recommandés
- Hiérarchie visuelle (titres, prix, détails)
- Palette de couleurs (si applicable)
- Composition spatiale (layout)
- Appel à l'action clair

Réponds en français, sois concis mais complet. Le résultat doit servir de prompt pour un système de génération d'images IA.`

interface AnthropicContentBlock {
  type: string
  text?: string
}

interface AnthropicResponse {
  content?: AnthropicContentBlock[]
}

export async function optimizePrompt(brutPrompt: string): Promise<string> {
  const setOptimizing = useUIStore.getState().setOptimizingPrompt
  setOptimizing(true)

  try {
    const apiKey = getApiKey('anthropic')
    if (!apiKey) {
      throw new Error('Clé Anthropic absente. Configurez-la dans Réglages.')
    }

    const ctrl = new AbortController()
    const timeoutId = setTimeout(() => ctrl.abort(), 180_000)

    let res: Response
    try {
      res = await fetch(ANTHROPIC_ENDPOINT, {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-opus-4-7',
          max_tokens: 500,
          system: OPTIMIZATION_SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content: `Brief brut:\n\n${brutPrompt}`,
            },
          ],
        }),
      })
    } finally {
      clearTimeout(timeoutId)
    }

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Anthropic API ${res.status} : ${body.slice(0, 300)}`)
    }

    const data = (await res.json()) as AnthropicResponse
    const textBlock = data.content?.find((b) => b.type === 'text')
    if (!textBlock?.text) {
      throw new Error('Réponse Claude vide')
    }

    return textBlock.text.trim()
  } catch (error) {
    console.error('Prompt optimization failed:', error)
    if (error instanceof Error && error.message.includes('AbortError')) {
      throw new Error('Optimisation du prompt expirée (timeout). Réessaye.')
    }
    throw new Error('Impossible d\'optimiser le prompt. Vérifie ta connexion.')
  } finally {
    setOptimizing(false)
  }
}
